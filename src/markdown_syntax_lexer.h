#pragma once

#include <Qsci/qscilexercustom.h>

#include <KSyntaxHighlighting/AbstractHighlighter>
#include <KSyntaxHighlighting/Format>
#include <KSyntaxHighlighting/Repository>
#include <KSyntaxHighlighting/State>

#include <QVector>

namespace qt_editor {

class MarkdownSyntaxLexer final
    : public QsciLexerCustom,
      private KSyntaxHighlighting::AbstractHighlighter {
public:
  enum class Style {
    Default = 0,
    Heading,
    Emphasis,
    Strong,
    StrongEmphasis,
    StrikeThrough,
    Highlight,
    Link,
    BlockQuote,
    ListMarker,
    Checkbox,
    Comment,
    Code,
    CodeFence,
    Table,
    Emoji,
    MetadataKey,
    Metadata,
    Escape,
    Keyword,
    Function,
    Variable,
    ControlFlow,
    Operator,
    BuiltIn,
    String,
    DataType,
    Number,
    Constant,
    Preprocessor,
    Annotation,
    Error,
  };

  explicit MarkdownSyntaxLexer(QObject *parent = nullptr);

  [[nodiscard]] const char *language() const override;
  [[nodiscard]] QString description(int style) const override;
  void styleText(int start, int end) override;

  [[nodiscard]] bool hasValidDefinition() const;

private:
  struct FormatRange {
    int offset = 0;
    int length = 0;
    Style style = Style::Default;
  };

  void applyFormat(int offset, int length,
                   const KSyntaxHighlighting::Format &format) override;
  [[nodiscard]] Style
  styleForFormat(const KSyntaxHighlighting::Format &format) const;
  void configureStyles();
  void ensureStateBeforeLine(int line);
  [[nodiscard]] KSyntaxHighlighting::State
  highlightEditorLine(int line, const KSyntaxHighlighting::State &previousState,
                      bool collectFormats);
  void applyLineStyles(int line, int start, int end);

  KSyntaxHighlighting::Repository repository_;
  QVector<KSyntaxHighlighting::State> statesAfterLine_;
  QVector<FormatRange> currentRanges_;
};

} // namespace qt_editor
