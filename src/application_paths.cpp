#include "application_paths.h"

#include <QCoreApplication>
#include <QDir>
#include <QFileInfo>
#include <QStandardPaths>

namespace el_baton {
namespace {

constexpr auto kApplicationDirectory = "el-baton";

bool ensureDirectory(const QString &path, QString *errorMessage) {
  if (!path.isEmpty() && QDir().mkpath(path))
    return true;

  if (errorMessage != nullptr) {
    *errorMessage =
        path.isEmpty()
            ? QStringLiteral(
                  "Qt did not provide a writable application directory")
            : QStringLiteral("Unable to create application directory: %1")
                  .arg(path);
  }
  return false;
}

} // namespace

ApplicationPaths
ApplicationPaths::fromBaseDirectories(const QString &configBase,
                                      const QString &cacheBase,
                                      const QString &runtimeBase) {
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

QString
ApplicationPaths::dataFileForApplication(const QString &applicationDirectory,
                                         const QString &name,
                                         const QString &buildFallback) {
  const QDir application(applicationDirectory);
  const QStringList candidates = {
      application.filePath(name),
      application.filePath(QStringLiteral("../share/el-baton/") + name),
      application.filePath(QStringLiteral("../Resources/") + name),
  };
  for (const QString &candidate : candidates) {
    const QFileInfo file(candidate);
    if (file.isFile())
      return file.canonicalFilePath();
  }
  return buildFallback;
}

QString ApplicationPaths::dataFile(const QString &name,
                                   const QString &buildFallback) {
  return dataFileForApplication(QCoreApplication::applicationDirPath(), name,
                                buildFallback);
}

QString ApplicationPaths::webDirectory(const QString &buildFallback) {
  const QString preview = dataFile(QStringLiteral("web/preview.html"));
  return preview.isEmpty() ? buildFallback : QFileInfo(preview).absolutePath();
}

QString ApplicationPaths::plantUmlJar(const QString &buildFallback) {
  return dataFile(QStringLiteral("plantuml.jar"), buildFallback);
}

bool ApplicationPaths::ensureCreated(QString *errorMessage) const {
  return ensureDirectory(configDirectory, errorMessage) &&
         ensureDirectory(cacheDirectory, errorMessage) &&
         ensureDirectory(runtimeDirectory, errorMessage);
}

} // namespace el_baton
