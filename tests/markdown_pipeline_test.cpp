#include <QtTest>

#include <QFile>
#include <QHash>
#include <QRegularExpression>

#include "markdown_pipeline.h"

using qt_editor::MarkdownPipeline;
using qt_editor::RenderedBlock;
using qt_editor::RenderResult;

namespace {

QString combinedHtml(const RenderResult &result) {
  QString html;
  for (const RenderedBlock &block : result.allBlocks)
    html += block.html;
  return html;
}

void compareRenderedSemantics(const RenderResult &actual,
                              const RenderResult &expected) {
  QCOMPARE(actual.allBlocks.size(), expected.allBlocks.size());
  for (qsizetype index = 0; index < actual.allBlocks.size(); ++index) {
    const RenderedBlock &left = actual.allBlocks.at(index);
    const RenderedBlock &right = expected.allBlocks.at(index);
    QCOMPARE(left.kind, right.kind);
    QCOMPARE(left.source, right.source);
    QCOMPARE(left.html, right.html);
    QCOMPARE(left.range.start, right.range.start);
    QCOMPARE(left.range.end, right.range.end);
    QCOMPARE(left.syncMode, right.syncMode);
  }
}

QVector<RenderedBlock> applyPatch(const QVector<RenderedBlock> &previous,
                                  const RenderResult &patch) {
  QHash<QString, RenderedBlock> byId;
  for (const RenderedBlock &block : previous)
    byId.insert(block.id, block);
  for (const QString &id : patch.removedBlockIds)
    byId.remove(id);
  for (const RenderedBlock &block : patch.blocks)
    byId.insert(block.id, block);
  for (const RenderedBlock &block : patch.rangeUpdates) {
    if (!byId.contains(block.id))
      qFatal("Unknown range-update ID %s", qPrintable(block.id));
    byId[block.id].range = block.range;
  }

  QVector<RenderedBlock> reconstructed;
  reconstructed.reserve(patch.allBlocks.size());
  for (const RenderedBlock &expected : patch.allBlocks) {
    if (!byId.contains(expected.id))
      qFatal("Missing patched block ID %s", qPrintable(expected.id));
    reconstructed.append(byId.value(expected.id));
  }
  return reconstructed;
}

QString largeTestDocument() {
  QString markdown =
      QStringLiteral("# 1 Test Note\n\n"
                     "# CHEM 1120 Chapter 16 ALEKS\n\n"
                     "[Chapter 16](@note/CHEM 1120 Chapter 16)\n\n"
                     "[[@toc]]\n\n"
                     "---\n\n"
                     "<div align=\"center\">\n\n"
                     "# Some Heading\n\n"
                     "The user is editing this line\n\n"
                     "</div>\n\n"
                     "<details open>\n"
                     "<summary>Worked example</summary>\n\n"
                     "The pressure is $P = nRT/V$ and N~2~ is a subscript.\n\n"
                     "<details>\n"
                     "<summary>Derivation</summary>\n\n"
                     "- first step\n"
                     "- second step\n\n"
                     "</details>\n\n"
                     "</details>\n\n"
                     "```mermaid\n"
                     "graph TD\n"
                     "a --> b\n"
                     "b --> c\n"
                     "```\n\n"
                     "```katex\n"
                     "\\ce{CO2 + C -> 2CO}\n"
                     "```\n\n");
  for (int section = 0; section < 900; ++section) {
    markdown += QStringLiteral("## Generated section %1\n\n"
                               "Paragraph %1 discusses equilibrium, "
                               "temperature, and a :cat: marker. "
                               "It links to [[Generated note %1]] and contains "
                               "`inline code %1`.\n\n"
                               "| quantity | value |\n"
                               "| --- | ---: |\n"
                               "| sample | %1 |\n\n"
                               "- [ ] observation %1\n"
                               "- [x] completed %1\n\n")
                    .arg(section);
    if (section % 75 == 0) {
      markdown += QStringLiteral("<details>\n"
                                 "<summary>Generated details %1</summary>\n\n"
                                 "A paragraph inside generated details %1.\n\n"
                                 "</details>\n\n")
                      .arg(section);
    }
  }
  return markdown;
}

RenderResult renderFresh(const QString &markdown, quint64 generation) {
  MarkdownPipeline pipeline;
  return pipeline.render(markdown, generation);
}

} // namespace

class MarkdownPipelineTest final : public QObject {
  Q_OBJECT
private slots:
  void stableIdsAcrossLocalEdit() {
    MarkdownPipeline pipeline;
    const RenderResult first = pipeline.render(
        QStringLiteral("# Heading\n\nfirst paragraph\n\nlast paragraph\n"), 1);
    QCOMPARE(first.blocks.size(), 3);
    const QStringList ids{first.blocks.at(0).id, first.blocks.at(1).id,
                          first.blocks.at(2).id};

    const RenderResult second = pipeline.render(
        QStringLiteral(
            "# Heading\n\nfirst edited paragraph\n\nlast paragraph\n"),
        2);
    // Only the edited block carries HTML. The following block gets a cheap
    // source-range metadata update and retains its live dynamic descendants.
    QCOMPARE(second.blocks.size(), 1);
    QCOMPARE(second.blocks.at(0).id, ids.at(1));
    QCOMPARE(second.rangeUpdates.size(), 1);
    QCOMPARE(second.rangeUpdates.at(0).id, ids.at(2));
    const QJsonObject patch = second.toJson(qt_editor::PatchMode::Blocks);
    QCOMPARE(patch.value("changedBlocks").toArray().size(), 1);
    QCOMPARE(patch.value("rangeUpdates").toArray().size(), 1);
    QCOMPARE(pipeline.previousBlocks().size(), 3);
    QCOMPARE(pipeline.previousBlocks().at(0).id, ids.at(0));
    QCOMPARE(pipeline.previousBlocks().at(2).id, ids.at(2));
    QVERIFY(second.removedBlockIds.isEmpty());
  }

  void sourceRangesUseQStringOffsets() {
    MarkdownPipeline pipeline;
    const QString markdown = QString::fromUtf8("# Héading 😀\n\nparagraph é\n");
    const RenderResult result = pipeline.render(markdown, 1);
    QCOMPARE(result.blocks.size(), 2);
    const QVector<RenderedBlock> &blocks = pipeline.previousBlocks();
    QCOMPARE(blocks.size(), 2);
    QCOMPARE(blocks.at(0).range.start, qsizetype{0});
    QCOMPARE(blocks.at(0).range.end, markdown.indexOf(QStringLiteral("\n\n")));
    QCOMPARE(blocks.at(0).source, QString::fromUtf8("# Héading 😀"));
    const qsizetype paragraphStart =
        markdown.indexOf(QStringLiteral("paragraph"));
    QCOMPARE(blocks.at(1).range.start, paragraphStart);
    QCOMPARE(blocks.at(1).range.end,
             paragraphStart + QString::fromUtf8("paragraph é").size());
  }

  void anchorOnlyAndRemovedBlocks() {
    MarkdownPipeline pipeline;
    const RenderResult first = pipeline.render(
        QStringLiteral("<a id=\"target\"></a>\n\nVisible\n"), 1);
    QCOMPARE(first.blocks.size(), 2);
    const QString anchorId = first.blocks.at(0).id;
    // An inline anchor is a paragraph in CommonMark, but must not be dropped
    // merely because it has no visible text.
    QCOMPARE(first.blocks.at(0).kind, QStringLiteral("paragraph"));
    QVERIFY(first.blocks.at(0).html.contains(QStringLiteral("id=\"target\"")));

    const RenderResult second = pipeline.render(QStringLiteral("Visible\n"), 2);
    QVERIFY(second.removedBlockIds.contains(anchorId));
    QCOMPARE(pipeline.previousBlocks().size(), 1);
  }

  void dynamicPlaceholdersAndMalformedInput() {
    MarkdownPipeline pipeline;
    const QString markdown =
        QStringLiteral("Inline $x < y & z$ and unmatched $oops.\n\n"
                       "```katex\n\\frac{1}{\n```\n\n"
                       "```mermaid\ngraph TD\nA -->\n");
    const RenderResult result = pipeline.render(markdown, 1);
    QCOMPARE(result.blocks.size(), 3);
    const QVector<RenderedBlock> &blocks = pipeline.previousBlocks();
    QCOMPARE(blocks.size(), 3);
    QVERIFY(blocks.at(0).html.contains(
        QStringLiteral("class=\"qt-katex\" data-tex=\"x &lt; y &amp; z\" "
                       "data-display=\"0\"")));
    QVERIFY(blocks.at(0).html.contains(QStringLiteral("unmatched $oops")));
    QVERIFY(blocks.at(1).html.contains(QStringLiteral("class=\"qt-katex\"")));
    QVERIFY(blocks.at(1).html.contains(QStringLiteral("data-display=\"1\"")));
    QVERIFY(blocks.at(2).html.contains(QStringLiteral("qt-mermaid")));
    static const QRegularExpression mermaidPayload(
        QStringLiteral("data-source-b64=\"([^\"]+)\""));
    const QRegularExpressionMatch payload =
        mermaidPayload.match(blocks.at(2).html);
    QVERIFY(payload.hasMatch());
    QCOMPARE(QString::fromUtf8(
                 QByteArray::fromBase64(payload.captured(1).toLatin1())),
             QStringLiteral("graph TD\nA -->\n"));
  }

  void plantUmlFencesBecomeOpaqueLocalRenderRequests() {
    MarkdownPipeline pipeline;
    const RenderResult result = pipeline.render(
        QStringLiteral("```puml\nAlice -> Bob : <hello>\n```\n"), 1);
    QCOMPARE(result.allBlocks.size(), 1);
    const QString html = result.allBlocks.front().html;
    QVERIFY(html.contains(QStringLiteral("class=\"plantuml qt-plantuml\"")));
    static const QRegularExpression payload(
        QStringLiteral("data-source-b64=\"([^\"]+)\""));
    const QRegularExpressionMatch match = payload.match(html);
    QVERIFY(match.hasMatch());
    QCOMPARE(
        QString::fromUtf8(QByteArray::fromBase64(match.captured(1).toLatin1())),
        QStringLiteral("Alice -> Bob : <hello>\n"));
  }

  void rawHtmlAndGfmExtensionsAreEnabled() {
    MarkdownPipeline pipeline;
    const RenderResult result = pipeline.render(
        QStringLiteral("<section data-value=\"kept\"><b>raw</b></section>\n\n"
                       "~~gone~~\n\n"
                       "| a | b |\n| - | - |\n| 1 | 2 |\n"),
        1);
    QCOMPARE(result.blocks.size(), 3);
    const QVector<RenderedBlock> &blocks = pipeline.previousBlocks();
    QCOMPARE(blocks.size(), 3);
    QCOMPARE(
        blocks.at(0).html,
        QStringLiteral("<section data-value=\"kept\"><b>raw</b></section>\n"));
    QVERIFY(blocks.at(1).html.contains(QStringLiteral("<del>gone</del>")));
    QVERIFY(blocks.at(2).html.contains(QStringLiteral("<table>")));
  }

  void multilineDetailsOwnTheirRenderedMarkdownContents() {
    MarkdownPipeline pipeline;
    const QString markdown = QStringLiteral("<details open>\n"
                                            "<summary>More</summary>\n\n"
                                            "First paragraph.\n\n"
                                            "<details>\n"
                                            "<summary>Nested</summary>\n\n"
                                            "- nested item\n\n"
                                            "</details>\n\n"
                                            "Last paragraph.\n\n"
                                            "</details>\n\n"
                                            "After details.\n");

    const RenderResult result = pipeline.render(markdown, 1);
    QCOMPARE(result.allBlocks.size(), 2);
    const RenderedBlock &details = result.allBlocks.at(0);
    QCOMPARE(details.kind, QStringLiteral("details"));
    QCOMPARE(details.source, markdown.first(markdown.indexOf(
                                 QStringLiteral("\n\nAfter details."))));
    QVERIFY(details.html.startsWith(
        QStringLiteral("<details data-nth=\"0\" open>")));
    QVERIFY(details.html.contains(QStringLiteral("<p>First paragraph.</p>")));
    QVERIFY(details.html.contains(QStringLiteral("<details data-nth=\"1\">")));
    QVERIFY(details.html.contains(QStringLiteral("<li>nested item</li>")));
    QVERIFY(details.html.contains(QStringLiteral("<p>Last paragraph.</p>")));
    QVERIFY(details.html.endsWith(QStringLiteral("</details>\n")));
    QCOMPARE(result.allBlocks.at(1).source, QStringLiteral("After details."));
  }

  void fullReplacementPublishesEveryBlockInOrder() {
    MarkdownPipeline pipeline;
    const RenderResult first =
        pipeline.render(QStringLiteral("one\n\ntwo\n\nthree\n"), 1);
    QCOMPARE(first.allBlocks.size(), 3);
    const RenderResult second =
        pipeline.render(QStringLiteral("one\n\ntwo edited\n\nthree\n"), 2);
    const QJsonObject update =
        second.toJson(qt_editor::PatchMode::FullDocument);
    QCOMPARE(update.value("changedBlocks").toArray().size(), 3);
    QCOMPARE(update.value("blockOrder").toArray().size(), 3);
    QVERIFY(update.value("replaceAll").toBool());
  }

  void largeDocumentMatchingIsBoundedAndStable() {
    QString markdown;
    for (int index = 0; index < 1500; ++index)
      markdown += QStringLiteral("paragraph %1\n\n").arg(index);
    MarkdownPipeline pipeline;
    const RenderResult first = pipeline.render(markdown, 1);
    QCOMPARE(first.allBlocks.size(), 1500);
    const QString retained = pipeline.previousBlocks().at(1000).id;
    markdown.replace(QStringLiteral("paragraph 750"),
                     QStringLiteral("paragraph 750 edited"));
    const RenderResult second = pipeline.render(markdown, 2);
    QCOMPARE(second.blocks.size(), 1);
    QCOMPARE(second.rangeUpdates.size(), 749);
    QCOMPARE(pipeline.previousBlocks().at(1000).id, retained);
    // Exact unchanged edges must be anchored before edit-distance matching, so
    // one local edit never builds a whole-document quadratic matrix.
    QVERIFY(second.timings.identityMatchCells <= 4);
  }

  void fullLargeDocumentRenderIsTheCorrectnessOracle() {
    const QString markdown = largeTestDocument();
    QVERIFY(markdown.size() > 200'000);

    const RenderResult result = renderFresh(markdown, 1);
    const QString html = combinedHtml(result);
    QVERIFY(result.allBlocks.size() > 3'000);
    QVERIFY(html.contains(
        QStringLiteral("<h1 id=\"1-test-note\">1 Test Note</h1>")));
    QVERIFY(html.contains(QStringLiteral("<div class=\"macro-toc\">")));
    QVERIFY(html.contains(QStringLiteral("href=\"#generated-section-899\"")));
    QVERIFY(html.contains(QStringLiteral("<div align=\"center\">")));
    QVERIFY(html.contains(
        QStringLiteral("<h1 id=\"some-heading\">Some Heading</h1>")));
    QVERIFY(
        html.contains(QStringLiteral("<p>The user is editing this line</p>")));
    QVERIFY(html.contains(QStringLiteral("<details data-nth=\"0\" open>")));
    QVERIFY(html.contains(QStringLiteral("qt-mermaid")));
    QVERIFY(
        html.contains(QStringLiteral("data-tex=\"\\ce{CO2 + C -&gt; 2CO}")));
    QVERIFY(html.contains(QStringLiteral("N<sub>2</sub>")));
    QVERIFY(!result.timings.incremental);
    QCOMPARE(result.timings.reparsedCharacters, markdown.size());
    QCOMPARE(result.timings.reparsedRegions, 1);
  }

  void nonLinearIncrementalConstructionMatchesFullRenderingAndPatches() {
    const QString complete = largeTestDocument();
    const qsizetype generatedStart =
        complete.indexOf(QStringLiteral("## Generated section 0"));
    const qsizetype section200 =
        complete.indexOf(QStringLiteral("## Generated section 200"));
    const qsizetype section450 =
        complete.indexOf(QStringLiteral("## Generated section 450"));
    const qsizetype section700 =
        complete.indexOf(QStringLiteral("## Generated section 700"));
    QVERIFY(generatedStart > 0);
    QVERIFY(section200 > generatedStart);
    QVERIFY(section450 > section200);
    QVERIFY(section700 > section450);

    const QString prefix = complete.first(generatedStart);
    const QString early =
        complete.sliced(generatedStart, section200 - generatedStart);
    const QString middle = complete.sliced(section200, section450 - section200);
    const QString later = complete.sliced(section450, section700 - section450);
    const QString tail = complete.sliced(section700);
    const QVector<QString> states{
        prefix + early,
        prefix + early + tail,
        prefix + early + later + tail,
        prefix + early + middle + later + tail,
    };

    MarkdownPipeline incremental;
    QVector<RenderedBlock> simulatedDom;
    for (qsizetype index = 0; index < states.size(); ++index) {
      const RenderResult patch =
          incremental.render(states.at(index), static_cast<quint64>(index + 1));
      simulatedDom = applyPatch(simulatedDom, patch);
      const RenderResult full =
          renderFresh(states.at(index), static_cast<quint64>(index + 1));
      compareRenderedSemantics(patch, full);
      QCOMPARE(simulatedDom.size(), patch.allBlocks.size());
      for (qsizetype block = 0; block < simulatedDom.size(); ++block) {
        QCOMPARE(simulatedDom.at(block).id, patch.allBlocks.at(block).id);
        QCOMPARE(simulatedDom.at(block).html, patch.allBlocks.at(block).html);
        QCOMPARE(simulatedDom.at(block).range.start,
                 patch.allBlocks.at(block).range.start);
        QCOMPARE(simulatedDom.at(block).range.end,
                 patch.allBlocks.at(block).range.end);
      }
      if (index > 0) {
        QVERIFY(patch.timings.incremental);
        QVERIFY(patch.timings.reparsedCharacters < states.at(index).size());
        QCOMPARE(patch.timings.reparsedRegions, 1);
      }
    }
    QCOMPARE(states.constLast(), complete);
  }

  void incrementalEditsRespectRawHtmlAndDetailsScope() {
    QString markdown = largeTestDocument();
    MarkdownPipeline incremental;
    QVector<RenderedBlock> simulatedDom;

    const auto assertEdit = [&](const QString &next, quint64 generation,
                                bool expectIncremental,
                                int expectedChangedBlocks = -1) {
      const RenderResult patch = incremental.render(next, generation);
      simulatedDom = applyPatch(simulatedDom, patch);
      const RenderResult full = renderFresh(next, generation);
      compareRenderedSemantics(patch, full);
      QCOMPARE(combinedHtml(patch), combinedHtml(full));
      QCOMPARE(simulatedDom.size(), patch.allBlocks.size());
      for (qsizetype index = 0; index < simulatedDom.size(); ++index)
        QCOMPARE(simulatedDom.at(index).html, patch.allBlocks.at(index).html);
      QCOMPARE(patch.timings.incremental, expectIncremental);
      if (expectIncremental)
        QVERIFY(patch.timings.reparsedCharacters < next.size() / 4);
      if (expectedChangedBlocks >= 0)
        QCOMPARE(patch.blocks.size(), expectedChangedBlocks);
    };

    assertEdit(markdown, 1, false);

    markdown.replace(QStringLiteral("The user is editing this line"),
                     QStringLiteral("The user edited only this line"));
    // The container stays live: only the generated paragraph is published to
    // the DOM patch even though parsing uses guarded blocks on both sides.
    assertEdit(markdown, 2, true, 1);

    markdown.replace(
        QStringLiteral("<div align=\"center\">"),
        QStringLiteral("<div class=\"centered\" align=\"center\">"));
    assertEdit(markdown, 3, true);

    markdown.replace(QStringLiteral("</div>\n\n<details open>"),
                     QStringLiteral("</section>\n\n<details open>"));
    assertEdit(markdown, 4, true);

    markdown.replace(QStringLiteral("<details open>"),
                     QStringLiteral("<details class=\"worked\" open>"));
    assertEdit(markdown, 5, true);

    markdown.replace(
        QStringLiteral("A paragraph inside generated details 450."),
        QStringLiteral("An edited paragraph inside generated details 450."));
    assertEdit(markdown, 6, true);
  }

  void removesFrontMatterLikeTheReferenceEditor() {
    const QString file =
        QStringLiteral("---\ntitle: Test\ntags: [one]\n---\n# Body\n");
    QCOMPARE(MarkdownPipeline::plainContent(file), QStringLiteral("# Body\n"));
    QCOMPARE(MarkdownPipeline::plainContent(
                 QStringLiteral("---\ntitle: Test\n---\n\n# Body\n")),
             QStringLiteral("# Body\n"));
    QCOMPARE(MarkdownPipeline::plainContent(QStringLiteral("---\nunclosed\n")),
             QStringLiteral("---\nunclosed\n"));
  }

  void portsCommonReferencePreAndPostprocessing() {
    MarkdownPipeline pipeline;
    const RenderResult result = pipeline.render(
        QStringLiteral("# Heading\n\n[[@toc]]\n\n[[@pagebreak]]\n\n"
                       "[[A note]]\n\n- [x] done\n\n<details "
                       "open><summary>More</summary>Text</details>\n\n"
                       "[Local](file:///workspace/support.txt)\n\n```ts\nconst "
                       "value = 1;\n```\n"),
        1);
    QCOMPARE(result.allBlocks.size(), 8);
    const QString html = [&] {
      QString combined;
      for (const RenderedBlock &block : result.allBlocks)
        combined += block.html;
      return combined;
    }();
    QVERIFY(html.contains(QStringLiteral("<h1 id=\"heading\">")));
    QVERIFY(html.contains(QStringLiteral("class=\"macro-toc\"")));
    QVERIFY(html.contains(QStringLiteral("href=\"#heading\"")));
    QVERIFY(html.contains(QStringLiteral("<hr class=\"pagebreak\">")));
    QVERIFY(html.contains(QStringLiteral("href=\"@note/A%20note.md\"")));
    QVERIFY(html.contains(QStringLiteral("class=\"task-list-item\"")));
    QVERIFY(html.contains(QStringLiteral("data-nth=\"0\"")));
    QVERIFY(html.contains(QStringLiteral("<details data-nth=\"0\" open>")));
    QVERIFY(html.contains(QStringLiteral(
        "href=\"@file/file%3A%2F%2F%2Fworkspace%2Fsupport.txt\"")));
    QVERIFY(html.contains(QStringLiteral("class=\"copy-wrapper\"")));
  }

  void keepsLooseTaskLabelsBesideTheirCheckboxes() {
    MarkdownPipeline pipeline;
    const RenderResult result = pipeline.render(
        QStringLiteral("- [ ] First paragraph\n\n"
                       "  A second paragraph in the same task.\n"),
        1);
    const QString html = combinedHtml(result);

    QVERIFY2(html.contains(QStringLiteral(
                 "<li class=\"task-list-item\"><input type=\"checkbox\" "
                 "data-nth=\"0\"> \n<p>First paragraph</p>")),
             qPrintable(html));

    QFile previewStylesheet(QStringLiteral(QT_EDITOR_WEB_DIR "/preview.css"));
    QVERIFY2(previewStylesheet.open(QIODevice::ReadOnly | QIODevice::Text),
             qPrintable(previewStylesheet.errorString()));
    const QByteArray css = previewStylesheet.readAll();
    QVERIFY(css.contains(
        ".preview .task-list-item > input[type=\"checkbox\"] + p { "
        "display: inline; }"));
  }

  void rendersNestedTableOfContentsLikeReference() {
    MarkdownPipeline pipeline;
    const RenderResult result =
        pipeline.render(QStringLiteral("# One\n\n### Deep\n\n## Middle\n\n#### "
                                       "Deeper\n\n# Two\n\n[[@toc]]\n"),
                        1);
    QString html;
    for (const RenderedBlock &block : result.allBlocks)
      html += block.html;

    QVERIFY(html.contains(
        QStringLiteral("<div class=\"macro-toc\"><p "
                       "class=\"macro-toc-title\">Table of Contents</p>")));
    QVERIFY(html.contains(
        QStringLiteral("<li><a class=\"toc-item\" href=\"#one\">One</a>"
                       "<ul class=\"macro-toc-list\"><li><a class=\"toc-item\" "
                       "href=\"#deep\">Deep</a>")));
    QVERIFY(html.contains(QStringLiteral(
        "</li><li><a class=\"toc-item\" href=\"#middle\">Middle</a>"
        "<ul class=\"macro-toc-list\"><li><a class=\"toc-item\" "
        "href=\"#deeper\">Deeper</a>")));
    QVERIFY(html.contains(QStringLiteral(
        "<li><a class=\"toc-item\" href=\"#middle\">Middle</a>"
        "<ul class=\"macro-toc-list\"><li><a class=\"toc-item\" "
        "href=\"#deeper\">Deeper</a>"
        "</li></ul></li><li><a class=\"toc-item\" href=\"#two\">Two</a>")));
    QVERIFY(!html.contains(QStringLiteral("toc-level-")));
  }

  void replacesEmojiShortcodesOutsideCode() {
    MarkdownPipeline pipeline;
    const RenderResult result =
        pipeline.render(QStringLiteral("A :cat: and :unknown_shortcode:.\n\n"
                                       "`:cat:`\n\n"
                                       "```text\n:cat:\n```\n"),
                        1);
    QString html;
    for (const RenderedBlock &block : result.allBlocks)
      html += block.html;
    QVERIFY(html.contains(QStringLiteral("A 🐱 and :unknown_shortcode:.")));
    QVERIFY(html.contains(QStringLiteral("<code>:cat:</code>")));
    QVERIFY(html.contains(QStringLiteral(":cat:")));
  }

  void rendersReferenceSuperscriptAndSubscriptSyntax() {
    MarkdownPipeline pipeline;
    const RenderResult result =
        pipeline.render(QStringLiteral("N~2~ and x^2^ beside $N_2$.\n\n"
                                       "Escaped N\\~2\\~ and ~~deleted~~.\n\n"
                                       "`N~2~`\n\n"
                                       "```text\nN~2~\n```\n"),
                        1);
    QString html;
    for (const RenderedBlock &block : result.allBlocks)
      html += block.html;
    QVERIFY(html.contains(QStringLiteral("N<sub>2</sub>")));
    QVERIFY(html.contains(QStringLiteral("x<sup>2</sup>")));
    QVERIFY(
        html.contains(QStringLiteral("class=\"qt-katex\" data-tex=\"N_2\"")));
    QVERIFY(html.contains(QStringLiteral("Escaped N~2~")));
    QVERIFY(html.contains(QStringLiteral("<del>deleted</del>")));
    QVERIFY(html.contains(QStringLiteral("<code>N~2~</code>")));
    QVERIFY(
        html.contains(QStringLiteral("<code class=\"language-text\">N~2~")));
  }
};

QTEST_APPLESS_MAIN(MarkdownPipelineTest)
#include "markdown_pipeline_test.moc"
