#include "preview_bridge.h"
#include "sync_controller.h"

#include <QJsonObject>
#include <QScrollBar>
#include <QSignalSpy>
#include <Qsci/qsciscintilla.h>
#include <QtTest>

using qt_editor::PreviewBridge;
using qt_editor::RenderedBlock;
using qt_editor::SourceRange;
using qt_editor::SyncController;
using qt_editor::SyncMode;

namespace {

QString numberedDocument(int lines = 80) {
  QString text;
  for (int line = 0; line < lines; ++line)
    text += QStringLiteral("0123456789\n");
  return text;
}

RenderedBlock block(QString id, qsizetype start, qsizetype end,
                    QString mode = QStringLiteral("interpolate")) {
  RenderedBlock result;
  result.id = std::move(id);
  result.range = SourceRange{start, end};
  result.syncMode = std::move(mode);
  return result;
}

QJsonObject previewPosition(quint64 generation, QString id, double progress) {
  return {{"owner", "preview"},
          {"generation", static_cast<qint64>(generation)},
          {"blockId", std::move(id)},
          {"progress", progress}};
}

void prepareEditor(QsciScintilla &editor) {
  editor.resize(500, 160);
  editor.setWrapMode(QsciScintilla::WrapNone);
  editor.setText(numberedDocument());
  editor.show();
  QTest::qWait(1);
}

} // namespace

class SyncControllerTest final : public QObject {
  Q_OBJECT

private slots:
  void generationFilteringAndRemovedBlocks();
  void previewOwnershipAndExplicitRelease();
  void sourceOwnershipReleasesAfterIdle();
  void suppressesReciprocalProgrammaticScroll();
  void interpolatesProgressInBothDirections();
  void anchorOnlyBlockIgnoresProgress();
  void percentageModeUsesRawScrollbarRatio();
  void coalescesDuplicateTargets();
};

void SyncControllerTest::generationFilteringAndRemovedBlocks() {
  QsciScintilla editor;
  prepareEditor(editor);
  PreviewBridge bridge;
  SyncController controller(&editor, &bridge, SyncMode::Semantic);
  controller.setBlocks({block("current", 0, 220)}, 7);

  bridge.reportPreviewScroll(previewPosition(6, "current", 1.0));
  QCOMPARE(editor.firstVisibleLine(), 0);
  QCOMPARE(controller.owner(), SyncController::Owner::None);

  bridge.reportPreviewScroll(previewPosition(7, "removed", 1.0));
  QCOMPARE(editor.firstVisibleLine(), 0);
  QCOMPARE(controller.metrics().dropped, quint64(2));

  controller.setBlocks({block("stale", 0, 44)}, 5);
  QCOMPARE(controller.generation(), quint64(7));
}

void SyncControllerTest::previewOwnershipAndExplicitRelease() {
  QsciScintilla editor;
  prepareEditor(editor);
  PreviewBridge bridge;
  SyncController controller(&editor, &bridge, SyncMode::Semantic);
  controller.setBlocks({block("body", 0, 440)}, 9);
  QSignalSpy owners(&controller, &SyncController::ownerChanged);

  bridge.reportPreviewScroll(previewPosition(9, "body", 0.5));
  QCOMPARE(controller.owner(), SyncController::Owner::Preview);
  QVERIFY(editor.firstVisibleLine() >= 19);

  bridge.reportPreviewScroll(
      {{"owner", "preview"}, {"generation", 9}, {"phase", "end"}});
  QCOMPARE(controller.owner(), SyncController::Owner::None);
  QCOMPARE(owners.count(), 2);
}

void SyncControllerTest::sourceOwnershipReleasesAfterIdle() {
  QsciScintilla editor;
  prepareEditor(editor);
  PreviewBridge bridge;
  SyncController controller(&editor, &bridge, SyncMode::Semantic);
  controller.setBlocks({block("body", 0, 880)}, 3);

  editor.verticalScrollBar()->setValue(10);
  QTRY_COMPARE(controller.owner(), SyncController::Owner::Source);
  QTRY_COMPARE_WITH_TIMEOUT(controller.owner(), SyncController::Owner::None,
                            300);
}

void SyncControllerTest::suppressesReciprocalProgrammaticScroll() {
  QsciScintilla editor;
  prepareEditor(editor);
  PreviewBridge bridge;
  SyncController controller(&editor, &bridge, SyncMode::Semantic);
  controller.setBlocks({block("body", 0, 880)}, 2);
  QSignalSpy published(&bridge, &PreviewBridge::sourceScrollPublished);

  bridge.reportPreviewScroll(previewPosition(2, "body", 0.75));
  QVERIFY(editor.firstVisibleLine() > 40);
  QCOMPARE(published.count(), 0);

  // A DOM notification retaining source ownership is likewise reciprocal.
  QJsonObject reciprocal = previewPosition(2, "body", 0.75);
  reciprocal.insert("owner", "source");
  bridge.reportPreviewScroll(reciprocal);
  QCOMPARE(controller.owner(), SyncController::Owner::Preview);
}

void SyncControllerTest::interpolatesProgressInBothDirections() {
  QsciScintilla editor;
  prepareEditor(editor);
  PreviewBridge bridge;
  SyncController controller(&editor, &bridge, SyncMode::Semantic);
  controller.setBlocks({block("middle", 110, 330)}, 12);

  bridge.reportPreviewScroll(previewPosition(12, "middle", 0.5));
  QCOMPARE(editor.firstVisibleLine(), 20); // offset 220 / 11 chars per line
  bridge.reportPreviewScroll(
      {{"owner", "preview"}, {"generation", 12}, {"phase", "end"}});

  QSignalSpy published(&bridge, &PreviewBridge::sourceScrollPublished);
  editor.verticalScrollBar()->setValue(15);
  QTRY_COMPARE(published.count(), 1);
  const QJsonObject target = published.takeFirst().at(0).toJsonObject();
  QCOMPARE(target.value("blockId").toString(), QStringLiteral("middle"));
  QVERIFY(std::abs(target.value("progress").toDouble() - 0.25) < 0.02);
}

void SyncControllerTest::anchorOnlyBlockIgnoresProgress() {
  QsciScintilla editor;
  prepareEditor(editor);
  PreviewBridge bridge;
  SyncController controller(&editor, &bridge, SyncMode::Semantic);
  controller.setBlocks({block("anchor", 88, 88, "anchor")}, 4);

  bridge.reportPreviewScroll(previewPosition(4, "anchor", 0.95));
  QCOMPARE(editor.firstVisibleLine(), 8);
}

void SyncControllerTest::percentageModeUsesRawScrollbarRatio() {
  QsciScintilla editor;
  prepareEditor(editor);
  PreviewBridge bridge;
  SyncController controller(&editor, &bridge, SyncMode::Percentage);
  controller.setBlocks({}, 6);
  QSignalSpy published(&bridge, &PreviewBridge::sourceScrollPublished);

  bridge.reportPreviewScroll(
      {{"owner", "preview"}, {"generation", 6}, {"percentage", 0.5}});
  const int maximum = editor.verticalScrollBar()->maximum();
  QVERIFY(std::abs(editor.verticalScrollBar()->value() - maximum / 2) <= 1);
  QCOMPARE(published.count(), 0);

  bridge.reportPreviewScroll(
      {{"owner", "preview"}, {"generation", 6}, {"phase", "end"}});
  editor.verticalScrollBar()->setValue(maximum);
  QTRY_COMPARE(published.count(), 1);
  const QJsonObject target = published.takeFirst().at(0).toJsonObject();
  QCOMPARE(target.value("mode").toString(), QStringLiteral("percentage"));
  QCOMPARE(target.value("percentage").toDouble(), 1.0);
}

void SyncControllerTest::coalescesDuplicateTargets() {
  QsciScintilla editor;
  prepareEditor(editor);
  PreviewBridge bridge;
  SyncController controller(&editor, &bridge, SyncMode::Semantic);
  controller.setBlocks({block("body", 0, 880)}, 1);

  bridge.reportPreviewScroll(previewPosition(1, "body", 0.25));
  const quint64 before = controller.metrics().coalesced;
  bridge.reportPreviewScroll(previewPosition(1, "body", 0.25));
  QVERIFY(controller.metrics().coalesced > before);
}

QTEST_MAIN(SyncControllerTest)
#include "sync_controller_test.moc"
