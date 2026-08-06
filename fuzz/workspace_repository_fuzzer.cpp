#include "workspace_repository.h"

#include <QCoreApplication>
#include <QDir>
#include <QFile>
#include <QTemporaryDir>
#include <QtLogging>

#include <cstddef>
#include <cstdint>
#include <cstdlib>

namespace {

constexpr size_t kMaximumInputBytes = 1024 * 1024;

void discardMessages(QtMsgType, const QMessageLogContext &, const QString &) {}

void ensureApplication() {
  static const bool initialized = [] {
    static int argc = 1;
    static char applicationName[] = "el-baton-workspace-fuzz";
    static char *argv[] = {applicationName, nullptr};
    new QCoreApplication(argc, argv);
    qInstallMessageHandler(discardMessages);
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
  QDir root(directory.path());
  if (!root.mkpath(QStringLiteral("notes")) ||
      !root.mkpath(QStringLiteral("attachments"))) {
    std::abort();
  }

  const QString notePath = root.filePath(QStringLiteral("notes/note.md"));
  QFile note(notePath);
  if (!note.open(QIODevice::WriteOnly) ||
      note.write(reinterpret_cast<const char *>(data), size) !=
          static_cast<qint64>(size)) {
    std::abort();
  }
  note.close();

  qt_editor::WorkspaceRepository repository;
  repository.setWorkspaceRoot(directory.path());
  repository.refresh();
  repository.refresh();
  repository.invalidatePath(notePath);
  repository.refresh();
  (void)repository.search(QStringLiteral("note"));
  (void)repository.attachmentsForNote(notePath);
  (void)repository.graph();
  return 0;
}
