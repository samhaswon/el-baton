#include "preview_bridge.h"

#include <QDesktopServices>
#include <QUrl>

namespace qt_editor {

PreviewBridge::PreviewBridge(QObject* parent) : QObject(parent) {}

void PreviewBridge::publishRender(const QJsonObject& update) { emit renderPublished(update); }
void PreviewBridge::publishSourceScroll(const QJsonObject& target) { emit sourceScrollPublished(target); }
void PreviewBridge::publishPlantUmlResults(const QJsonObject& batch) { emit plantUmlResultsPublished(batch); }
void PreviewBridge::reportPreviewScroll(const QJsonObject& position) { emit previewScrolled(position); }
void PreviewBridge::reportMetrics(const QJsonObject& metrics) { emit browserMetricsChanged(metrics); }
void PreviewBridge::requestMermaidRender(const QJsonObject& batch) {
  if (!mermaidReady_) { pendingMermaidBatch_ = batch; return; }
  emit mermaidRenderRequested(batch);
}
void PreviewBridge::reportMermaidResults(const QJsonObject& batch) { emit mermaidResultsPublished(batch); }
void PreviewBridge::requestPlantUmlRender(const QJsonObject& batch) { emit plantUmlRenderRequested(batch); }
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

void PreviewBridge::requestInternalLink(const QString& kind, const QString& target) {
  if (target.isEmpty()) return;
  if (kind != QStringLiteral("note") && kind != QStringLiteral("attachment") &&
      kind != QStringLiteral("tag") && kind != QStringLiteral("file")) return;
  emit internalLinkRequested(kind, target);
}

void PreviewBridge::requestTaskToggle(qsizetype taskIndex, bool checked) {
  if (taskIndex >= 0) emit taskToggleRequested(taskIndex, checked);
}

void PreviewBridge::requestDetailsToggle(qsizetype detailsIndex, bool open) {
  if (detailsIndex >= 0) emit detailsToggleRequested(detailsIndex, open);
}

}  // namespace qt_editor
