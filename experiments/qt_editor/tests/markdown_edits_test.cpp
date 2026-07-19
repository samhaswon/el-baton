#include "markdown_edits.h"

#include <QtTest>

using qt_editor::MarkdownEdits;

class MarkdownEditsTest final : public QObject {
  Q_OBJECT

 private slots:
  void togglesTheRequestedTaskOnly();
  void ignoresCheckboxSyntaxInsideFences();
  void updatesTheRequestedDetailsTagOnly();
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

QTEST_GUILESS_MAIN(MarkdownEditsTest)

#include "markdown_edits_test.moc"
