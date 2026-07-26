#include "markdown_syntax_lexer.h"

#include <Qsci/qsciscintilla.h>

#include <QTest>

using qt_editor::MarkdownSyntaxLexer;

namespace {

int styleNumber(MarkdownSyntaxLexer::Style style) {
  return static_cast<int>(style);
}

int bytePosition(const QString& source, const QByteArray& needle) {
  return source.toUtf8().indexOf(needle);
}

int styleAt(const QsciScintilla& editor, int bytePosition) {
  return static_cast<int>(const_cast<QsciScintilla&>(editor).SendScintilla(
      QsciScintilla::SCI_GETSTYLEAT, bytePosition));
}

void styleDocument(QsciScintilla& editor, MarkdownSyntaxLexer& lexer,
                   const QString& source) {
  editor.setText(source);
  lexer.styleText(0, editor.length());
}

}  // namespace

class MarkdownSyntaxLexerTest final : public QObject {
  Q_OBJECT

 private slots:
  void loadsBundledMarkdownDefinition();
  void highlightsMarkdownConstructs();
  void highlightsEmbeddedPython();
  void preservesUtf8ByteOffsets();
  void continuesFenceStateFromPartialRestyle();
};

void MarkdownSyntaxLexerTest::loadsBundledMarkdownDefinition() {
  QsciScintilla editor;
  auto* lexer = new MarkdownSyntaxLexer(&editor);
  editor.setLexer(lexer);

  QVERIFY(lexer->hasValidDefinition());
  QCOMPARE(QString::fromLatin1(lexer->language()),
           QStringLiteral("El Baton Markdown"));
}

void MarkdownSyntaxLexerTest::highlightsMarkdownConstructs() {
  QsciScintilla editor;
  auto* lexer = new MarkdownSyntaxLexer(&editor);
  editor.setLexer(lexer);
  const QString source = QStringLiteral(
      "---\n"
      "title: Example\n"
      "---\n"
      "# Heading\n"
      "\n"
      "**strong** and *emphasis* with [a link](https://example.com) :cat:\n"
      "- [x] complete\n");

  styleDocument(editor, *lexer, source);

  QCOMPARE(styleAt(editor, bytePosition(source, "# Heading")),
           styleNumber(MarkdownSyntaxLexer::Style::Heading));
  QCOMPARE(styleAt(editor, bytePosition(source, "strong")),
           styleNumber(MarkdownSyntaxLexer::Style::Strong));
  QCOMPARE(styleAt(editor, bytePosition(source, "emphasis")),
           styleNumber(MarkdownSyntaxLexer::Style::Emphasis));
  QCOMPARE(styleAt(editor, bytePosition(source, "https://")),
           styleNumber(MarkdownSyntaxLexer::Style::Link));
  QCOMPARE(styleAt(editor, bytePosition(source, ":cat:")),
           styleNumber(MarkdownSyntaxLexer::Style::Emoji));
  QCOMPARE(styleAt(editor, bytePosition(source, "[x]")),
           styleNumber(MarkdownSyntaxLexer::Style::Checkbox));
}

void MarkdownSyntaxLexerTest::highlightsEmbeddedPython() {
  QsciScintilla editor;
  auto* lexer = new MarkdownSyntaxLexer(&editor);
  editor.setLexer(lexer);
  const QString source = QStringLiteral(
      "```python\n"
      "def greet(name: str):\n"
      "    return \"Hello \" + name\n"
      "```\n");

  styleDocument(editor, *lexer, source);

  QCOMPARE(styleAt(editor, bytePosition(source, "def")),
           styleNumber(MarkdownSyntaxLexer::Style::Keyword));
  QCOMPARE(styleAt(editor, bytePosition(source, "return")),
           styleNumber(MarkdownSyntaxLexer::Style::ControlFlow));
  QCOMPARE(styleAt(editor, bytePosition(source, "\"Hello \"")),
           styleNumber(MarkdownSyntaxLexer::Style::String));
}

void MarkdownSyntaxLexerTest::preservesUtf8ByteOffsets() {
  QsciScintilla editor;
  auto* lexer = new MarkdownSyntaxLexer(&editor);
  editor.setLexer(lexer);
  const QString source =
      QString::fromUtf8("Text 🐈 before https://example.com and **bold**.\n");

  styleDocument(editor, *lexer, source);

  QCOMPARE(styleAt(editor, bytePosition(source, "https://")),
           styleNumber(MarkdownSyntaxLexer::Style::Link));
  QCOMPARE(styleAt(editor, bytePosition(source, "bold")),
           styleNumber(MarkdownSyntaxLexer::Style::Strong));
}

void MarkdownSyntaxLexerTest::continuesFenceStateFromPartialRestyle() {
  QsciScintilla editor;
  auto* lexer = new MarkdownSyntaxLexer(&editor);
  editor.setLexer(lexer);
  const QString source = QStringLiteral(
      "Before\n"
      "```python\n"
      "value = 1\n"
      "other = \"updated\"\n"
      "```\n");
  styleDocument(editor, *lexer, source);

  const int changedLineStart = editor.positionFromLineIndex(3, 0);
  lexer->styleText(changedLineStart, editor.length());

  QCOMPARE(styleAt(editor, bytePosition(source, "\"updated\"")),
           styleNumber(MarkdownSyntaxLexer::Style::String));
}

QTEST_MAIN(MarkdownSyntaxLexerTest)

#include "markdown_syntax_lexer_test.moc"
