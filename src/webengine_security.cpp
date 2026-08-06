#include "webengine_security.h"

#include <QAction>
#include <QFileInfo>
#include <QWebEngineDownloadRequest>
#include <QWebEnginePermission>
#include <QWebEngineProfile>
#include <QWebEngineSettings>

#include <utility>

namespace qt_editor {
namespace {

bool isInside(const QString &parentPath, const QString &childPath) {
  const QString parent = QFileInfo(parentPath).canonicalFilePath();
  const QString child = QFileInfo(childPath).canonicalFilePath();
  if (parent.isEmpty() || child.isEmpty())
    return false;
  const QString prefix =
      parent.endsWith(QLatin1Char('/')) ? parent : parent + QLatin1Char('/');
  return child == parent || child.startsWith(prefix);
}

bool isDisplayResource(QWebEngineUrlRequestInfo::ResourceType type) {
  return type == QWebEngineUrlRequestInfo::ResourceTypeImage ||
         type == QWebEngineUrlRequestInfo::ResourceTypeMedia ||
         type == QWebEngineUrlRequestInfo::ResourceTypeFontResource;
}

bool isReadOnlyAction(QWebEnginePage::WebAction action) {
  switch (action) {
  case QWebEnginePage::Copy:
  case QWebEnginePage::SelectAll:
  case QWebEnginePage::CopyLinkToClipboard:
  case QWebEnginePage::CopyImageToClipboard:
  case QWebEnginePage::CopyImageUrlToClipboard:
  case QWebEnginePage::CopyMediaUrlToClipboard:
    return true;
  default:
    return false;
  }
}

} // namespace

bool WebEngineRequestPolicy::isAllowed(
    const QUrl &url, QWebEngineUrlRequestInfo::ResourceType type,
    const QString &webRoot, const QString &workspaceRoot) {
  const QString scheme = url.scheme().toLower();
  if (scheme == QStringLiteral("qrc")) {
    return url.path() == QStringLiteral("/qtwebchannel/qwebchannel.js");
  }
  if (scheme == QStringLiteral("data") || scheme == QStringLiteral("blob"))
    return isDisplayResource(type);
  if (scheme == QStringLiteral("https"))
    return type == QWebEngineUrlRequestInfo::ResourceTypeImage;
  if (scheme != QStringLiteral("file"))
    return false;

  const QString candidate = url.toLocalFile();
  if (isInside(webRoot, candidate))
    return true;
  return isDisplayResource(type) && isInside(workspaceRoot, candidate);
}

bool WebEngineRequestPolicy::isAllowedMainFrameNavigation(
    const QUrl &url, const QUrl &applicationPage,
    QWebEnginePage::NavigationType type) {
  if (type == QWebEnginePage::NavigationTypeReload)
    return false;
  if (url == QUrl(QStringLiteral("about:blank")))
    return true;
  const QString target = QFileInfo(url.toLocalFile()).canonicalFilePath();
  const QString allowed =
      QFileInfo(applicationPage.toLocalFile()).canonicalFilePath();
  return !target.isEmpty() && target == allowed;
}

WorkspaceRequestInterceptor::WorkspaceRequestInterceptor(
    QString webRoot, std::function<QString()> workspaceRoot, QObject *parent)
    : QWebEngineUrlRequestInterceptor(parent), webRoot_(std::move(webRoot)),
      workspaceRoot_(std::move(workspaceRoot)) {}

void WorkspaceRequestInterceptor::interceptRequest(
    QWebEngineUrlRequestInfo &info) {
  if (!WebEngineRequestPolicy::isAllowed(info.requestUrl(), info.resourceType(),
                                         webRoot_, workspaceRoot_())) {
    info.block(true);
  }
}

RestrictedWebEnginePage::RestrictedWebEnginePage(QWebEngineProfile *profile,
                                                 QUrl applicationPage,
                                                 QObject *parent)
    : QWebEnginePage(profile, parent),
      applicationPage_(std::move(applicationPage)) {
  QWebEngineSettings *pageSettings = settings();
  pageSettings->setAttribute(QWebEngineSettings::JavascriptEnabled, true);
  pageSettings->setAttribute(QWebEngineSettings::AutoLoadImages, true);
  pageSettings->setAttribute(QWebEngineSettings::LocalContentCanAccessFileUrls,
                             true);
  pageSettings->setAttribute(
      QWebEngineSettings::LocalContentCanAccessRemoteUrls, true);
  pageSettings->setAttribute(QWebEngineSettings::JavascriptCanOpenWindows,
                             false);
  pageSettings->setAttribute(QWebEngineSettings::JavascriptCanAccessClipboard,
                             false);
  pageSettings->setAttribute(QWebEngineSettings::JavascriptCanPaste, false);
  pageSettings->setAttribute(QWebEngineSettings::LocalStorageEnabled, false);
  pageSettings->setAttribute(QWebEngineSettings::HyperlinkAuditingEnabled,
                             false);
  pageSettings->setAttribute(QWebEngineSettings::DnsPrefetchEnabled, false);
  pageSettings->setAttribute(QWebEngineSettings::PluginsEnabled, false);
  pageSettings->setAttribute(QWebEngineSettings::FullScreenSupportEnabled,
                             false);
  pageSettings->setAttribute(QWebEngineSettings::ScreenCaptureEnabled, false);
  pageSettings->setAttribute(QWebEngineSettings::WebGLEnabled, false);
  pageSettings->setAttribute(QWebEngineSettings::PdfViewerEnabled, false);
  pageSettings->setAttribute(QWebEngineSettings::NavigateOnDropEnabled, false);
  pageSettings->setAttribute(QWebEngineSettings::AllowRunningInsecureContent,
                             false);

  connect(this, &QWebEnginePage::permissionRequested, this,
          [](const QWebEnginePermission &permission) { permission.deny(); });

  for (const WebAction action :
       {Back, Forward, Reload, ReloadAndBypassCache, OpenLinkInThisWindow,
        OpenLinkInNewWindow, OpenLinkInNewTab, DownloadLinkToDisk,
        DownloadImageToDisk, ViewSource, InspectElement}) {
    this->action(action)->setEnabled(false);
  }
}

void RestrictedWebEnginePage::triggerAction(WebAction action, bool checked) {
  if (isReadOnlyAction(action))
    QWebEnginePage::triggerAction(action, checked);
}

bool RestrictedWebEnginePage::acceptNavigationRequest(const QUrl &url,
                                                      NavigationType type,
                                                      bool isMainFrame) {
  return isMainFrame && WebEngineRequestPolicy::isAllowedMainFrameNavigation(
                            url, applicationPage_, type);
}

QWebEnginePage *RestrictedWebEnginePage::createWindow(WebWindowType) {
  return nullptr;
}

QStringList RestrictedWebEnginePage::chooseFiles(FileSelectionMode,
                                                 const QStringList &,
                                                 const QStringList &) {
  return {};
}

void RestrictedWebEnginePage::javaScriptAlert(const QUrl &, const QString &) {}

bool RestrictedWebEnginePage::javaScriptConfirm(const QUrl &, const QString &) {
  return false;
}

bool RestrictedWebEnginePage::javaScriptPrompt(const QUrl &, const QString &,
                                               const QString &, QString *) {
  return false;
}

void hardenWebEngineProfile(QWebEngineProfile *profile) {
  Q_ASSERT(profile != nullptr);
  profile->setHttpCacheType(QWebEngineProfile::MemoryHttpCache);
  profile->setPersistentCookiesPolicy(QWebEngineProfile::NoPersistentCookies);
  profile->setPersistentPermissionsPolicy(
      QWebEngineProfile::PersistentPermissionsPolicy::StoreInMemory);
  profile->setSpellCheckEnabled(false);
  QObject::connect(profile, &QWebEngineProfile::downloadRequested, profile,
                   [](QWebEngineDownloadRequest *download) {
                     if (download != nullptr)
                       download->cancel();
                   });
}

} // namespace qt_editor
