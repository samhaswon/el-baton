#include "document_file.h"

#include <QCoreApplication>
#include <QFile>
#include <QTemporaryDir>

#include <cstddef>
#include <cstdint>
#include <cstdlib>

namespace {

constexpr size_t kMaximumInputBytes = 1024 * 1024;

void ensureApplication() {
  static const bool initialized = [] {
    static int argc = 1;
    static char applicationName[] = "el-baton-fuzz";
    static char *argv[] = {applicationName, nullptr};
    new QCoreApplication(argc, argv);
    return true;
  }();
  (void)initialized;
}

} // namespace

extern "C" int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size) {
  if (size > kMaximumInputBytes)
    return 0;
  ensureApplication();

  QTemporaryDir directory;
  if (!directory.isValid())
    std::abort();
  const QString path = directory.filePath(QStringLiteral("note.md"));
  QFile file(path);
  if (!file.open(QIODevice::WriteOnly) ||
      file.write(reinterpret_cast<const char *>(data), size) !=
          static_cast<qint64>(size)) {
    std::abort();
  }
  file.close();

  const std::optional<qt_editor::DocumentFile> document =
      qt_editor::DocumentFile::load(path);
  if (document.has_value() && document->path().isEmpty())
    std::abort();
  return 0;
}
