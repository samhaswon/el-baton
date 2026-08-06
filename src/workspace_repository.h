#pragma once

#include <QDateTime>
#include <QHash>
#include <QString>
#include <QVector>

namespace qt_editor {

struct NoteSummary final {
  QString filePath;
  QString title;
  QString relativePath;
  QString content;
  QStringList tags;
  QStringList attachments;
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

enum class WorkspaceGraphNodeKind { Note, Tag, Attachment };
enum class WorkspaceGraphEdgeKind {
  NoteLink,
  TagMembership,
  AttachmentReference
};

struct AttachmentSummary final {
  QString filePath;
  QString relativePath;
  QString displayName;
  QString mimeType;
  qint64 sizeBytes = 0;
  QDateTime created;
  QDateTime modified;
};

struct WorkspaceGraphNode final {
  QString id;
  QString label;
  QString filePath;
  QString detail;
  WorkspaceGraphNodeKind kind = WorkspaceGraphNodeKind::Note;
};

struct WorkspaceGraphEdge final {
  QString sourceId;
  QString targetId;
  WorkspaceGraphEdgeKind kind = WorkspaceGraphEdgeKind::NoteLink;
};

struct WorkspaceGraph final {
  QVector<WorkspaceGraphNode> nodes;
  QVector<WorkspaceGraphEdge> edges;
};

struct WorkspaceRefreshMetrics final {
  qsizetype notesRead = 0;
  qsizetype notesReused = 0;
  qsizetype attachmentsRead = 0;
  qsizetype attachmentsReused = 0;
  bool graphRebuilt = false;
};

class WorkspaceRepository final {
public:
  void setWorkspaceRoot(const QString &path);
  void inferFromDocument(const QString &filePath);
  void invalidatePath(const QString &path);
  void refresh();

  [[nodiscard]] const QString &workspaceRoot() const { return workspaceRoot_; }
  [[nodiscard]] const QVector<NoteSummary> &notes() const { return notes_; }
  [[nodiscard]] QVector<NoteSummary> search(const QString &query) const;
  [[nodiscard]] QVector<NoteSearchResult>
  searchWithSnippets(const QString &query,
                     SearchMode mode = SearchMode::Smart) const;
  [[nodiscard]] QString resolveNoteTarget(const QString &target) const;
  [[nodiscard]] QString resolveAttachmentTarget(const QString &target) const;
  [[nodiscard]] QString
  resolveLocalFileTarget(const QString &target,
                         const QString &sourceFilePath) const;
  [[nodiscard]] const QVector<AttachmentSummary> &attachments() const {
    return attachments_;
  }
  [[nodiscard]] QVector<AttachmentSummary>
  attachmentsForNote(const QString &notePath) const;
  [[nodiscard]] const WorkspaceGraph &graph() const { return graph_; }
  [[nodiscard]] const WorkspaceRefreshMetrics &lastRefreshMetrics() const {
    return lastRefreshMetrics_;
  }

private:
  struct CachedNote final {
    qint64 size = 0;
    qint64 modifiedMs = 0;
    qint64 metadataChangedMs = 0;
    NoteSummary summary;
  };

  struct CachedAttachment final {
    qint64 size = 0;
    qint64 modifiedMs = 0;
    qint64 metadataChangedMs = 0;
    AttachmentSummary summary;
  };

  [[nodiscard]] static bool isSupportedNote(const QString &path);
  [[nodiscard]] static QString readTitle(const QString &path,
                                         const QString &content);
  [[nodiscard]] QStringList linkTargets(const QString &content) const;
  [[nodiscard]] QVector<AttachmentSummary> scanAttachments(bool *changed);
  [[nodiscard]] WorkspaceGraph buildGraph() const;

  QString workspaceRoot_;
  QVector<NoteSummary> notes_;
  QVector<AttachmentSummary> attachments_;
  WorkspaceGraph graph_;
  QHash<QString, CachedNote> noteCache_;
  QHash<QString, CachedAttachment> attachmentCache_;
  WorkspaceRefreshMetrics lastRefreshMetrics_;
  bool graphInitialized_ = false;
};

} // namespace qt_editor
