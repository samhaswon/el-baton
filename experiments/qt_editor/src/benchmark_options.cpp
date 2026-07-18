#include "benchmark_options.h"

namespace qt_editor {

void addBenchmarkOptions(QCommandLineParser& parser) {
  parser.addOption({"sync", "Scroll synchronization mode: off, percentage, or semantic.", "mode", "semantic"});
  parser.addOption({"patch", "Preview update mode: full or blocks.", "mode", "blocks"});
  parser.addOption({"no-katex", "Disable KaTeX rendering."});
  parser.addOption({"no-mermaid", "Disable Mermaid rendering."});
  parser.addOption({"no-overlay", "Disable the instrumentation overlay."});
  parser.addOption({"hidden-mermaid-page", "Render Mermaid in a hidden QWebEnginePage (milestone 4 mode)."});
  parser.addOption({"unthrottled-webengine", "Disable Chromium's compositor frame-rate limit (diagnostic; may increase CPU use)."});
}

BenchmarkOptions parseBenchmarkOptions(const QCommandLineParser& parser) {
  BenchmarkOptions options;
  const QString sync = parser.value("sync").toLower();
  options.syncMode = sync == "off" ? SyncMode::Disabled : sync == "percentage" ? SyncMode::Percentage : SyncMode::Semantic;
  options.patchMode = parser.value("patch").compare("full", Qt::CaseInsensitive) == 0 ? PatchMode::FullDocument : PatchMode::Blocks;
  options.katexEnabled = !parser.isSet("no-katex");
  options.mermaidEnabled = !parser.isSet("no-mermaid");
  options.overlayEnabled = !parser.isSet("no-overlay");
  options.hiddenMermaidPage = parser.isSet("hidden-mermaid-page");
  options.unthrottledWebEngine = parser.isSet("unthrottled-webengine");
  return options;
}

QString describeBenchmarkOptions(const BenchmarkOptions& options) {
  const QString sync = options.syncMode == SyncMode::Disabled ? "off" : options.syncMode == SyncMode::Percentage ? "percentage" : "semantic";
  return QString("sync=%1 | patch=%2 | KaTeX=%3 | Mermaid=%4 | WebEngine=%5")
      .arg(sync, options.patchMode == PatchMode::Blocks ? "blocks" : "full", options.katexEnabled ? "on" : "off",
           options.mermaidEnabled ? "on" : "off", options.unthrottledWebEngine ? "unthrottled" : "vsync");
}

}  // namespace qt_editor
