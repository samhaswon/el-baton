#pragma once

#include <QString>

namespace el_baton {

struct ApplicationPaths final {
  QString configDirectory;
  QString cacheDirectory;
  QString runtimeDirectory;

  [[nodiscard]] static ApplicationPaths fromBaseDirectories(
      const QString& configBase,
      const QString& cacheBase,
      const QString& runtimeBase);
  [[nodiscard]] static ApplicationPaths system();
  [[nodiscard]] static QString dataFile(const QString& name, const QString& buildFallback = {});
  [[nodiscard]] static QString webDirectory(const QString& buildFallback = {});
  [[nodiscard]] static QString plantUmlJar(const QString& buildFallback = {});
  [[nodiscard]] static QString dataFileForApplication(
      const QString& applicationDirectory,
      const QString& name,
      const QString& buildFallback = {});
  [[nodiscard]] bool ensureCreated(QString* errorMessage = nullptr) const;
};

}  // namespace el_baton
