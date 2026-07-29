#pragma once

#include <QHash>
#include <QString>
#include <QVector>

namespace qt_editor {

enum class MarkdownCompletionKind { Emoji, CodeFence, File, Directory };

struct MarkdownCompletionItem final {
  QString label;
  QString insertText;
  MarkdownCompletionKind kind = MarkdownCompletionKind::File;
};

struct MarkdownCompletionResult final {
  qsizetype replaceStart = 0;
  qsizetype replaceLength = 0;
  QVector<MarkdownCompletionItem> items;

  [[nodiscard]] bool isEmpty() const { return items.isEmpty(); }
};

class MarkdownCompletion final {
public:
  [[nodiscard]] static QHash<QString, QString>
  loadEmojiMap(const QString &path);
  [[nodiscard]] static MarkdownCompletionResult
  suggestions(const QString &source, qsizetype cursorOffset,
              const QString &workspaceRoot, const QString &sourceFilePath,
              const QHash<QString, QString> &emojiMap, qsizetype limit = 30);
};

} // namespace qt_editor
