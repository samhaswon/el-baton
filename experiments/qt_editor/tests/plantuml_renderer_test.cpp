#include <QtTest>

#include <QCoreApplication>
#include <QFileInfo>
#include <QJsonArray>
#include <QRegularExpression>
#include <QSignalSpy>
#include <QTcpServer>
#include <QTcpSocket>

#include "plantuml_renderer.h"

using qt_editor::PlantUmlRenderer;

class PlantUmlRendererTest final : public QObject {
  Q_OBJECT

 private slots:
  void normalizesWrappers() {
    QCOMPARE(PlantUmlRenderer::normalizeSource(QStringLiteral("Alice -> Bob\n")),
             QStringLiteral("@startuml\nAlice -> Bob\n\n@enduml"));
    QCOMPARE(PlantUmlRenderer::normalizeSource(QStringLiteral("@startmindmap\n* root\n@endmindmap")),
             QStringLiteral("@startmindmap\n* root\n@endmindmap"));
    QCOMPARE(PlantUmlRenderer::normalizeSource(QStringLiteral("  \n")), QString());
  }

  void buildsReferenceCompatibleRemoteUrlsAndEncoding() {
    QCOMPARE(PlantUmlRenderer::normalizeServerUrl(QStringLiteral("example.com/plantuml/")),
             QStringLiteral("https://example.com/plantuml"));
    QCOMPARE(PlantUmlRenderer::buildRemoteRenderUrl(QStringLiteral("https://example.com/plantuml")),
             QStringLiteral("https://example.com/plantuml/svg"));
    QCOMPARE(PlantUmlRenderer::buildRemoteSvgUrl(QStringLiteral("https://example.com/plantuml/svg/old"),
                                                 QStringLiteral("encoded")),
             QStringLiteral("https://example.com/plantuml/svg/encoded"));
    const QString encoded = PlantUmlRenderer::encodeForServer(
        QStringLiteral("@startuml\nAlice -> Bob\n@enduml"));
    QVERIFY(!encoded.isEmpty());
    QVERIFY(QRegularExpression(QStringLiteral("^[0-9A-Za-z_-]+$")).match(encoded).hasMatch());
  }

  void rendersWithPinnedLocalJar() {
    const QString jar = QStringLiteral(QT_EDITOR_PLANTUML_JAR);
    QVERIFY2(QFileInfo(jar).isFile(), qPrintable(jar));
    PlantUmlRenderer renderer(jar);
    QSignalSpy spy(&renderer, &PlantUmlRenderer::resultsReady);
    renderer.requestRenderBatch({
        {QStringLiteral("generation"), 7},
        {QStringLiteral("requests"), QJsonArray{QJsonObject{
             {QStringLiteral("id"), QStringLiteral("diagram")},
             {QStringLiteral("source"), QStringLiteral("class Alice\nclass Bob\nAlice --> Bob")}}}}});
    QVERIFY2(spy.wait(15000), "Local PlantUML renderer did not respond");
    const QJsonObject batch = spy.takeFirst().at(0).toJsonObject();
    QCOMPARE(batch.value(QStringLiteral("generation")).toInt(), 7);
    const QJsonObject result = batch.value(QStringLiteral("results")).toArray().at(0).toObject();
    QVERIFY2(result.value(QStringLiteral("ok")).toBool(), qPrintable(result.value(QStringLiteral("error")).toString()));
    QVERIFY(result.value(QStringLiteral("svg")).toString().contains(QStringLiteral("<svg")));
  }

  void remotePostOverridesSuccessfulLocalRender() {
    QTcpServer server;
    QVERIFY(server.listen(QHostAddress::LocalHost));
    QByteArray requestBytes;
    connect(&server, &QTcpServer::newConnection, this, [&] {
      QTcpSocket* socket = server.nextPendingConnection();
      connect(socket, &QTcpSocket::readyRead, socket, [&, socket] {
        requestBytes += socket->readAll();
        const qsizetype headersEnd = requestBytes.indexOf("\r\n\r\n");
        if (headersEnd < 0) return;
        static const QRegularExpression contentLength(QStringLiteral("Content-Length: (\\d+)"),
                                                       QRegularExpression::CaseInsensitiveOption);
        const QRegularExpressionMatch match = contentLength.match(QString::fromLatin1(requestBytes.left(headersEnd)));
        if (!match.hasMatch() || requestBytes.size() < headersEnd + 4 + match.captured(1).toInt()) return;
        const QByteArray svg = "<svg xmlns=\"http://www.w3.org/2000/svg\"><text>remote-marker</text></svg>";
        socket->write("HTTP/1.1 200 OK\r\nContent-Type: image/svg+xml\r\nContent-Length: " +
                      QByteArray::number(svg.size()) + "\r\nConnection: close\r\n\r\n" + svg);
        socket->disconnectFromHost();
      });
    });

    PlantUmlRenderer renderer(QStringLiteral(QT_EDITOR_PLANTUML_JAR));
    renderer.configure(5000, 100, 8 * 1024 * 1024,
                       QStringLiteral("http://127.0.0.1:%1/plantuml").arg(server.serverPort()));
    QSignalSpy spy(&renderer, &PlantUmlRenderer::resultsReady);
    renderer.requestRenderBatch({
        {QStringLiteral("generation"), 9},
        {QStringLiteral("requests"), QJsonArray{QJsonObject{
             {QStringLiteral("id"), QStringLiteral("remote")},
             {QStringLiteral("source"), QStringLiteral("Alice -> Bob : hello")}}}}});
    QVERIFY2(spy.wait(15000), "Remote PlantUML renderer did not respond");
    const QJsonObject result = spy.takeFirst().at(0).toJsonObject()
                                   .value(QStringLiteral("results")).toArray().at(0).toObject();
    QCOMPARE(result.value(QStringLiteral("origin")).toString(), QStringLiteral("remote"));
    QCOMPARE(result.value(QStringLiteral("localStatus")).toString(), QStringLiteral("ok"));
    QCOMPARE(result.value(QStringLiteral("remoteStatus")).toString(), QStringLiteral("ok"));
    QVERIFY(result.value(QStringLiteral("svg")).toString().contains(QStringLiteral("remote-marker")));
    QVERIFY(requestBytes.startsWith("POST /plantuml/svg HTTP/1.1"));
  }

  void remoteGetFallbackUsesEncodedDiagramUrl() {
    QTcpServer server;
    QVERIFY(server.listen(QHostAddress::LocalHost));
    QStringList requestLines;
    connect(&server, &QTcpServer::newConnection, this, [&] {
      QTcpSocket* socket = server.nextPendingConnection();
      connect(socket, &QTcpSocket::readyRead, socket, [&, socket] {
        const QByteArray request = socket->readAll();
        if (!request.contains("\r\n\r\n")) return;
        requestLines.append(QString::fromLatin1(request.first(request.indexOf("\r\n"))));
        if (request.startsWith("POST ")) {
          socket->write("HTTP/1.1 405 Method Not Allowed\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
        } else {
          const QByteArray svg = "<svg xmlns=\"http://www.w3.org/2000/svg\"><text>get-fallback</text></svg>";
          socket->write("HTTP/1.1 200 OK\r\nContent-Type: image/svg+xml\r\nContent-Length: " +
                        QByteArray::number(svg.size()) + "\r\nConnection: close\r\n\r\n" + svg);
        }
        socket->disconnectFromHost();
      });
    });

    PlantUmlRenderer renderer(QStringLiteral(QT_EDITOR_PLANTUML_JAR));
    renderer.configure(5000, 100, 8 * 1024 * 1024,
                       QStringLiteral("http://127.0.0.1:%1/plantuml").arg(server.serverPort()));
    QSignalSpy spy(&renderer, &PlantUmlRenderer::resultsReady);
    renderer.requestRenderBatch({
        {QStringLiteral("generation"), 10},
        {QStringLiteral("requests"), QJsonArray{QJsonObject{
             {QStringLiteral("id"), QStringLiteral("fallback")},
             {QStringLiteral("source"), QStringLiteral("Alice -> Bob")}}}}});
    QVERIFY2(spy.wait(15000), "Encoded GET fallback did not respond");
    const QJsonObject result = spy.takeFirst().at(0).toJsonObject()
                                   .value(QStringLiteral("results")).toArray().at(0).toObject();
    QCOMPARE(result.value(QStringLiteral("origin")).toString(), QStringLiteral("remote"));
    QVERIFY(result.value(QStringLiteral("svg")).toString().contains(QStringLiteral("get-fallback")));
    QCOMPARE(requestLines.size(), 2);
    QVERIFY(requestLines.at(0).startsWith(QStringLiteral("POST /plantuml/svg ")));
    QVERIFY(QRegularExpression(QStringLiteral("^GET /plantuml/svg/[0-9A-Za-z_-]+ HTTP/1\\.1$"))
                .match(requestLines.at(1)).hasMatch());
  }
};

QTEST_GUILESS_MAIN(PlantUmlRendererTest)
#include "plantuml_renderer_test.moc"
