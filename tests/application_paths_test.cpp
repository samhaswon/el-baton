#include "application_paths.h"

#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QTemporaryDir>
#include <QtTest>

class ApplicationPathsTest final : public QObject {
  Q_OBJECT

private slots:
  void appendsStableApplicationDirectory();
  void createsEveryRuntimeDirectory();
  void resolvesInstalledDataBeforeBuildFallback();
};

void ApplicationPathsTest::appendsStableApplicationDirectory() {
  const el_baton::ApplicationPaths paths =
      el_baton::ApplicationPaths::fromBaseDirectories("/config", "/cache",
                                                      "/runtime");

  QCOMPARE(paths.configDirectory, QStringLiteral("/config/el-baton"));
  QCOMPARE(paths.cacheDirectory, QStringLiteral("/cache/el-baton"));
  QCOMPARE(paths.runtimeDirectory, QStringLiteral("/runtime/el-baton"));
}

void ApplicationPathsTest::createsEveryRuntimeDirectory() {
  QTemporaryDir temporaryDirectory;
  QVERIFY(temporaryDirectory.isValid());

  const QDir root(temporaryDirectory.path());
  const el_baton::ApplicationPaths paths =
      el_baton::ApplicationPaths::fromBaseDirectories(root.filePath("config"),
                                                      root.filePath("cache"),
                                                      root.filePath("runtime"));

  QString errorMessage;
  QVERIFY2(paths.ensureCreated(&errorMessage), qPrintable(errorMessage));
  QVERIFY(QDir(paths.configDirectory).exists());
  QVERIFY(QDir(paths.cacheDirectory).exists());
  QVERIFY(QDir(paths.runtimeDirectory).exists());
}

void ApplicationPathsTest::resolvesInstalledDataBeforeBuildFallback() {
  QTemporaryDir temporaryDirectory;
  QVERIFY(temporaryDirectory.isValid());
  QDir root(temporaryDirectory.path());
  QVERIFY(root.mkpath(QStringLiteral("bin")));
  QVERIFY(root.mkpath(QStringLiteral("share/el-baton/web")));

  QFile preview(
      root.filePath(QStringLiteral("share/el-baton/web/preview.html")));
  QVERIFY(preview.open(QIODevice::WriteOnly));
  preview.write("<!doctype html>");
  preview.close();

  const QString applicationDirectory = root.filePath(QStringLiteral("bin"));
  QCOMPARE(el_baton::ApplicationPaths::dataFileForApplication(
               applicationDirectory, QStringLiteral("web/preview.html"),
               QStringLiteral("/build/web/preview.html")),
           QFileInfo(preview).canonicalFilePath());
  QCOMPARE(el_baton::ApplicationPaths::dataFileForApplication(
               applicationDirectory, QStringLiteral("missing.txt"),
               QStringLiteral("/build/missing.txt")),
           QStringLiteral("/build/missing.txt"));
}

QTEST_GUILESS_MAIN(ApplicationPathsTest)

#include "application_paths_test.moc"
