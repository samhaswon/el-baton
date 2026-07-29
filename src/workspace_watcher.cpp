#include "workspace_watcher.h"

#include <QCryptographicHash>
#include <QDir>
#include <QDirIterator>
#include <QFile>
#include <QFileInfo>
#include <QRegularExpression>
#include <QSet>

#include <algorithm>

namespace qt_editor {
namespace {

bool isSupportedNote(const QString &path) {
  static const QRegularExpression extension(
      QStringLiteral(
          "\\.(?:md|mkd|mdwn|mdown|markdown|markdn|mdtxt|mdtext|txt)$"),
      QRegularExpression::CaseInsensitiveOption);
  return extension.match(path).hasMatch();
}

QStringList sortedKeys(const QSet<QString> &paths) {
  QStringList result(paths.begin(), paths.end());
  result.sort(Qt::CaseSensitive);
  return result;
}

WatchedFileState readFileState(const QString &path) {
  const QFileInfo info(path);
  QFile file(path);
  QByteArray digest;
  if (file.open(QIODevice::ReadOnly)) {
    digest =
        QCryptographicHash::hash(file.readAll(), QCryptographicHash::Sha256);
  }
  return {info.size(), info.lastModified().toMSecsSinceEpoch(), digest};
}

} // namespace

WorkspaceWatcher::WorkspaceWatcher(QObject *parent) : QObject(parent) {
  qRegisterMetaType<QVector<WorkspaceChange>>();
  scanTimer_.setSingleShot(true);
  scanTimer_.setInterval(175);
  connect(&scanTimer_, &QTimer::timeout, this, &WorkspaceWatcher::scan);
  connect(&fileSystemWatcher_, &QFileSystemWatcher::directoryChanged, this,
          [this](const QString &) { scheduleScan(); });
  connect(&fileSystemWatcher_, &QFileSystemWatcher::fileChanged, this,
          [this](const QString &) { scheduleScan(); });
}

void WorkspaceWatcher::setWorkspaceRoot(const QString &path) {
  const QString normalized =
      path.isEmpty() ? QString() : QFileInfo(path).absoluteFilePath();
  if (workspaceRoot_ == normalized)
    return;
  const bool restart = active_;
  stop();
  workspaceRoot_ = normalized;
  if (restart && !workspaceRoot_.isEmpty())
    start();
}

void WorkspaceWatcher::start() {
  stop();
  if (workspaceRoot_.isEmpty())
    return;
  active_ = true;
  QStringList directories;
  snapshot_ = takeSnapshot(&directories);
  canonicalStates_ = snapshot_;
  rebuildWatchPaths(directories);
}

void WorkspaceWatcher::stop() {
  active_ = false;
  scanTimer_.stop();
  const QStringList watchedFiles = fileSystemWatcher_.files();
  if (!watchedFiles.isEmpty())
    fileSystemWatcher_.removePaths(watchedFiles);
  const QStringList watchedDirectories = fileSystemWatcher_.directories();
  if (!watchedDirectories.isEmpty())
    fileSystemWatcher_.removePaths(watchedDirectories);
  snapshot_.clear();
  canonicalStates_.clear();
}

void WorkspaceWatcher::acknowledgeWrite(const QString &path,
                                        const QByteArray &content) {
  if (!active_)
    return;
  const QString absolutePath = QFileInfo(path).absoluteFilePath();
  if (!isSupportedNote(absolutePath))
    return;
  acceptDiskState(absolutePath, content);
  if (!fileSystemWatcher_.files().contains(absolutePath))
    fileSystemWatcher_.addPath(absolutePath);
  scheduleScan();
}

void WorkspaceWatcher::acknowledgeWrite(const QString &path) {
  if (!active_)
    return;
  const QString absolutePath = QFileInfo(path).absoluteFilePath();
  if (!QFileInfo(absolutePath).isFile() || !isSupportedNote(absolutePath))
    return;
  QFile file(absolutePath);
  if (!file.open(QIODevice::ReadOnly))
    return;
  acknowledgeWrite(absolutePath, file.readAll());
}

void WorkspaceWatcher::acceptDiskState(const QString &path,
                                       const QByteArray &content) {
  if (!active_)
    return;
  const QString absolutePath = QFileInfo(path).absoluteFilePath();
  if (!isSupportedNote(absolutePath))
    return;
  canonicalStates_.insert(
      absolutePath,
      {
          content.size(),
          0,
          QCryptographicHash::hash(content, QCryptographicHash::Sha256),
      });
}

QString WorkspaceWatcher::notesRoot() const {
  const QDir workspace(workspaceRoot_);
  return workspace.exists(QStringLiteral("notes"))
             ? workspace.filePath(QStringLiteral("notes"))
             : workspaceRoot_;
}

WorkspaceSnapshot
WorkspaceWatcher::takeSnapshot(QStringList *directories) const {
  WorkspaceSnapshot result;
  const QString rootPath = notesRoot();
  const QFileInfo rootInfo(rootPath);
  if (!rootInfo.isDir())
    return result;

  if (directories != nullptr)
    directories->append(rootInfo.absoluteFilePath());
  QDirIterator iterator(rootPath,
                        QDir::Dirs | QDir::Files | QDir::Readable |
                            QDir::NoDotAndDotDot,
                        QDirIterator::Subdirectories);
  while (iterator.hasNext()) {
    const QString path = QFileInfo(iterator.next()).absoluteFilePath();
    const QFileInfo info(path);
    if (info.isDir()) {
      if (directories != nullptr)
        directories->append(path);
      continue;
    }
    if (!info.isFile() || !isSupportedNote(path))
      continue;
    result.insert(path, readFileState(path));
  }
  return result;
}

QVector<WorkspaceChange>
WorkspaceWatcher::compareSnapshots(const WorkspaceSnapshot &before,
                                   const WorkspaceSnapshot &after) {
  QSet<QString> added;
  QSet<QString> removed;
  QStringList modified;

  for (auto iterator = after.cbegin(); iterator != after.cend(); ++iterator) {
    const auto previous = before.constFind(iterator.key());
    if (previous == before.cend()) {
      added.insert(iterator.key());
    } else if (previous.value() != iterator.value()) {
      modified.append(iterator.key());
    }
  }
  for (auto iterator = before.cbegin(); iterator != before.cend(); ++iterator) {
    if (!after.contains(iterator.key()))
      removed.insert(iterator.key());
  }

  QVector<WorkspaceChange> renames;
  for (const QString &previousPath : sortedKeys(removed)) {
    QString renamedPath;
    for (const QString &candidate : sortedKeys(added)) {
      const WatchedFileState &previous = before.value(previousPath);
      const WatchedFileState &next = after.value(candidate);
      if (!previous.digest.isEmpty() && previous.digest == next.digest) {
        renamedPath = candidate;
        break;
      }
    }
    if (renamedPath.isEmpty())
      continue;
    removed.remove(previousPath);
    added.remove(renamedPath);
    renames.append({WorkspaceChangeKind::Renamed, renamedPath, previousPath});
  }

  QVector<WorkspaceChange> changes;
  for (const QString &path : sortedKeys(added))
    changes.append({WorkspaceChangeKind::Added, path, {}});
  modified.sort(Qt::CaseSensitive);
  for (const QString &path : modified)
    changes.append({WorkspaceChangeKind::Modified, path, {}});
  for (const QString &path : sortedKeys(removed))
    changes.append({WorkspaceChangeKind::Removed, path, {}});
  changes.append(renames);
  return changes;
}

void WorkspaceWatcher::scheduleScan() {
  if (active_)
    scanTimer_.start();
}

void WorkspaceWatcher::scan() {
  if (!active_)
    return;
  QStringList directories;
  const WorkspaceSnapshot current = takeSnapshot(&directories);
  const QVector<WorkspaceChange> detected =
      compareSnapshots(snapshot_, current);
  QVector<WorkspaceChange> changes;
  changes.reserve(detected.size());
  for (const WorkspaceChange &change : detected) {
    const auto canonical = canonicalStates_.constFind(change.path);
    const auto file = current.constFind(change.path);
    const bool canonicalDiskState =
        canonical != canonicalStates_.cend() && file != current.cend() &&
        canonical.value() == file.value() &&
        (change.kind == WorkspaceChangeKind::Added ||
         change.kind == WorkspaceChangeKind::Modified);
    if (!canonicalDiskState)
      changes.append(change);
  }
  snapshot_ = current;
  rebuildWatchPaths(directories);
  if (!changes.isEmpty())
    emit changesDetected(changes);
}

void WorkspaceWatcher::rebuildWatchPaths(const QStringList &directories) {
  const QStringList oldFiles = fileSystemWatcher_.files();
  if (!oldFiles.isEmpty())
    fileSystemWatcher_.removePaths(oldFiles);
  const QStringList oldDirectories = fileSystemWatcher_.directories();
  if (!oldDirectories.isEmpty())
    fileSystemWatcher_.removePaths(oldDirectories);

  QStringList existingDirectories;
  for (const QString &path : directories) {
    if (QFileInfo::exists(path))
      existingDirectories.append(path);
  }
  if (!existingDirectories.isEmpty())
    fileSystemWatcher_.addPaths(existingDirectories);

  QStringList files;
  files.reserve(snapshot_.size());
  for (auto iterator = snapshot_.cbegin(); iterator != snapshot_.cend();
       ++iterator)
    files.append(iterator.key());
  if (!files.isEmpty())
    fileSystemWatcher_.addPaths(files);
}

} // namespace qt_editor
