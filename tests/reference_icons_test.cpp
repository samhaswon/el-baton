#include "reference_icons.h"

#include <QtTest>

class ReferenceIconsTest final : public QObject {
  Q_OBJECT

private slots:
  void embeddedIconsAreRegistered() {
    QVERIFY(qt_editor::referenceIconsAvailable());
  }
};

QTEST_APPLESS_MAIN(ReferenceIconsTest)

#include "reference_icons_test.moc"
