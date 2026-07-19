#pragma once

#include <QString>
#include <QStringList>
#include <QVector>

namespace qt_editor {

struct SpellingIssue final {
  qsizetype startByte = 0;
  qsizetype lengthBytes = 0;
  QString word;
  QStringList suggestions;
};

class SpellChecker final {
 public:
  [[nodiscard]] static bool isAvailable();
  [[nodiscard]] static QVector<SpellingIssue> check(
      const QString& markdown,
      const QStringList& addedWords = {});
};

}  // namespace qt_editor
