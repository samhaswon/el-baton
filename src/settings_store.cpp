#include "settings_store.h"

#include <QFile>
#include <QFileInfo>
#include <QJsonDocument>
#include <QJsonParseError>
#include <QSaveFile>
#include <QStandardPaths>

#include <utility>

namespace qt_editor {
namespace {

QJsonObject setNestedValue(QJsonObject object, const QStringList &parts,
                           qsizetype index, const QJsonValue &value) {
  if (index == parts.size() - 1) {
    object.insert(parts.at(index), value);
    return object;
  }
  QJsonObject child = object.value(parts.at(index)).toObject();
  object.insert(parts.at(index),
                setNestedValue(child, parts, index + 1, value));
  return object;
}

} // namespace

SettingsStore::SettingsStore(QString path) : path_(std::move(path)) {
  QFile file(path_);
  if (!QFileInfo::exists(path_))
    return;
  if (!file.open(QIODevice::ReadOnly)) {
    loadError_ = file.errorString();
    return;
  }
  QJsonParseError parseError;
  const QJsonDocument document =
      QJsonDocument::fromJson(file.readAll(), &parseError);
  if (parseError.error != QJsonParseError::NoError) {
    loadError_ = parseError.errorString();
  } else if (!document.isObject()) {
    loadError_ = QStringLiteral("Settings root must be an object.");
  } else {
    root_ = document.object();
  }
}

QString SettingsStore::referencePath() {
  return QStandardPaths::writableLocation(QStandardPaths::HomeLocation) +
         QStringLiteral("/.el-baton.json");
}

QVariant SettingsStore::value(const QString &dottedKey,
                              const QVariant &fallback) const {
  QJsonValue current(root_);
  for (const QString &part :
       dottedKey.split(QLatin1Char('.'), Qt::SkipEmptyParts)) {
    if (!current.isObject())
      return fallback;
    current = current.toObject().value(part);
    if (current.isUndefined())
      return fallback;
  }
  return current.toVariant();
}

void SettingsStore::setValue(const QString &dottedKey, const QVariant &value) {
  const QStringList parts =
      dottedKey.split(QLatin1Char('.'), Qt::SkipEmptyParts);
  if (parts.isEmpty())
    return;
  root_ = setNestedValue(root_, parts, 0, QJsonValue::fromVariant(value));
}

bool SettingsStore::save(QString *errorMessage) const {
  if (!loadError_.isEmpty()) {
    if (errorMessage != nullptr) {
      *errorMessage =
          QStringLiteral("Refusing to overwrite invalid settings: %1")
              .arg(loadError_);
    }
    return false;
  }
  QSaveFile file(path_);
  if (!file.open(QIODevice::WriteOnly)) {
    if (errorMessage != nullptr)
      *errorMessage = file.errorString();
    return false;
  }
  if (file.write(QJsonDocument(root_).toJson(QJsonDocument::Indented)) < 0 ||
      !file.commit()) {
    if (errorMessage != nullptr)
      *errorMessage = file.errorString();
    return false;
  }
  return true;
}

} // namespace qt_editor
