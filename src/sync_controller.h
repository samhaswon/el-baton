#pragma once

#include "types.h"

#include <QElapsedTimer>
#include <QJsonObject>
#include <QObject>
#include <QTimer>

#include <optional>

class QsciScintilla;

namespace qt_editor {

class PreviewBridge;

// Translates the editor's line-based viewport into semantic block positions.
// Scroll ownership is deliberately short lived: a pane owns synchronization
// until 150 ms after its last accepted update, or until it sends phase="end".
class SyncController final : public QObject {
  Q_OBJECT

public:
  enum class Owner { None, Source, Preview };
  Q_ENUM(Owner)

  struct Metrics {
    quint64 published = 0;
    quint64 applied = 0;
    quint64 dropped = 0;
    quint64 coalesced = 0;
    [[nodiscard]] QJsonObject toJson(qint64 elapsedMs) const;
  };

  SyncController(QsciScintilla *editor, PreviewBridge *bridge, SyncMode mode,
                 QObject *parent = nullptr);
  void setBlocks(QVector<RenderedBlock> blocks, quint64 generation);
  void setMode(SyncMode mode);
  void setTargetFps(int framesPerSecond);

  [[nodiscard]] Owner owner() const { return owner_; }
  [[nodiscard]] quint64 generation() const { return generation_; }
  [[nodiscard]] Metrics metrics() const { return metrics_; }

signals:
  void ownerChanged(qt_editor::SyncController::Owner owner);
  void syncMetricsChanged(const QJsonObject &metrics);

private slots:
  void sourceScrolled(int value);
  void previewScrolled(const QJsonObject &position);
  void flushSourceScroll();
  void flushPreviewScroll();
  void releaseOwner();
  void rebuildLineOffsets();

private:
  [[nodiscard]] qsizetype sourceOffsetAtViewport() const;
  [[nodiscard]] int visibleLineForSourceOffset(qsizetype offset) const;
  [[nodiscard]] const RenderedBlock *
  blockAtSourceOffset(qsizetype offset) const;
  [[nodiscard]] double sourcePercentage() const;
  void processSourceScroll();
  void processPreviewScroll(const QJsonObject &position);
  void acquire(Owner owner);
  void publishMetrics();

  QsciScintilla *editor_;
  PreviewBridge *bridge_;
  SyncMode mode_;
  QVector<RenderedBlock> blocks_;
  QVector<qsizetype> lineOffsets_;
  quint64 generation_ = 0;
  Owner owner_ = Owner::None;
  QTimer ownerReleaseTimer_;
  QTimer sourceRateTimer_;
  QTimer previewRateTimer_;
  QElapsedTimer metricsClock_;
  QElapsedTimer sourceRateClock_;
  QElapsedTimer previewRateClock_;
  Metrics metrics_;
  bool applyingPreviewScroll_ = false;
  bool sourceSyncPending_ = false;
  std::optional<QJsonObject> previewSyncPending_;
  std::optional<QJsonObject> previewEndPending_;
  int syncIntervalMs_ = 0;
  QString lastPublishedBlock_;
  double lastPublishedProgress_ = -1.0;
};

} // namespace qt_editor
