#include "application_paths.h"

#include <QDir>
#include <QStandardPaths>

namespace el_baton {
namespace {

constexpr auto kApplicationDirectory = "el-baton";

bool ensureDirectory(const QString& path, QString* errorMessage) {
  if (!path.isEmpty() && QDir().mkpath(path)) return true;

  if (errorMessage != nullptr) {
    *errorMessage = path.isEmpty()
        ? QStringLiteral("Qt did not provide a writable application directory")
        : QStringLiteral("Unable to create application directory: %1").arg(path);
  }
  return false;
}

}  // namespace

ApplicationPaths ApplicationPaths::fromBaseDirectories(
    const QString& configBase,
    const QString& cacheBase,
    const QString& runtimeBase) {
  return {
      QDir(configBase).filePath(QString::fromLatin1(kApplicationDirectory)),
      QDir(cacheBase).filePath(QString::fromLatin1(kApplicationDirectory)),
      QDir(runtimeBase).filePath(QString::fromLatin1(kApplicationDirectory)),
  };
}

ApplicationPaths ApplicationPaths::system() {
  return fromBaseDirectories(
      QStandardPaths::writableLocation(QStandardPaths::GenericConfigLocation),
      QStandardPaths::writableLocation(QStandardPaths::GenericCacheLocation),
      QStandardPaths::writableLocation(QStandardPaths::RuntimeLocation));
}

bool ApplicationPaths::ensureCreated(QString* errorMessage) const {
  return ensureDirectory(configDirectory, errorMessage) &&
      ensureDirectory(cacheDirectory, errorMessage) &&
      ensureDirectory(runtimeDirectory, errorMessage);
}

}  // namespace el_baton
