#include "workspace_repository.h"

#include "document_file.h"

#include <QDir>
#include <QDirIterator>
#include <QFile>
#include <QFileInfo>
#include <QHash>
#include <QLocale>
#include <QMimeDatabase>
#include <QRegularExpression>
#include <QSet>
#include <QUrl>

#include <algorithm>

namespace qt_editor {
namespace {

QString graphNodeId(const WorkspaceGraphNodeKind kind, const QString &value) {
  const QString prefix =
      kind == WorkspaceGraphNodeKind::Note  ? QStringLiteral("note:")
      : kind == WorkspaceGraphNodeKind::Tag ? QStringLiteral("tag:")
                                            : QStringLiteral("attachment:");
  return prefix + value;
}

QString targetWithoutFragment(const QString &target) {
  const qsizetype fragment = target.indexOf(QLatin1Char('#'));
  return (fragment < 0 ? target : target.first(fragment)).trimmed();
}

} // namespace

void WorkspaceRepository::setWorkspaceRoot(const QString &path) {
  workspaceRoot_ = QFileInfo(path).absoluteFilePath();
}

void WorkspaceRepository::inferFromDocument(const QString &filePath) {
  QDir directory = QFileInfo(filePath).absoluteDir();
  while (!directory.isRoot()) {
    if (directory.dirName().compare(QStringLiteral("notes"),
                                    Qt::CaseInsensitive) == 0) {
      directory.cdUp();
      setWorkspaceRoot(directory.absolutePath());
      return;
    }
    directory.cdUp();
  }
  setWorkspaceRoot(QFileInfo(filePath).absolutePath());
}

bool WorkspaceRepository::isSupportedNote(const QString &path) {
  static const QRegularExpression extension(
      QStringLiteral(
          "\\.(?:md|mkd|mdwn|mdown|markdown|markdn|mdtxt|mdtext|txt)$"),
      QRegularExpression::CaseInsensitiveOption);
  return extension.match(path).hasMatch();
}

QString WorkspaceRepository::readTitle(const QString &path,
                                       const QString &content) {
  static const QRegularExpression metadataTitle(
      QStringLiteral("(?:^|\\n)title:[ \\t]*['\"]?([^'\"\\r\\n]+)"),
      QRegularExpression::CaseInsensitiveOption);
  const QRegularExpressionMatch metadata = metadataTitle.match(content);
  if (metadata.hasMatch())
    return metadata.captured(1).trimmed();
  static const QRegularExpression heading(
      QStringLiteral("(?:^|\\n)#[ \\t]+([^\\r\\n]+)"));
  const QRegularExpressionMatch markdownHeading = heading.match(content);
  return markdownHeading.hasMatch() ? markdownHeading.captured(1).trimmed()
                                    : QFileInfo(path).completeBaseName();
}

void WorkspaceRepository::refresh() {
  notes_.clear();
  attachments_.clear();
  graph_ = {};
  if (workspaceRoot_.isEmpty())
    return;
  const QDir root(workspaceRoot_);
  const QString notesPath = root.exists(QStringLiteral("notes"))
                                ? root.filePath(QStringLiteral("notes"))
                                : workspaceRoot_;
  QDirIterator iterator(notesPath, QDir::Files | QDir::Readable,
                        QDirIterator::Subdirectories);
  const QDir notesDirectory(notesPath);
  while (iterator.hasNext()) {
    const QString path = iterator.next();
    if (!isSupportedNote(path))
      continue;
    QFile file(path);
    const QString source = file.open(QIODevice::ReadOnly)
                               ? QString::fromUtf8(file.readAll())
                               : QString();
    const std::optional<DocumentFile> document = DocumentFile::load(path);
    const QString userContent =
        document.has_value() ? document->body() : source;
    notes_.append(
        {path, readTitle(path, source), notesDirectory.relativeFilePath(path),
         userContent, document.has_value() ? document->tags() : QStringList(),
         document.has_value() ? document->attachments() : QStringList(),
         document.has_value() && document->metadataFlag(NoteFlag::Favorited),
         document.has_value() && document->metadataFlag(NoteFlag::Pinned),
         document.has_value() && document->metadataFlag(NoteFlag::Deleted)});
  }
  std::sort(notes_.begin(), notes_.end(),
            [](const NoteSummary &left, const NoteSummary &right) {
              if (left.pinned != right.pinned)
                return left.pinned;
              return QString::localeAwareCompare(left.title, right.title) < 0;
            });
  attachments_ = scanAttachments();
  graph_ = buildGraph();
}

QVector<NoteSummary> WorkspaceRepository::search(const QString &query) const {
  QVector<NoteSummary> matches;
  for (const NoteSearchResult &result : searchWithSnippets(query))
    matches.append(result.note);
  return matches;
}

QVector<NoteSearchResult>
WorkspaceRepository::searchWithSnippets(const QString &query,
                                        SearchMode mode) const {
  const QStringList tokens =
      query.simplified().split(QLatin1Char(' '), Qt::SkipEmptyParts);
  if (tokens.isEmpty())
    return {};
  const QRegularExpression regex(
      query, QRegularExpression::CaseInsensitiveOption |
                 QRegularExpression::UseUnicodePropertiesOption);
  if (mode == SearchMode::Regex && !regex.isValid())
    return {};
  QVector<NoteSearchResult> matches;
  const QString primaryTerm = tokens.constFirst();
  for (const NoteSummary &note : notes_) {
    const bool titleMatches = note.title.contains(query, Qt::CaseInsensitive);
    const bool contentMatches = std::all_of(
        tokens.begin(), tokens.end(), [&note](const QString &token) {
          return note.content.contains(token, Qt::CaseInsensitive);
        });
    const bool regexMatches =
        mode == SearchMode::Regex && regex.match(note.content).hasMatch();
    const bool included = mode == SearchMode::Title     ? titleMatches
                          : mode == SearchMode::Content ? contentMatches
                          : mode == SearchMode::Regex
                              ? regexMatches
                              : titleMatches || contentMatches;
    if (!included)
      continue;

    QVector<SearchSnippet> snippets;
    QVector<QPair<qsizetype, qsizetype>> sourceMatches;
    if (mode == SearchMode::Regex) {
      auto iterator = regex.globalMatch(note.content);
      while (iterator.hasNext() && sourceMatches.size() < 3) {
        const QRegularExpressionMatch match = iterator.next();
        sourceMatches.append({match.capturedStart(), match.capturedLength()});
      }
    } else {
      qsizetype from = 0;
      while (sourceMatches.size() < 3) {
        const qsizetype matchIndex =
            note.content.indexOf(primaryTerm, from, Qt::CaseInsensitive);
        if (matchIndex < 0)
          break;
        sourceMatches.append({matchIndex, primaryTerm.size()});
        from = matchIndex + std::max<qsizetype>(1, primaryTerm.size());
      }
    }
    for (qsizetype occurrence = 0; occurrence < sourceMatches.size();
         ++occurrence) {
      const qsizetype matchIndex = sourceMatches.at(occurrence).first;
      const qsizetype matchLength = sourceMatches.at(occurrence).second;
      constexpr qsizetype context = 44;
      const qsizetype start = std::max<qsizetype>(0, matchIndex - context);
      const qsizetype end =
          std::min(note.content.size(), matchIndex + matchLength + context);
      QString text = note.content.sliced(start, end - start);
      text.replace(QRegularExpression(QStringLiteral("\\s+")),
                   QStringLiteral(" "));
      text = text.trimmed();
      const QString prefix = start > 0 ? QStringLiteral("…") : QString();
      const QString suffix =
          end < note.content.size() ? QStringLiteral("…") : QString();
      const QString matchedText = note.content.sliced(matchIndex, matchLength);
      const qsizetype normalizedMatch =
          text.indexOf(matchedText, 0, Qt::CaseInsensitive);
      snippets.append(
          {prefix + text + suffix,
           normalizedMatch < 0 ? 0 : normalizedMatch + prefix.size(),
           matchLength, matchIndex, occurrence});
    }
    if (snippets.isEmpty()) {
      QString fallback = note.content.simplified();
      if (fallback.size() > 96)
        fallback = fallback.first(96).trimmed() + QStringLiteral("…");
      if (!fallback.isEmpty())
        snippets.append({fallback, 0, 0, -1, 0});
    }
    matches.append({note, snippets});
  }
  return matches;
}

QString WorkspaceRepository::resolveNoteTarget(const QString &target) const {
  QString decoded = QUrl::fromPercentEncoding(target.toUtf8()).trimmed();
  decoded.replace(QLatin1Char('\\'), QLatin1Char('/'));
  const QString cleaned = QDir::cleanPath(decoded);
  if (cleaned.isEmpty() || cleaned == QStringLiteral(".") ||
      QDir::isAbsolutePath(cleaned) || cleaned == QStringLiteral("..") ||
      cleaned.startsWith(QStringLiteral("../")))
    return {};

  for (const NoteSummary &note : notes_) {
    const QString relative = QDir::cleanPath(note.relativePath);
    if (relative.compare(cleaned, Qt::CaseInsensitive) == 0 ||
        note.title.compare(decoded, Qt::CaseInsensitive) == 0 ||
        QFileInfo(relative).completeBaseName().compare(
            decoded, Qt::CaseInsensitive) == 0) {
      return note.filePath;
    }
  }
  return {};
}

QString
WorkspaceRepository::resolveAttachmentTarget(const QString &target) const {
  if (workspaceRoot_.isEmpty())
    return {};
  QString decoded = QUrl::fromPercentEncoding(target.toUtf8()).trimmed();
  decoded.replace(QLatin1Char('\\'), QLatin1Char('/'));
  const QString cleaned = QDir::cleanPath(decoded);
  if (cleaned.isEmpty() || cleaned == QStringLiteral(".") ||
      QDir::isAbsolutePath(cleaned) || cleaned == QStringLiteral("..") ||
      cleaned.startsWith(QStringLiteral("../")))
    return {};

  const QDir attachments(
      QDir(workspaceRoot_).filePath(QStringLiteral("attachments")));
  const QFileInfo candidate(attachments.filePath(cleaned));
  if (!candidate.isFile())
    return {};
  const QString rootCanonical =
      QFileInfo(attachments.absolutePath()).canonicalFilePath();
  const QString candidateCanonical = candidate.canonicalFilePath();
  if (rootCanonical.isEmpty() || candidateCanonical.isEmpty())
    return {};
  const QString workspaceCanonical =
      QFileInfo(workspaceRoot_).canonicalFilePath();
  const QString workspacePrefix = workspaceCanonical.endsWith(QLatin1Char('/'))
                                      ? workspaceCanonical
                                      : workspaceCanonical + QLatin1Char('/');
  if (workspaceCanonical.isEmpty() ||
      !rootCanonical.startsWith(workspacePrefix))
    return {};
  const QString prefix = rootCanonical.endsWith(QLatin1Char('/'))
                             ? rootCanonical
                             : rootCanonical + QLatin1Char('/');
  return candidateCanonical.startsWith(prefix) ? candidateCanonical : QString();
}

QString WorkspaceRepository::resolveLocalFileTarget(
    const QString &target, const QString &sourceFilePath) const {
  if (workspaceRoot_.isEmpty() || sourceFilePath.isEmpty())
    return {};
  const QString trimmed = QUrl::fromPercentEncoding(target.trimmed().toUtf8());
  if (trimmed.isEmpty() || trimmed.startsWith(QLatin1Char('#')))
    return {};

  const QUrl url(trimmed);
  QString candidatePath;
  if (!url.scheme().isEmpty()) {
    if (url.scheme().compare(QStringLiteral("file"), Qt::CaseInsensitive) != 0)
      return {};
    candidatePath = url.toLocalFile();
  } else {
    const QString relative = QUrl::fromPercentEncoding(url.path().toUtf8());
    if (relative.isEmpty() || QDir::isAbsolutePath(relative))
      return {};
    candidatePath = QDir(QFileInfo(sourceFilePath).absolutePath())
                        .absoluteFilePath(relative);
  }

  const QFileInfo candidate(candidatePath);
  if (!candidate.exists())
    return {};
  const QString rootCanonical = QFileInfo(workspaceRoot_).canonicalFilePath();
  const QString candidateCanonical = candidate.canonicalFilePath();
  if (rootCanonical.isEmpty() || candidateCanonical.isEmpty())
    return {};
  const QString prefix = rootCanonical.endsWith(QLatin1Char('/'))
                             ? rootCanonical
                             : rootCanonical + QLatin1Char('/');
  return candidateCanonical == rootCanonical ||
                 candidateCanonical.startsWith(prefix)
             ? candidateCanonical
             : QString();
}

QStringList WorkspaceRepository::linkTargets(const QString &content) const {
  static const QRegularExpression markdownLink(QStringLiteral(
      "!?\\[[^\\]]*\\]\\(\\s*(?:<([^>]+)>|([^\\r\\n]*?))\\s*\\)"));
  static const QRegularExpression htmlLink(
      QStringLiteral("(?:href|src)\\s*=\\s*['\"]([^'\"]+)['\"]"),
      QRegularExpression::CaseInsensitiveOption);
  static const QRegularExpression wikiLink(
      QStringLiteral("\\[\\[([^\\]|]+)(?:\\|[^\\]]*)?\\]\\]"));
  static const QRegularExpression fence(QStringLiteral("^\\s*(```|~~~)"));

  QStringList targets;
  bool inFence = false;
  const QStringList lines = content.split(QLatin1Char('\n'));
  for (const QString &line : lines) {
    if (fence.match(line).hasMatch()) {
      inFence = !inFence;
      continue;
    }
    if (inFence)
      continue;
    auto markdownMatches = markdownLink.globalMatch(line);
    while (markdownMatches.hasNext()) {
      const QRegularExpressionMatch match = markdownMatches.next();
      QString destination =
          match.captured(1).isEmpty() ? match.captured(2) : match.captured(1);
      static const QRegularExpression optionalTitle(
          QStringLiteral("\\s+(?:\"[^\"]*\"|'[^']*')\\s*$"));
      destination.remove(optionalTitle);
      const QString target = targetWithoutFragment(destination);
      if (!target.isEmpty() && !targets.contains(target))
        targets.append(target);
    }
    for (const QRegularExpression *pattern : {&htmlLink, &wikiLink}) {
      auto otherMatches = pattern->globalMatch(line);
      while (otherMatches.hasNext()) {
        const QString target =
            targetWithoutFragment(otherMatches.next().captured(1));
        if (!target.isEmpty() && !targets.contains(target))
          targets.append(target);
      }
    }
  }
  return targets;
}

QVector<AttachmentSummary> WorkspaceRepository::scanAttachments() const {
  QVector<AttachmentSummary> result;
  if (workspaceRoot_.isEmpty())
    return result;
  const QDir directory(
      QDir(workspaceRoot_).filePath(QStringLiteral("attachments")));
  if (!directory.exists())
    return result;
  const QString rootCanonical =
      QFileInfo(directory.absolutePath()).canonicalFilePath();
  if (rootCanonical.isEmpty())
    return result;
  const QString workspaceCanonical =
      QFileInfo(workspaceRoot_).canonicalFilePath();
  const QString workspacePrefix = workspaceCanonical.endsWith(QLatin1Char('/'))
                                      ? workspaceCanonical
                                      : workspaceCanonical + QLatin1Char('/');
  if (workspaceCanonical.isEmpty() ||
      !rootCanonical.startsWith(workspacePrefix))
    return result;
  const QString rootPrefix = rootCanonical.endsWith(QLatin1Char('/'))
                                 ? rootCanonical
                                 : rootCanonical + QLatin1Char('/');
  QMimeDatabase mimeDatabase;
  QDirIterator iterator(directory.absolutePath(), QDir::Files | QDir::Readable,
                        QDirIterator::Subdirectories);
  while (iterator.hasNext()) {
    const QFileInfo info(iterator.next());
    const QString canonical = info.canonicalFilePath();
    if (canonical.isEmpty() || !canonical.startsWith(rootPrefix))
      continue;
    result.append({canonical,
                   directory.relativeFilePath(info.absoluteFilePath()),
                   info.fileName(), mimeDatabase.mimeTypeForFile(info).name(),
                   info.size(), info.birthTime(), info.lastModified()});
  }
  std::sort(result.begin(), result.end(),
            [](const AttachmentSummary &left, const AttachmentSummary &right) {
              return QString::localeAwareCompare(left.relativePath,
                                                 right.relativePath) < 0;
            });
  return result;
}

QVector<AttachmentSummary>
WorkspaceRepository::attachmentsForNote(const QString &notePath) const {
  const auto note = std::find_if(
      notes_.cbegin(), notes_.cend(), [&notePath](const NoteSummary &value) {
        return QFileInfo(value.filePath) == QFileInfo(notePath);
      });
  if (note == notes_.cend())
    return {};

  QSet<QString> referenced;
  QHash<QString, AttachmentSummary> summaries;
  QMimeDatabase mimeDatabase;
  for (const AttachmentSummary &attachment : attachments_) {
    summaries.insert(attachment.filePath, attachment);
  }
  const auto addLocalAttachment = [this, &referenced, &summaries,
                                   &mimeDatabase](const QString &path) {
    const QFileInfo info(path);
    const QString canonical = info.canonicalFilePath();
    if (!info.isFile() || canonical.isEmpty() || isSupportedNote(canonical))
      return;
    referenced.insert(canonical);
    if (summaries.contains(canonical))
      return;
    summaries.insert(canonical,
                     {
                         canonical,
                         QDir(workspaceRoot_).relativeFilePath(canonical),
                         info.fileName(),
                         mimeDatabase.mimeTypeForFile(info).name(),
                         info.size(),
                         info.birthTime(),
                         info.lastModified(),
                     });
  };
  for (const QString &attachment : note->attachments) {
    const QString resolved = resolveAttachmentTarget(attachment);
    if (!resolved.isEmpty())
      addLocalAttachment(resolved);
  }
  for (const QString &rawTarget : linkTargets(note->content)) {
    QString target = rawTarget;
    if (target.startsWith(QStringLiteral("@attachment/"),
                          Qt::CaseInsensitive)) {
      target = target.sliced(12);
    }
    QString resolved = resolveAttachmentTarget(target);
    if (resolved.isEmpty()) {
      const QString local = resolveLocalFileTarget(rawTarget, note->filePath);
      if (!local.isEmpty())
        resolved = local;
    }
    if (!resolved.isEmpty())
      addLocalAttachment(resolved);
  }

  QVector<AttachmentSummary> result;
  for (const QString &path : referenced) {
    result.append(summaries.value(path));
  }
  std::sort(result.begin(), result.end(),
            [](const AttachmentSummary &left, const AttachmentSummary &right) {
              return QString::localeAwareCompare(left.relativePath,
                                                 right.relativePath) < 0;
            });
  return result;
}

WorkspaceGraph WorkspaceRepository::buildGraph() const {
  WorkspaceGraph result;
  QHash<QString, QString> noteIds;
  QHash<QString, QString> attachmentIds;
  QSet<QString> edgeKeys;
  const auto addEdge = [&result, &edgeKeys](const QString &source,
                                            const QString &target,
                                            const WorkspaceGraphEdgeKind kind) {
    if (source.isEmpty() || target.isEmpty() || source == target)
      return;
    const QString key = source + QLatin1Char('\n') + target +
                        QLatin1Char('\n') +
                        QString::number(static_cast<int>(kind));
    if (edgeKeys.contains(key))
      return;
    edgeKeys.insert(key);
    result.edges.append({source, target, kind});
  };

  for (const NoteSummary &note : notes_) {
    const QString canonical = QFileInfo(note.filePath).canonicalFilePath();
    const QString id = graphNodeId(WorkspaceGraphNodeKind::Note, canonical);
    noteIds.insert(canonical, id);
    result.nodes.append({id, note.title, canonical, note.relativePath,
                         WorkspaceGraphNodeKind::Note});
  }
  for (const AttachmentSummary &attachment : attachments_) {
    const QString id =
        graphNodeId(WorkspaceGraphNodeKind::Attachment, attachment.filePath);
    attachmentIds.insert(attachment.filePath, id);
    result.nodes.append({id, attachment.displayName, attachment.filePath,
                         attachment.mimeType + QStringLiteral(" · ") +
                             QLocale().formattedDataSize(attachment.sizeBytes),
                         WorkspaceGraphNodeKind::Attachment});
  }
  QMimeDatabase mimeDatabase;
  const auto ensureAttachmentNode = [this, &result, &attachmentIds,
                                     &mimeDatabase](const QString &path) {
    const QFileInfo info(path);
    const QString canonical = info.canonicalFilePath();
    if (!info.isFile() || canonical.isEmpty() || isSupportedNote(canonical))
      return QString();
    if (attachmentIds.contains(canonical))
      return attachmentIds.value(canonical);
    const QString id =
        graphNodeId(WorkspaceGraphNodeKind::Attachment, canonical);
    attachmentIds.insert(canonical, id);
    result.nodes.append({
        id,
        info.fileName(),
        canonical,
        mimeDatabase.mimeTypeForFile(info).name() + QStringLiteral(" · ") +
            QLocale().formattedDataSize(info.size()) + QStringLiteral(" · ") +
            QDir(workspaceRoot_).relativeFilePath(canonical),
        WorkspaceGraphNodeKind::Attachment,
    });
    return id;
  };

  QSet<QString> addedTags;
  for (const NoteSummary &note : notes_) {
    const QString sourceId =
        noteIds.value(QFileInfo(note.filePath).canonicalFilePath());
    for (const QString &tag : note.tags) {
      const QString normalized = tag.trimmed();
      if (normalized.isEmpty())
        continue;
      const QString tagId =
          graphNodeId(WorkspaceGraphNodeKind::Tag, normalized.toCaseFolded());
      if (!addedTags.contains(tagId)) {
        addedTags.insert(tagId);
        result.nodes.append({tagId, normalized, QString(),
                             QStringLiteral("Tag"),
                             WorkspaceGraphNodeKind::Tag});
      }
      addEdge(sourceId, tagId, WorkspaceGraphEdgeKind::TagMembership);
    }

    for (const QString &attachment : note.attachments) {
      const QString attachmentTarget = resolveAttachmentTarget(attachment);
      if (!attachmentTarget.isEmpty()) {
        addEdge(sourceId,
                attachmentIds.value(
                    QFileInfo(attachmentTarget).canonicalFilePath()),
                WorkspaceGraphEdgeKind::AttachmentReference);
      }
    }

    for (const QString &rawTarget : linkTargets(note.content)) {
      QString target = rawTarget;
      if (target.startsWith(QStringLiteral("@note/"), Qt::CaseInsensitive)) {
        target = target.sliced(6);
      }
      QString noteTarget = resolveNoteTarget(target);
      const QString localTarget =
          resolveLocalFileTarget(rawTarget, note.filePath);
      if (noteTarget.isEmpty() && isSupportedNote(localTarget))
        noteTarget = localTarget;
      if (!noteTarget.isEmpty()) {
        addEdge(sourceId,
                noteIds.value(QFileInfo(noteTarget).canonicalFilePath()),
                WorkspaceGraphEdgeKind::NoteLink);
        continue;
      }
      if (target.startsWith(QStringLiteral("@attachment/"),
                            Qt::CaseInsensitive)) {
        target = target.sliced(12);
      }
      QString attachmentTarget = resolveAttachmentTarget(target);
      if (attachmentTarget.isEmpty() && !localTarget.isEmpty())
        attachmentTarget = localTarget;
      if (!attachmentTarget.isEmpty()) {
        addEdge(sourceId, ensureAttachmentNode(attachmentTarget),
                WorkspaceGraphEdgeKind::AttachmentReference);
      }
    }
  }
  return result;
}

} // namespace qt_editor
