#pragma once

#include <QJsonObject>
#include <QObject>

namespace qt_editor {

// Minimal semantic C++/JavaScript API. No method evaluates script supplied by a document.
class PreviewBridge final : public QObject {
  Q_OBJECT

 public:
  explicit PreviewBridge(QObject* parent = nullptr);

  // Sends one batched document update to the preview.
  void publishRender(const QJsonObject& update);
  // Sends a semantic source-owned scroll target to the preview.
  void publishSourceScroll(const QJsonObject& target);

 signals:
  void renderPublished(const QJsonObject& update);
  void sourceScrollPublished(const QJsonObject& target);
  void mermaidRenderRequested(const QJsonObject& batch);
  void mermaidResultsPublished(const QJsonObject& batch);
  void previewScrolled(const QJsonObject& position);
  void browserMetricsChanged(const QJsonObject& metrics);
  void externalLinkRequested(const QString& url);
  void clientReady(const QString& role);

 public slots:
  // Reports a preview-owned semantic position: block ID, progress, and generation.
  void reportPreviewScroll(const QJsonObject& position);
  // Reports aggregated browser timings and geometry stability, never per-event logs.
  void reportMetrics(const QJsonObject& metrics);
  // Requests that C++ open a normal http(s) link; non-http(s) schemes are rejected.
  void requestExternalLink(const QString& url);
  // Requests one semantic batch of Mermaid sources for the optional hidden page.
  void requestMermaidRender(const QJsonObject& batch);
  // Returns rendered SVG/errors from the hidden page to the visible preview.
  void reportMermaidResults(const QJsonObject& batch);
  // Announces that a page has connected before C++ publishes its first batch.
  void reportReady(const QString& role);

 private:
  bool mermaidReady_ = false;
  QJsonObject pendingMermaidBatch_;
};

}  // namespace qt_editor
