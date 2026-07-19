#include "workspace_watcher.h"

#include <QDir>
#include <QDateTime>
#include <QFile>
#include <QSignalSpy>
#include <QTemporaryDir>
#include <QtTest>

using qt_editor::WatchedFileState;
using qt_editor::WorkspaceChange;
using qt_editor::WorkspaceChangeKind;
using qt_editor::WorkspaceSnapshot;
using qt_editor::WorkspaceWatcher;

class WorkspaceWatcherTest final : public QObject {
  Q_OBJECT

 private slots:
  void classifiesSnapshotChanges();
  void pairsMovedFilesAsRenames();
  void watchesNewNotesInNestedDirectories();
  void suppressesAcknowledgedAppWrites();
};

namespace {

WatchedFileState state(const QByteArray& digest, qint64 size = 10, qint64 modifiedMs = 1000) {
  return {size, modifiedMs, digest};
}

bool writeFile(const QString& path, const QByteArray& content) {
  QFile file(path);
  return file.open(QIODevice::WriteOnly) && file.write(content) == content.size();
}

}  // namespace

void WorkspaceWatcherTest::classifiesSnapshotChanges() {
  const WorkspaceSnapshot before{
      {QStringLiteral("/notes/changed.md"), state("old")},
      {QStringLiteral("/notes/deleted.md"), state("deleted")},
      {QStringLiteral("/notes/unchanged.md"), state("same")},
  };
  const WorkspaceSnapshot after{
      {QStringLiteral("/notes/added.md"), state("added")},
      {QStringLiteral("/notes/changed.md"), state("new")},
      {QStringLiteral("/notes/unchanged.md"), state("same")},
  };

  const QVector<WorkspaceChange> changes = WorkspaceWatcher::compareSnapshots(before, after);
  QCOMPARE(changes.size(), 3);
  QCOMPARE(changes.at(0).kind, WorkspaceChangeKind::Added);
  QCOMPARE(changes.at(0).path, QStringLiteral("/notes/added.md"));
  QCOMPARE(changes.at(1).kind, WorkspaceChangeKind::Modified);
  QCOMPARE(changes.at(1).path, QStringLiteral("/notes/changed.md"));
  QCOMPARE(changes.at(2).kind, WorkspaceChangeKind::Removed);
  QCOMPARE(changes.at(2).path, QStringLiteral("/notes/deleted.md"));
}

void WorkspaceWatcherTest::pairsMovedFilesAsRenames() {
  const WorkspaceSnapshot before{
      {QStringLiteral("/notes/old.md"), state("same-content")},
  };
  const WorkspaceSnapshot after{
      {QStringLiteral("/notes/nested/new.md"), state("same-content")},
  };

  const QVector<WorkspaceChange> changes = WorkspaceWatcher::compareSnapshots(before, after);
  QCOMPARE(changes.size(), 1);
  QCOMPARE(changes.constFirst().kind, WorkspaceChangeKind::Renamed);
  QCOMPARE(changes.constFirst().previousPath, QStringLiteral("/notes/old.md"));
  QCOMPARE(changes.constFirst().path, QStringLiteral("/notes/nested/new.md"));
}

void WorkspaceWatcherTest::watchesNewNotesInNestedDirectories() {
  QTemporaryDir directory;
  QVERIFY(directory.isValid());
  QDir root(directory.path());
  QVERIFY(root.mkpath(QStringLiteral("notes/nested")));

  WorkspaceWatcher watcher;
  watcher.setWorkspaceRoot(directory.path());
  QSignalSpy changesSpy(&watcher, &WorkspaceWatcher::changesDetected);
  watcher.start();

  const QString path = root.filePath(QStringLiteral("notes/nested/new.md"));
  QVERIFY(writeFile(path, QByteArrayLiteral("# New note\n")));

  QTRY_VERIFY_WITH_TIMEOUT(!changesSpy.isEmpty(), 3000);
  bool found = false;
  for (const QList<QVariant>& arguments : changesSpy) {
    const QVector<WorkspaceChange> changes = qvariant_cast<QVector<WorkspaceChange>>(arguments.constFirst());
    for (const WorkspaceChange& change : changes) {
      if (change.kind == WorkspaceChangeKind::Added && change.path == path) found = true;
    }
  }
  QVERIFY(found);
}

void WorkspaceWatcherTest::suppressesAcknowledgedAppWrites() {
  QTemporaryDir directory;
  QVERIFY(directory.isValid());
  QDir root(directory.path());
  QVERIFY(root.mkpath(QStringLiteral("notes")));
  const QString path = root.filePath(QStringLiteral("notes/note.md"));
  QVERIFY(writeFile(path, QByteArrayLiteral("# Before\n")));

  WorkspaceWatcher watcher;
  watcher.setWorkspaceRoot(directory.path());
  QSignalSpy changesSpy(&watcher, &WorkspaceWatcher::changesDetected);
  watcher.start();

  QVERIFY(writeFile(path, QByteArrayLiteral("# App-owned write\n")));
  watcher.acknowledgeWrite(path);
  QFile metadataOnly(path);
  QVERIFY(metadataOnly.open(QIODevice::ReadOnly));
  QVERIFY(metadataOnly.setFileTime(QDateTime::currentDateTime().addSecs(1), QFileDevice::FileModificationTime));
  metadataOnly.close();
  QTest::qWait(350);
  QCOMPARE(changesSpy.size(), 0);

  QVERIFY(writeFile(path, QByteArrayLiteral("# External write\n")));
  QTRY_COMPARE_WITH_TIMEOUT(changesSpy.size(), 1, 3000);
  const QVector<WorkspaceChange> changes =
      qvariant_cast<QVector<WorkspaceChange>>(changesSpy.constFirst().constFirst());
  QCOMPARE(changes.size(), 1);
  QCOMPARE(changes.constFirst().kind, WorkspaceChangeKind::Modified);
  QCOMPARE(changes.constFirst().path, path);
}

QTEST_GUILESS_MAIN(WorkspaceWatcherTest)

#include "workspace_watcher_test.moc"
