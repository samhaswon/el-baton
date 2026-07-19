#include "markdown_edits.h"

#include <QRegularExpression>
#include <QStringList>

namespace qt_editor {
namespace {

bool updateFenceState(const QString& line, QString& fenceMarker) {
  static const QRegularExpression fence(QStringLiteral("^\\s{0,3}(`{3,}|~{3,})"));
  const QRegularExpressionMatch match = fence.match(line);
  if (!match.hasMatch()) return false;
  const QString marker = match.captured(1);
  if (fenceMarker.isEmpty()) {
    fenceMarker = marker;
    return true;
  }
  if (marker.at(0) == fenceMarker.at(0) && marker.size() >= fenceMarker.size()) {
    fenceMarker.clear();
  }
  return true;
}

}  // namespace

QString MarkdownEdits::setTaskChecked(const QString& source, qsizetype taskIndex, bool checked) {
  if (taskIndex < 0) return source;
  QStringList lines = source.split(QLatin1Char('\n'), Qt::KeepEmptyParts);
  static const QRegularExpression task(QStringLiteral("^(\\s*(?:[-+*]|\\d+[.)])\\s+\\[)[ xX](\\])"));
  QString fenceMarker;
  qsizetype current = 0;
  for (QString& line : lines) {
    if (updateFenceState(line, fenceMarker) || !fenceMarker.isEmpty()) continue;
    const QRegularExpressionMatch match = task.match(line);
    if (!match.hasMatch()) continue;
    if (current++ != taskIndex) continue;
    line.replace(match.capturedStart(), match.capturedLength(),
                 match.captured(1) + (checked ? QLatin1Char('x') : QLatin1Char(' ')) + match.captured(2));
    return lines.join(QLatin1Char('\n'));
  }
  return source;
}

QString MarkdownEdits::setDetailsOpen(const QString& source, qsizetype detailsIndex, bool open) {
  if (detailsIndex < 0) return source;
  QStringList lines = source.split(QLatin1Char('\n'), Qt::KeepEmptyParts);
  static const QRegularExpression details(QStringLiteral("<details\\b([^>]*)>"),
                                          QRegularExpression::CaseInsensitiveOption);
  static const QRegularExpression openAttribute(
      QStringLiteral("\\s+open(?:\\s*=\\s*(?:\"[^\"]*\"|'[^']*'|[^\\s>]+))?"),
      QRegularExpression::CaseInsensitiveOption);
  QString fenceMarker;
  qsizetype current = 0;
  for (QString& line : lines) {
    if (updateFenceState(line, fenceMarker) || !fenceMarker.isEmpty()) continue;
    qsizetype offset = 0;
    while (true) {
      const QRegularExpressionMatch match = details.match(line, offset);
      if (!match.hasMatch()) break;
      if (current++ != detailsIndex) {
        offset = match.capturedEnd();
        continue;
      }
      QString attributes = match.captured(1);
      const bool currentlyOpen = openAttribute.match(attributes).hasMatch();
      if (open == currentlyOpen) return source;
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

}  // namespace qt_editor
