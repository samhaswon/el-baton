#include "webengine_security.h"

#include <QByteArray>
#include <QUrl>

#include <array>
#include <cstddef>
#include <cstdint>

namespace {

constexpr size_t kMaximumInputBytes = 64 * 1024;

} // namespace

extern "C" int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size) {
  if (size > kMaximumInputBytes)
    return 0;

  const QUrl url =
      QUrl::fromEncoded(QByteArray(reinterpret_cast<const char *>(data),
                                   static_cast<qsizetype>(size)),
                        QUrl::StrictMode);
  constexpr std::array resourceTypes = {
      QWebEngineUrlRequestInfo::ResourceTypeMainFrame,
      QWebEngineUrlRequestInfo::ResourceTypeSubFrame,
      QWebEngineUrlRequestInfo::ResourceTypeScript,
      QWebEngineUrlRequestInfo::ResourceTypeImage,
      QWebEngineUrlRequestInfo::ResourceTypeFontResource,
      QWebEngineUrlRequestInfo::ResourceTypeMedia,
      QWebEngineUrlRequestInfo::ResourceTypeWorker,
      QWebEngineUrlRequestInfo::ResourceTypeXhr,
      QWebEngineUrlRequestInfo::ResourceTypeUnknown,
  };
  for (const auto type : resourceTypes) {
    (void)qt_editor::WebEngineRequestPolicy::isAllowed(
        url, type, QStringLiteral("/application/web"),
        QStringLiteral("/workspace"));
  }

  constexpr std::array navigationTypes = {
      QWebEnginePage::NavigationTypeLinkClicked,
      QWebEnginePage::NavigationTypeTyped,
      QWebEnginePage::NavigationTypeReload,
      QWebEnginePage::NavigationTypeOther,
  };
  for (const auto type : navigationTypes) {
    (void)qt_editor::WebEngineRequestPolicy::isAllowedMainFrameNavigation(
        url,
        QUrl::fromLocalFile(QStringLiteral("/application/web/preview.html")),
        type);
  }
  return 0;
}
