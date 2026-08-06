#pragma once

#include <QByteArray>
#include <QString>
#include <QUrl>
#include <QVersionNumber>

#include <optional>

namespace qt_editor {

struct ApplicationVersion final {
  QVersionNumber core;
  std::optional<quint64> nightly;

  [[nodiscard]] static std::optional<ApplicationVersion>
  parse(const QString &version);
  [[nodiscard]] QString toString() const;
};

[[nodiscard]] int compareVersions(const ApplicationVersion &left,
                                  const ApplicationVersion &right);

struct AvailableRelease final {
  ApplicationVersion version;
  QString tag;
  QString name;
  QUrl pageUrl;
};

enum class UpdateCheckStatus {
  UpdateAvailable,
  UpToDate,
  InvalidCurrentVersion,
  InvalidResponse
};

struct UpdateCheckResult final {
  UpdateCheckStatus status = UpdateCheckStatus::InvalidResponse;
  std::optional<AvailableRelease> release;
  QString errorMessage;
};

class UpdateChecker final {
public:
  [[nodiscard]] static UpdateCheckResult
  evaluateGitHubReleases(const QString &currentVersion,
                         const QByteArray &response);
};

} // namespace qt_editor
