#include "update_checker.h"

#include <QByteArray>

#include <cstddef>
#include <cstdint>

namespace {

constexpr size_t kMaximumInputBytes = 1024 * 1024;

} // namespace

extern "C" int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size) {
  if (size > kMaximumInputBytes)
    return 0;

  const QByteArray response(reinterpret_cast<const char *>(data),
                            static_cast<qsizetype>(size));
  (void)qt_editor::UpdateChecker::evaluateGitHubReleases(
      QStringLiteral("1.2.3"), response);
  (void)qt_editor::UpdateChecker::evaluateGitHubReleases(
      QStringLiteral("0.0.0-nightly29"), response);
  return 0;
}
