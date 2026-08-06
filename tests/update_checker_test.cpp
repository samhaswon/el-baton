#include "update_checker.h"

#include <QtTest>

using qt_editor::ApplicationVersion;
using qt_editor::UpdateChecker;
using qt_editor::UpdateCheckStatus;

class UpdateCheckerTest final : public QObject {
  Q_OBJECT

private slots:
  void parsesSupportedVersions();
  void comparesNightlyAndStableVersions();
  void selectsNewestCompatibleRelease();
  void nightlyBuildsAdvanceWithinTheNightlyChannel();
  void stableBuildsFindNewerStableReleases();
  void stableBuildsIgnorePrereleases();
  void rejectsMalformedResponsesAndUnsafeUrls();
};

void UpdateCheckerTest::parsesSupportedVersions() {
  const auto stable = ApplicationVersion::parse(QStringLiteral("v1.2.3"));
  QVERIFY(stable.has_value());
  QCOMPARE(stable->toString(), QStringLiteral("1.2.3"));
  QVERIFY(!stable->nightly.has_value());

  const auto nightly =
      ApplicationVersion::parse(QStringLiteral("0.0.0-nightly29"));
  QVERIFY(nightly.has_value());
  QCOMPARE(nightly->nightly, std::optional<quint64>(29));
  QVERIFY(!ApplicationVersion::parse(QStringLiteral("1.2")).has_value());
  QVERIFY(!ApplicationVersion::parse(QStringLiteral("1.02.3")).has_value());
  QVERIFY(
      !ApplicationVersion::parse(QStringLiteral("1.2.3-beta1")).has_value());
}

void UpdateCheckerTest::comparesNightlyAndStableVersions() {
  const auto nightly29 =
      ApplicationVersion::parse(QStringLiteral("0.0.0-nightly29"));
  const auto nightly30 =
      ApplicationVersion::parse(QStringLiteral("0.0.0-nightly30"));
  const auto stable = ApplicationVersion::parse(QStringLiteral("0.0.0"));
  const auto nextStable = ApplicationVersion::parse(QStringLiteral("0.1.0"));
  QVERIFY(nightly29 && nightly30 && stable && nextStable);
  QVERIFY(qt_editor::compareVersions(*nightly30, *nightly29) > 0);
  QVERIFY(qt_editor::compareVersions(*stable, *nightly30) > 0);
  QVERIFY(qt_editor::compareVersions(*nextStable, *stable) > 0);
}

void UpdateCheckerTest::selectsNewestCompatibleRelease() {
  const QByteArray response = R"json([
    {"tag_name":"0.0.0-nightly30","name":"Nightly 30","draft":false,
     "prerelease":true,"html_url":"https://github.com/samhaswon/el-baton/releases/tag/0.0.0-nightly30"},
    {"tag_name":"0.1.0","name":"El Baton 0.1","draft":false,
     "prerelease":false,"html_url":"https://github.com/samhaswon/el-baton/releases/tag/0.1.0"},
    {"tag_name":"9.0.0","draft":true,"prerelease":false,
     "html_url":"https://github.com/samhaswon/el-baton/releases/tag/9.0.0"}
  ])json";
  const auto result = UpdateChecker::evaluateGitHubReleases(
      QStringLiteral("0.0.0-nightly29"), response);
  QCOMPARE(result.status, UpdateCheckStatus::UpdateAvailable);
  QVERIFY(result.release.has_value());
  QCOMPARE(result.release->version.toString(), QStringLiteral("0.1.0"));
}

void UpdateCheckerTest::nightlyBuildsAdvanceWithinTheNightlyChannel() {
  const QByteArray response = R"json([
    {"tag_name":"0.0.0-nightly30","draft":false,"prerelease":true,
     "html_url":"https://github.com/samhaswon/el-baton/releases/tag/0.0.0-nightly30"},
    {"tag_name":"0.0.0-nightly31","draft":false,"prerelease":true,
     "html_url":"https://github.com/samhaswon/el-baton/releases/tag/0.0.0-nightly31"},
    {"tag_name":"0.0.0-nightly28","draft":false,"prerelease":true,
     "html_url":"https://github.com/samhaswon/el-baton/releases/tag/0.0.0-nightly28"}
  ])json";
  const auto result = UpdateChecker::evaluateGitHubReleases(
      QStringLiteral("0.0.0-nightly29"), response);
  QCOMPARE(result.status, UpdateCheckStatus::UpdateAvailable);
  QVERIFY(result.release.has_value());
  QCOMPARE(result.release->version.toString(),
           QStringLiteral("0.0.0-nightly31"));
}

void UpdateCheckerTest::stableBuildsFindNewerStableReleases() {
  const QByteArray response = R"json([
    {"tag_name":"1.2.3","draft":false,"prerelease":false,
     "html_url":"https://github.com/samhaswon/el-baton/releases/tag/1.2.3"},
    {"tag_name":"1.4.0","draft":false,"prerelease":false,
     "html_url":"https://github.com/samhaswon/el-baton/releases/tag/1.4.0"},
    {"tag_name":"1.3.9","draft":false,"prerelease":false,
     "html_url":"https://github.com/samhaswon/el-baton/releases/tag/1.3.9"}
  ])json";
  const auto result =
      UpdateChecker::evaluateGitHubReleases(QStringLiteral("1.2.3"), response);
  QCOMPARE(result.status, UpdateCheckStatus::UpdateAvailable);
  QVERIFY(result.release.has_value());
  QCOMPARE(result.release->version.toString(), QStringLiteral("1.4.0"));
}

void UpdateCheckerTest::stableBuildsIgnorePrereleases() {
  const QByteArray response = R"json([
    {"tag_name":"1.1.0-nightly2","draft":false,"prerelease":true,
     "html_url":"https://github.com/samhaswon/el-baton/releases/tag/1.1.0-nightly2"},
    {"tag_name":"1.0.0","draft":false,"prerelease":false,
     "html_url":"https://github.com/samhaswon/el-baton/releases/tag/1.0.0"}
  ])json";
  const auto result =
      UpdateChecker::evaluateGitHubReleases(QStringLiteral("1.0.0"), response);
  QCOMPARE(result.status, UpdateCheckStatus::UpToDate);
}

void UpdateCheckerTest::rejectsMalformedResponsesAndUnsafeUrls() {
  QCOMPARE(UpdateChecker::evaluateGitHubReleases(QStringLiteral("development"),
                                                 QByteArrayLiteral("[]"))
               .status,
           UpdateCheckStatus::InvalidCurrentVersion);
  QCOMPARE(UpdateChecker::evaluateGitHubReleases(QStringLiteral("1.0.0"),
                                                 QByteArrayLiteral("{}"))
               .status,
           UpdateCheckStatus::InvalidResponse);

  const QByteArray unsafe = R"json([
    {"tag_name":"2.0.0","draft":false,"prerelease":false,
     "html_url":"http://example.test/download"}
  ])json";
  QCOMPARE(
      UpdateChecker::evaluateGitHubReleases(QStringLiteral("1.0.0"), unsafe)
          .status,
      UpdateCheckStatus::UpToDate);
}

QTEST_GUILESS_MAIN(UpdateCheckerTest)

#include "update_checker_test.moc"
