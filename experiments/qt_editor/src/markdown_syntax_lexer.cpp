#include "markdown_syntax_lexer.h"

#include <Qsci/qsciscintilla.h>

#include <QColor>
#include <QFont>
#include <QFontDatabase>
#include <QStringView>

#include <algorithm>
#include <initializer_list>
#include <ranges>
#include <utility>

namespace qt_editor {
namespace {

constexpr int styleNumber(MarkdownSyntaxLexer::Style style) {
  return static_cast<int>(style);
}

bool isOneOf(KSyntaxHighlighting::Theme::TextStyle style,
             std::initializer_list<KSyntaxHighlighting::Theme::TextStyle> values) {
  return std::ranges::find(values, style) != values.end();
}

}  // namespace

MarkdownSyntaxLexer::MarkdownSyntaxLexer(QObject* parent)
    : QsciLexerCustom(parent) {
  const KSyntaxHighlighting::Definition markdown =
      repository_.definitionForName(QStringLiteral("Markdown"));
  KSyntaxHighlighting::AbstractHighlighter::setDefinition(markdown);
  KSyntaxHighlighting::AbstractHighlighter::setTheme(
      repository_.defaultTheme(
          KSyntaxHighlighting::Repository::DefaultTheme::DarkTheme));
  configureStyles();
}

const char* MarkdownSyntaxLexer::language() const {
  return "El Baton Markdown";
}

QString MarkdownSyntaxLexer::description(int style) const {
  static const QStringList descriptions{
      QStringLiteral("Default"),
      QStringLiteral("Heading"),
      QStringLiteral("Emphasis"),
      QStringLiteral("Strong"),
      QStringLiteral("Strong emphasis"),
      QStringLiteral("Strike-through"),
      QStringLiteral("Highlight"),
      QStringLiteral("Link"),
      QStringLiteral("Block quote"),
      QStringLiteral("List marker"),
      QStringLiteral("Checkbox"),
      QStringLiteral("Comment"),
      QStringLiteral("Code"),
      QStringLiteral("Code fence"),
      QStringLiteral("Table"),
      QStringLiteral("Emoji"),
      QStringLiteral("Metadata key"),
      QStringLiteral("Metadata"),
      QStringLiteral("Escape"),
      QStringLiteral("Keyword"),
      QStringLiteral("Function"),
      QStringLiteral("Variable"),
      QStringLiteral("Control flow"),
      QStringLiteral("Operator"),
      QStringLiteral("Built-in"),
      QStringLiteral("String"),
      QStringLiteral("Data type"),
      QStringLiteral("Number"),
      QStringLiteral("Constant"),
      QStringLiteral("Preprocessor"),
      QStringLiteral("Annotation"),
      QStringLiteral("Error"),
  };
  return style >= 0 && style < descriptions.size()
      ? descriptions.at(style)
      : QString();
}

bool MarkdownSyntaxLexer::hasValidDefinition() const {
  return definition().isValid();
}

void MarkdownSyntaxLexer::styleText(int start, int end) {
  QsciScintilla* const sourceEditor = editor();
  if (sourceEditor == nullptr || start < 0 || end <= start ||
      !hasValidDefinition()) {
    return;
  }

  const int startLine = static_cast<int>(sourceEditor->SendScintilla(
      QsciScintilla::SCI_LINEFROMPOSITION, start));
  ensureStateBeforeLine(startLine);
  statesAfterLine_.resize(startLine);

  KSyntaxHighlighting::State state =
      startLine > 0 ? statesAfterLine_.at(startLine - 1)
                    : KSyntaxHighlighting::State();

  startStyling(start);
  for (int line = startLine; line < sourceEditor->lines(); ++line) {
    const int lineStart = static_cast<int>(sourceEditor->SendScintilla(
        QsciScintilla::SCI_POSITIONFROMLINE, line));
    if (lineStart >= end) break;

    state = highlightEditorLine(line, state, true);
    statesAfterLine_.append(state);
    applyLineStyles(line, start, end);
  }
}

void MarkdownSyntaxLexer::applyFormat(
    int offset, int length, const KSyntaxHighlighting::Format& format) {
  if (length <= 0) return;
  currentRanges_.append({offset, length, styleForFormat(format)});
}

MarkdownSyntaxLexer::Style MarkdownSyntaxLexer::styleForFormat(
    const KSyntaxHighlighting::Format& format) const {
  const QString name = format.name();

  if (name.contains(QStringLiteral("Strong-Emphasis"))) {
    return Style::StrongEmphasis;
  }
  if (name.contains(QStringLiteral("Emphasis Text"))) return Style::Emphasis;
  if (name.contains(QStringLiteral("Strong Text"))) return Style::Strong;
  if (name.contains(QStringLiteral("Strikethrough"))) {
    return Style::StrikeThrough;
  }
  if (name.contains(QStringLiteral("Highlight Text"))) return Style::Highlight;
  if (name.startsWith(QStringLiteral("Header H"))) return Style::Heading;
  if (name == QStringLiteral("List: Checkbox")) return Style::Checkbox;
  if (name == QStringLiteral("List") ||
      name == QStringLiteral("Number List")) {
    return Style::ListMarker;
  }
  if (name.contains(QStringLiteral("Blockquote"))) return Style::BlockQuote;
  if (name.contains(QStringLiteral("Link")) ||
      name.contains(QStringLiteral("Email")) ||
      name.contains(QStringLiteral("Footnote")) ||
      name.contains(QStringLiteral("Image"))) {
    return Style::Link;
  }
  if (name == QStringLiteral("Comment")) return Style::Comment;
  if (name == QStringLiteral("Fenced Code")) return Style::CodeFence;
  if (name == QStringLiteral("Code")) return Style::Code;
  if (name == QStringLiteral("Table")) return Style::Table;
  if (name == QStringLiteral("Emoji")) return Style::Emoji;
  if (name == QStringLiteral("Metadata Title")) return Style::MetadataKey;
  if (name == QStringLiteral("Metadata")) return Style::Metadata;
  if (name == QStringLiteral("Backslash Escape") ||
      name == QStringLiteral("EntityRef")) {
    return Style::Escape;
  }

  using TextStyle = KSyntaxHighlighting::Theme::TextStyle;
  const TextStyle textStyle = format.textStyle();
  if (textStyle == TextStyle::Keyword) return Style::Keyword;
  if (textStyle == TextStyle::Function) return Style::Function;
  if (textStyle == TextStyle::Variable ||
      textStyle == TextStyle::Attribute) {
    return Style::Variable;
  }
  if (textStyle == TextStyle::ControlFlow ||
      textStyle == TextStyle::Import) {
    return Style::ControlFlow;
  }
  if (textStyle == TextStyle::Operator) return Style::Operator;
  if (textStyle == TextStyle::BuiltIn ||
      textStyle == TextStyle::Extension) {
    return Style::BuiltIn;
  }
  if (isOneOf(textStyle,
              {TextStyle::String, TextStyle::VerbatimString,
               TextStyle::SpecialString, TextStyle::Char,
               TextStyle::SpecialChar})) {
    return Style::String;
  }
  if (textStyle == TextStyle::DataType) return Style::DataType;
  if (isOneOf(textStyle,
              {TextStyle::DecVal, TextStyle::BaseN, TextStyle::Float})) {
    return Style::Number;
  }
  if (textStyle == TextStyle::Constant) return Style::Constant;
  if (textStyle == TextStyle::Preprocessor) return Style::Preprocessor;
  if (isOneOf(textStyle,
              {TextStyle::Comment, TextStyle::Documentation,
               TextStyle::CommentVar, TextStyle::RegionMarker})) {
    return Style::Comment;
  }
  if (textStyle == TextStyle::Annotation) return Style::Annotation;
  if (isOneOf(textStyle,
              {TextStyle::Warning, TextStyle::Alert, TextStyle::Error})) {
    return Style::Error;
  }
  if (textStyle == TextStyle::Information) return Style::Code;
  return Style::Default;
}

void MarkdownSyntaxLexer::configureStyles() {
  QFont baseFont = QFontDatabase::systemFont(QFontDatabase::FixedFont);
  baseFont.setPointSize(11);

  const QColor background(QStringLiteral("#1f1f1f"));
  const QColor foreground(QStringLiteral("#e8e8e8"));
  setDefaultFont(baseFont);
  setDefaultPaper(background);
  setDefaultColor(foreground);

  for (int style = styleNumber(Style::Default);
       style <= styleNumber(Style::Error); ++style) {
    setPaper(background, style);
    setFont(baseFont, style);
    setColor(foreground, style);
  }

  const auto setFontProperties =
      [this, &baseFont](Style style, bool bold, bool italic,
                        bool underline = false, bool strikeThrough = false) {
        QFont font = baseFont;
        font.setBold(bold);
        font.setItalic(italic);
        font.setUnderline(underline);
        font.setStrikeOut(strikeThrough);
        setFont(font, styleNumber(style));
      };
  const auto setStyleColor = [this](Style style, const char* color) {
    setColor(QColor(QString::fromLatin1(color)), styleNumber(style));
  };

  setStyleColor(Style::Heading, "#e8a15b");
  setFontProperties(Style::Heading, true, false);
  setFontProperties(Style::Emphasis, false, true);
  setFontProperties(Style::Strong, true, false);
  setFontProperties(Style::StrongEmphasis, true, true);
  setFontProperties(Style::StrikeThrough, false, false, false, true);
  setStyleColor(Style::Highlight, "#e06c75");
  setStyleColor(Style::Link, "#6aa9e9");
  setFontProperties(Style::Link, false, false, true);
  setStyleColor(Style::BlockQuote, "#999999");
  setFontProperties(Style::BlockQuote, false, true);
  setStyleColor(Style::ListMarker, "#e8a15b");
  setFontProperties(Style::ListMarker, true, false);
  setStyleColor(Style::Checkbox, "#6aa9e9");
  setStyleColor(Style::Comment, "#7f848e");
  setFontProperties(Style::Comment, false, true);
  setStyleColor(Style::Code, "#a8cc8c");
  setStyleColor(Style::CodeFence, "#999999");
  setStyleColor(Style::Table, "#c678dd");
  setStyleColor(Style::Emoji, "#d19a66");
  setStyleColor(Style::MetadataKey, "#c678dd");
  setFontProperties(Style::MetadataKey, true, false);
  setStyleColor(Style::Metadata, "#7f848e");
  setStyleColor(Style::Escape, "#56b6c2");

  setStyleColor(Style::Keyword, "#c678dd");
  setStyleColor(Style::Function, "#61afef");
  setStyleColor(Style::Variable, "#e06c75");
  setStyleColor(Style::ControlFlow, "#c678dd");
  setFontProperties(Style::ControlFlow, true, false);
  setStyleColor(Style::Operator, "#56b6c2");
  setStyleColor(Style::BuiltIn, "#e5c07b");
  setStyleColor(Style::String, "#98c379");
  setStyleColor(Style::DataType, "#e5c07b");
  setStyleColor(Style::Number, "#d19a66");
  setStyleColor(Style::Constant, "#d19a66");
  setStyleColor(Style::Preprocessor, "#c678dd");
  setStyleColor(Style::Annotation, "#e5c07b");
  setStyleColor(Style::Error, "#e06c75");
}

void MarkdownSyntaxLexer::ensureStateBeforeLine(int line) {
  if (line <= statesAfterLine_.size()) return;

  KSyntaxHighlighting::State state =
      statesAfterLine_.isEmpty() ? KSyntaxHighlighting::State()
                                 : statesAfterLine_.constLast();
  for (int currentLine = statesAfterLine_.size(); currentLine < line;
       ++currentLine) {
    state = highlightEditorLine(currentLine, state, false);
    statesAfterLine_.append(state);
  }
}

KSyntaxHighlighting::State MarkdownSyntaxLexer::highlightEditorLine(
    int line, const KSyntaxHighlighting::State& previousState,
    bool collectFormats) {
  QString text = editor()->text(line);
  if (text.endsWith(QStringLiteral("\r\n"))) {
    text.chop(2);
  } else if (text.endsWith(QLatin1Char('\n')) ||
             text.endsWith(QLatin1Char('\r'))) {
    text.chop(1);
  }

  currentRanges_.clear();
  const KSyntaxHighlighting::State state =
      highlightLine(QStringView(text), previousState);
  if (!collectFormats) currentRanges_.clear();
  return state;
}

void MarkdownSyntaxLexer::applyLineStyles(int line, int start, int end) {
  const int lineStart = static_cast<int>(editor()->SendScintilla(
      QsciScintilla::SCI_POSITIONFROMLINE, line));
  const QByteArray lineBytes = editor()->text(line).toUtf8();
  if (lineBytes.isEmpty()) return;

  QVector<int> styles(lineBytes.size(), styleNumber(Style::Default));
  QString content = editor()->text(line);
  if (content.endsWith(QStringLiteral("\r\n"))) {
    content.chop(2);
  } else if (content.endsWith(QLatin1Char('\n')) ||
             content.endsWith(QLatin1Char('\r'))) {
    content.chop(1);
  }

  const int contentSize = static_cast<int>(content.size());
  for (const FormatRange& range : std::as_const(currentRanges_)) {
    const int boundedOffset = std::clamp(range.offset, 0, contentSize);
    const int boundedEnd =
        std::clamp(range.offset + range.length, boundedOffset, contentSize);
    const int byteStart =
        QStringView(content).first(boundedOffset).toUtf8().size();
    const int byteEnd = QStringView(content).first(boundedEnd).toUtf8().size();
    std::fill(styles.begin() + byteStart, styles.begin() + byteEnd,
              styleNumber(range.style));
  }

  const int styleCount = static_cast<int>(styles.size());
  const int firstByte = std::clamp(start - lineStart, 0, styleCount);
  const int lastByte = std::clamp(end - lineStart, firstByte, styleCount);
  int runStart = firstByte;
  while (runStart < lastByte) {
    int runEnd = runStart + 1;
    while (runEnd < lastByte && styles.at(runEnd) == styles.at(runStart)) {
      ++runEnd;
    }
    setStyling(runEnd - runStart, styles.at(runStart));
    runStart = runEnd;
  }
}

}  // namespace qt_editor
