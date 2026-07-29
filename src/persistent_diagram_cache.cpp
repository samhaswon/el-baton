#include "persistent_diagram_cache.h"

#include <QDateTime>
#include <QDir>
#include <QFileInfo>
#include <QJsonDocument>
#include <QSqlDatabase>
#include <QSqlError>
#include <QSqlQuery>
#include <QUuid>

#include <algorithm>
#include <utility>

namespace qt_editor {

namespace {
qint64 nextAccessTime(qint64 &clock) {
  clock = std::max(QDateTime::currentMSecsSinceEpoch(), clock + 1);
  return clock;
}
} // namespace

PersistentDiagramCache::PersistentDiagramCache(QString databasePath)
    : databasePath_(std::move(databasePath)),
      connectionName_(QStringLiteral("el-baton-diagrams-") +
                      QUuid::createUuid().toString(QUuid::WithoutBraces)) {}

PersistentDiagramCache::~PersistentDiagramCache() {
  if (QSqlDatabase::contains(connectionName_)) {
    QSqlDatabase database = QSqlDatabase::database(connectionName_, false);
    database.close();
  }
  QSqlDatabase::removeDatabase(connectionName_);
}

void PersistentDiagramCache::configure(int maxEntries, qint64 maxBytes) {
  maxEntries_ = std::clamp(maxEntries, 20, 5000);
  maxBytes_ = std::clamp<qint64>(maxBytes, 1024 * 1024, 512LL * 1024 * 1024);
  if (ensureOpen())
    (void)prune();
}

bool PersistentDiagramCache::ensureOpen() {
  if (QSqlDatabase::contains(connectionName_)) {
    QSqlDatabase existing = QSqlDatabase::database(connectionName_, false);
    if (existing.isOpen())
      return true;
  }
  if (!QDir().mkpath(QFileInfo(databasePath_).absolutePath())) {
    setError(QStringLiteral("Unable to create diagram cache directory"));
    return false;
  }
  QSqlDatabase database =
      QSqlDatabase::addDatabase(QStringLiteral("QSQLITE"), connectionName_);
  database.setDatabaseName(databasePath_);
  database.setConnectOptions(QStringLiteral("QSQLITE_BUSY_TIMEOUT=5000"));
  if (!database.open()) {
    setError(database.lastError().text());
    return false;
  }
  QSqlQuery query(database);
  for (const QString &statement : {
           QStringLiteral("PRAGMA journal_mode=WAL"),
           QStringLiteral("PRAGMA synchronous=NORMAL"),
           QStringLiteral(
               "CREATE TABLE IF NOT EXISTS diagram_cache ("
               "cache_key TEXT PRIMARY KEY, payload BLOB NOT NULL, "
               "size_bytes INTEGER NOT NULL, last_accessed INTEGER NOT NULL)"),
           QStringLiteral("CREATE INDEX IF NOT EXISTS diagram_cache_lru "
                          "ON diagram_cache(last_accessed)"),
       }) {
    if (!query.exec(statement)) {
      setError(query.lastError().text());
      return false;
    }
  }
  lastError_.clear();
  return true;
}

std::optional<QJsonObject> PersistentDiagramCache::get(const QString &key) {
  if (!ensureOpen())
    return std::nullopt;
  QSqlDatabase database = QSqlDatabase::database(connectionName_);
  QSqlQuery query(database);
  query.prepare(
      QStringLiteral("SELECT payload FROM diagram_cache WHERE cache_key = ?"));
  query.addBindValue(key);
  if (!query.exec() || !query.next())
    return std::nullopt;
  const QByteArray encoded = qUncompress(query.value(0).toByteArray());
  const QJsonDocument document = QJsonDocument::fromJson(encoded);
  if (!document.isObject())
    return std::nullopt;
  QSqlQuery touch(database);
  touch.prepare(QStringLiteral(
      "UPDATE diagram_cache SET last_accessed = ? WHERE cache_key = ?"));
  touch.addBindValue(nextAccessTime(accessClock_));
  touch.addBindValue(key);
  (void)touch.exec();
  return document.object();
}

bool PersistentDiagramCache::put(const QString &key, const QJsonObject &value) {
  if (!ensureOpen())
    return false;
  const QByteArray payload =
      qCompress(QJsonDocument(value).toJson(QJsonDocument::Compact), 6);
  QSqlQuery query(QSqlDatabase::database(connectionName_));
  query.prepare(QStringLiteral(
      "INSERT INTO diagram_cache(cache_key,payload,size_bytes,last_accessed) "
      "VALUES(?,?,?,?) "
      "ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload, "
      "size_bytes=excluded.size_bytes,last_accessed=excluded.last_accessed"));
  query.addBindValue(key);
  query.addBindValue(payload);
  query.addBindValue(payload.size());
  query.addBindValue(nextAccessTime(accessClock_));
  if (!query.exec()) {
    setError(query.lastError().text());
    return false;
  }
  return prune();
}

bool PersistentDiagramCache::prune() {
  QSqlQuery stats(QSqlDatabase::database(connectionName_));
  if (!stats.exec(QStringLiteral(
          "SELECT COUNT(*),COALESCE(SUM(size_bytes),0) FROM diagram_cache")) ||
      !stats.next())
    return false;
  qint64 count = stats.value(0).toLongLong();
  qint64 bytes = stats.value(1).toLongLong();
  while (count > maxEntries_ || bytes > maxBytes_) {
    QSqlQuery remove(QSqlDatabase::database(connectionName_));
    if (!remove.exec(QStringLiteral("DELETE FROM diagram_cache WHERE cache_key "
                                    "IN (SELECT cache_key FROM diagram_cache "
                                    "ORDER BY last_accessed ASC LIMIT 1)")))
      return false;
    if (!stats.exec(
            QStringLiteral("SELECT COUNT(*),COALESCE(SUM(size_bytes),0) FROM "
                           "diagram_cache")) ||
        !stats.next())
      return false;
    count = stats.value(0).toLongLong();
    bytes = stats.value(1).toLongLong();
  }
  return true;
}

bool PersistentDiagramCache::clear() {
  if (!ensureOpen())
    return false;
  QSqlQuery query(QSqlDatabase::database(connectionName_));
  return query.exec(QStringLiteral("DELETE FROM diagram_cache"));
}

void PersistentDiagramCache::setError(const QString &error) {
  lastError_ = error;
}

} // namespace qt_editor
