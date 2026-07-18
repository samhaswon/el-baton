#include "preview_bridge.h"

#include <QDesktopServices>
#include <QUrl>

namespace qt_editor {

PreviewBridge::PreviewBridge(QObject* parent) : QObject(parent) {}

void PreviewBridge::publishRender(const QJsonObject& update) { emit renderPublished(update); }
void PreviewBridge::publishSourceScroll(const QJsonObject& target) { emit sourceScrollPublished(target); }
void PreviewBridge::reportPreviewScroll(const QJsonObject& position) { emit previewScrolled(position); }
void PreviewBridge::reportMetrics(const QJsonObject& metrics) { emit browserMetricsChanged(metrics); }
void PreviewBridge::requestMermaidRender(const QJsonObject& batch) {
  if (!mermaidReady_) { pendingMermaidBatch_ = batch; return; }
  emit mermaidRenderRequested(batch);
}
void PreviewBridge::reportMermaidResults(const QJsonObject& batch) { emit mermaidResultsPublished(batch); }
void PreviewBridge::reportReady(const QString& role) {
  if (role == QStringLiteral("mermaid")) {
    mermaidReady_ = true;
    if (!pendingMermaidBatch_.isEmpty()) {
      const QJsonObject pending = pendingMermaidBatch_;
      pendingMermaidBatch_ = {};
      emit mermaidRenderRequested(pending);
    }
  }
  emit clientReady(role);
}

void PreviewBridge::requestExternalLink(const QString& url) {
  const QUrl parsed(url);
  if (!parsed.isValid() || (parsed.scheme() != "http" && parsed.scheme() != "https")) return;
  emit externalLinkRequested(url);
  QDesktopServices::openUrl(parsed);
}

}  // namespace qt_editor
