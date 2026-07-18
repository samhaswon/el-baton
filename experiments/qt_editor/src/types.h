#pragma once

#include <QJsonArray>
#include <QJsonObject>
#include <QString>
#include <QVector>

namespace qt_editor {

enum class SyncMode { Disabled, Percentage, Semantic };
enum class PatchMode { FullDocument, Blocks };

struct BenchmarkOptions {
  SyncMode syncMode = SyncMode::Semantic;
  PatchMode patchMode = PatchMode::Blocks;
  bool katexEnabled = true;
  bool mermaidEnabled = true;
  bool overlayEnabled = true;
  bool hiddenMermaidPage = false;
  bool unthrottledWebEngine = false;
};

struct SourceRange {
  qsizetype start = 0;
  qsizetype end = 0;
};

struct RenderedBlock {
  QString id;
  QString kind;
  QString source;
  QString html;
  SourceRange range;
  QString syncMode = QStringLiteral("interpolate");

  [[nodiscard]] QJsonObject toJson() const;
  [[nodiscard]] QJsonObject rangeToJson() const;
};

struct RenderTimings {
  double inputToRenderStartMs = 0;
  double preprocessMs = 0;
  double parseMs = 0;
  double postprocessMs = 0;

  [[nodiscard]] QJsonObject toJson() const;
};

struct RenderResult {
  quint64 generation = 0;
  QVector<RenderedBlock> allBlocks;
  QVector<RenderedBlock> blocks;
  QVector<RenderedBlock> rangeUpdates;
  QStringList removedBlockIds;
  RenderTimings timings;

  [[nodiscard]] QJsonObject toJson(PatchMode patchMode) const;
};

}  // namespace qt_editor
