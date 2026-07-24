#pragma once

#include <QJsonObject>
#include <QString>

#include <optional>

namespace qt_editor {

class PersistentDiagramCache final {
 public:
  explicit PersistentDiagramCache(QString databasePath);
  ~PersistentDiagramCache();

  PersistentDiagramCache(const PersistentDiagramCache&) = delete;
  PersistentDiagramCache& operator=(const PersistentDiagramCache&) = delete;

  void configure(int maxEntries, qint64 maxBytes);
  [[nodiscard]] std::optional<QJsonObject> get(const QString& key);
  [[nodiscard]] bool put(const QString& key, const QJsonObject& value);
  [[nodiscard]] bool clear();
  [[nodiscard]] const QString& lastError() const { return lastError_; }

 private:
  [[nodiscard]] bool ensureOpen();
  [[nodiscard]] bool prune();
  void setError(const QString& error);

  QString databasePath_;
  QString connectionName_;
  QString lastError_;
  int maxEntries_ = 400;
  qint64 maxBytes_ = 64 * 1024 * 1024;
  qint64 accessClock_ = 0;
};

}  // namespace qt_editor
