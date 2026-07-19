#include "markdown_pipeline.h"

#include <cmark-gfm-core-extensions.h>
#include <cmark-gfm-extension_api.h>
#include <cmark-gfm.h>

#include <QElapsedTimer>
#include <QFile>
#include <QHash>
#include <QJsonDocument>
#include <QJsonObject>
#include <QRegularExpression>
#include <QUrl>

#include <algorithm>
#include <chrono>
#include <cstdlib>
#include <mutex>
#include <utility>

namespace qt_editor {

namespace {

constexpr int kCmarkOptions = CMARK_OPT_UNSAFE | CMARK_OPT_VALIDATE_UTF8 | CMARK_OPT_FOOTNOTES;

QString escapeAttribute(QStringView value) {
  QString escaped;
  escaped.reserve(value.size());
  for (const QChar character : value) {
    switch (character.unicode()) {
      case '&': escaped += QStringLiteral("&amp;"); break;
      case '<': escaped += QStringLiteral("&lt;"); break;
      case '>': escaped += QStringLiteral("&gt;"); break;
      case '"': escaped += QStringLiteral("&quot;"); break;
      case '\'': escaped += QStringLiteral("&#39;"); break;
      default: escaped += character; break;
    }
  }
  return escaped;
}

QString encodePayload(QStringView value) {
  return QString::fromLatin1(value.toString().toUtf8().toBase64());
}

QString decodeHtml(QString value) {
  static const QRegularExpression numeric(QStringLiteral("&#(x[0-9a-fA-F]+|[0-9]+);"));
  qsizetype offset = 0;
  while (true) {
    const QRegularExpressionMatch match = numeric.match(value, offset);
    if (!match.hasMatch()) break;
    bool ok = false;
    const QString digits = match.captured(1);
    const uint codepoint = digits.startsWith(QLatin1Char('x'))
        ? digits.sliced(1).toUInt(&ok, 16) : digits.toUInt(&ok, 10);
    const bool validCodepoint = codepoint <= 0x10ffffU && !(codepoint >= 0xd800U && codepoint <= 0xdfffU);
    const char32_t utf32 = static_cast<char32_t>(codepoint);
    const QString replacement = ok && validCodepoint
        ? QString::fromUcs4(&utf32, 1) : match.captured(0);
    value.replace(match.capturedStart(), match.capturedLength(), replacement);
    offset = match.capturedStart() + replacement.size();
  }
  value.replace(QStringLiteral("&quot;"), QStringLiteral("\""));
  value.replace(QStringLiteral("&#39;"), QStringLiteral("'"));
  value.replace(QStringLiteral("&lt;"), QStringLiteral("<"));
  value.replace(QStringLiteral("&gt;"), QStringLiteral(">"));
  value.replace(QStringLiteral("&amp;"), QStringLiteral("&"));
  return value;
}

bool escapedAt(QStringView text, qsizetype position) {
  qsizetype slashes = 0;
  while (position > slashes && text.at(position - slashes - 1) == QLatin1Char('\\')) ++slashes;
  return (slashes % 2) != 0;
}

bool appendSuperscriptOrSubscript(QStringView line, qsizetype* cursor, QString* output) {
  const qsizetype start = *cursor;
  const QChar delimiter = line.at(start);
  if ((delimiter != QLatin1Char('~') && delimiter != QLatin1Char('^')) ||
      escapedAt(line, start) ||
      (start > 0 && line.at(start - 1) == delimiter) ||
      (start + 1 < line.size() && line.at(start + 1) == delimiter)) {
    return false;
  }

  const qsizetype close = line.indexOf(delimiter, start + 1);
  if (close <= start + 1 || escapedAt(line, close) ||
      (close + 1 < line.size() && line.at(close + 1) == delimiter)) {
    return false;
  }
  const QStringView contents = line.sliced(start + 1, close - start - 1);
  if (contents.front().isSpace() || contents.back().isSpace() || contents.contains(delimiter)) {
    return false;
  }

  const QStringView tag = delimiter == QLatin1Char('~')
      ? QStringView(u"sub") : QStringView(u"sup");
  *output += QLatin1Char('<');
  *output += tag;
  *output += QLatin1Char('>');
  *output += contents;
  *output += QStringLiteral("</");
  *output += tag;
  *output += QLatin1Char('>');
  *cursor = close + 1;
  return true;
}

QString preprocessMathLine(QStringView line) {
  QString output;
  qsizetype cursor = 0;
  while (cursor < line.size()) {
    // Inline code is deliberately opaque to the math preprocessor.
    if (line.at(cursor) == QLatin1Char('`')) {
      qsizetype ticks = 1;
      while (cursor + ticks < line.size() && line.at(cursor + ticks) == QLatin1Char('`')) ++ticks;
      const QString delimiter(ticks, QLatin1Char('`'));
      const qsizetype close = line.indexOf(delimiter, cursor + ticks);
      const qsizetype end = close < 0 ? line.size() : close + ticks;
      output += line.sliced(cursor, end - cursor);
      cursor = end;
      continue;
    }
    // Preserve raw HTML tags and their attributes byte-for-byte.
    if (line.at(cursor) == QLatin1Char('<')) {
      const qsizetype close = line.indexOf(QLatin1Char('>'), cursor + 1);
      if (close >= 0) {
        output += line.sliced(cursor, close - cursor + 1);
        cursor = close + 1;
        continue;
      }
    }

    QStringView opener;
    QStringView closer;
    bool display = false;
    if (line.sliced(cursor).startsWith(QStringLiteral("$$")) && !escapedAt(line, cursor)) {
      opener = QStringLiteral("$$"); closer = opener; display = true;
    } else if (line.sliced(cursor).startsWith(QStringLiteral("\\[")) && !escapedAt(line, cursor)) {
      opener = QStringLiteral("\\["); closer = QStringLiteral("\\]"); display = true;
    } else if (line.sliced(cursor).startsWith(QStringLiteral("\\(")) && !escapedAt(line, cursor)) {
      opener = QStringLiteral("\\("); closer = QStringLiteral("\\)");
    } else if (line.at(cursor) == QLatin1Char('$') && !escapedAt(line, cursor)) {
      opener = QStringLiteral("$"); closer = opener;
    }
    if (opener.isEmpty()) {
      if (appendSuperscriptOrSubscript(line, &cursor, &output)) continue;
      output += line.at(cursor++);
      continue;
    }

    qsizetype close = cursor + opener.size();
    do {
      close = line.indexOf(closer, close);
    } while (close >= 0 && escapedAt(line, close) && ++close);
    if (close < 0 || close == cursor + opener.size()) {
      output += line.at(cursor++);
      continue;
    }
    const QString tex = line.sliced(cursor + opener.size(), close - cursor - opener.size()).toString();
    if (!display && tex.contains(QLatin1Char('\n'))) {
      output += line.at(cursor++);
      continue;
    }
    output += QStringLiteral("<span class=\"qt-katex\" data-tex=\"") + escapeAttribute(tex) +
              QStringLiteral("\" data-display=\"") + (display ? QLatin1Char('1') : QLatin1Char('0')) +
              QStringLiteral("\"></span>");
    cursor = close + closer.size();
  }
  return output;
}

QString preprocessMath(const QString& source) {
  QString output;
  QString ordinary;
  const QStringList lines = source.split(QLatin1Char('\n'), Qt::KeepEmptyParts);
  bool inFence = false;
  QChar fenceCharacter;
  qsizetype fenceLength = 0;
  static const QRegularExpression fence(QStringLiteral("^ {0,3}(`{3,}|~{3,})(.*)$"));
  const auto flushOrdinary = [&] {
    output += preprocessMathLine(ordinary);
    ordinary.clear();
  };
  for (qsizetype index = 0; index < lines.size(); ++index) {
    const QString& line = lines.at(index);
    const bool hasNewline = index + 1 < lines.size();
    const QRegularExpressionMatch match = fence.match(line);
    if (match.hasMatch()) {
      flushOrdinary();
      const QString marker = match.captured(1);
      if (!inFence) {
        inFence = true;
        fenceCharacter = marker.front();
        fenceLength = marker.size();
      } else if (marker.front() == fenceCharacter && marker.size() >= fenceLength && match.captured(2).trimmed().isEmpty()) {
        inFence = false;
      }
      output += line;
    } else {
      if (inFence) output += line;
      else ordinary += line;
    }
    if (hasNewline) {
      if (inFence || match.hasMatch()) output += QLatin1Char('\n');
      else ordinary += QLatin1Char('\n');
    }
  }
  flushOrdinary();
  return output;
}

const QHash<QString, QString>& emojiShortcodes() {
  static const QHash<QString, QString> shortcodes = [] {
    QHash<QString, QString> result;
    QFile file(QStringLiteral(QT_EDITOR_EMOJI_JSON));
    if (!file.open(QIODevice::ReadOnly)) return result;
    const QJsonObject object = QJsonDocument::fromJson(file.readAll()).object();
    for (auto iterator = object.constBegin(); iterator != object.constEnd(); ++iterator) {
      result.insert(iterator.key(), iterator.value().toString());
    }
    return result;
  }();
  return shortcodes;
}

QString replaceEmojiOnLine(const QString& line) {
  static const QRegularExpression shortcode(QStringLiteral(":([a-z0-9_+\\-]+):"),
                                            QRegularExpression::CaseInsensitiveOption);
  QString output;
  qsizetype cursor = 0;
  while (cursor < line.size()) {
    if (line.at(cursor) == QLatin1Char('`')) {
      qsizetype ticks = 1;
      while (cursor + ticks < line.size() && line.at(cursor + ticks) == QLatin1Char('`')) ++ticks;
      const QString delimiter(ticks, QLatin1Char('`'));
      const qsizetype close = line.indexOf(delimiter, cursor + ticks);
      const qsizetype end = close < 0 ? line.size() : close + ticks;
      output += line.sliced(cursor, end - cursor);
      cursor = end;
      continue;
    }
    const QRegularExpressionMatch match = shortcode.match(line, cursor);
    const qsizetype nextCode = line.indexOf(QLatin1Char('`'), cursor);
    if (nextCode >= 0 && (!match.hasMatch() || nextCode < match.capturedStart())) {
      output += line.sliced(cursor, nextCode - cursor);
      cursor = nextCode;
      continue;
    }
    if (!match.hasMatch()) {
      output += line.sliced(cursor);
      break;
    }
    output += line.sliced(cursor, match.capturedStart() - cursor);
    const QString replacement = emojiShortcodes().value(match.captured(1).toLower());
    output += replacement.isEmpty() ? match.captured(0) : replacement;
    cursor = match.capturedEnd();
  }
  return output;
}

QString replaceEmojiShortcodes(const QString& source) {
  QStringList lines = source.split(QLatin1Char('\n'), Qt::KeepEmptyParts);
  static const QRegularExpression fence(QStringLiteral("^ {0,3}(`{3,}|~{3,})(.*)$"));
  bool inFence = false;
  QChar fenceCharacter;
  qsizetype fenceLength = 0;
  for (QString& line : lines) {
    const QRegularExpressionMatch match = fence.match(line);
    if (match.hasMatch()) {
      const QString marker = match.captured(1);
      if (!inFence) {
        inFence = true;
        fenceCharacter = marker.front();
        fenceLength = marker.size();
      } else if (marker.front() == fenceCharacter && marker.size() >= fenceLength &&
                 match.captured(2).trimmed().isEmpty()) {
        inFence = false;
      }
      continue;
    }
    if (!inFence) line = replaceEmojiOnLine(line);
  }
  return lines.join(QLatin1Char('\n'));
}

QString preprocessReferenceSyntax(QString source) {
  source = replaceEmojiShortcodes(source);
  source.replace(QRegularExpression(QStringLiteral("\\[\\[@toc\\]\\]"), QRegularExpression::CaseInsensitiveOption),
                 QStringLiteral("MDMACROTOCPLACEHOLDER"));
  source.replace(QRegularExpression(QStringLiteral("\\[\\[@pagebreak\\]\\]"), QRegularExpression::CaseInsensitiveOption),
                 QStringLiteral("MDMACROPAGEBREAKPLACEHOLDER"));

  // Notable wikilinks use title|target (the title alone is also the target).
  static const QRegularExpression wikilink(QStringLiteral("\\[\\[([^|\\]\\n]+)(?:\\|([^\\]\\n]+))?\\]\\]"));
  qsizetype offset = 0;
  while (true) {
    const QRegularExpressionMatch match = wikilink.match(source, offset);
    if (!match.hasMatch()) break;
    const QString title = match.captured(1);
    QString target = match.captured(2).isEmpty() ? title : match.captured(2);
    if (!QRegularExpression(QStringLiteral("\\.(?:md|mkd|mdwn|mdown|markdown|markdn|mdtxt|mdtext|txt)$"),
                            QRegularExpression::CaseInsensitiveOption).match(target).hasMatch()) {
      target += QStringLiteral(".md");
    }
    const QString replacement = QStringLiteral("[%1](@note/%2)").arg(title, target);
    source.replace(match.capturedStart(), match.capturedLength(), replacement);
    offset = match.capturedStart() + replacement.size();
  }

  // cmark rejects spaces in app-token destinations. Match the native addon's
  // encodeSpecialLinks behavior while retaining the semantic @token scheme.
  static const QRegularExpression specialLink(
      QStringLiteral("\\[([^\\]]*)\\]\\((@(?>note|attachment|tag)/[^)]+)\\)"));
  offset = 0;
  while (true) {
    const QRegularExpressionMatch match = specialLink.match(source, offset);
    if (!match.hasMatch()) break;
    const QByteArray encoded = QUrl::toPercentEncoding(match.captured(2), QByteArray("@/:?&=+$#;,*'!~"));
    const QString replacement = QStringLiteral("[%1](%2)").arg(match.captured(1), QString::fromLatin1(encoded));
    source.replace(match.capturedStart(), match.capturedLength(), replacement);
    offset = match.capturedStart() + replacement.size();
  }
  return source;
}

void attachExtensions(cmark_parser* parser) {
  static std::once_flag once;
  std::call_once(once, [] { cmark_gfm_core_extensions_ensure_registered(); });
  static constexpr const char* names[] = {"autolink", "strikethrough", "table", "tasklist"};
  for (const char* name : names) {
    if (cmark_syntax_extension* extension = cmark_find_syntax_extension(name)) {
      cmark_parser_attach_syntax_extension(parser, extension);
    }
  }
}

struct Document final {
  cmark_parser* parser = nullptr;
  cmark_node* root = nullptr;
  Document() = default;
  Document(const Document&) = delete;
  Document& operator=(const Document&) = delete;
  Document(Document&& other) noexcept
      : parser(std::exchange(other.parser, nullptr)), root(std::exchange(other.root, nullptr)) {}
  Document& operator=(Document&&) = delete;
  ~Document() {
    if (root) cmark_node_free(root);
    if (parser) cmark_parser_free(parser);
  }
};

Document parse(const QByteArray& utf8) {
  Document document;
  document.parser = cmark_parser_new(kCmarkOptions);
  attachExtensions(document.parser);
  cmark_parser_feed(document.parser, utf8.constData(), static_cast<size_t>(utf8.size()));
  document.root = cmark_parser_finish(document.parser);
  return document;
}

QString postprocessCodeBlocks(QString html) {
  static const QRegularExpression codeBlock(
      QStringLiteral("<pre><code([^>]*)>([\\s\\S]*?)</code></pre>"));
  qsizetype offset = 0;
  while (true) {
    const QRegularExpressionMatch match = codeBlock.match(html, offset);
    if (!match.hasMatch()) break;
    const QString attributes = match.captured(1);
    static const QRegularExpression language(QStringLiteral("(?:^|\\s)class=\\\"[^\\\"]*language-([A-Za-z0-9_+-]+)[^\\\"]*\\\""));
    const QRegularExpressionMatch languageMatch = language.match(attributes);
    if (!languageMatch.hasMatch()) {
      offset = match.capturedEnd();
      continue;
    }
    const QString name = languageMatch.captured(1).toLower();
    const QString source = decodeHtml(match.captured(2));
    QString replacement;
    if (name == QStringLiteral("mermaid")) {
      // Mermaid syntax commonly contains `-->`. Once HTML parsing decodes the
      // attribute, DOMPurify deliberately removes values containing that
      // sequence. Carry an opaque UTF-8 payload through sanitization instead.
      replacement = QStringLiteral("<div class=\"mermaid qt-mermaid\" data-source-b64=\"") +
                    encodePayload(source) + QStringLiteral("\"></div>");
    } else if (name == QStringLiteral("plantuml") || name == QStringLiteral("puml") ||
               name == QStringLiteral("uml")) {
      replacement = QStringLiteral("<div class=\"plantuml qt-plantuml\" data-source-b64=\"") +
                    encodePayload(source) + QStringLiteral("\"></div>");
    } else if (name == QStringLiteral("tex") || name == QStringLiteral("latex") || name == QStringLiteral("katex")) {
      replacement = QStringLiteral("<span class=\"qt-katex\" data-tex=\"") +
                    escapeAttribute(source) + QStringLiteral("\" data-display=\"1\"></span>");
    } else {
      offset = match.capturedEnd();
      continue;
    }
    html.replace(match.capturedStart(), match.capturedLength(), replacement);
    offset = match.capturedStart() + replacement.size();
  }
  return html;
}

QString renderFragment(const QString& source) {
  const QByteArray utf8 = preprocessMath(source).toUtf8();
  Document document = parse(utf8);
  char* rendered = cmark_render_html(document.root, kCmarkOptions,
                                     cmark_parser_get_syntax_extensions(document.parser));
  const QString html = QString::fromUtf8(rendered ? rendered : "");
  std::free(rendered);
  return postprocessCodeBlocks(html);
}

QVector<QString> renderTopLevel(Document& document) {
  QVector<QString> renderedBlocks;
  for (cmark_node* node = cmark_node_first_child(document.root); node; node = cmark_node_next(node)) {
    char* rendered = cmark_render_html(node, kCmarkOptions,
                                       cmark_parser_get_syntax_extensions(document.parser));
    renderedBlocks.append(postprocessCodeBlocks(QString::fromUtf8(rendered ? rendered : "")));
    std::free(rendered);
  }
  return renderedBlocks;
}

QString stripTags(QString html) {
  html.remove(QRegularExpression(QStringLiteral("<[^>]*>")));
  return decodeHtml(html).trimmed();
}

QString slugify(QString text, QHash<QString, int>& counts) {
  text = stripTags(text).toLower();
  text.replace(QRegularExpression(QStringLiteral("[^\\p{L}\\p{N}]+")), QStringLiteral("-"));
  text.remove(QRegularExpression(QStringLiteral("^-+|-+$")));
  if (text.isEmpty()) text = QStringLiteral("section");
  const int count = counts.value(text, 0);
  counts.insert(text, count + 1);
  return count == 0 ? text : QStringLiteral("%1-%2").arg(text).arg(count);
}

void postprocessReferenceHtml(QVector<QString>& blocks) {
  struct Heading { int level; QString id; QString text; };
  QVector<Heading> headings;
  QHash<QString, int> slugCounts;
  static const QRegularExpression heading(QStringLiteral("<h([1-6])([^>]*)>([\\s\\S]*?)</h\\1>"),
                                          QRegularExpression::CaseInsensitiveOption);
  static const QRegularExpression idAttribute(QStringLiteral("\\sid=\"([^\"]+)\""),
                                              QRegularExpression::CaseInsensitiveOption);
  for (QString& html : blocks) {
    qsizetype offset = 0;
    while (true) {
      const QRegularExpressionMatch match = heading.match(html, offset);
      if (!match.hasMatch()) break;
      const QString text = stripTags(match.captured(3));
      const QRegularExpressionMatch existingId = idAttribute.match(match.captured(2));
      const QString id = existingId.hasMatch() ? existingId.captured(1) : slugify(text, slugCounts);
      QString replacement = match.captured(0);
      if (!existingId.hasMatch()) replacement.insert(replacement.indexOf(QLatin1Char('>')), QStringLiteral(" id=\"%1\"").arg(escapeAttribute(id)));
      html.replace(match.capturedStart(), match.capturedLength(), replacement);
      offset = match.capturedStart() + replacement.size();
      if (!text.isEmpty()) headings.append({match.captured(1).toInt(), id, text});
    }
  }

  QString toc = QStringLiteral("<div class=\"macro-toc\"><div class=\"macro-toc-title\">Table of Contents</div><ul class=\"macro-toc-list\">");
  for (const Heading& item : headings) {
    toc += QStringLiteral("<li class=\"toc-level-%1\"><a class=\"toc-item\" href=\"#%2\">%3</a></li>")
        .arg(item.level).arg(escapeAttribute(item.id), escapeAttribute(item.text));
  }
  toc += QStringLiteral("</ul></div>");

  qsizetype checkbox = 0;
  qsizetype detailsIndex = 0;
  static const QRegularExpression checkboxTag(QStringLiteral("<input type=\"checkbox\"([^>]*)>"),
                                              QRegularExpression::CaseInsensitiveOption);
  static const QRegularExpression detailsTag(QStringLiteral("<details(?![^>]*\\bdata-nth=)([^>]*)>"),
                                             QRegularExpression::CaseInsensitiveOption);
  static const QRegularExpression externalAnchor(QStringLiteral("<a(?![^>]*\\btarget=)([^>]*\\bhref=\"(?!#)[^\"]+\"[^>]*)>"),
                                                 QRegularExpression::CaseInsensitiveOption);
  static const QRegularExpression fileHref(QStringLiteral("href=\"(file:[^\"]+)\""),
                                           QRegularExpression::CaseInsensitiveOption);
  static const QRegularExpression codeBlock(QStringLiteral("<pre><code([^>]*)>([\\s\\S]*?)</code></pre>"));
  for (QString& html : blocks) {
    html.replace(QStringLiteral("<p>MDMACROTOCPLACEHOLDER</p>"), toc);
    html.replace(QStringLiteral("<p>MDMACROPAGEBREAKPLACEHOLDER</p>"), QStringLiteral("<hr class=\"pagebreak\">"));

    qsizetype offset = 0;
    while (true) {
      const QRegularExpressionMatch match = checkboxTag.match(html, offset);
      if (!match.hasMatch()) break;
      QString attributes = match.captured(1);
      attributes.remove(QRegularExpression(QStringLiteral("\\sdisabled(?:=\"[^\"]*\")?"), QRegularExpression::CaseInsensitiveOption));
      attributes = attributes.trimmed();
      if (attributes.endsWith(QLatin1Char('/'))) attributes.chop(1);
      attributes = attributes.trimmed();
      if (!attributes.isEmpty()) attributes.prepend(QLatin1Char(' '));
      const QString replacement = QStringLiteral("<input type=\"checkbox\"%1 data-nth=\"%2\">").arg(attributes).arg(checkbox++);
      html.replace(match.capturedStart(), match.capturedLength(), replacement);
      offset = match.capturedStart() + replacement.size();
    }
    html.replace(QStringLiteral("<li><input type=\"checkbox\""), QStringLiteral("<li class=\"task-list-item\"><input type=\"checkbox\""));

    offset = 0;
    while (true) {
      const QRegularExpressionMatch match = detailsTag.match(html, offset);
      if (!match.hasMatch()) break;
      const QString replacement = QStringLiteral("<details data-nth=\"%1\"%2>")
          .arg(detailsIndex++).arg(match.captured(1));
      html.replace(match.capturedStart(), match.capturedLength(), replacement);
      offset = match.capturedStart() + replacement.size();
    }
    html.replace(externalAnchor, QStringLiteral("<a target=\"_blank\"\\1>"));
    qsizetype fileOffset = 0;
    while (true) {
      const QRegularExpressionMatch match = fileHref.match(html, fileOffset);
      if (!match.hasMatch()) break;
      const QString encoded = QString::fromLatin1(QUrl::toPercentEncoding(match.captured(1)));
      const QString replacement = QStringLiteral("href=\"@file/%1\"").arg(encoded);
      html.replace(match.capturedStart(), match.capturedLength(), replacement);
      fileOffset = match.capturedStart() + replacement.size();
    }

    offset = 0;
    while (true) {
      const QRegularExpressionMatch match = codeBlock.match(html, offset);
      if (!match.hasMatch()) break;
      // Dynamic blocks have already been replaced and never match this path.
      const QString replacement = QStringLiteral("<div class=\"copy-wrapper\"><button class=\"copy\" type=\"button\" title=\"Copy code\">Copy</button>%1</div>").arg(match.captured(0));
      html.replace(match.capturedStart(), match.capturedLength(), replacement);
      offset = match.capturedStart() + replacement.size();
    }
  }
}

QVector<qsizetype> lineByteStarts(const QByteArray& utf8) {
  QVector<qsizetype> starts{0};
  for (qsizetype index = 0; index < utf8.size(); ++index) {
    if (utf8.at(index) == '\n') starts.append(index + 1);
  }
  return starts;
}

qsizetype toQStringOffset(const QByteArray& utf8, qsizetype byteOffset) {
  return QString::fromUtf8(utf8.constData(), std::clamp(byteOffset, qsizetype{0}, utf8.size())).size();
}

SourceRange sourceRange(cmark_node* node, const QByteArray& utf8, const QVector<qsizetype>& starts) {
  const qsizetype startLine = std::max(1, cmark_node_get_start_line(node));
  const qsizetype endLine = std::max(startLine, static_cast<qsizetype>(cmark_node_get_end_line(node)));
  const qsizetype startBase = starts.value(startLine - 1, utf8.size());
  const qsizetype endBase = starts.value(endLine - 1, utf8.size());
  const qsizetype startByte = startBase + std::max(0, cmark_node_get_start_column(node) - 1);
  // cmark's end column is inclusive; SourceRange::end is consistently exclusive.
  qsizetype endByte = endBase + std::max(0, cmark_node_get_end_column(node));
  const qsizetype lineLimit = starts.value(endLine, utf8.size());
  endByte = std::min(endByte, lineLimit);
  while (endByte > endBase && (utf8.at(endByte - 1) == '\n' || utf8.at(endByte - 1) == '\r')) --endByte;
  return {toQStringOffset(utf8, startByte), toQStringOffset(utf8, std::max(startByte, endByte))};
}

bool blockContentChanged(const RenderedBlock& left, const RenderedBlock& right) {
  return left.kind != right.kind || left.source != right.source || left.html != right.html || left.syncMode != right.syncMode;
}

bool blockRangeChanged(const RenderedBlock& left, const RenderedBlock& right) {
  return left.range.start != right.range.start || left.range.end != right.range.end;
}

int detailsDepthDelta(const RenderedBlock& block) {
  // Only raw HTML blocks can establish a container across cmark's top-level
  // nodes. Looking at Markdown/code block source here would mistake examples
  // containing literal <details> text for real containers.
  if (block.kind != QStringLiteral("html_block")) return 0;

  static const QRegularExpression tag(
      QStringLiteral("<\\s*(/?)\\s*details\\b[^>]*>"),
      QRegularExpression::CaseInsensitiveOption);
  int delta = 0;
  QRegularExpressionMatchIterator matches = tag.globalMatch(block.source);
  while (matches.hasNext()) {
    const QRegularExpressionMatch match = matches.next();
    if (match.captured(1) == QStringLiteral("/")) {
      --delta;
    } else if (!match.captured(0).chopped(1).trimmed().endsWith(QLatin1Char('/'))) {
      ++delta;
    }
  }
  return delta;
}

QVector<RenderedBlock> groupDetailsContainers(QVector<RenderedBlock> blocks,
                                               QStringView markdown) {
  QVector<RenderedBlock> grouped;
  grouped.reserve(blocks.size());
  for (qsizetype index = 0; index < blocks.size(); ++index) {
    RenderedBlock block = std::move(blocks[index]);
    int depth = detailsDepthDelta(block);
    if (depth <= 0) {
      grouped.append(std::move(block));
      continue;
    }

    block.kind = QStringLiteral("details");
    while (depth > 0 && index + 1 < blocks.size()) {
      RenderedBlock child = std::move(blocks[++index]);
      depth += detailsDepthDelta(child);
      block.range.end = child.range.end;
      block.html += child.html;
    }
    block.source = markdown.sliced(block.range.start, block.range.end - block.range.start).toString();
    grouped.append(std::move(block));
  }
  return grouped;
}

}  // namespace

MarkdownPipeline::MarkdownPipeline() = default;
MarkdownPipeline::~MarkdownPipeline() = default;

QString MarkdownPipeline::plainContent(const QString& fileContent) {
  if (!fileContent.startsWith(QStringLiteral("---\n")) && !fileContent.startsWith(QStringLiteral("---\r\n"))) return fileContent;
  static const QRegularExpression closing(QStringLiteral("\\r?\\n(?:---|\\.\\.\\.)[ \\t]*\\r?\\n"));
  const QRegularExpressionMatch match = closing.match(fileContent, 3);
  if (!match.hasMatch()) return fileContent;
  QString body = fileContent.sliced(match.capturedEnd());
  if (body.startsWith(QLatin1Char('\n'))) body.remove(0, 1);
  return body;
}

RenderResult MarkdownPipeline::render(const QString& markdown, quint64 generation, qint64 inputTimestampNs) {
  RenderResult result;
  result.generation = generation;
  const auto renderStart = std::chrono::steady_clock::now();
  if (inputTimestampNs > 0) {
    const qint64 now = std::chrono::duration_cast<std::chrono::nanoseconds>(renderStart.time_since_epoch()).count();
    result.timings.inputToRenderStartMs = std::max<qint64>(0, now - inputTimestampNs) / 1'000'000.0;
  }

  QElapsedTimer timer;
  timer.start();
  const QByteArray utf8 = markdown.toUtf8();
  const QByteArray preprocessedUtf8 = preprocessReferenceSyntax(preprocessMath(markdown)).toUtf8();
  const QVector<qsizetype> starts = lineByteStarts(utf8);
  result.timings.preprocessMs = timer.nsecsElapsed() / 1'000'000.0;

  timer.restart();
  Document document = parse(utf8);
  Document renderDocument = parse(preprocessedUtf8);
  QVector<QString> renderedBlocks = renderTopLevel(renderDocument);
  postprocessReferenceHtml(renderedBlocks);
  QVector<RenderedBlock> current;
  qsizetype renderedIndex = 0;
  for (cmark_node* node = cmark_node_first_child(document.root); node; node = cmark_node_next(node)) {
    RenderedBlock block;
    block.kind = QString::fromUtf8(cmark_node_get_type_string(node));
    block.range = sourceRange(node, utf8, starts);
    block.source = markdown.sliced(block.range.start, block.range.end - block.range.start);
    block.html = renderedIndex < renderedBlocks.size()
        ? renderedBlocks.at(renderedIndex) : renderFragment(block.source);
    current.append(std::move(block));
    ++renderedIndex;
  }
  current = groupDetailsContainers(std::move(current), markdown);
  result.timings.parseMs = timer.nsecsElapsed() / 1'000'000.0;

  timer.restart();
  // Sequence edit distance preserves identities across content edits while exact
  // blocks on either side anchor insertions and removals. Bound the matrix for
  // benchmark-sized documents: an unbounded O(n*m) allocation would itself
  // invalidate the large-document experiment.
  const qsizetype oldCount = previousBlocks_.size();
  const qsizetype newCount = current.size();
  QVector<int> matchedOld(newCount, -1);
  QVector<bool> oldUsed(oldCount, false);
  constexpr qsizetype kMaximumEditMatrixCells = 2'000'000;
  if ((oldCount + 1) <= kMaximumEditMatrixCells / std::max<qsizetype>(1, newCount + 1)) {
    QVector<QVector<int>> cost(oldCount + 1, QVector<int>(newCount + 1));
    for (qsizetype oldIndex = 0; oldIndex <= oldCount; ++oldIndex) cost[oldIndex][0] = static_cast<int>(oldIndex * 2);
    for (qsizetype newIndex = 0; newIndex <= newCount; ++newIndex) cost[0][newIndex] = static_cast<int>(newIndex * 2);
    for (qsizetype oldIndex = 1; oldIndex <= oldCount; ++oldIndex) {
      for (qsizetype newIndex = 1; newIndex <= newCount; ++newIndex) {
        const RenderedBlock& oldBlock = previousBlocks_.at(oldIndex - 1);
        const RenderedBlock& newBlock = current.at(newIndex - 1);
        const int substitution = oldBlock.kind == newBlock.kind
            ? (oldBlock.source == newBlock.source ? 0 : 1) : 5;
        cost[oldIndex][newIndex] = std::min({cost[oldIndex - 1][newIndex] + 2,
                                             cost[oldIndex][newIndex - 1] + 2,
                                             cost[oldIndex - 1][newIndex - 1] + substitution});
      }
    }
    qsizetype oldIndex = oldCount;
    qsizetype newIndex = newCount;
    while (oldIndex > 0 || newIndex > 0) {
      if (oldIndex > 0 && newIndex > 0) {
        const RenderedBlock& oldBlock = previousBlocks_.at(oldIndex - 1);
        const RenderedBlock& newBlock = current.at(newIndex - 1);
        const int substitution = oldBlock.kind == newBlock.kind
            ? (oldBlock.source == newBlock.source ? 0 : 1) : 5;
        if (cost[oldIndex][newIndex] == cost[oldIndex - 1][newIndex - 1] + substitution) {
          if (substitution < 5) {
            matchedOld[newIndex - 1] = static_cast<int>(oldIndex - 1);
            oldUsed[oldIndex - 1] = true;
          }
          --oldIndex;
          --newIndex;
          continue;
        }
      }
      if (oldIndex > 0 && cost[oldIndex][newIndex] == cost[oldIndex - 1][newIndex] + 2) --oldIndex;
      else --newIndex;
    }
  } else {
    // A bounded-lookahead linear matcher retains IDs around ordinary local
    // insertions/deletions without quadratic memory on very large documents.
    constexpr qsizetype kLookahead = 64;
    qsizetype oldIndex = 0;
    for (qsizetype newIndex = 0; newIndex < newCount; ++newIndex) {
      if (oldIndex >= oldCount) break;
      const auto exact = [&](qsizetype oldPosition, qsizetype newPosition) {
        return previousBlocks_.at(oldPosition).kind == current.at(newPosition).kind &&
               previousBlocks_.at(oldPosition).source == current.at(newPosition).source;
      };
      if (exact(oldIndex, newIndex)) {
        matchedOld[newIndex] = static_cast<int>(oldIndex);
        oldUsed[oldIndex++] = true;
        continue;
      }
      qsizetype upcomingNew = -1;
      for (qsizetype candidate = newIndex + 1; candidate < std::min(newCount, newIndex + kLookahead); ++candidate) {
        if (exact(oldIndex, candidate)) { upcomingNew = candidate; break; }
      }
      qsizetype upcomingOld = -1;
      for (qsizetype candidate = oldIndex + 1; candidate < std::min(oldCount, oldIndex + kLookahead); ++candidate) {
        if (exact(candidate, newIndex)) { upcomingOld = candidate; break; }
      }
      if (upcomingNew >= 0 && (upcomingOld < 0 || upcomingNew - newIndex <= upcomingOld - oldIndex)) continue;
      if (upcomingOld >= 0) oldIndex = upcomingOld;
      if (previousBlocks_.at(oldIndex).kind == current.at(newIndex).kind) {
        matchedOld[newIndex] = static_cast<int>(oldIndex);
        oldUsed[oldIndex++] = true;
      }
    }
  }

  for (qsizetype index = 0; index < current.size(); ++index) {
    RenderedBlock& block = current[index];
    const int match = matchedOld.at(index);
    block.id = match >= 0 ? previousBlocks_.at(match).id
                          : QStringLiteral("block-%1").arg(nextBlockId_++);
    if (match < 0 || blockContentChanged(previousBlocks_.at(match), block)) result.blocks.append(block);
    else if (blockRangeChanged(previousBlocks_.at(match), block)) result.rangeUpdates.append(block);
  }
  for (qsizetype index = 0; index < previousBlocks_.size(); ++index) {
    if (!oldUsed.at(index)) result.removedBlockIds.append(previousBlocks_.at(index).id);
  }
  result.allBlocks = current;
  previousBlocks_ = std::move(current);
  result.timings.postprocessMs = timer.nsecsElapsed() / 1'000'000.0;
  return result;
}

QJsonObject RenderedBlock::toJson() const {
  return {{"id", id}, {"kind", kind}, {"html", html}, {"sourceStart", range.start}, {"sourceEnd", range.end}, {"syncMode", syncMode}};
}

QJsonObject RenderedBlock::rangeToJson() const {
  return {{"id", id}, {"sourceStart", range.start}, {"sourceEnd", range.end}, {"syncMode", syncMode}};
}

QJsonObject RenderTimings::toJson() const {
  return {{"inputToRenderStartMs", inputToRenderStartMs}, {"preprocessMs", preprocessMs}, {"parseMs", parseMs}, {"postprocessMs", postprocessMs}};
}

QJsonObject RenderResult::toJson(PatchMode patchMode) const {
  QJsonArray changed;
  const QVector<RenderedBlock>& publishedBlocks = patchMode == PatchMode::FullDocument ? allBlocks : blocks;
  for (const RenderedBlock& block : publishedBlocks) changed.append(block.toJson());
  QJsonArray order;
  for (const RenderedBlock& block : allBlocks) order.append(block.id);
  QJsonArray removed;
  for (const QString& id : removedBlockIds) removed.append(id);
  QJsonArray ranges;
  if (patchMode == PatchMode::Blocks) {
    for (const RenderedBlock& block : rangeUpdates) ranges.append(block.rangeToJson());
  }
  return {{"generation", static_cast<qint64>(generation)}, {"replaceAll", patchMode == PatchMode::FullDocument}, {"changedBlocks", changed}, {"rangeUpdates", ranges}, {"blockOrder", order}, {"removedBlockIds", removed}, {"timings", timings.toJson()}};
}

}  // namespace qt_editor
