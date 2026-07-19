#include "workspace_repository.h"

#include "document_file.h"

#include <QDir>
#include <QDirIterator>
#include <QFile>
#include <QFileInfo>
#include <QRegularExpression>
#include <QUrl>

#include <algorithm>

namespace qt_editor {

void WorkspaceRepository::setWorkspaceRoot(const QString& path) {
  workspaceRoot_ = QFileInfo(path).absoluteFilePath();
}

void WorkspaceRepository::inferFromDocument(const QString& filePath) {
  QDir directory = QFileInfo(filePath).absoluteDir();
  while (!directory.isRoot()) {
    if (directory.dirName().compare(QStringLiteral("notes"), Qt::CaseInsensitive) == 0) {
      directory.cdUp();
      setWorkspaceRoot(directory.absolutePath());
      return;
    }
    directory.cdUp();
  }
  setWorkspaceRoot(QFileInfo(filePath).absolutePath());
}

bool WorkspaceRepository::isSupportedNote(const QString& path) {
  static const QRegularExpression extension(
      QStringLiteral("\\.(?:md|mkd|mdwn|mdown|markdown|markdn|mdtxt|mdtext|txt)$"),
      QRegularExpression::CaseInsensitiveOption);
  return extension.match(path).hasMatch();
}

QString WorkspaceRepository::readTitle(const QString& path, const QString& content) {
  static const QRegularExpression metadataTitle(
      QStringLiteral("(?:^|\\n)title:[ \\t]*['\"]?([^'\"\\r\\n]+)"),
      QRegularExpression::CaseInsensitiveOption);
  const QRegularExpressionMatch metadata = metadataTitle.match(content);
  if (metadata.hasMatch()) return metadata.captured(1).trimmed();
  static const QRegularExpression heading(QStringLiteral("(?:^|\\n)#[ \\t]+([^\\r\\n]+)"));
  const QRegularExpressionMatch markdownHeading = heading.match(content);
  return markdownHeading.hasMatch() ? markdownHeading.captured(1).trimmed() : QFileInfo(path).completeBaseName();
}

void WorkspaceRepository::refresh() {
  notes_.clear();
  if (workspaceRoot_.isEmpty()) return;
  const QDir root(workspaceRoot_);
  const QString notesPath = root.exists(QStringLiteral("notes"))
      ? root.filePath(QStringLiteral("notes")) : workspaceRoot_;
  QDirIterator iterator(notesPath, QDir::Files | QDir::Readable, QDirIterator::Subdirectories);
  const QDir notesDirectory(notesPath);
  while (iterator.hasNext()) {
    const QString path = iterator.next();
    if (!isSupportedNote(path)) continue;
    QFile file(path);
    const QString source = file.open(QIODevice::ReadOnly) ? QString::fromUtf8(file.readAll()) : QString();
    const std::optional<DocumentFile> document = DocumentFile::load(path);
    const QString userContent = document.has_value() ? document->body() : source;
    notes_.append({path, readTitle(path, source), notesDirectory.relativeFilePath(path), userContent,
                   document.has_value() ? document->tags() : QStringList(),
                   document.has_value() && document->metadataFlag(NoteFlag::Favorited),
                   document.has_value() && document->metadataFlag(NoteFlag::Pinned),
                   document.has_value() && document->metadataFlag(NoteFlag::Deleted)});
  }
  std::sort(notes_.begin(), notes_.end(), [](const NoteSummary& left, const NoteSummary& right) {
    if (left.pinned != right.pinned) return left.pinned;
    return QString::localeAwareCompare(left.title, right.title) < 0;
  });
}

QVector<NoteSummary> WorkspaceRepository::search(const QString& query) const {
  QVector<NoteSummary> matches;
  for (const NoteSearchResult& result : searchWithSnippets(query)) matches.append(result.note);
  return matches;
}

QVector<NoteSearchResult> WorkspaceRepository::searchWithSnippets(
    const QString& query,
    SearchMode mode) const {
  const QStringList tokens = query.simplified().split(QLatin1Char(' '), Qt::SkipEmptyParts);
  if (tokens.isEmpty()) return {};
  const QRegularExpression regex(
      query,
      QRegularExpression::CaseInsensitiveOption | QRegularExpression::UseUnicodePropertiesOption);
  if (mode == SearchMode::Regex && !regex.isValid()) return {};
  QVector<NoteSearchResult> matches;
  const QString primaryTerm = tokens.constFirst();
  for (const NoteSummary& note : notes_) {
    const bool titleMatches = note.title.contains(query, Qt::CaseInsensitive);
    const bool contentMatches = std::all_of(tokens.begin(), tokens.end(), [&note](const QString& token) {
      return note.content.contains(token, Qt::CaseInsensitive);
    });
    const bool regexMatches = mode == SearchMode::Regex && regex.match(note.content).hasMatch();
    const bool included = mode == SearchMode::Title ? titleMatches
        : mode == SearchMode::Content ? contentMatches
        : mode == SearchMode::Regex ? regexMatches
        : titleMatches || contentMatches;
    if (!included) continue;

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
        const qsizetype matchIndex = note.content.indexOf(primaryTerm, from, Qt::CaseInsensitive);
        if (matchIndex < 0) break;
        sourceMatches.append({matchIndex, primaryTerm.size()});
        from = matchIndex + std::max<qsizetype>(1, primaryTerm.size());
      }
    }
    for (qsizetype occurrence = 0; occurrence < sourceMatches.size(); ++occurrence) {
      const qsizetype matchIndex = sourceMatches.at(occurrence).first;
      const qsizetype matchLength = sourceMatches.at(occurrence).second;
      constexpr qsizetype context = 44;
      const qsizetype start = std::max<qsizetype>(0, matchIndex - context);
      const qsizetype end = std::min(note.content.size(), matchIndex + matchLength + context);
      QString text = note.content.sliced(start, end - start);
      text.replace(QRegularExpression(QStringLiteral("\\s+")), QStringLiteral(" "));
      text = text.trimmed();
      const QString prefix = start > 0 ? QStringLiteral("…") : QString();
      const QString suffix = end < note.content.size() ? QStringLiteral("…") : QString();
      const QString matchedText = note.content.sliced(matchIndex, matchLength);
      const qsizetype normalizedMatch = text.indexOf(matchedText, 0, Qt::CaseInsensitive);
      snippets.append({prefix + text + suffix,
                       normalizedMatch < 0 ? 0 : normalizedMatch + prefix.size(),
                       matchLength,
                       matchIndex,
                       occurrence});
    }
    if (snippets.isEmpty()) {
      QString fallback = note.content.simplified();
      if (fallback.size() > 96) fallback = fallback.first(96).trimmed() + QStringLiteral("…");
      if (!fallback.isEmpty()) snippets.append({fallback, 0, 0, -1, 0});
    }
    matches.append({note, snippets});
  }
  return matches;
}

QString WorkspaceRepository::resolveNoteTarget(const QString& target) const {
  QString decoded = QUrl::fromPercentEncoding(target.toUtf8()).trimmed();
  decoded.replace(QLatin1Char('\\'), QLatin1Char('/'));
  const QString cleaned = QDir::cleanPath(decoded);
  if (cleaned.isEmpty() || cleaned == QStringLiteral(".") || QDir::isAbsolutePath(cleaned) ||
      cleaned == QStringLiteral("..") || cleaned.startsWith(QStringLiteral("../"))) return {};

  for (const NoteSummary& note : notes_) {
    const QString relative = QDir::cleanPath(note.relativePath);
    if (relative.compare(cleaned, Qt::CaseInsensitive) == 0 ||
        note.title.compare(decoded, Qt::CaseInsensitive) == 0 ||
        QFileInfo(relative).completeBaseName().compare(decoded, Qt::CaseInsensitive) == 0) {
      return note.filePath;
    }
  }
  return {};
}

QString WorkspaceRepository::resolveAttachmentTarget(const QString& target) const {
  if (workspaceRoot_.isEmpty()) return {};
  QString decoded = QUrl::fromPercentEncoding(target.toUtf8()).trimmed();
  decoded.replace(QLatin1Char('\\'), QLatin1Char('/'));
  const QString cleaned = QDir::cleanPath(decoded);
  if (cleaned.isEmpty() || cleaned == QStringLiteral(".") || QDir::isAbsolutePath(cleaned) ||
      cleaned == QStringLiteral("..") || cleaned.startsWith(QStringLiteral("../"))) return {};

  const QDir attachments(QDir(workspaceRoot_).filePath(QStringLiteral("attachments")));
  const QFileInfo candidate(attachments.filePath(cleaned));
  if (!candidate.isFile()) return {};
  const QString rootCanonical = QFileInfo(attachments.absolutePath()).canonicalFilePath();
  const QString candidateCanonical = candidate.canonicalFilePath();
  if (rootCanonical.isEmpty() || candidateCanonical.isEmpty()) return {};
  const QString prefix = rootCanonical.endsWith(QLatin1Char('/'))
      ? rootCanonical : rootCanonical + QLatin1Char('/');
  return candidateCanonical.startsWith(prefix) ? candidateCanonical : QString();
}

QString WorkspaceRepository::resolveLocalFileTarget(
    const QString& target,
    const QString& sourceFilePath) const {
  if (workspaceRoot_.isEmpty() || sourceFilePath.isEmpty()) return {};
  const QString trimmed = QUrl::fromPercentEncoding(target.trimmed().toUtf8());
  if (trimmed.isEmpty() || trimmed.startsWith(QLatin1Char('#'))) return {};

  const QUrl url(trimmed);
  QString candidatePath;
  if (!url.scheme().isEmpty()) {
    if (url.scheme().compare(QStringLiteral("file"), Qt::CaseInsensitive) != 0) return {};
    candidatePath = url.toLocalFile();
  } else {
    const QString relative = QUrl::fromPercentEncoding(url.path().toUtf8());
    if (relative.isEmpty() || QDir::isAbsolutePath(relative)) return {};
    candidatePath = QDir(QFileInfo(sourceFilePath).absolutePath()).absoluteFilePath(relative);
  }

  const QFileInfo candidate(candidatePath);
  if (!candidate.exists()) return {};
  const QString rootCanonical = QFileInfo(workspaceRoot_).canonicalFilePath();
  const QString candidateCanonical = candidate.canonicalFilePath();
  if (rootCanonical.isEmpty() || candidateCanonical.isEmpty()) return {};
  const QString prefix = rootCanonical.endsWith(QLatin1Char('/'))
      ? rootCanonical : rootCanonical + QLatin1Char('/');
  return candidateCanonical == rootCanonical || candidateCanonical.startsWith(prefix)
      ? candidateCanonical : QString();
}

}  // namespace qt_editor
