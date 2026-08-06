#include "webengine_security.h"

#include <QCoreApplication>
#include <QWebEngineProfile>
#include <QWebEngineView>
#include <QWidget>
#include <QtTest>

namespace {

bool profileReleasedBeforePage = false;
QtMessageHandler previousMessageHandler = nullptr;

void lifecycleMessageHandler(QtMsgType type, const QMessageLogContext &context,
                             const QString &message) {
  if (message.contains(QStringLiteral("Release of profile requested but "
                                      "WebEnginePage still not deleted"))) {
    profileReleasedBeforePage = true;
  }
  if (previousMessageHandler != nullptr)
    previousMessageHandler(type, context, message);
}

} // namespace

class WebEngineLifecycleTest final : public QObject {
  Q_OBJECT

private slots:
  void initTestCase();
  void cleanupTestCase();
  void destroysPageBeforeProfile();
};

void WebEngineLifecycleTest::initTestCase() {
  previousMessageHandler = qInstallMessageHandler(lifecycleMessageHandler);
}

void WebEngineLifecycleTest::cleanupTestCase() {
  qInstallMessageHandler(previousMessageHandler);
}

void WebEngineLifecycleTest::destroysPageBeforeProfile() {
  profileReleasedBeforePage = false;
  auto *profile = new QWebEngineProfile(QCoreApplication::instance());
  qt_editor::hardenWebEngineProfile(profile);
  const QUrl applicationPage =
      QUrl::fromLocalFile(QStringLiteral("/application/web/preview.html"));
  auto *page = new qt_editor::RestrictedWebEnginePage(profile, applicationPage);
  auto *window = new QWidget;
  auto *view = new QWebEngineView(page, window);
  page->setParent(view);

  profile->deleteLater();
  delete window;
  QCoreApplication::sendPostedEvents(nullptr, QEvent::DeferredDelete);
  QVERIFY(!profileReleasedBeforePage);
}

QTEST_MAIN(WebEngineLifecycleTest)

#include "webengine_lifecycle_test.moc"
