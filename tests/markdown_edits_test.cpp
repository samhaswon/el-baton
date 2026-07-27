#include "markdown_edits.h"

#include <QtTest>

using qt_editor::MarkdownEdits;

class MarkdownEditsTest final : public QObject {
  Q_OBJECT

 private slots:
  void togglesTheRequestedTaskOnly();
  void ignoresCheckboxSyntaxInsideFences();
  void updatesTheRequestedDetailsTagOnly();
  void togglesTaskCommandsLikeTheReferenceEditor();
  void formatsMarkdownTablesAndPreservesAlignment();
  void preservesIndentedEscapedPipeCells();
  void leavesInvalidTableCandidatesUnchanged();
  void ignoresTablesInsideCodeFences();
  void mapsTheCursorBackIntoItsTableCell();
};

void MarkdownEditsTest::togglesTheRequestedTaskOnly() {
  const QString source = QStringLiteral("- [ ] first\n- [x] second\n- [ ] third\n");
  QCOMPARE(MarkdownEdits::setTaskChecked(source, 1, false),
           QStringLiteral("- [ ] first\n- [ ] second\n- [ ] third\n"));
  QCOMPARE(MarkdownEdits::setTaskChecked(source, 2, true),
           QStringLiteral("- [ ] first\n- [x] second\n- [x] third\n"));
  QCOMPARE(MarkdownEdits::setTaskChecked(source, 8, true), source);
}

void MarkdownEditsTest::ignoresCheckboxSyntaxInsideFences() {
  const QString source = QStringLiteral(
      "```markdown\n- [ ] example\n```\n\n- [ ] real task\n");
  QCOMPARE(MarkdownEdits::setTaskChecked(source, 0, true),
           QStringLiteral("```markdown\n- [ ] example\n```\n\n- [x] real task\n"));
}

void MarkdownEditsTest::updatesTheRequestedDetailsTagOnly() {
  const QString source = QStringLiteral(
      "<details>\n<summary>One</summary>\n</details>\n"
      "<details class=\"more\" open>\n<summary>Two</summary>\n</details>\n");
  QCOMPARE(MarkdownEdits::setDetailsOpen(source, 0, true),
           QStringLiteral(
               "<details open>\n<summary>One</summary>\n</details>\n"
               "<details class=\"more\" open>\n<summary>Two</summary>\n</details>\n"));
  QCOMPARE(MarkdownEdits::setDetailsOpen(source, 1, false),
           QStringLiteral(
               "<details>\n<summary>One</summary>\n</details>\n"
               "<details class=\"more\">\n<summary>Two</summary>\n</details>\n"));
}

void MarkdownEditsTest::togglesTaskCommandsLikeTheReferenceEditor() {
  QCOMPARE(MarkdownEdits::toggleTaskLine(QStringLiteral("Write tests"), false),
           QStringLiteral("- [ ] Write tests"));
  QCOMPARE(MarkdownEdits::toggleTaskLine(QStringLiteral("  - [ ] Write tests"), false),
           QStringLiteral("  Write tests"));
  QCOMPARE(MarkdownEdits::toggleTaskLine(QStringLiteral("  - [x] Write tests"), false),
           QStringLiteral("  - [ ] Write tests"));
  QCOMPARE(MarkdownEdits::toggleTaskLine(QStringLiteral("Write tests"), true),
           QStringLiteral("- [x] Write tests"));
  QCOMPARE(MarkdownEdits::toggleTaskLine(QStringLiteral("- [ ] Write tests"), true),
           QStringLiteral("- [x] Write tests"));
  QCOMPARE(MarkdownEdits::toggleTaskLine(QStringLiteral("- [x] Write tests"), true),
           QStringLiteral("- [ ] Write tests"));
}

void MarkdownEditsTest::formatsMarkdownTablesAndPreservesAlignment() {
  const QString source = QStringLiteral(
      "Before\n\n| a | b | c |\n| :- | -: | :-: |\n| long | 1 | zz |\n\nAfter");
  const auto result = MarkdownEdits::formatTableAtLine(source, 4);
  QVERIFY(result.changed());
  QCOMPARE(result.source, QStringLiteral(
      "Before\n\n| a    |   b |  c  |\n| :--- | --: | :-: |\n| long |   1 | zz  |\n\nAfter"));
  QCOMPARE(result.startLine, 2);
  QCOMPARE(result.endLine, 4);
}

void MarkdownEditsTest::preservesIndentedEscapedPipeCells() {
  const QString source = QStringLiteral(
      "  | name | value |\n  | --- | --- |\n  | A\\|B | 12 |");
  const auto result = MarkdownEdits::formatTableAtLine(source, 2);
  QVERIFY(result.changed());
  QCOMPARE(result.source, QStringLiteral(
      "  | name | value |\n  | ---- | ----- |\n  | A\\|B | 12    |"));
}

void MarkdownEditsTest::leavesInvalidTableCandidatesUnchanged() {
  const QString source = QStringLiteral("a|b\none|two");
  const auto result = MarkdownEdits::formatTableAtLine(source, 1);
  QVERIFY(!result.changed());
  QCOMPARE(result.source, source);
}

void MarkdownEditsTest::ignoresTablesInsideCodeFences() {
  const QString source = QStringLiteral(
      "````markdown\n| not | a table |\n| --- | --- |\n```\n| still | fenced |\n````\n");
  const auto result = MarkdownEdits::formatTableAtLine(source, 2);
  QVERIFY(!result.changed());
  QCOMPARE(result.source, source);
}

void MarkdownEditsTest::mapsTheCursorBackIntoItsTableCell() {
  const QString source = QStringLiteral("name|value\n-|-\nlong|7");
  const qsizetype cursor = source.indexOf(QLatin1Char('7')) + 1;
  const auto result = MarkdownEdits::formatTableAtLine(source, 2, {cursor});
  QVERIFY(result.changed());
  QCOMPARE(result.source, QStringLiteral(
      "| name | value |\n| ---- | ----- |\n| long | 7     |"));
  QCOMPARE(result.source.at(result.mappedOffsets.constFirst() - 1), QLatin1Char('7'));
}

QTEST_GUILESS_MAIN(MarkdownEditsTest)

#include "markdown_edits_test.moc"
