#include <QtTest>

#include <QRegularExpression>

#include "markdown_pipeline.h"

using qt_editor::MarkdownPipeline;
using qt_editor::RenderResult;
using qt_editor::RenderedBlock;

class MarkdownPipelineTest final : public QObject {
  Q_OBJECT
 private slots:
  void stableIdsAcrossLocalEdit() {
    MarkdownPipeline pipeline;
    const RenderResult first = pipeline.render(QStringLiteral("# Heading\n\nfirst paragraph\n\nlast paragraph\n"), 1);
    QCOMPARE(first.blocks.size(), 3);
    const QStringList ids{first.blocks.at(0).id, first.blocks.at(1).id, first.blocks.at(2).id};

    const RenderResult second = pipeline.render(QStringLiteral("# Heading\n\nfirst edited paragraph\n\nlast paragraph\n"), 2);
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
    const QVector<RenderedBlock>& blocks = pipeline.previousBlocks();
    QCOMPARE(blocks.size(), 2);
    QCOMPARE(blocks.at(0).range.start, qsizetype{0});
    QCOMPARE(blocks.at(0).range.end, markdown.indexOf(QStringLiteral("\n\n")));
    QCOMPARE(blocks.at(0).source, QString::fromUtf8("# Héading 😀"));
    const qsizetype paragraphStart = markdown.indexOf(QStringLiteral("paragraph"));
    QCOMPARE(blocks.at(1).range.start, paragraphStart);
    QCOMPARE(blocks.at(1).range.end, paragraphStart + QString::fromUtf8("paragraph é").size());
  }

  void anchorOnlyAndRemovedBlocks() {
    MarkdownPipeline pipeline;
    const RenderResult first = pipeline.render(QStringLiteral("<a id=\"target\"></a>\n\nVisible\n"), 1);
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
    const QString markdown = QStringLiteral(
        "Inline $x < y & z$ and unmatched $oops.\n\n"
        "```katex\n\\frac{1}{\n```\n\n"
        "```mermaid\ngraph TD\nA -->\n");
    const RenderResult result = pipeline.render(markdown, 1);
    QCOMPARE(result.blocks.size(), 3);
    const QVector<RenderedBlock>& blocks = pipeline.previousBlocks();
    QCOMPARE(blocks.size(), 3);
    QVERIFY(blocks.at(0).html.contains(
        QStringLiteral("class=\"qt-katex\" data-tex=\"x &lt; y &amp; z\" data-display=\"0\"")));
    QVERIFY(blocks.at(0).html.contains(QStringLiteral("unmatched $oops")));
    QVERIFY(blocks.at(1).html.contains(QStringLiteral("class=\"qt-katex\"")));
    QVERIFY(blocks.at(1).html.contains(QStringLiteral("data-display=\"1\"")));
    QVERIFY(blocks.at(2).html.contains(QStringLiteral("qt-mermaid")));
    static const QRegularExpression mermaidPayload(QStringLiteral("data-source-b64=\"([^\"]+)\""));
    const QRegularExpressionMatch payload = mermaidPayload.match(blocks.at(2).html);
    QVERIFY(payload.hasMatch());
    QCOMPARE(QString::fromUtf8(QByteArray::fromBase64(payload.captured(1).toLatin1())),
             QStringLiteral("graph TD\nA -->\n"));
  }

  void plantUmlFencesBecomeOpaqueLocalRenderRequests() {
    MarkdownPipeline pipeline;
    const RenderResult result = pipeline.render(
        QStringLiteral("```puml\nAlice -> Bob : <hello>\n```\n"), 1);
    QCOMPARE(result.allBlocks.size(), 1);
    const QString html = result.allBlocks.front().html;
    QVERIFY(html.contains(QStringLiteral("class=\"plantuml qt-plantuml\"")));
    static const QRegularExpression payload(QStringLiteral("data-source-b64=\"([^\"]+)\""));
    const QRegularExpressionMatch match = payload.match(html);
    QVERIFY(match.hasMatch());
    QCOMPARE(QString::fromUtf8(QByteArray::fromBase64(match.captured(1).toLatin1())),
             QStringLiteral("Alice -> Bob : <hello>\n"));
  }

  void rawHtmlAndGfmExtensionsAreEnabled() {
    MarkdownPipeline pipeline;
    const RenderResult result = pipeline.render(QStringLiteral(
        "<section data-value=\"kept\"><b>raw</b></section>\n\n"
        "~~gone~~\n\n"
        "| a | b |\n| - | - |\n| 1 | 2 |\n"), 1);
    QCOMPARE(result.blocks.size(), 3);
    const QVector<RenderedBlock>& blocks = pipeline.previousBlocks();
    QCOMPARE(blocks.size(), 3);
    QCOMPARE(blocks.at(0).html, QStringLiteral("<section data-value=\"kept\"><b>raw</b></section>\n"));
    QVERIFY(blocks.at(1).html.contains(QStringLiteral("<del>gone</del>")));
    QVERIFY(blocks.at(2).html.contains(QStringLiteral("<table>")));
  }

  void multilineDetailsOwnTheirRenderedMarkdownContents() {
    MarkdownPipeline pipeline;
    const QString markdown = QStringLiteral(
        "<details open>\n"
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
    const RenderedBlock& details = result.allBlocks.at(0);
    QCOMPARE(details.kind, QStringLiteral("details"));
    QCOMPARE(details.source, markdown.first(markdown.indexOf(QStringLiteral("\n\nAfter details."))));
    QVERIFY(details.html.startsWith(QStringLiteral("<details data-nth=\"0\" open>")));
    QVERIFY(details.html.contains(QStringLiteral("<p>First paragraph.</p>")));
    QVERIFY(details.html.contains(QStringLiteral("<details data-nth=\"1\">")));
    QVERIFY(details.html.contains(QStringLiteral("<li>nested item</li>")));
    QVERIFY(details.html.contains(QStringLiteral("<p>Last paragraph.</p>")));
    QVERIFY(details.html.endsWith(QStringLiteral("</details>\n")));
    QCOMPARE(result.allBlocks.at(1).source, QStringLiteral("After details."));
  }

  void fullReplacementPublishesEveryBlockInOrder() {
    MarkdownPipeline pipeline;
    const RenderResult first = pipeline.render(QStringLiteral("one\n\ntwo\n\nthree\n"), 1);
    QCOMPARE(first.allBlocks.size(), 3);
    const RenderResult second = pipeline.render(QStringLiteral("one\n\ntwo edited\n\nthree\n"), 2);
    const QJsonObject update = second.toJson(qt_editor::PatchMode::FullDocument);
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
    markdown.replace(QStringLiteral("paragraph 750"), QStringLiteral("paragraph 750 edited"));
    const RenderResult second = pipeline.render(markdown, 2);
    QCOMPARE(second.blocks.size(), 1);
    QCOMPARE(second.rangeUpdates.size(), 749);
    QCOMPARE(pipeline.previousBlocks().at(1000).id, retained);
  }

  void removesFrontMatterLikeTheReferenceEditor() {
    const QString file = QStringLiteral("---\ntitle: Test\ntags: [one]\n---\n# Body\n");
    QCOMPARE(MarkdownPipeline::plainContent(file), QStringLiteral("# Body\n"));
    QCOMPARE(
        MarkdownPipeline::plainContent(QStringLiteral("---\ntitle: Test\n---\n\n# Body\n")),
        QStringLiteral("# Body\n"));
    QCOMPARE(MarkdownPipeline::plainContent(QStringLiteral("---\nunclosed\n")), QStringLiteral("---\nunclosed\n"));
  }

  void portsCommonReferencePreAndPostprocessing() {
    MarkdownPipeline pipeline;
    const RenderResult result = pipeline.render(QStringLiteral(
        "# Heading\n\n[[@toc]]\n\n[[@pagebreak]]\n\n"
        "[[A note]]\n\n- [x] done\n\n<details open><summary>More</summary>Text</details>\n\n"
        "[Local](file:///workspace/support.txt)\n\n```ts\nconst value = 1;\n```\n"), 1);
    QCOMPARE(result.allBlocks.size(), 8);
    const QString html = [&] {
      QString combined;
      for (const RenderedBlock& block : result.allBlocks) combined += block.html;
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
    QVERIFY(html.contains(QStringLiteral("href=\"@file/file%3A%2F%2F%2Fworkspace%2Fsupport.txt\"")));
    QVERIFY(html.contains(QStringLiteral("class=\"copy-wrapper\"")));
  }

  void replacesEmojiShortcodesOutsideCode() {
    MarkdownPipeline pipeline;
    const RenderResult result = pipeline.render(QStringLiteral(
        "A :cat: and :unknown_shortcode:.\n\n"
        "`:cat:`\n\n"
        "```text\n:cat:\n```\n"), 1);
    QString html;
    for (const RenderedBlock& block : result.allBlocks) html += block.html;
    QVERIFY(html.contains(QStringLiteral("A 🐱 and :unknown_shortcode:.")));
    QVERIFY(html.contains(QStringLiteral("<code>:cat:</code>")));
    QVERIFY(html.contains(QStringLiteral(":cat:")));
  }
};

QTEST_APPLESS_MAIN(MarkdownPipelineTest)
#include "markdown_pipeline_test.moc"
