#pragma once

#include <QJsonObject>
#include <QString>
#include <QVariant>

namespace qt_editor {

class SettingsStore final {
public:
  explicit SettingsStore(QString path);

  [[nodiscard]] static QString referencePath();
  [[nodiscard]] QVariant value(const QString &dottedKey,
                               const QVariant &fallback = {}) const;
  void setValue(const QString &dottedKey, const QVariant &value);
  [[nodiscard]] bool save(QString *errorMessage = nullptr) const;
  [[nodiscard]] const QString &path() const { return path_; }

private:
  QString path_;
  QJsonObject root_;
  QString loadError_;
};

} // namespace qt_editor
