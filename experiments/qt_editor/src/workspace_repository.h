#pragma once

#include <QString>
#include <QVector>

namespace qt_editor {

struct NoteSummary final {
  QString filePath;
  QString title;
  QString relativePath;
  QString content;
  QStringList tags;
  bool favorited = false;
  bool pinned = false;
  bool deleted = false;
};

struct SearchSnippet final {
  QString text;
  qsizetype matchStart = 0;
  qsizetype matchLength = 0;
  qsizetype sourceMatchStart = -1;
  qsizetype occurrence = 0;
};

struct NoteSearchResult final {
  NoteSummary note;
  QVector<SearchSnippet> snippets;
};

enum class SearchMode { Smart, Title, Content, Regex };

class WorkspaceRepository final {
 public:
  void setWorkspaceRoot(const QString& path);
  void inferFromDocument(const QString& filePath);
  void refresh();

  [[nodiscard]] const QString& workspaceRoot() const { return workspaceRoot_; }
  [[nodiscard]] const QVector<NoteSummary>& notes() const { return notes_; }
  [[nodiscard]] QVector<NoteSummary> search(const QString& query) const;
  [[nodiscard]] QVector<NoteSearchResult> searchWithSnippets(
      const QString& query,
      SearchMode mode = SearchMode::Smart) const;
  [[nodiscard]] QString resolveNoteTarget(const QString& target) const;
  [[nodiscard]] QString resolveAttachmentTarget(const QString& target) const;
  [[nodiscard]] QString resolveLocalFileTarget(
      const QString& target,
      const QString& sourceFilePath) const;

 private:
  [[nodiscard]] static bool isSupportedNote(const QString& path);
  [[nodiscard]] static QString readTitle(const QString& path, const QString& content);

  QString workspaceRoot_;
  QVector<NoteSummary> notes_;
};

}  // namespace qt_editor
