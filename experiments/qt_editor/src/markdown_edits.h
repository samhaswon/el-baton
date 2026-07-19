#pragma once

#include <QString>

namespace qt_editor {

class MarkdownEdits final {
 public:
  [[nodiscard]] static QString setTaskChecked(const QString& source, qsizetype taskIndex, bool checked);
  [[nodiscard]] static QString setDetailsOpen(const QString& source, qsizetype detailsIndex, bool open);
};

}  // namespace qt_editor
