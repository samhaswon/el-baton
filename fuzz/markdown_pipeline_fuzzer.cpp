#include "markdown_pipeline.h"

#include <QCoreApplication>

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

  const QString markdown =
      QString::fromUtf8(reinterpret_cast<const char *>(data), size);
  qt_editor::MarkdownPipeline pipeline;
  const qt_editor::RenderResult result = pipeline.render(markdown, 1);

  qsizetype previousEnd = 0;
  for (const qt_editor::RenderedBlock &block : result.allBlocks) {
    if (block.id.isEmpty() || block.range.start < 0 ||
        block.range.end < block.range.start ||
        block.range.end > markdown.size() || block.range.start < previousEnd) {
      std::abort();
    }
    previousEnd = block.range.end;
  }
  return 0;
}
