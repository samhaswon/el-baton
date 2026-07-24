#include "markdown_completion.h"

#include <QDir>
#include <QFile>
#include <QTemporaryDir>
#include <QtTest>

using qt_editor::MarkdownCompletion;
using qt_editor::MarkdownCompletionKind;

class MarkdownCompletionTest final : public QObject {
  Q_OBJECT

 private slots:
  void suggestsEmojiShortcodesWithoutReplacingTheOpeningColon();
  void suggestsOpeningFenceLanguagesButNotClosingFences();
  void suggestsWorkspacePathsAndRejectsTraversal();
};

void MarkdownCompletionTest::suggestsEmojiShortcodesWithoutReplacingTheOpeningColon() {
  const QString source = QStringLiteral("A :ca");
  const QHash<QString, QString> emojiMap = {
      {QStringLiteral("cat"), QStringLiteral("🐱")},
      {QStringLiteral("cat2"), QStringLiteral("🐈")},
      {QStringLiteral("dog"), QStringLiteral("🐶")}};
  const auto result = MarkdownCompletion::suggestions(
      source, source.size(), {}, {}, emojiMap);
  QCOMPARE(result.replaceStart, 3);
  QCOMPARE(result.replaceLength, 2);
  QCOMPARE(result.items.size(), 2);
  QCOMPARE(result.items.constFirst().insertText, QStringLiteral("cat:"));
  QCOMPARE(result.items.constFirst().kind, MarkdownCompletionKind::Emoji);
}

void MarkdownCompletionTest::suggestsOpeningFenceLanguagesButNotClosingFences() {
  const QString opening = QStringLiteral("```py");
  const auto openingResult = MarkdownCompletion::suggestions(opening, opening.size(), {}, {}, {});
  QVERIFY(!openingResult.isEmpty());
  QCOMPARE(openingResult.items.constFirst().insertText, QStringLiteral("python"));

  const QString closing = QStringLiteral("```python\nprint('ok')\n```");
  const auto closingResult = MarkdownCompletion::suggestions(closing, closing.size(), {}, {}, {});
  QVERIFY(closingResult.isEmpty());
}

void MarkdownCompletionTest::suggestsWorkspacePathsAndRejectsTraversal() {
  QTemporaryDir temporary;
  QVERIFY(temporary.isValid());
  QDir root(temporary.path());
  QVERIFY(root.mkpath(QStringLiteral("notes/sub")));
  QVERIFY(root.mkpath(QStringLiteral("attachments")));
  QFile note(root.filePath(QStringLiteral("notes/sub/Alpha.md")));
  QVERIFY(note.open(QIODevice::WriteOnly));
  note.write("# Alpha\n");
  note.close();
  QFile attachment(root.filePath(QStringLiteral("attachments/cat.png")));
  QVERIFY(attachment.open(QIODevice::WriteOnly));
  attachment.write("png");
  attachment.close();

  const QString sourcePath = root.filePath(QStringLiteral("notes/current.md"));
  const QString noteLink = QStringLiteral("[note](@note/sub/A");
  const auto noteResult = MarkdownCompletion::suggestions(
      noteLink, noteLink.size(), temporary.path(), sourcePath, {});
  QCOMPARE(noteResult.items.size(), 1);
  QCOMPARE(noteResult.items.constFirst().insertText, QStringLiteral("@note/sub/Alpha.md"));

  const QString attachmentLink = QStringLiteral("![](@attachment/c");
  const auto attachmentResult = MarkdownCompletion::suggestions(
      attachmentLink, attachmentLink.size(), temporary.path(), sourcePath, {});
  QCOMPARE(attachmentResult.items.size(), 1);
  QCOMPARE(attachmentResult.items.constFirst().kind, MarkdownCompletionKind::File);

  const QString traversal = QStringLiteral("[bad](../../");
  const auto traversalResult = MarkdownCompletion::suggestions(
      traversal, traversal.size(), temporary.path(), sourcePath, {});
  QVERIFY(traversalResult.isEmpty());
}

QTEST_GUILESS_MAIN(MarkdownCompletionTest)

#include "markdown_completion_test.moc"
