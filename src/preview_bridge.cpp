#include "preview_bridge.h"
#include "persistent_diagram_cache.h"

#include <QDesktopServices>
#include <QDir>
#include <QJsonArray>
#include <QStandardPaths>
#include <QUrl>

namespace qt_editor {

namespace {
constexpr auto kMermaidCacheVersion = "mermaid-v11.15.0:";

QString requestCacheId(qint64 generation, const QString &id) {
  return QString::number(generation) + QLatin1Char(':') + id;
}
} // namespace

PreviewBridge::PreviewBridge(QObject *parent)
    : QObject(parent),
      persistentCache_(std::make_unique<PersistentDiagramCache>(
          QDir(QStandardPaths::writableLocation(
                   QStandardPaths::GenericCacheLocation))
              .filePath(QStringLiteral("el-baton/diagrams.sqlite3")))) {}

PreviewBridge::~PreviewBridge() = default;

void PreviewBridge::configureDiagramCache(int maxEntries, qint64 maxBytes) {
  persistentCache_->configure(maxEntries, maxBytes);
}

void PreviewBridge::publishRender(const QJsonObject &update) {
  emit renderPublished(update);
}
void PreviewBridge::publishSourceScroll(const QJsonObject &target) {
  emit sourceScrollPublished(target);
}
void PreviewBridge::publishPlantUmlResults(const QJsonObject &batch) {
  emit plantUmlResultsPublished(batch);
}
void PreviewBridge::reportPreviewScroll(const QJsonObject &position) {
  emit previewScrolled(position);
}
void PreviewBridge::reportMetrics(const QJsonObject &metrics) {
  emit browserMetricsChanged(metrics);
}
void PreviewBridge::requestMermaidRender(const QJsonObject &batch) {
  const qint64 generation =
      batch.value(QStringLiteral("generation")).toVariant().toLongLong();
  QJsonArray cachedResults;
  QJsonArray uncachedRequests;
  const QJsonArray requests = batch.value(QStringLiteral("requests")).toArray();
  for (const QJsonValue &value : requests) {
    const QJsonObject request = value.toObject();
    const QString id = request.value(QStringLiteral("id")).toString();
    const QString clientKey =
        request.value(QStringLiteral("cacheKey")).toString();
    if (id.isEmpty() || clientKey.isEmpty())
      continue;
    const QString persistentKey =
        QString::fromLatin1(kMermaidCacheVersion) + clientKey;
    if (const auto stored = persistentCache_->get(persistentKey);
        stored.has_value()) {
      QJsonObject result = *stored;
      result.insert(QStringLiteral("id"), id);
      cachedResults.append(result);
      continue;
    }
    pendingMermaidCacheKeys_.insert(requestCacheId(generation, id),
                                    persistentKey);
    uncachedRequests.append(request);
  }
  if (!cachedResults.isEmpty()) {
    emit mermaidResultsPublished({{QStringLiteral("generation"), generation},
                                  {QStringLiteral("results"), cachedResults},
                                  {QStringLiteral("mermaidMs"), 0.0}});
  }
  if (uncachedRequests.isEmpty())
    return;
  QJsonObject uncachedBatch = batch;
  uncachedBatch.insert(QStringLiteral("requests"), uncachedRequests);
  if (!mermaidReady_) {
    pendingMermaidBatch_ = uncachedBatch;
    return;
  }
  emit mermaidRenderRequested(uncachedBatch);
}
void PreviewBridge::reportMermaidResults(const QJsonObject &batch) {
  const qint64 generation =
      batch.value(QStringLiteral("generation")).toVariant().toLongLong();
  for (const QJsonValue &value :
       batch.value(QStringLiteral("results")).toArray()) {
    const QJsonObject result = value.toObject();
    const QString id = result.value(QStringLiteral("id")).toString();
    const QString pendingId = requestCacheId(generation, id);
    const QString persistentKey = pendingMermaidCacheKeys_.take(pendingId);
    if (!persistentKey.isEmpty() &&
        result.value(QStringLiteral("ok")).toBool()) {
      QJsonObject stored = result;
      stored.remove(QStringLiteral("id"));
      (void)persistentCache_->put(persistentKey, stored);
    }
  }
  emit mermaidResultsPublished(batch);
}
void PreviewBridge::requestPlantUmlRender(const QJsonObject &batch) {
  emit plantUmlRenderRequested(batch);
}
void PreviewBridge::reportReady(const QString &role) {
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

void PreviewBridge::requestExternalLink(const QString &url) {
  const QUrl parsed(url);
  if (!parsed.isValid() ||
      (parsed.scheme() != "http" && parsed.scheme() != "https"))
    return;
  emit externalLinkRequested(url);
  QDesktopServices::openUrl(parsed);
}

void PreviewBridge::requestInternalLink(const QString &kind,
                                        const QString &target) {
  if (target.isEmpty())
    return;
  if (kind != QStringLiteral("note") && kind != QStringLiteral("attachment") &&
      kind != QStringLiteral("tag") && kind != QStringLiteral("file"))
    return;
  emit internalLinkRequested(kind, target);
}

void PreviewBridge::requestTaskToggle(qsizetype taskIndex, bool checked) {
  if (taskIndex >= 0)
    emit taskToggleRequested(taskIndex, checked);
}

void PreviewBridge::requestDetailsToggle(qsizetype detailsIndex, bool open) {
  if (detailsIndex >= 0)
    emit detailsToggleRequested(detailsIndex, open);
}

void PreviewBridge::reportRenderApplied(qint64 generation) {
  if (generation >= 0)
    emit renderApplied(generation);
}

} // namespace qt_editor
