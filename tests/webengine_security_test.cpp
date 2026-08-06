#include "webengine_security.h"

#include <QDir>
#include <QFile>
#include <QTemporaryDir>
#include <QtTest>

using qt_editor::WebEngineRequestPolicy;

namespace {

QString writeFile(const QString &path, const QByteArray &contents = {}) {
  QFile file(path);
  if (!file.open(QIODevice::WriteOnly) ||
      file.write(contents) != contents.size())
    return {};
  file.close();
  return file.fileName();
}

} // namespace

class WebEngineSecurityTest final : public QObject {
  Q_OBJECT

private slots:
  void permitsOnlyRequiredApplicationAndWorkspaceResources();
  void restrictsRemoteAndSyntheticResources();
  void restrictsMainFrameNavigationAndReload();
};

void WebEngineSecurityTest::
    permitsOnlyRequiredApplicationAndWorkspaceResources() {
  QTemporaryDir directory;
  QVERIFY(directory.isValid());
  QDir root(directory.path());
  QVERIFY(root.mkpath(QStringLiteral("web")));
  QVERIFY(root.mkpath(QStringLiteral("workspace/attachments")));
  QVERIFY(root.mkpath(QStringLiteral("outside")));
  const QString script =
      writeFile(root.filePath(QStringLiteral("web/preview.js")), "script");
  const QString image = writeFile(
      root.filePath(QStringLiteral("workspace/attachments/image.png")),
      "image");
  const QString outside =
      writeFile(root.filePath(QStringLiteral("outside/private.js")), "data");
  QVERIFY(!script.isEmpty());
  QVERIFY(!image.isEmpty());
  QVERIFY(!outside.isEmpty());

  const QString webRoot = root.filePath(QStringLiteral("web"));
  const QString workspaceRoot = root.filePath(QStringLiteral("workspace"));
  QVERIFY(WebEngineRequestPolicy::isAllowed(
      QUrl::fromLocalFile(script), QWebEngineUrlRequestInfo::ResourceTypeScript,
      webRoot, workspaceRoot));
  QVERIFY(WebEngineRequestPolicy::isAllowed(
      QUrl::fromLocalFile(image), QWebEngineUrlRequestInfo::ResourceTypeImage,
      webRoot, workspaceRoot));
  QVERIFY(!WebEngineRequestPolicy::isAllowed(
      QUrl::fromLocalFile(image), QWebEngineUrlRequestInfo::ResourceTypeScript,
      webRoot, workspaceRoot));
  QVERIFY(!WebEngineRequestPolicy::isAllowed(
      QUrl::fromLocalFile(outside),
      QWebEngineUrlRequestInfo::ResourceTypeScript, webRoot, workspaceRoot));
#ifdef Q_OS_UNIX
  const QString linkedImage =
      root.filePath(QStringLiteral("workspace/attachments/linked.png"));
  QVERIFY(QFile::link(outside, linkedImage));
  QVERIFY(!WebEngineRequestPolicy::isAllowed(
      QUrl::fromLocalFile(linkedImage),
      QWebEngineUrlRequestInfo::ResourceTypeImage, webRoot, workspaceRoot));
#endif
}

void WebEngineSecurityTest::restrictsRemoteAndSyntheticResources() {
  const QString root = QStringLiteral("/not/used");
  QVERIFY(WebEngineRequestPolicy::isAllowed(
      QUrl(QStringLiteral("https://images.example/image.png")),
      QWebEngineUrlRequestInfo::ResourceTypeImage, root, root));
  QVERIFY(!WebEngineRequestPolicy::isAllowed(
      QUrl(QStringLiteral("http://images.example/image.png")),
      QWebEngineUrlRequestInfo::ResourceTypeImage, root, root));
  QVERIFY(!WebEngineRequestPolicy::isAllowed(
      QUrl(QStringLiteral("https://example.test/script.js")),
      QWebEngineUrlRequestInfo::ResourceTypeScript, root, root));
  QVERIFY(!WebEngineRequestPolicy::isAllowed(
      QUrl(QStringLiteral("https://example.test/data")),
      QWebEngineUrlRequestInfo::ResourceTypeXhr, root, root));
  QVERIFY(WebEngineRequestPolicy::isAllowed(
      QUrl(QStringLiteral("data:image/png;base64,AA==")),
      QWebEngineUrlRequestInfo::ResourceTypeImage, root, root));
  QVERIFY(!WebEngineRequestPolicy::isAllowed(
      QUrl(QStringLiteral("data:text/javascript,alert(1)")),
      QWebEngineUrlRequestInfo::ResourceTypeScript, root, root));
  QVERIFY(WebEngineRequestPolicy::isAllowed(
      QUrl(QStringLiteral("qrc:///qtwebchannel/qwebchannel.js")),
      QWebEngineUrlRequestInfo::ResourceTypeScript, root, root));
  QVERIFY(!WebEngineRequestPolicy::isAllowed(
      QUrl(QStringLiteral("qrc:///unexpected/resource.js")),
      QWebEngineUrlRequestInfo::ResourceTypeScript, root, root));
}

void WebEngineSecurityTest::restrictsMainFrameNavigationAndReload() {
  QTemporaryDir directory;
  QVERIFY(directory.isValid());
  const QString preview =
      writeFile(QDir(directory.path()).filePath(QStringLiteral("preview.html")),
                "<!doctype html>");
  const QString other =
      writeFile(QDir(directory.path()).filePath(QStringLiteral("other.html")),
                "<!doctype html>");
  QVERIFY(!preview.isEmpty());
  QVERIFY(!other.isEmpty());
  const QUrl allowed = QUrl::fromLocalFile(preview);

  QVERIFY(WebEngineRequestPolicy::isAllowedMainFrameNavigation(
      allowed, allowed, QWebEnginePage::NavigationTypeTyped));
  QVERIFY(!WebEngineRequestPolicy::isAllowedMainFrameNavigation(
      allowed, allowed, QWebEnginePage::NavigationTypeReload));
  QVERIFY(!WebEngineRequestPolicy::isAllowedMainFrameNavigation(
      QUrl::fromLocalFile(other), allowed,
      QWebEnginePage::NavigationTypeLinkClicked));
  QVERIFY(!WebEngineRequestPolicy::isAllowedMainFrameNavigation(
      QUrl(QStringLiteral("https://example.test")), allowed,
      QWebEnginePage::NavigationTypeLinkClicked));
}

QTEST_GUILESS_MAIN(WebEngineSecurityTest)

#include "webengine_security_test.moc"
