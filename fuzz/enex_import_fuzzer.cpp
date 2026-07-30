#include "note_transfer_service.h"

#include <QFile>
#include <QGuiApplication>
#include <QTemporaryDir>

#include <cstddef>
#include <cstdint>
#include <cstdlib>

namespace {

constexpr size_t kMaximumInputBytes = 1024 * 1024;

void ensureApplication() {
  static const bool initialized = [] {
    qputenv("QT_QPA_PLATFORM", "offscreen");
    static int argc = 1;
    static char applicationName[] = "el-baton-fuzz";
    static char *argv[] = {applicationName, nullptr};
    new QGuiApplication(argc, argv);
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
  const QString sourcePath = directory.filePath(QStringLiteral("input.enex"));
  QFile source(sourcePath);
  if (!source.open(QIODevice::WriteOnly) ||
      source.write(reinterpret_cast<const char *>(data), size) !=
          static_cast<qint64>(size)) {
    std::abort();
  }
  source.close();

  const qt_editor::ImportResult result =
      qt_editor::NoteTransferService::importFiles({sourcePath},
                                                  directory.path());
  if (result.notesImported < 0 || result.attachmentsImported < 0)
    std::abort();
  return 0;
}
