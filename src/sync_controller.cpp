#include "sync_controller.h"

#include "preview_bridge.h"

#include <QJsonValue>
#include <QScrollBar>
#include <Qsci/qsciscintilla.h>
#include <Qsci/qsciscintillabase.h>

#include <algorithm>
#include <cmath>
#include <utility>

namespace qt_editor {
namespace {

constexpr int kOwnershipIdleMs = 150;

double clampProgress(double value) {
  return std::clamp(std::isfinite(value) ? value : 0.0, 0.0, 1.0);
}

} // namespace

QJsonObject SyncController::Metrics::toJson(qint64 elapsedMs) const {
  const double seconds = std::max<qint64>(1, elapsedMs) / 1000.0;
  return {{"syncRate", (published + applied) / seconds},
          {"droppedSync", static_cast<qint64>(dropped)},
          {"coalescedSync", static_cast<qint64>(coalesced)}};
}

SyncController::SyncController(QsciScintilla *editor, PreviewBridge *bridge,
                               SyncMode mode, QObject *parent)
    : QObject(parent), editor_(editor), bridge_(bridge), mode_(mode) {
  Q_ASSERT(editor_);
  Q_ASSERT(bridge_);
  ownerReleaseTimer_.setSingleShot(true);
  ownerReleaseTimer_.setInterval(kOwnershipIdleMs);
  sourceRateTimer_.setSingleShot(true);
  previewRateTimer_.setSingleShot(true);
  metricsClock_.start();
  sourceRateClock_.start();
  previewRateClock_.start();

  connect(editor_->verticalScrollBar(), &QScrollBar::valueChanged, this,
          &SyncController::sourceScrolled);
  connect(editor_, &QsciScintilla::textChanged, this,
          &SyncController::rebuildLineOffsets);
  connect(bridge_, &PreviewBridge::previewScrolled, this,
          &SyncController::previewScrolled);
  connect(&ownerReleaseTimer_, &QTimer::timeout, this,
          &SyncController::releaseOwner);
  connect(&sourceRateTimer_, &QTimer::timeout, this,
          &SyncController::flushSourceScroll);
  connect(&previewRateTimer_, &QTimer::timeout, this,
          &SyncController::flushPreviewScroll);
  rebuildLineOffsets();
}

void SyncController::setBlocks(QVector<RenderedBlock> blocks,
                               quint64 generation) {
  // An older asynchronous render must never replace the geometry/ranges used
  // by a newer preview generation.
  if (generation < generation_) {
    ++metrics_.dropped;
    publishMetrics();
    return;
  }
  std::stable_sort(blocks.begin(), blocks.end(),
                   [](const RenderedBlock &a, const RenderedBlock &b) {
                     return a.range.start < b.range.start;
                   });
  blocks_ = std::move(blocks);
  generation_ = generation;
  lastPublishedBlock_.clear();
  lastPublishedProgress_ = -1.0;
}

void SyncController::setMode(SyncMode mode) {
  if (mode_ == mode)
    return;
  mode_ = mode;
  releaseOwner();
  lastPublishedBlock_.clear();
  lastPublishedProgress_ = -1.0;
  sourceRateTimer_.stop();
  previewRateTimer_.stop();
  sourceSyncPending_ = false;
  previewSyncPending_.reset();
  previewEndPending_.reset();
}

void SyncController::setTargetFps(int framesPerSecond) {
  const int clamped = std::clamp(framesPerSecond, 1, 60);
  const int interval = clamped >= 60 ? 0 : 1000 / clamped;
  if (syncIntervalMs_ == interval)
    return;
  syncIntervalMs_ = interval;
  sourceRateTimer_.stop();
  previewRateTimer_.stop();
  if (syncIntervalMs_ == 0) {
    flushSourceScroll();
    flushPreviewScroll();
    return;
  }
  if (sourceSyncPending_)
    sourceRateTimer_.start(syncIntervalMs_);
  if (previewSyncPending_.has_value())
    previewRateTimer_.start(syncIntervalMs_);
}

void SyncController::sourceScrolled(int) {
  if (mode_ == SyncMode::Disabled)
    return;
  if (applyingPreviewScroll_) {
    ++metrics_.coalesced;
    publishMetrics();
    return;
  }
  if (owner_ == Owner::Preview) {
    ++metrics_.dropped;
    publishMetrics();
    return;
  }

  const qint64 elapsed = sourceRateClock_.elapsed();
  if (syncIntervalMs_ == 0 || elapsed >= syncIntervalMs_) {
    sourceRateClock_.restart();
    processSourceScroll();
    return;
  }
  if (sourceSyncPending_) {
    ++metrics_.coalesced;
    publishMetrics();
  }
  sourceSyncPending_ = true;
  if (!sourceRateTimer_.isActive())
    sourceRateTimer_.start(syncIntervalMs_ - static_cast<int>(elapsed));
}

void SyncController::flushSourceScroll() {
  if (!sourceSyncPending_)
    return;
  sourceSyncPending_ = false;
  sourceRateClock_.restart();
  processSourceScroll();
}

void SyncController::processSourceScroll() {
  if (mode_ == SyncMode::Disabled)
    return;
  if (owner_ == Owner::Preview) {
    ++metrics_.dropped;
    publishMetrics();
    return;
  }

  QJsonObject target{{"owner", "source"},
                     {"generation", static_cast<qint64>(generation_)}};
  if (mode_ == SyncMode::Percentage) {
    const double percentage = sourcePercentage();
    if (lastPublishedBlock_ == QStringLiteral("%") &&
        std::abs(lastPublishedProgress_ - percentage) < 0.0001) {
      ++metrics_.coalesced;
      publishMetrics();
      return;
    }
    target.insert("mode", "percentage");
    target.insert("percentage", percentage);
    lastPublishedBlock_ = QStringLiteral("%");
    lastPublishedProgress_ = percentage;
  } else {
    const qsizetype offset = sourceOffsetAtViewport();
    const RenderedBlock *block = blockAtSourceOffset(offset);
    if (!block) {
      ++metrics_.dropped;
      publishMetrics();
      return;
    }
    const qsizetype span =
        std::max<qsizetype>(0, block->range.end - block->range.start);
    const bool interpolate =
        block->syncMode == QStringLiteral("interpolate") && span > 0;
    const double progress =
        interpolate
            ? clampProgress(static_cast<double>(offset - block->range.start) /
                            span)
            : 0.0;
    if (lastPublishedBlock_ == block->id &&
        std::abs(lastPublishedProgress_ - progress) < 0.0001) {
      ++metrics_.coalesced;
      publishMetrics();
      return;
    }
    target.insert("mode", "semantic");
    target.insert("blockId", block->id);
    target.insert("progress", progress);
    lastPublishedBlock_ = block->id;
    lastPublishedProgress_ = progress;
  }

  acquire(Owner::Source);
  ++metrics_.published;
  bridge_->publishSourceScroll(target);
  publishMetrics();
}

void SyncController::previewScrolled(const QJsonObject &position) {
  if (position.value("phase").toString() == QStringLiteral("end")) {
    if (previewSyncPending_.has_value() || previewRateTimer_.isActive()) {
      previewEndPending_ = position;
      return;
    }
    processPreviewScroll(position);
    return;
  }
  previewEndPending_.reset();
  const qint64 elapsed = previewRateClock_.elapsed();
  if (syncIntervalMs_ == 0 || elapsed >= syncIntervalMs_) {
    previewRateClock_.restart();
    processPreviewScroll(position);
    return;
  }
  if (previewSyncPending_.has_value()) {
    ++metrics_.coalesced;
    publishMetrics();
  }
  previewSyncPending_ = position;
  if (!previewRateTimer_.isActive())
    previewRateTimer_.start(syncIntervalMs_ - static_cast<int>(elapsed));
}

void SyncController::flushPreviewScroll() {
  if (!previewSyncPending_.has_value())
    return;
  const QJsonObject position = std::move(*previewSyncPending_);
  previewSyncPending_.reset();
  previewRateClock_.restart();
  processPreviewScroll(position);
  if (previewEndPending_.has_value()) {
    const QJsonObject end = std::move(*previewEndPending_);
    previewEndPending_.reset();
    processPreviewScroll(end);
  }
}

void SyncController::processPreviewScroll(const QJsonObject &position) {
  if (mode_ == SyncMode::Disabled)
    return;
  if (position.value("owner").toString() != QStringLiteral("preview")) {
    // A source-owned DOM scroll is the reciprocal event generated by our own
    // publishSourceScroll call and must not come back into the editor.
    ++metrics_.coalesced;
    publishMetrics();
    return;
  }
  if (position.value("generation").toVariant().toULongLong() != generation_) {
    ++metrics_.dropped;
    publishMetrics();
    return;
  }
  if (position.value("phase").toString() == QStringLiteral("end")) {
    if (owner_ == Owner::Preview)
      releaseOwner();
    return;
  }
  if (owner_ == Owner::Source) {
    ++metrics_.dropped;
    publishMetrics();
    return;
  }

  int targetVisibleLine = 0;
  if (mode_ == SyncMode::Percentage) {
    const double percentage =
        clampProgress(position.value("percentage").toDouble());
    auto *bar = editor_->verticalScrollBar();
    targetVisibleLine =
        bar->minimum() +
        std::lround(percentage * (bar->maximum() - bar->minimum()));
  } else {
    const QString id = position.value("blockId").toString();
    const auto it = std::find_if(
        blocks_.cbegin(), blocks_.cend(),
        [&id](const RenderedBlock &block) { return block.id == id; });
    if (it == blocks_.cend()) {
      ++metrics_.dropped; // Includes a block removed by the current render.
      publishMetrics();
      return;
    }
    const qsizetype span =
        std::max<qsizetype>(0, it->range.end - it->range.start);
    const bool interpolate =
        it->syncMode == QStringLiteral("interpolate") && span > 0;
    const double progress =
        interpolate ? clampProgress(position.value("progress").toDouble())
                    : 0.0;
    targetVisibleLine = visibleLineForSourceOffset(
        it->range.start + std::lround(progress * span));
  }

  acquire(Owner::Preview);
  const int current = editor_->firstVisibleLine();
  if (current == targetVisibleLine) {
    ++metrics_.coalesced;
  } else {
    applyingPreviewScroll_ = true;
    // QScintilla's vertical scrollbar is measured in display lines (including
    // wrapped continuations), the same units accepted by
    // SCI_SETFIRSTVISIBLELINE. Driving the scrollbar also guarantees a
    // valueChanged notification, which is synchronously suppressed here as the
    // reciprocal programmatic event.
    editor_->verticalScrollBar()->setValue(targetVisibleLine);
    applyingPreviewScroll_ = false;
    ++metrics_.applied;
  }
  publishMetrics();
}

void SyncController::releaseOwner() {
  ownerReleaseTimer_.stop();
  if (owner_ == Owner::None)
    return;
  owner_ = Owner::None;
  emit ownerChanged(owner_);
}

void SyncController::rebuildLineOffsets() {
  lineOffsets_.clear();
  lineOffsets_.push_back(0);
  const QString text = editor_->text();
  for (qsizetype index = 0; index < text.size(); ++index) {
    if (text.at(index) == QLatin1Char('\n'))
      lineOffsets_.push_back(index + 1);
  }
}

qsizetype SyncController::sourceOffsetAtViewport() const {
  if (lineOffsets_.isEmpty())
    return 0;
  const int visibleLine = std::max(0, editor_->firstVisibleLine());
  const int documentLine = std::clamp<int>(
      editor_->SendScintilla(QsciScintillaBase::SCI_DOCLINEFROMVISIBLE,
                             visibleLine),
      0, lineOffsets_.size() - 1);
  const int firstDisplay = editor_->SendScintilla(
      QsciScintillaBase::SCI_VISIBLEFROMDOCLINE, documentLine);
  const int nextDisplay =
      documentLine + 1 < lineOffsets_.size()
          ? editor_->SendScintilla(QsciScintillaBase::SCI_VISIBLEFROMDOCLINE,
                                   documentLine + 1)
          : firstDisplay + 1;
  const int displaySpan = std::max(1, nextDisplay - firstDisplay);
  const double fraction = clampProgress(
      static_cast<double>(visibleLine - firstDisplay) / displaySpan);
  const qsizetype start = lineOffsets_.at(documentLine);
  const qsizetype end = documentLine + 1 < lineOffsets_.size()
                            ? lineOffsets_.at(documentLine + 1)
                            : editor_->text().size();
  return start + std::lround(fraction * std::max<qsizetype>(0, end - start));
}

int SyncController::visibleLineForSourceOffset(qsizetype offset) const {
  if (lineOffsets_.isEmpty())
    return 0;
  const qsizetype textSize = editor_->text().size();
  offset = std::clamp<qsizetype>(offset, 0, textSize);
  auto upper =
      std::upper_bound(lineOffsets_.cbegin(), lineOffsets_.cend(), offset);
  const int documentLine = std::max<int>(0, upper - lineOffsets_.cbegin() - 1);
  const qsizetype start = lineOffsets_.at(documentLine);
  const qsizetype end = documentLine + 1 < lineOffsets_.size()
                            ? lineOffsets_.at(documentLine + 1)
                            : textSize;
  const double fraction =
      end > start
          ? clampProgress(static_cast<double>(offset - start) / (end - start))
          : 0.0;
  const int firstDisplay = editor_->SendScintilla(
      QsciScintillaBase::SCI_VISIBLEFROMDOCLINE, documentLine);
  const int nextDisplay =
      documentLine + 1 < lineOffsets_.size()
          ? editor_->SendScintilla(QsciScintillaBase::SCI_VISIBLEFROMDOCLINE,
                                   documentLine + 1)
          : firstDisplay + 1;
  return firstDisplay +
         std::lround(fraction * std::max(0, nextDisplay - firstDisplay - 1));
}

const RenderedBlock *
SyncController::blockAtSourceOffset(qsizetype offset) const {
  if (blocks_.isEmpty())
    return nullptr;
  auto upper =
      std::upper_bound(blocks_.cbegin(), blocks_.cend(), offset,
                       [](qsizetype value, const RenderedBlock &block) {
                         return value < block.range.start;
                       });
  if (upper == blocks_.cbegin())
    return &blocks_.first();
  --upper;
  // Zero-width/anchor-only blocks win at their exact source position.
  while (upper + 1 != blocks_.cend() && (upper + 1)->range.start == offset)
    ++upper;
  return &*upper;
}

double SyncController::sourcePercentage() const {
  const auto *bar = editor_->verticalScrollBar();
  const int span = bar->maximum() - bar->minimum();
  return span > 0
             ? clampProgress(
                   static_cast<double>(bar->value() - bar->minimum()) / span)
             : 0.0;
}

void SyncController::acquire(Owner owner) {
  ownerReleaseTimer_.start();
  if (owner_ == owner)
    return;
  owner_ = owner;
  emit ownerChanged(owner_);
}

void SyncController::publishMetrics() {
  emit syncMetricsChanged(metrics_.toJson(metricsClock_.elapsed()));
}

} // namespace qt_editor
