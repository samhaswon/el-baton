#pragma once

#include <QByteArray>
#include <QFileSystemWatcher>
#include <QHash>
#include <QObject>
#include <QString>
#include <QTimer>
#include <QVector>

namespace qt_editor {

struct WatchedFileState final {
  qint64 size = 0;
  qint64 modifiedMs = 0;
  QByteArray digest;

  bool operator==(const WatchedFileState &other) const {
    if (!digest.isEmpty() || !other.digest.isEmpty())
      return digest == other.digest;
    return size == other.size && modifiedMs == other.modifiedMs;
  }
};

using WorkspaceSnapshot = QHash<QString, WatchedFileState>;

enum class WorkspaceChangeKind { Added, Modified, Removed, Renamed };

struct WorkspaceChange final {
  WorkspaceChangeKind kind = WorkspaceChangeKind::Modified;
  QString path;
  QString previousPath;
};

class WorkspaceWatcher final : public QObject {
  Q_OBJECT

public:
  explicit WorkspaceWatcher(QObject *parent = nullptr);

  void setWorkspaceRoot(const QString &path);
  void start();
  void stop();
  // Records the exact bytes committed by the app. A later scan suppresses only
  // this digest, so an external replacement racing the acknowledgement is not
  // mistaken for an app-owned write.
  void acknowledgeWrite(const QString &path, const QByteArray &content);
  // Convenience for callers that cannot retain their write buffer. Prefer the
  // exact-content overload for note mutations.
  void acknowledgeWrite(const QString &path);
  // Advances the canonical hash after the UI deliberately accepts a disk
  // revision. Unlike acknowledgeWrite(), this does not schedule another scan.
  void acceptDiskState(const QString &path, const QByteArray &content);

  [[nodiscard]] bool isActive() const { return active_; }
  [[nodiscard]] const QString &workspaceRoot() const { return workspaceRoot_; }
  [[nodiscard]] static QVector<WorkspaceChange>
  compareSnapshots(const WorkspaceSnapshot &before,
                   const WorkspaceSnapshot &after);

signals:
  void changesDetected(const QVector<qt_editor::WorkspaceChange> &changes);

private:
  [[nodiscard]] QString notesRoot() const;
  [[nodiscard]] WorkspaceSnapshot
  takeSnapshot(QStringList *directories = nullptr) const;
  void scheduleScan();
  void scan();
  void rebuildWatchPaths(const QStringList &directories);

  QFileSystemWatcher fileSystemWatcher_;
  QTimer scanTimer_;
  QString workspaceRoot_;
  WorkspaceSnapshot snapshot_;
  WorkspaceSnapshot canonicalStates_;
  bool active_ = false;
};

} // namespace qt_editor

Q_DECLARE_METATYPE(qt_editor::WorkspaceChange)
Q_DECLARE_METATYPE(QVector<qt_editor::WorkspaceChange>)
