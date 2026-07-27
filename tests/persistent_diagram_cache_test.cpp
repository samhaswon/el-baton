#include "persistent_diagram_cache.h"

#include <QTemporaryDir>
#include <QtTest>

class PersistentDiagramCacheTest final : public QObject {
  Q_OBJECT

 private slots:
  void persistsAndClearsValues();
  void prunesLeastRecentlyUsedValues();
};

void PersistentDiagramCacheTest::persistsAndClearsValues() {
  QTemporaryDir directory;
  QVERIFY(directory.isValid());
  const QString path = directory.filePath(QStringLiteral("diagrams.sqlite3"));
  {
    qt_editor::PersistentDiagramCache cache(path);
    QVERIFY(cache.put(QStringLiteral("a"), {{QStringLiteral("ok"), true},
                                            {QStringLiteral("svg"), QStringLiteral("<svg/>")}}));
  }
  qt_editor::PersistentDiagramCache cache(path);
  const auto restored = cache.get(QStringLiteral("a"));
  QVERIFY(restored.has_value());
  QCOMPARE(restored->value(QStringLiteral("svg")).toString(), QStringLiteral("<svg/>"));
  QVERIFY(cache.clear());
  QVERIFY(!cache.get(QStringLiteral("a")).has_value());
}

void PersistentDiagramCacheTest::prunesLeastRecentlyUsedValues() {
  QTemporaryDir directory;
  QVERIFY(directory.isValid());
  qt_editor::PersistentDiagramCache cache(directory.filePath(QStringLiteral("diagrams.sqlite3")));
  cache.configure(20, 1024 * 1024);
  for (int index = 0; index < 20; ++index) {
    QVERIFY(cache.put(QString::number(index), {{QStringLiteral("value"), index}}));
  }
  QVERIFY(cache.get(QStringLiteral("0")).has_value());
  QVERIFY(cache.put(QStringLiteral("20"), {{QStringLiteral("value"), 20}}));
  QVERIFY(cache.get(QStringLiteral("0")).has_value());
  QVERIFY(!cache.get(QStringLiteral("1")).has_value());
}

QTEST_GUILESS_MAIN(PersistentDiagramCacheTest)
#include "persistent_diagram_cache_test.moc"
