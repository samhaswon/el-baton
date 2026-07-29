#pragma once

#include <QElapsedTimer>
#include <QHash>
#include <QJsonArray>
#include <QJsonObject>
#include <QObject>
#include <QVector>

#include <memory>
#include <optional>

class QProcess;
class QTimer;
class QNetworkAccessManager;
class QNetworkReply;

namespace qt_editor {
class PersistentDiagramCache;

// Asynchronous local PlantUML service. Document text is passed only to the
// pinned local JAR over stdin and is never interpreted as a shell command.
class PlantUmlRenderer final : public QObject {
  Q_OBJECT

public:
  explicit PlantUmlRenderer(QString jarPath, QObject *parent = nullptr);
  ~PlantUmlRenderer() override;

  void configure(int timeoutMs, int cacheMaxEntries, qint64 cacheMaxBytes,
                 const QString &externalServerUrl = {});
  [[nodiscard]] static QString normalizeSource(const QString &source);
  [[nodiscard]] static QString normalizeLocalError(const QString &message);
  [[nodiscard]] static QString normalizeServerUrl(const QString &url);
  [[nodiscard]] static QString buildRemoteRenderUrl(const QString &serverUrl);
  [[nodiscard]] static QString buildRemoteSvgUrl(const QString &serverUrl,
                                                 const QString &encodedDiagram);
  [[nodiscard]] static QString encodeForServer(const QString &source);

public slots:
  // Accepts {generation, requests:[{id, source}]} and coalesces waiting
  // batches.
  void requestRenderBatch(const QJsonObject &batch);

signals:
  void resultsReady(const QJsonObject &batch);

private:
  struct Request final {
    QString id;
    QString source;
  };
  struct Batch final {
    quint64 generation = 0;
    QVector<Request> requests;
    qsizetype next = 0;
    QJsonArray results;
    QElapsedTimer elapsed;
  };

  void beginBatch(const QJsonObject &batch);
  void advanceBatch();
  void startProcess(const Request &request);
  void finishProcess(QProcess *process, const QJsonObject &result);
  void continueWithRemote(const Request &request,
                          const QJsonObject &localResult);
  void startRemoteRequest(const Request &request, bool encodedGet);
  void finishRemoteRequest(QNetworkReply *reply);
  void
  finishRequest(const Request &request, const QJsonObject &localResult,
                const std::optional<QJsonObject> &remoteResult = std::nullopt);
  void appendResult(const Request &request, const QJsonObject &result);
  void finishBatch();
  void remember(const QString &source, const QJsonObject &result);

  QString jarPath_;
  QString externalServerUrl_;
  int timeoutMs_ = 12000;
  int cacheMaxEntries_ = 400;
  QHash<QString, QJsonObject> cache_;
  QVector<QString> cacheOrder_;
  std::unique_ptr<PersistentDiagramCache> persistentCache_;
  std::optional<Batch> currentBatch_;
  QJsonObject pendingBatch_;
  std::optional<Request> activeRequest_;
  QProcess *process_ = nullptr;
  QTimer *processTimer_ = nullptr;
  bool processTimedOut_ = false;
  QNetworkAccessManager *network_ = nullptr;
  QNetworkReply *networkReply_ = nullptr;
  QTimer *networkTimer_ = nullptr;
  QJsonObject activeLocalResult_;
  bool remoteGetAttempted_ = false;
};

} // namespace qt_editor
