#include "markdown_completion.h"

#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QJsonDocument>
#include <QJsonObject>
#include <QRegularExpression>

#include <algorithm>

namespace qt_editor {
namespace {

const QStringList &codeFenceLanguages() {
  static const QStringList languages = {
      QStringLiteral("bash"),       QStringLiteral("sh"),
      QStringLiteral("zsh"),        QStringLiteral("fish"),
      QStringLiteral("powershell"), QStringLiteral("ps1"),
      QStringLiteral("cmd"),        QStringLiteral("batch"),
      QStringLiteral("javascript"), QStringLiteral("js"),
      QStringLiteral("typescript"), QStringLiteral("ts"),
      QStringLiteral("jsx"),        QStringLiteral("tsx"),
      QStringLiteral("json"),       QStringLiteral("yaml"),
      QStringLiteral("yml"),        QStringLiteral("toml"),
      QStringLiteral("ini"),        QStringLiteral("html"),
      QStringLiteral("xml"),        QStringLiteral("css"),
      QStringLiteral("scss"),       QStringLiteral("less"),
      QStringLiteral("markdown"),   QStringLiteral("md"),
      QStringLiteral("python"),     QStringLiteral("py"),
      QStringLiteral("java"),       QStringLiteral("kotlin"),
      QStringLiteral("go"),         QStringLiteral("rust"),
      QStringLiteral("c"),          QStringLiteral("cpp"),
      QStringLiteral("csharp"),     QStringLiteral("sql"),
      QStringLiteral("php"),        QStringLiteral("ruby"),
      QStringLiteral("perl"),       QStringLiteral("swift"),
      QStringLiteral("dart"),       QStringLiteral("lua"),
      QStringLiteral("r"),          QStringLiteral("dockerfile"),
      QStringLiteral("makefile"),   QStringLiteral("mermaid"),
      QStringLiteral("plantuml"),   QStringLiteral("puml"),
      QStringLiteral("uml"),        QStringLiteral("katex"),
      QStringLiteral("latex"),      QStringLiteral("tex"),
      QStringLiteral("asciimath")};
  return languages;
}

bool fenceContextIsOpening(const QStringList &linesBefore,
                           const QString &marker, const QString &query) {
  if (!query.isEmpty())
    return true;
  const QString trimmedMarker = marker.trimmed();
  if (trimmedMarker.isEmpty())
    return true;
  const QChar markerCharacter = trimmedMarker.at(0);
  const qsizetype markerLength = trimmedMarker.size();
  QChar openCharacter;
  qsizetype openLength = 0;
  static const QRegularExpression fence(
      QStringLiteral("^\\s{0,3}([`~]{3,})(.*)$"));
  for (const QString &line : linesBefore) {
    const QRegularExpressionMatch match = fence.match(line);
    if (!match.hasMatch())
      continue;
    const QString fenceText = match.captured(1);
    const bool closing = match.captured(2).trimmed().isEmpty();
    if (openLength == 0) {
      openCharacter = fenceText.at(0);
      openLength = fenceText.size();
    } else if (fenceText.at(0) == openCharacter &&
               fenceText.size() >= openLength && closing) {
      openLength = 0;
    }
  }
  return openLength == 0 || openCharacter != markerCharacter ||
         markerLength < openLength;
}

bool isInside(const QString &parent, const QString &child) {
  const QString parentCanonical = QFileInfo(parent).canonicalFilePath();
  const QString childCanonical = QFileInfo(child).canonicalFilePath();
  if (parentCanonical.isEmpty() || childCanonical.isEmpty())
    return false;
  if (parentCanonical == childCanonical)
    return true;
  const QString prefix = parentCanonical.endsWith(QLatin1Char('/'))
                             ? parentCanonical
                             : parentCanonical + QLatin1Char('/');
  return childCanonical.startsWith(prefix);
}

QVector<MarkdownCompletionItem> pathSuggestions(const QString &query,
                                                const QString &workspaceRoot,
                                                const QString &sourceFilePath,
                                                qsizetype limit) {
  if (workspaceRoot.isEmpty() || query.startsWith(QLatin1Char('#')) ||
      query.startsWith(QLatin1Char('/')) ||
      QRegularExpression(QStringLiteral("^[A-Za-z][A-Za-z0-9+.-]*:"))
          .match(query)
          .hasMatch())
    return {};

  const QDir workspace(workspaceRoot);
  const QString notesRoot = workspace.exists(QStringLiteral("notes"))
                                ? workspace.filePath(QStringLiteral("notes"))
                                : workspaceRoot;
  const QString attachmentsRoot =
      workspace.filePath(QStringLiteral("attachments"));
  if (query.startsWith(QLatin1Char('@')) && !query.contains(QLatin1Char('/'))) {
    QVector<MarkdownCompletionItem> tokens;
    if (QStringLiteral("@attachment").startsWith(query, Qt::CaseInsensitive) &&
        QFileInfo::exists(attachmentsRoot)) {
      tokens.append({QStringLiteral("@attachment/"),
                     QStringLiteral("@attachment/"),
                     MarkdownCompletionKind::Directory});
    }
    if (QStringLiteral("@note").startsWith(query, Qt::CaseInsensitive) &&
        QFileInfo::exists(notesRoot)) {
      tokens.append({QStringLiteral("@note/"), QStringLiteral("@note/"),
                     MarkdownCompletionKind::Directory});
    }
    return tokens;
  }

  QString base = sourceFilePath.isEmpty()
                     ? notesRoot
                     : QFileInfo(sourceFilePath).absolutePath();
  QString root = workspaceRoot;
  QString relative = query;
  QString outputPrefix;
  if (query.startsWith(QStringLiteral("@attachment/"), Qt::CaseInsensitive)) {
    base = attachmentsRoot;
    root = attachmentsRoot;
    relative = query.sliced(QStringLiteral("@attachment/").size());
    outputPrefix = QStringLiteral("@attachment/");
  } else if (query.startsWith(QStringLiteral("@note/"), Qt::CaseInsensitive)) {
    base = notesRoot;
    root = notesRoot;
    relative = query.sliced(QStringLiteral("@note/").size());
    outputPrefix = QStringLiteral("@note/");
  }
  const qsizetype slash = relative.lastIndexOf(QLatin1Char('/'));
  const QString directoryPart =
      slash >= 0 ? relative.first(slash + 1) : QString();
  const QString prefix = slash >= 0 ? relative.sliced(slash + 1) : relative;
  const QString lookup = QDir(base).absoluteFilePath(
      directoryPart.isEmpty() ? QStringLiteral(".") : directoryPart);
  if (!QFileInfo(lookup).isDir() || !isInside(root, lookup))
    return {};

  const QFileInfoList entries = QDir(lookup).entryInfoList(
      QDir::Dirs | QDir::Files | QDir::NoDotAndDotDot | QDir::Readable,
      QDir::DirsFirst | QDir::Name | QDir::IgnoreCase);
  QVector<MarkdownCompletionItem> result;
  for (const QFileInfo &entry : entries) {
    if (!entry.fileName().startsWith(prefix, Qt::CaseInsensitive) ||
        !isInside(root, entry.absoluteFilePath()))
      continue;
    const QString path = outputPrefix + directoryPart + entry.fileName() +
                         (entry.isDir() ? QStringLiteral("/") : QString());
    result.append({path, path,
                   entry.isDir() ? MarkdownCompletionKind::Directory
                                 : MarkdownCompletionKind::File});
    if (result.size() >= limit)
      break;
  }
  return result;
}

} // namespace

QHash<QString, QString> MarkdownCompletion::loadEmojiMap(const QString &path) {
  QFile file(path);
  if (!file.open(QIODevice::ReadOnly))
    return {};
  const QJsonDocument document = QJsonDocument::fromJson(file.readAll());
  if (!document.isObject())
    return {};
  QHash<QString, QString> result;
  const QJsonObject object = document.object();
  for (auto iterator = object.constBegin(); iterator != object.constEnd();
       ++iterator) {
    if (iterator.value().isString())
      result.insert(iterator.key().toLower(), iterator.value().toString());
  }
  return result;
}

MarkdownCompletionResult MarkdownCompletion::suggestions(
    const QString &source, qsizetype cursorOffset, const QString &workspaceRoot,
    const QString &sourceFilePath, const QHash<QString, QString> &emojiMap,
    qsizetype limit) {
  MarkdownCompletionResult result;
  if (cursorOffset < 0 || cursorOffset > source.size() || limit <= 0)
    return result;
  const qsizetype lineStart =
      source.lastIndexOf(QLatin1Char('\n'), cursorOffset - 1) + 1;
  const QString beforeCursor =
      source.sliced(lineStart, cursorOffset - lineStart);

  static const QRegularExpression emoji(
      QStringLiteral("(?:^|[\\s([{<]):([A-Za-z0-9_+\\-]*)$"));
  const QRegularExpressionMatch emojiMatch = emoji.match(beforeCursor);
  if (emojiMatch.hasMatch()) {
    const QString query = emojiMatch.captured(1).toLower();
    QStringList prefixMatches;
    QStringList containsMatches;
    for (auto iterator = emojiMap.constBegin(); iterator != emojiMap.constEnd();
         ++iterator) {
      if (iterator.key().startsWith(query))
        prefixMatches.append(iterator.key());
      else if (iterator.key().contains(query))
        containsMatches.append(iterator.key());
    }
    prefixMatches.sort(Qt::CaseInsensitive);
    containsMatches.sort(Qt::CaseInsensitive);
    prefixMatches.append(containsMatches);
    result.replaceStart = cursorOffset - query.size();
    result.replaceLength = query.size();
    for (const QString &shortcode : prefixMatches) {
      result.items.append(
          {QStringLiteral("%1  :%2:").arg(emojiMap.value(shortcode), shortcode),
           shortcode + QLatin1Char(':'), MarkdownCompletionKind::Emoji});
      if (result.items.size() >= limit)
        break;
    }
    return result;
  }

  static const QRegularExpression fence(
      QStringLiteral("^(\\s{0,3}(?:`{3,}|~{3,}))([A-Za-z0-9_+#.\\-]*)$"));
  const QRegularExpressionMatch fenceMatch = fence.match(beforeCursor);
  if (fenceMatch.hasMatch()) {
    const QString query = fenceMatch.captured(2).toLower();
    const QStringList linesBefore =
        source.first(lineStart).split(QLatin1Char('\n'), Qt::KeepEmptyParts);
    if (!fenceContextIsOpening(linesBefore, fenceMatch.captured(1), query))
      return result;
    QStringList prefixMatches;
    QStringList containsMatches;
    for (const QString &language : codeFenceLanguages()) {
      if (language.startsWith(query, Qt::CaseInsensitive))
        prefixMatches.append(language);
      else if (language.contains(query, Qt::CaseInsensitive))
        containsMatches.append(language);
    }
    prefixMatches.append(containsMatches);
    result.replaceStart = cursorOffset - query.size();
    result.replaceLength = query.size();
    for (const QString &language : prefixMatches) {
      result.items.append(
          {language, language, MarkdownCompletionKind::CodeFence});
      if (result.items.size() >= limit)
        break;
    }
    return result;
  }

  static const QRegularExpression markdownPath(
      QStringLiteral("(?:^|[^`])!?\\[[^\\]\\n]*\\]\\(([^)\\n]*)$"));
  static const QRegularExpression htmlPath(
      QStringLiteral(
          "<(?:a|img|source)\\b[^>\\n]*?\\s(?:src|href)=\"([^\"\\n]*)$"),
      QRegularExpression::CaseInsensitiveOption);
  QRegularExpressionMatch pathMatch = markdownPath.match(beforeCursor);
  if (!pathMatch.hasMatch())
    pathMatch = htmlPath.match(beforeCursor);
  if (!pathMatch.hasMatch())
    return result;
  const QString query = pathMatch.captured(1);
  result.replaceStart = cursorOffset - query.size();
  result.replaceLength = query.size();
  result.items = pathSuggestions(query, workspaceRoot, sourceFilePath, limit);
  return result;
}

} // namespace qt_editor
