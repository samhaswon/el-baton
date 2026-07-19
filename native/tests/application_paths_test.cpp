#include "application_paths.h"

#include <QDir>
#include <QTemporaryDir>
#include <QtTest>

class ApplicationPathsTest final : public QObject {
  Q_OBJECT

 private slots:
  void appendsStableApplicationDirectory();
  void createsEveryRuntimeDirectory();
};

void ApplicationPathsTest::appendsStableApplicationDirectory() {
  const el_baton::ApplicationPaths paths =
      el_baton::ApplicationPaths::fromBaseDirectories("/config", "/cache", "/runtime");

  QCOMPARE(paths.configDirectory, QStringLiteral("/config/el-baton"));
  QCOMPARE(paths.cacheDirectory, QStringLiteral("/cache/el-baton"));
  QCOMPARE(paths.runtimeDirectory, QStringLiteral("/runtime/el-baton"));
}

void ApplicationPathsTest::createsEveryRuntimeDirectory() {
  QTemporaryDir temporaryDirectory;
  QVERIFY(temporaryDirectory.isValid());

  const QDir root(temporaryDirectory.path());
  const el_baton::ApplicationPaths paths = el_baton::ApplicationPaths::fromBaseDirectories(
      root.filePath("config"), root.filePath("cache"), root.filePath("runtime"));

  QString errorMessage;
  QVERIFY2(paths.ensureCreated(&errorMessage), qPrintable(errorMessage));
  QVERIFY(QDir(paths.configDirectory).exists());
  QVERIFY(QDir(paths.cacheDirectory).exists());
  QVERIFY(QDir(paths.runtimeDirectory).exists());
}

QTEST_GUILESS_MAIN(ApplicationPathsTest)

#include "application_paths_test.moc"
