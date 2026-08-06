#pragma once

#include <QWebEnginePage>
#include <QWebEngineUrlRequestInfo>
#include <QWebEngineUrlRequestInterceptor>

#include <functional>

class QWebEngineProfile;

namespace qt_editor {

class WebEngineRequestPolicy final {
public:
  [[nodiscard]] static bool
  isAllowed(const QUrl &url, QWebEngineUrlRequestInfo::ResourceType type,
            const QString &webRoot, const QString &workspaceRoot);
  [[nodiscard]] static bool
  isAllowedMainFrameNavigation(const QUrl &url, const QUrl &applicationPage,
                               QWebEnginePage::NavigationType type);
};

class WorkspaceRequestInterceptor final
    : public QWebEngineUrlRequestInterceptor {
public:
  WorkspaceRequestInterceptor(QString webRoot,
                              std::function<QString()> workspaceRoot,
                              QObject *parent = nullptr);

  void interceptRequest(QWebEngineUrlRequestInfo &info) override;

private:
  QString webRoot_;
  std::function<QString()> workspaceRoot_;
};

class RestrictedWebEnginePage final : public QWebEnginePage {
public:
  RestrictedWebEnginePage(QWebEngineProfile *profile, QUrl applicationPage,
                          QObject *parent = nullptr);

  void triggerAction(WebAction action, bool checked = false) override;

protected:
  [[nodiscard]] bool acceptNavigationRequest(const QUrl &url,
                                             NavigationType type,
                                             bool isMainFrame) override;
  [[nodiscard]] QWebEnginePage *createWindow(WebWindowType type) override;
  [[nodiscard]] QStringList
  chooseFiles(FileSelectionMode mode, const QStringList &oldFiles,
              const QStringList &acceptedMimeTypes) override;
  void javaScriptAlert(const QUrl &securityOrigin,
                       const QString &message) override;
  [[nodiscard]] bool javaScriptConfirm(const QUrl &securityOrigin,
                                       const QString &message) override;
  [[nodiscard]] bool javaScriptPrompt(const QUrl &securityOrigin,
                                      const QString &message,
                                      const QString &defaultValue,
                                      QString *result) override;

private:
  QUrl applicationPage_;
};

void hardenWebEngineProfile(QWebEngineProfile *profile);

} // namespace qt_editor
