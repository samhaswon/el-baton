#include "markdown_pipeline.h"

#include <QFile>
#include <QtTest>

class CheatsheetContentTest final : public QObject {
  Q_OBJECT

private slots:
  void generatesAndRendersReferenceContent() {
    QFile file(QStringLiteral(QT_EDITOR_CHEATSHEET_MARKDOWN));
    QVERIFY2(file.open(QIODevice::ReadOnly), qPrintable(file.errorString()));
    const QString markdown = QString::fromUtf8(file.readAll());
    QVERIFY(markdown.contains(QStringLiteral("# Cheatsheets")));
    QVERIFY(markdown.contains(QStringLiteral("## Markdown Basics")));
    QVERIFY(markdown.contains(QStringLiteral("## KaTeX")));
    QVERIFY(markdown.contains(QStringLiteral("## Mermaid")));
    QVERIFY(markdown.contains(QStringLiteral("## PlantUML")));
    QVERIFY(markdown.contains(QStringLiteral("`:cat:` | 🐱")));

    qt_editor::MarkdownPipeline pipeline;
    const qt_editor::RenderResult result = pipeline.render(markdown, 1);
    QVERIFY(result.allBlocks.size() > 50);
    QString html;
    for (const qt_editor::RenderedBlock &block : result.allBlocks)
      html += block.html;
    QVERIFY(html.contains(QStringLiteral("class=\"qt-katex\"")));
    QVERIFY(html.contains(QStringLiteral("class=\"mermaid qt-mermaid\"")));
    QVERIFY(html.contains(QStringLiteral("class=\"plantuml qt-plantuml\"")));
  }
};

QTEST_APPLESS_MAIN(CheatsheetContentTest)

#include "cheatsheet_content_test.moc"
