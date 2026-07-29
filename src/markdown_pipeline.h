#pragma once

#include "types.h"

namespace qt_editor {

class MarkdownPipeline final {
public:
  MarkdownPipeline();
  ~MarkdownPipeline();
  MarkdownPipeline(const MarkdownPipeline &) = delete;
  MarkdownPipeline &operator=(const MarkdownPipeline &) = delete;

  // Mirrors Metadata.remove(): the Electron editor and preview operate on the
  // Markdown body, while YAML front matter remains file-level metadata.
  [[nodiscard]] static QString plainContent(const QString &fileContent);
  [[nodiscard]] RenderResult render(const QString &markdown, quint64 generation,
                                    qint64 inputTimestampNs = 0);
  [[nodiscard]] const QVector<RenderedBlock> &previousBlocks() const {
    return previousBlocks_;
  }

private:
  QString previousMarkdown_;
  // Top-level cmark nodes before document-wide heading/TOC/control
  // normalization and details-container grouping. These are the reusable
  // incremental parse units.
  QVector<RenderedBlock> parsedBlocks_;
  QVector<RenderedBlock> previousBlocks_;
  quint64 nextBlockId_ = 1;
  bool hasPreviousRender_ = false;
};

} // namespace qt_editor
