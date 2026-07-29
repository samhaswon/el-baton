#include "markdown_edits.h"

#include <QRegularExpression>
#include <QStringList>

#include <algorithm>
#include <optional>

namespace qt_editor {
namespace {

bool updateFenceState(const QString &line, QString &fenceMarker) {
  static const QRegularExpression fence(
      QStringLiteral("^\\s{0,3}(`{3,}|~{3,})"));
  const QRegularExpressionMatch match = fence.match(line);
  if (!match.hasMatch())
    return false;
  const QString marker = match.captured(1);
  if (fenceMarker.isEmpty()) {
    fenceMarker = marker;
    return true;
  }
  if (marker.at(0) == fenceMarker.at(0) &&
      marker.size() >= fenceMarker.size()) {
    fenceMarker.clear();
  }
  return true;
}

struct TableBlock final {
  int startLine = -1;
  int endLine = -1;
};

enum class TableAlignment { Default, Left, Center, Right };

bool hasUnescapedPipe(const QString &line) {
  for (qsizetype index = 0; index < line.size(); ++index) {
    if (line.at(index) != QLatin1Char('|'))
      continue;
    if (index > 0 && line.at(index - 1) == QLatin1Char('\\'))
      continue;
    return true;
  }
  return false;
}

std::optional<QPair<QChar, qsizetype>> fenceAt(const QString &line) {
  static const QRegularExpression expression(
      QStringLiteral("^\\s*(`{3,}|~{3,})"));
  const QRegularExpressionMatch match = expression.match(line);
  if (!match.hasMatch())
    return std::nullopt;
  return QPair<QChar, qsizetype>{match.captured(1).at(0),
                                 match.capturedLength(1)};
}

bool isInsideFence(const QStringList &lines, int line) {
  std::optional<QPair<QChar, qsizetype>> open;
  for (int index = 0; index < line; ++index) {
    const auto marker = fenceAt(lines.at(index));
    if (!marker.has_value())
      continue;
    if (!open.has_value()) {
      open = marker;
    } else if (open->first == marker->first && marker->second >= open->second) {
      open.reset();
    }
  }
  return open.has_value();
}

bool isTableCandidate(const QStringList &lines, int line) {
  if (line < 0 || line >= lines.size() || lines.at(line).trimmed().isEmpty())
    return false;
  if (fenceAt(lines.at(line)).has_value() || isInsideFence(lines, line))
    return false;
  return hasUnescapedPipe(lines.at(line));
}

QStringList splitTableRow(const QString &line, bool *valid = nullptr) {
  if (valid != nullptr)
    *valid = false;
  if (!hasUnescapedPipe(line))
    return {};
  QStringList cells;
  QString current;
  bool escaped = false;
  for (const QChar character : line) {
    if (escaped) {
      current += character;
      escaped = false;
    } else if (character == QLatin1Char('\\')) {
      current += character;
      escaped = true;
    } else if (character == QLatin1Char('|')) {
      cells.append(current);
      current.clear();
    } else {
      current += character;
    }
  }
  cells.append(current);
  const QString trimmed = line.trimmed();
  if (trimmed.startsWith(QLatin1Char('|')))
    cells.removeFirst();
  if (trimmed.endsWith(QLatin1Char('|')))
    cells.removeLast();
  for (QString &cell : cells)
    cell = cell.trimmed();
  if (valid != nullptr)
    *valid = true;
  return cells;
}

std::optional<TableAlignment> tableAlignment(const QString &cell) {
  static const QRegularExpression delimiter(QStringLiteral("^:?-{1,}:?$"));
  const QString value = cell.trimmed();
  if (!delimiter.match(value).hasMatch())
    return std::nullopt;
  const bool left = value.startsWith(QLatin1Char(':'));
  const bool right = value.endsWith(QLatin1Char(':'));
  if (left && right)
    return TableAlignment::Center;
  if (left)
    return TableAlignment::Left;
  if (right)
    return TableAlignment::Right;
  return TableAlignment::Default;
}

bool isDelimiterRow(const QStringList &cells) {
  if (cells.isEmpty())
    return false;
  return std::all_of(cells.cbegin(), cells.cend(), [](const QString &cell) {
    return tableAlignment(cell).has_value();
  });
}

std::optional<TableBlock> tableBlockAt(const QStringList &lines, int line) {
  if (!isTableCandidate(lines, line))
    return std::nullopt;
  int start = line;
  int end = line;
  while (isTableCandidate(lines, start - 1))
    --start;
  while (isTableCandidate(lines, end + 1))
    ++end;
  for (int candidate = start; candidate < end; ++candidate) {
    bool headerValid = false;
    bool delimiterValid = false;
    splitTableRow(lines.at(candidate), &headerValid);
    const QStringList delimiter =
        splitTableRow(lines.at(candidate + 1), &delimiterValid);
    if (!headerValid || !delimiterValid || !isDelimiterRow(delimiter))
      continue;
    int candidateEnd = candidate + 1;
    while (candidateEnd + 1 <= end) {
      bool valid = false;
      splitTableRow(lines.at(candidateEnd + 1), &valid);
      if (!valid)
        break;
      ++candidateEnd;
    }
    if (line >= candidate && line <= candidateEnd)
      return TableBlock{candidate, candidateEnd};
  }
  return std::nullopt;
}

QString paddedCell(const QString &value, qsizetype width,
                   TableAlignment alignment) {
  const qsizetype padding = std::max<qsizetype>(0, width - value.size());
  if (alignment == TableAlignment::Right)
    return QString(padding, QLatin1Char(' ')) + value;
  if (alignment == TableAlignment::Center) {
    const qsizetype left = padding / 2;
    return QString(left, QLatin1Char(' ')) + value +
           QString(padding - left, QLatin1Char(' '));
  }
  return value + QString(padding, QLatin1Char(' '));
}

QString delimiterCell(qsizetype width, TableAlignment alignment) {
  const qsizetype finalWidth = std::max<qsizetype>(3, width);
  if (alignment == TableAlignment::Left)
    return QLatin1Char(':') + QString(finalWidth - 1, QLatin1Char('-'));
  if (alignment == TableAlignment::Right)
    return QString(finalWidth - 1, QLatin1Char('-')) + QLatin1Char(':');
  if (alignment == TableAlignment::Center) {
    return QLatin1Char(':') + QString(finalWidth - 2, QLatin1Char('-')) +
           QLatin1Char(':');
  }
  return QString(finalWidth, QLatin1Char('-'));
}

QString formatTableBlock(const QStringList &inputLines) {
  if (inputLines.size() < 2)
    return inputLines.join(QLatin1Char('\n'));
  static const QRegularExpression leadingWhitespace(QStringLiteral("^\\s*"));
  const QString indent =
      leadingWhitespace.match(inputLines.constFirst()).captured(0);
  QVector<QStringList> rows;
  int columns = 0;
  for (const QString &sourceLine : inputLines) {
    QString line = sourceLine.startsWith(indent)
                       ? sourceLine.sliced(indent.size())
                       : sourceLine.trimmed();
    bool valid = false;
    QStringList cells = splitTableRow(line, &valid);
    if (!valid)
      return inputLines.join(QLatin1Char('\n'));
    columns = std::max(columns, static_cast<int>(cells.size()));
    rows.append(std::move(cells));
  }
  if (rows.isEmpty() || !isDelimiterRow(rows.at(1)))
    return inputLines.join(QLatin1Char('\n'));
  for (QStringList &row : rows) {
    while (row.size() < columns)
      row.append(QString());
    while (row.size() > columns)
      row.removeLast();
  }
  QVector<TableAlignment> alignments(columns, TableAlignment::Default);
  QVector<qsizetype> widths(columns, 3);
  for (int column = 0; column < columns; ++column) {
    alignments[column] =
        tableAlignment(rows.at(1).at(column)).value_or(TableAlignment::Default);
    for (int row = 0; row < rows.size(); ++row) {
      if (row == 1)
        continue;
      widths[column] =
          std::max(widths.at(column), rows.at(row).at(column).size());
    }
  }
  QStringList output;
  for (int row = 0; row < rows.size(); ++row) {
    QStringList cells;
    for (int column = 0; column < columns; ++column) {
      cells.append(row == 1
                       ? delimiterCell(widths.at(column), alignments.at(column))
                       : paddedCell(rows.at(row).at(column), widths.at(column),
                                    alignments.at(column)));
    }
    output.append(indent + QStringLiteral("| ") +
                  cells.join(QStringLiteral(" | ")) + QStringLiteral(" |"));
  }
  return output.join(QLatin1Char('\n'));
}

struct CellSpan final {
  qsizetype start = 0;
  qsizetype end = 0;
};

QVector<CellSpan> tableCellSpans(const QString &line) {
  QVector<qsizetype> separators;
  for (qsizetype index = 0; index < line.size(); ++index) {
    if (line.at(index) == QLatin1Char('|') &&
        (index == 0 || line.at(index - 1) != QLatin1Char('\\')))
      separators.append(index);
  }
  QVector<CellSpan> spans;
  qsizetype start = 0;
  for (const qsizetype separator : separators) {
    spans.append({start, separator});
    start = separator + 1;
  }
  spans.append({start, line.size()});
  const QString trimmed = line.trimmed();
  if (trimmed.startsWith(QLatin1Char('|')) && !spans.isEmpty())
    spans.removeFirst();
  if (trimmed.endsWith(QLatin1Char('|')) && !spans.isEmpty())
    spans.removeLast();
  for (CellSpan &span : spans) {
    while (span.start < span.end && line.at(span.start).isSpace())
      ++span.start;
    while (span.end > span.start && line.at(span.end - 1).isSpace())
      --span.end;
  }
  return spans;
}

qsizetype lineStartOffset(const QStringList &lines, int line) {
  qsizetype offset = 0;
  for (int index = 0; index < line && index < lines.size(); ++index)
    offset += lines.at(index).size() + 1;
  return offset;
}

qsizetype mapOffsetInTable(const QString &before, const QString &after,
                           qsizetype offset) {
  const QStringList beforeLines =
      before.split(QLatin1Char('\n'), Qt::KeepEmptyParts);
  const QStringList afterLines =
      after.split(QLatin1Char('\n'), Qt::KeepEmptyParts);
  int line = 0;
  qsizetype lineStart = 0;
  while (line + 1 < beforeLines.size() &&
         offset > lineStart + beforeLines.at(line).size()) {
    lineStart += beforeLines.at(line).size() + 1;
    ++line;
  }
  line = std::clamp(line, 0, static_cast<int>(afterLines.size() - 1));
  const qsizetype column =
      std::clamp<qsizetype>(offset - lineStart, 0, beforeLines.at(line).size());
  const QVector<CellSpan> beforeSpans = tableCellSpans(beforeLines.at(line));
  const QVector<CellSpan> afterSpans = tableCellSpans(afterLines.at(line));
  if (beforeSpans.isEmpty() || afterSpans.isEmpty()) {
    return lineStartOffset(afterLines, line) +
           std::min(column, afterLines.at(line).size());
  }
  int cell = beforeSpans.size() - 1;
  for (int index = 0; index < beforeSpans.size(); ++index) {
    if (column <= beforeSpans.at(index).end) {
      cell = index;
      break;
    }
  }
  cell = std::min(cell, static_cast<int>(afterSpans.size() - 1));
  const CellSpan from = beforeSpans.at(cell);
  const CellSpan to = afterSpans.at(cell);
  const qsizetype contentOffset =
      std::clamp<qsizetype>(column - from.start, 0, from.end - from.start);
  return lineStartOffset(afterLines, line) + to.start +
         std::min(contentOffset, to.end - to.start);
}

} // namespace

QString MarkdownEdits::setTaskChecked(const QString &source,
                                      qsizetype taskIndex, bool checked) {
  if (taskIndex < 0)
    return source;
  QStringList lines = source.split(QLatin1Char('\n'), Qt::KeepEmptyParts);
  static const QRegularExpression task(
      QStringLiteral("^(\\s*(?:[-+*]|\\d+[.)])\\s+\\[)[ xX](\\])"));
  QString fenceMarker;
  qsizetype current = 0;
  for (QString &line : lines) {
    if (updateFenceState(line, fenceMarker) || !fenceMarker.isEmpty())
      continue;
    const QRegularExpressionMatch match = task.match(line);
    if (!match.hasMatch())
      continue;
    if (current++ != taskIndex)
      continue;
    line.replace(match.capturedStart(), match.capturedLength(),
                 match.captured(1) +
                     (checked ? QLatin1Char('x') : QLatin1Char(' ')) +
                     match.captured(2));
    return lines.join(QLatin1Char('\n'));
  }
  return source;
}

QString MarkdownEdits::setDetailsOpen(const QString &source,
                                      qsizetype detailsIndex, bool open) {
  if (detailsIndex < 0)
    return source;
  QStringList lines = source.split(QLatin1Char('\n'), Qt::KeepEmptyParts);
  static const QRegularExpression details(
      QStringLiteral("<details\\b([^>]*)>"),
      QRegularExpression::CaseInsensitiveOption);
  static const QRegularExpression openAttribute(
      QStringLiteral("\\s+open(?:\\s*=\\s*(?:\"[^\"]*\"|'[^']*'|[^\\s>]+))?"),
      QRegularExpression::CaseInsensitiveOption);
  QString fenceMarker;
  qsizetype current = 0;
  for (QString &line : lines) {
    if (updateFenceState(line, fenceMarker) || !fenceMarker.isEmpty())
      continue;
    qsizetype offset = 0;
    while (true) {
      const QRegularExpressionMatch match = details.match(line, offset);
      if (!match.hasMatch())
        break;
      if (current++ != detailsIndex) {
        offset = match.capturedEnd();
        continue;
      }
      QString attributes = match.captured(1);
      const bool currentlyOpen = openAttribute.match(attributes).hasMatch();
      if (open == currentlyOpen)
        return source;
      if (open) {
        attributes += QStringLiteral(" open");
      } else {
        attributes.remove(openAttribute);
      }
      line.replace(match.capturedStart(), match.capturedLength(),
                   QStringLiteral("<details%1>").arg(attributes));
      return lines.join(QLatin1Char('\n'));
    }
  }
  return source;
}

QString MarkdownEdits::toggleTaskLine(const QString &line, bool toggleDone) {
  static const QRegularExpression plain(
      QStringLiteral("^(\\s*)([*+-]?\\s*)(.*)$"));
  static const QRegularExpression unchecked(
      QStringLiteral("^(\\s*)([*+-]\\s+\\[ \\]\\s*)(.*)$"));
  static const QRegularExpression checked(
      QStringLiteral("^(\\s*)([*+-]\\s+\\[[xX]\\]\\s*)(.*)$"));
  QRegularExpressionMatch match = checked.match(line);
  if (match.hasMatch()) {
    return match.captured(1) + QStringLiteral("- [ ] ") + match.captured(3);
  }
  match = unchecked.match(line);
  if (match.hasMatch()) {
    return toggleDone ? match.captured(1) + QStringLiteral("- [x] ") +
                            match.captured(3)
                      : match.captured(1) + match.captured(3);
  }
  match = plain.match(line);
  if (!match.hasMatch())
    return line;
  return match.captured(1) +
         (toggleDone ? QStringLiteral("- [x] ") : QStringLiteral("- [ ] ")) +
         match.captured(3);
}

MarkdownTableFormatResult
MarkdownEdits::formatTableAtLine(const QString &source, int line,
                                 const QVector<qsizetype> &offsets) {
  MarkdownTableFormatResult result{source, offsets};
  const QStringList lines = source.split(QLatin1Char('\n'), Qt::KeepEmptyParts);
  const std::optional<TableBlock> block = tableBlockAt(lines, line);
  if (!block.has_value())
    return result;
  const QStringList blockLines =
      lines.sliced(block->startLine, block->endLine - block->startLine + 1);
  const QString before = blockLines.join(QLatin1Char('\n'));
  const QString after = formatTableBlock(blockLines);
  if (before == after)
    return result;
  const qsizetype start = lineStartOffset(lines, block->startLine);
  const qsizetype end = start + before.size();
  result.source.replace(start, before.size(), after);
  for (qsizetype &offset : result.mappedOffsets) {
    if (offset < start)
      continue;
    if (offset > end) {
      offset += after.size() - before.size();
    } else {
      offset = start + mapOffsetInTable(before, after, offset - start);
    }
  }
  result.startLine = block->startLine;
  result.endLine = block->endLine;
  return result;
}

} // namespace qt_editor
