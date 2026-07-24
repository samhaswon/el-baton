#pragma once

#include <QString>
#include <QStringList>

namespace qt_editor {

struct ImportResult final {
  int notesImported = 0;
  int attachmentsImported = 0;
  QStringList errors;
};

class NoteTransferService final {
 public:
  [[nodiscard]] static ImportResult importFiles(const QStringList& sourcePaths,
                                                const QString& workspaceRoot);
  [[nodiscard]] static QString uniquePath(const QString& directory,
                                          const QString& requestedName);
};

}  // namespace qt_editor
