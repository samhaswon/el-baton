#pragma once

#include <QString>
#include <QVector>

namespace qt_editor {

struct MarkdownTableFormatResult final {
  QString source;
  QVector<qsizetype> mappedOffsets;
  int startLine = -1;
  int endLine = -1;

  [[nodiscard]] bool changed() const { return startLine >= 0; }
};

class MarkdownEdits final {
 public:
  [[nodiscard]] static QString setTaskChecked(const QString& source, qsizetype taskIndex, bool checked);
  [[nodiscard]] static QString setDetailsOpen(const QString& source, qsizetype detailsIndex, bool open);
  [[nodiscard]] static QString toggleTaskLine(const QString& line, bool toggleDone);
  [[nodiscard]] static MarkdownTableFormatResult formatTableAtLine(
      const QString& source,
      int line,
      const QVector<qsizetype>& offsets = {});
};

}  // namespace qt_editor
