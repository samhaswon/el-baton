#include "plantuml_renderer.h"
#include "persistent_diagram_cache.h"

#include <QDir>
#include <QFileInfo>
#include <QJsonValue>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QProcess>
#include <QRegularExpression>
#include <QStandardPaths>
#include <QTimer>
#include <QUrl>

#include <zlib.h>

#include <algorithm>
#include <utility>

namespace qt_editor {

namespace {
constexpr auto kPlantUmlCacheVersion = "plantuml-v1.2026.3:";

QString persistentPlantUmlKey(const QString &key) {
  return QString::fromLatin1(kPlantUmlCacheVersion) + key;
}
} // namespace

PlantUmlRenderer::PlantUmlRenderer(QString jarPath, QObject *parent)
    : QObject(parent), jarPath_(std::move(jarPath)),
      persistentCache_(std::make_unique<PersistentDiagramCache>(
          QDir(QStandardPaths::writableLocation(
                   QStandardPaths::GenericCacheLocation))
              .filePath(QStringLiteral("el-baton/diagrams.sqlite3")))),
      network_(new QNetworkAccessManager(this)) {}

PlantUmlRenderer::~PlantUmlRenderer() = default;

void PlantUmlRenderer::configure(int timeoutMs, int cacheMaxEntries,
                                 qint64 cacheMaxBytes,
                                 const QString &externalServerUrl) {
  timeoutMs_ = std::clamp(timeoutMs, 1000, 120000);
  cacheMaxEntries_ = std::clamp(cacheMaxEntries, 20, 5000);
  externalServerUrl_ = normalizeServerUrl(externalServerUrl);
  persistentCache_->configure(cacheMaxEntries_, cacheMaxBytes);
  while (cacheOrder_.size() > cacheMaxEntries_) {
    cache_.remove(cacheOrder_.takeFirst());
  }
}

QString PlantUmlRenderer::normalizeSource(const QString &rawSource) {
  QString source = rawSource;
  source.replace(QStringLiteral("\r\n"), QStringLiteral("\n"));
  source.replace(QLatin1Char('\r'), QLatin1Char('\n'));
  const QStringList lines = source.split(QLatin1Char('\n'), Qt::KeepEmptyParts);
  qsizetype first = -1;
  qsizetype last = -1;
  for (qsizetype index = 0; index < lines.size(); ++index) {
    if (!lines.at(index).trimmed().isEmpty()) {
      if (first < 0)
        first = index;
      last = index;
    }
  }
  if (first < 0)
    return {};

  static const QRegularExpression startExpression(
      QStringLiteral("^@start(\\w+)?\\b"),
      QRegularExpression::CaseInsensitiveOption);
  static const QRegularExpression endExpression(
      QStringLiteral("^@end(\\w+)?\\b"),
      QRegularExpression::CaseInsensitiveOption);
  const QRegularExpressionMatch start =
      startExpression.match(lines.at(first).trimmed());
  const QRegularExpressionMatch end =
      endExpression.match(lines.at(last).trimmed());
  if (start.hasMatch() && end.hasMatch())
    return source;

  const QString suffix =
      !start.captured(1).isEmpty() ? start.captured(1).toLower()
      : !end.captured(1).isEmpty() ? end.captured(1).toLower()
                                   : QStringLiteral("uml");
  QStringList output = lines;
  if (!start.hasMatch())
    output.prepend(QStringLiteral("@start") + suffix);
  if (!end.hasMatch())
    output.append(QStringLiteral("@end") + suffix);
  return output.join(QLatin1Char('\n'));
}

QString PlantUmlRenderer::normalizeLocalError(const QString &rawMessage) {
  const QString message = rawMessage.trimmed();
  const QString lower = message.toLower();
  const bool graphvizMissing =
      lower.contains(QStringLiteral("cannot find graphviz")) ||
      (lower.contains(QStringLiteral("graphviz")) &&
       lower.contains(QStringLiteral("not found"))) ||
      lower.contains(QStringLiteral("dot executable")) ||
      lower.contains(QStringLiteral("failed to execute dot")) ||
      lower.contains(QStringLiteral("testdot"));
  return graphvizMissing
             ? QStringLiteral("Graphviz is required for local PlantUML "
                              "rendering but was not found.")
             : message;
}

QString PlantUmlRenderer::normalizeServerUrl(const QString &rawUrl) {
  QString value = rawUrl.trimmed();
  if (value.isEmpty())
    return {};
  if (!value.startsWith(QStringLiteral("http://"), Qt::CaseInsensitive) &&
      !value.startsWith(QStringLiteral("https://"), Qt::CaseInsensitive)) {
    value.prepend(QStringLiteral("https://"));
  }
  QUrl url(value);
  if (!url.isValid() || url.host().isEmpty() ||
      (url.scheme() != QStringLiteral("http") &&
       url.scheme() != QStringLiteral("https")))
    return {};
  QString path = url.path();
  while (path.endsWith(QLatin1Char('/')))
    path.chop(1);
  url.setPath(path.isEmpty() ? QStringLiteral("/plantuml") : path);
  url.setQuery(QString());
  url.setFragment(QString());
  return url.toString(QUrl::FullyEncoded);
}

QString PlantUmlRenderer::buildRemoteRenderUrl(const QString &serverUrl) {
  QUrl url(serverUrl);
  QString path = url.path();
  while (path.endsWith(QLatin1Char('/')))
    path.chop(1);
  static const QRegularExpression payload(
      QStringLiteral("^(.*)/svg/[^/]+$"),
      QRegularExpression::CaseInsensitiveOption);
  const QRegularExpressionMatch match = payload.match(path);
  if (path.endsWith(QStringLiteral("/svg"), Qt::CaseInsensitive)) {
    url.setPath(path);
  } else if (match.hasMatch()) {
    url.setPath(match.captured(1) + QStringLiteral("/svg"));
  } else {
    url.setPath(path + QStringLiteral("/svg"));
  }
  url.setQuery(QString());
  url.setFragment(QString());
  return url.toString(QUrl::FullyEncoded);
}

QString PlantUmlRenderer::buildRemoteSvgUrl(const QString &serverUrl,
                                            const QString &encodedDiagram) {
  return buildRemoteRenderUrl(serverUrl) + QLatin1Char('/') + encodedDiagram;
}

QString PlantUmlRenderer::encodeForServer(const QString &source) {
  const QByteArray input = source.toUtf8();
  z_stream stream{};
  if (deflateInit2(&stream, 9, Z_DEFLATED, -15, 8, Z_DEFAULT_STRATEGY) != Z_OK)
    return {};
  QByteArray compressed;
  compressed.resize(static_cast<qsizetype>(
      deflateBound(&stream, static_cast<uLong>(input.size()))));
  stream.next_in =
      reinterpret_cast<Bytef *>(const_cast<char *>(input.constData()));
  stream.avail_in = static_cast<uInt>(input.size());
  stream.next_out = reinterpret_cast<Bytef *>(compressed.data());
  stream.avail_out = static_cast<uInt>(compressed.size());
  const int result = deflate(&stream, Z_FINISH);
  if (result != Z_STREAM_END) {
    deflateEnd(&stream);
    return {};
  }
  compressed.resize(static_cast<qsizetype>(stream.total_out));
  deflateEnd(&stream);

  const auto encode6Bit = [](int value) -> QChar {
    if (value < 10)
      return QChar('0' + value);
    value -= 10;
    if (value < 26)
      return QChar('A' + value);
    value -= 26;
    if (value < 26)
      return QChar('a' + value);
    return value == 26 ? QLatin1Char('-') : QLatin1Char('_');
  };
  QString encoded;
  encoded.reserve(((compressed.size() + 2) / 3) * 4);
  for (qsizetype index = 0; index < compressed.size(); index += 3) {
    const int first = static_cast<unsigned char>(compressed.at(index));
    const int second =
        index + 1 < compressed.size()
            ? static_cast<unsigned char>(compressed.at(index + 1))
            : 0;
    const int third = index + 2 < compressed.size()
                          ? static_cast<unsigned char>(compressed.at(index + 2))
                          : 0;
    encoded += encode6Bit((first >> 2) & 0x3f);
    encoded += encode6Bit(((first & 0x3) << 4) | ((second >> 4) & 0xf));
    encoded += encode6Bit(((second & 0xf) << 2) | ((third >> 6) & 0x3));
    encoded += encode6Bit(third & 0x3f);
  }
  return encoded;
}

void PlantUmlRenderer::requestRenderBatch(const QJsonObject &batch) {
  if (currentBatch_.has_value()) {
    // Keep at most the newest waiting document generation. The in-flight Java
    // process is allowed to finish cleanly; stale results are ignored by JS.
    pendingBatch_ = batch;
    return;
  }
  beginBatch(batch);
}

void PlantUmlRenderer::beginBatch(const QJsonObject &batchObject) {
  Batch batch;
  batch.generation =
      batchObject.value(QStringLiteral("generation")).toVariant().toULongLong();
  const QJsonArray requests =
      batchObject.value(QStringLiteral("requests")).toArray();
  batch.requests.reserve(std::min<qsizetype>(requests.size(), 64));
  for (qsizetype index = 0; index < requests.size() && index < 64; ++index) {
    const QJsonObject request = requests.at(index).toObject();
    batch.requests.append(
        {request.value(QStringLiteral("id")).toString(),
         normalizeSource(request.value(QStringLiteral("source")).toString())});
  }
  batch.elapsed.start();
  currentBatch_ = std::move(batch);
  advanceBatch();
}

void PlantUmlRenderer::advanceBatch() {
  if (!currentBatch_.has_value() || process_ != nullptr)
    return;
  if (currentBatch_->next >= currentBatch_->requests.size()) {
    finishBatch();
    return;
  }
  const Request request = currentBatch_->requests.at(currentBatch_->next++);
  if (request.source.isEmpty()) {
    appendResult(request, {{QStringLiteral("ok"), false},
                           {QStringLiteral("error"),
                            QStringLiteral("Empty PlantUML source")}});
    advanceBatch();
    return;
  }
  const QString localKey = QStringLiteral("local\0") + request.source;
  const auto cached = cache_.constFind(localKey);
  if (cached != cache_.cend()) {
    continueWithRemote(request, cached.value());
    return;
  }
  if (const auto stored =
          persistentCache_->get(persistentPlantUmlKey(localKey));
      stored.has_value()) {
    cache_.insert(localKey, *stored);
    cacheOrder_.append(localKey);
    continueWithRemote(request, *stored);
    return;
  }
  startProcess(request);
}

void PlantUmlRenderer::startProcess(const Request &request) {
  if (!QFileInfo(jarPath_).isFile()) {
    const QJsonObject result{
        {QStringLiteral("ok"), false},
        {QStringLiteral("error"),
         QStringLiteral("Local PlantUML JAR was not found: %1").arg(jarPath_)}};
    remember(QStringLiteral("local\0") + request.source, result);
    continueWithRemote(request, result);
    return;
  }

  activeRequest_ = request;
  process_ = new QProcess(this);
  processTimedOut_ = false;
  processTimer_ = new QTimer(process_);
  processTimer_->setSingleShot(true);
  QProcess *const launchedProcess = process_;
  connect(processTimer_, &QTimer::timeout, this, [this, launchedProcess] {
    if (process_ != launchedProcess)
      return;
    processTimedOut_ = true;
    launchedProcess->kill();
  });
  connect(launchedProcess, &QProcess::errorOccurred, this,
          [this, launchedProcess](QProcess::ProcessError error) {
            if (error != QProcess::FailedToStart || process_ != launchedProcess)
              return;
            finishProcess(launchedProcess,
                          {{QStringLiteral("ok"), false},
                           {QStringLiteral("error"),
                            QStringLiteral("Failed to launch Java: %1")
                                .arg(launchedProcess->errorString())}});
          });
  connect(
      launchedProcess,
      qOverload<int, QProcess::ExitStatus>(&QProcess::finished), this,
      [this, launchedProcess](int exitCode, QProcess::ExitStatus) {
        if (process_ != launchedProcess)
          return;
        const QString output =
            QString::fromUtf8(launchedProcess->readAllStandardOutput())
                .trimmed();
        const QString errors =
            QString::fromUtf8(launchedProcess->readAllStandardError())
                .trimmed();
        static const QRegularExpression svg(
            QStringLiteral("<svg(?:\\s|>)"),
            QRegularExpression::CaseInsensitiveOption);
        if (svg.match(output).hasMatch()) {
          finishProcess(launchedProcess, {{QStringLiteral("ok"), true},
                                          {QStringLiteral("svg"), output}});
          return;
        }
        QString message =
            processTimedOut_
                ? QStringLiteral("Local renderer timed out after %1ms")
                      .arg(timeoutMs_)
                : (!errors.isEmpty() ? errors : output);
        if (message.isEmpty()) {
          message =
              QStringLiteral(
                  "PlantUML exited with code %1 without returning SVG output")
                  .arg(exitCode);
        }
        finishProcess(launchedProcess, {{QStringLiteral("ok"), false},
                                        {QStringLiteral("error"),
                                         normalizeLocalError(message)}});
      });
  connect(launchedProcess, &QProcess::started, this,
          [this, launchedProcess, request] {
            if (process_ != launchedProcess)
              return;
            launchedProcess->write(request.source.toUtf8());
            launchedProcess->closeWriteChannel();
          });

  processTimer_->start(timeoutMs_);
  launchedProcess->start(QStringLiteral("java"),
                         {QStringLiteral("-Djava.awt.headless=true"),
                          QStringLiteral("-DPLANTUML_SECURITY_PROFILE=SANDBOX"),
                          QStringLiteral("-jar"), jarPath_,
                          QStringLiteral("-pipe"), QStringLiteral("-tsvg")});
}

void PlantUmlRenderer::finishProcess(QProcess *process,
                                     const QJsonObject &result) {
  if (process_ != process || !activeRequest_.has_value())
    return;
  const Request request = *activeRequest_;
  if (processTimer_ != nullptr)
    processTimer_->stop();
  process_ = nullptr;
  processTimer_ = nullptr;
  activeRequest_.reset();
  process->deleteLater();
  remember(QStringLiteral("local\0") + request.source, result);
  continueWithRemote(request, result);
}

void PlantUmlRenderer::continueWithRemote(const Request &request,
                                          const QJsonObject &localResult) {
  if (externalServerUrl_.isEmpty()) {
    finishRequest(request, localResult);
    return;
  }
  const QString remoteKey = QStringLiteral("remote\0") + externalServerUrl_ +
                            QChar::Null + request.source;
  const auto cached = cache_.constFind(remoteKey);
  if (cached != cache_.cend()) {
    finishRequest(request, localResult, cached.value());
    return;
  }
  if (const auto stored =
          persistentCache_->get(persistentPlantUmlKey(remoteKey));
      stored.has_value()) {
    cache_.insert(remoteKey, *stored);
    cacheOrder_.append(remoteKey);
    finishRequest(request, localResult, *stored);
    return;
  }
  activeRequest_ = request;
  activeLocalResult_ = localResult;
  remoteGetAttempted_ = false;
  startRemoteRequest(request, false);
}

void PlantUmlRenderer::startRemoteRequest(const Request &request,
                                          bool encodedGet) {
  QNetworkRequest networkRequest;
  networkRequest.setAttribute(QNetworkRequest::RedirectPolicyAttribute,
                              QNetworkRequest::NoLessSafeRedirectPolicy);
  networkRequest.setRawHeader("Accept",
                              "image/svg+xml,text/plain;q=0.9,*/*;q=0.1");
  if (encodedGet) {
    networkRequest.setUrl(QUrl(buildRemoteSvgUrl(
        externalServerUrl_, encodeForServer(request.source))));
    networkReply_ = network_->get(networkRequest);
  } else {
    networkRequest.setUrl(QUrl(buildRemoteRenderUrl(externalServerUrl_)));
    networkRequest.setHeader(QNetworkRequest::ContentTypeHeader,
                             QStringLiteral("text/plain; charset=utf-8"));
    networkReply_ = network_->post(networkRequest, request.source.toUtf8());
  }
  QNetworkReply *const reply = networkReply_;
  reply->setReadBufferSize(32 * 1024 * 1024);
  connect(reply, &QNetworkReply::downloadProgress, this,
          [reply](qint64 received, qint64 total) {
            if (received > 32 * 1024 * 1024 || total > 32 * 1024 * 1024)
              reply->abort();
          });
  connect(reply, &QNetworkReply::finished, this,
          [this, reply] { finishRemoteRequest(reply); });
  networkTimer_ = new QTimer(reply);
  networkTimer_->setSingleShot(true);
  connect(networkTimer_, &QTimer::timeout, reply, &QNetworkReply::abort);
  networkTimer_->start(timeoutMs_);
}

void PlantUmlRenderer::finishRemoteRequest(QNetworkReply *reply) {
  if (networkReply_ != reply || !activeRequest_.has_value())
    return;
  if (networkTimer_ != nullptr)
    networkTimer_->stop();
  const QByteArray content = reply->readAll();
  const int status =
      reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
  const QString text = QString::fromUtf8(content).trimmed();
  static const QRegularExpression svg(
      QStringLiteral("<svg(?:\\s|>)"),
      QRegularExpression::CaseInsensitiveOption);
  const bool successful = reply->error() == QNetworkReply::NoError &&
                          status >= 200 && status < 300 &&
                          svg.match(text).hasMatch();
  const Request request = *activeRequest_;
  networkReply_ = nullptr;
  networkTimer_ = nullptr;
  reply->deleteLater();

  if (!successful && !remoteGetAttempted_) {
    remoteGetAttempted_ = true;
    startRemoteRequest(request, true);
    return;
  }

  QJsonObject remoteResult;
  if (successful) {
    remoteResult = {{QStringLiteral("ok"), true},
                    {QStringLiteral("svg"), text},
                    {QStringLiteral("externalUrl"),
                     buildRemoteSvgUrl(externalServerUrl_,
                                       encodeForServer(request.source))}};
  } else {
    QString error = text;
    if (error.isEmpty())
      error = reply->errorString();
    if (error.isEmpty())
      error = QStringLiteral("Remote renderer failed with HTTP %1").arg(status);
    remoteResult = {{QStringLiteral("ok"), false},
                    {QStringLiteral("error"), error},
                    {QStringLiteral("externalUrl"),
                     buildRemoteSvgUrl(externalServerUrl_,
                                       encodeForServer(request.source))}};
  }
  remember(QStringLiteral("remote\0") + externalServerUrl_ + QChar::Null +
               request.source,
           remoteResult);
  const QJsonObject localResult = activeLocalResult_;
  activeRequest_.reset();
  activeLocalResult_ = {};
  finishRequest(request, localResult, remoteResult);
}

void PlantUmlRenderer::finishRequest(
    const Request &request, const QJsonObject &localResult,
    const std::optional<QJsonObject> &remoteResult) {
  const bool localOk = localResult.value(QStringLiteral("ok")).toBool();
  const bool remoteOk = remoteResult.has_value() &&
                        remoteResult->value(QStringLiteral("ok")).toBool();
  const bool selectedRemote =
      remoteOk || (!localOk && remoteResult.has_value());
  QJsonObject selected = selectedRemote ? *remoteResult : localResult;
  selected.insert(QStringLiteral("origin"), selectedRemote
                                                ? QStringLiteral("remote")
                                                : QStringLiteral("local"));
  selected.insert(QStringLiteral("localStatus"),
                  localOk ? QStringLiteral("ok") : QStringLiteral("error"));
  if (!localOk)
    selected.insert(QStringLiteral("localError"),
                    localResult.value(QStringLiteral("error")));
  if (remoteResult.has_value()) {
    selected.insert(QStringLiteral("remoteStatus"),
                    remoteOk ? QStringLiteral("ok") : QStringLiteral("error"));
    if (!remoteOk)
      selected.insert(QStringLiteral("remoteError"),
                      remoteResult->value(QStringLiteral("error")));
  }
  appendResult(request, selected);
  advanceBatch();
}

void PlantUmlRenderer::appendResult(const Request &request,
                                    const QJsonObject &rawResult) {
  QJsonObject result = rawResult;
  result.insert(QStringLiteral("id"), request.id);
  currentBatch_->results.append(result);
}

void PlantUmlRenderer::finishBatch() {
  QJsonObject result{{QStringLiteral("generation"),
                      static_cast<qint64>(currentBatch_->generation)},
                     {QStringLiteral("results"), currentBatch_->results},
                     {QStringLiteral("plantUmlMs"),
                      currentBatch_->elapsed.nsecsElapsed() / 1'000'000.0}};
  currentBatch_.reset();
  emit resultsReady(result);
  if (!pendingBatch_.isEmpty()) {
    const QJsonObject pending = pendingBatch_;
    pendingBatch_ = {};
    beginBatch(pending);
  }
}

void PlantUmlRenderer::remember(const QString &source,
                                const QJsonObject &result) {
  if (!cache_.contains(source))
    cacheOrder_.append(source);
  cache_.insert(source, result);
  while (cacheOrder_.size() > cacheMaxEntries_)
    cache_.remove(cacheOrder_.takeFirst());
  if (result.value(QStringLiteral("ok")).toBool()) {
    (void)persistentCache_->put(persistentPlantUmlKey(source), result);
  }
}

} // namespace qt_editor
