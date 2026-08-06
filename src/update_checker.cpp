#include "update_checker.h"

#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QRegularExpression>

#include <utility>

namespace qt_editor {

std::optional<ApplicationVersion>
ApplicationVersion::parse(const QString &version) {
  static const QRegularExpression pattern(
      QStringLiteral("^v?(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)"
                     "(?:-nightly(0|[1-9][0-9]*))?$"));
  const QRegularExpressionMatch match = pattern.match(version.trimmed());
  if (!match.hasMatch())
    return std::nullopt;

  bool majorOk = false;
  bool minorOk = false;
  bool patchOk = false;
  const int major = match.captured(1).toInt(&majorOk);
  const int minor = match.captured(2).toInt(&minorOk);
  const int patch = match.captured(3).toInt(&patchOk);
  if (!majorOk || !minorOk || !patchOk)
    return std::nullopt;

  std::optional<quint64> nightly;
  if (!match.captured(4).isEmpty()) {
    bool nightlyOk = false;
    const quint64 sequence = match.captured(4).toULongLong(&nightlyOk);
    if (!nightlyOk)
      return std::nullopt;
    nightly = sequence;
  }
  return ApplicationVersion{QVersionNumber(major, minor, patch), nightly};
}

QString ApplicationVersion::toString() const {
  QString result = core.toString();
  if (nightly.has_value())
    result += QStringLiteral("-nightly%1").arg(*nightly);
  return result;
}

int compareVersions(const ApplicationVersion &left,
                    const ApplicationVersion &right) {
  const int coreComparison = QVersionNumber::compare(left.core, right.core);
  if (coreComparison != 0)
    return coreComparison;
  if (left.nightly.has_value() != right.nightly.has_value())
    return left.nightly.has_value() ? -1 : 1;
  if (!left.nightly.has_value())
    return 0;
  if (*left.nightly < *right.nightly)
    return -1;
  if (*left.nightly > *right.nightly)
    return 1;
  return 0;
}

UpdateCheckResult
UpdateChecker::evaluateGitHubReleases(const QString &currentVersion,
                                      const QByteArray &response) {
  const std::optional<ApplicationVersion> current =
      ApplicationVersion::parse(currentVersion);
  if (!current.has_value()) {
    return {UpdateCheckStatus::InvalidCurrentVersion,
            {},
            QStringLiteral("The installed version is not a supported El Baton "
                           "release version: %1")
                .arg(currentVersion)};
  }

  QJsonParseError parseError;
  const QJsonDocument document = QJsonDocument::fromJson(response, &parseError);
  if (parseError.error != QJsonParseError::NoError) {
    return {UpdateCheckStatus::InvalidResponse,
            {},
            QStringLiteral("The release service returned invalid JSON: %1")
                .arg(parseError.errorString())};
  }
  if (!document.isArray()) {
    return {
        UpdateCheckStatus::InvalidResponse,
        {},
        QStringLiteral("The release service returned an unexpected response.")};
  }

  std::optional<AvailableRelease> best;
  for (const QJsonValue &value : document.array()) {
    const QJsonObject object = value.toObject();
    if (object.isEmpty() || object.value(QStringLiteral("draft")).toBool())
      continue;
    const QString tag = object.value(QStringLiteral("tag_name")).toString();
    const std::optional<ApplicationVersion> candidate =
        ApplicationVersion::parse(tag);
    if (!candidate.has_value())
      continue;
    const bool prerelease =
        object.value(QStringLiteral("prerelease")).toBool() ||
        candidate->nightly.has_value();
    if (!current->nightly.has_value() && prerelease)
      continue;
    if (compareVersions(*candidate, *current) <= 0 ||
        (best.has_value() && compareVersions(*candidate, best->version) <= 0)) {
      continue;
    }
    const QUrl pageUrl(object.value(QStringLiteral("html_url")).toString());
    if (!pageUrl.isValid() || pageUrl.scheme() != QStringLiteral("https") ||
        pageUrl.host().compare(QStringLiteral("github.com"),
                               Qt::CaseInsensitive) != 0) {
      continue;
    }
    best = AvailableRelease{
        *candidate,
        tag,
        object.value(QStringLiteral("name")).toString(),
        pageUrl,
    };
  }

  if (!best.has_value())
    return {UpdateCheckStatus::UpToDate, {}, {}};
  return {UpdateCheckStatus::UpdateAvailable, std::move(best), {}};
}

} // namespace qt_editor
