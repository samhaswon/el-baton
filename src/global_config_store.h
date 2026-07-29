#pragma once

#include <QString>
#include <QVariantMap>

namespace qt_editor {

class GlobalConfigStore final {
public:
  void setWorkspaceRoot(const QString &workspaceRoot);
  [[nodiscard]] bool reload(QString *errorMessage = nullptr);
  [[nodiscard]] bool save(QString *errorMessage = nullptr) const;

  [[nodiscard]] const QString &filePath() const { return filePath_; }
  [[nodiscard]] QVariant value(const QString &dottedKey,
                               const QVariant &fallback = {}) const;
  void setValue(const QString &dottedKey, const QVariant &value);

private:
  [[nodiscard]] static QVariantMap defaults();
  QString workspaceRoot_;
  QString filePath_;
  QVariantMap values_;
};

} // namespace qt_editor
