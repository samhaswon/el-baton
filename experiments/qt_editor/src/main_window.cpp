#include "main_window.h"

#include "benchmark_options.h"
#include "markdown_pipeline.h"
#include "preview_bridge.h"
#include "sync_controller.h"

#include <Qsci/qscilexermarkdown.h>
#include <Qsci/qsciscintilla.h>
#include <QAction>
#include <QFile>
#include <QFileDialog>
#include <QFileInfo>
#include <QFontDatabase>
#include <QLabel>
#include <QMenuBar>
#include <QMessageBox>
#include <QToolBar>
#include <QWidgetAction>
#include <QSplitter>
#include <QStatusBar>
#include <QTextStream>
#include <QDateTime>
#include <QVBoxLayout>
#include <QWebChannel>
#include <QWebEnginePage>
#include <QWebEngineView>

#include <chrono>
#ifdef Q_OS_LINUX
#include <unistd.h>
#endif

namespace qt_editor {

MainWindow::MainWindow(BenchmarkOptions options, QWidget* parent)
    : QMainWindow(parent), options_(options), pipeline_(new MarkdownPipeline), bridge_(new PreviewBridge(this)) {
  auto* splitter = new QSplitter(Qt::Horizontal, this);
  editor_ = new QsciScintilla(splitter);
  preview_ = new QWebEngineView(splitter);
  splitter->addWidget(editor_);
  splitter->addWidget(preview_);
  splitter->setSizes({720, 720});
  splitter->setHandleWidth(2);
  setCentralWidget(splitter);

  status_ = new QLabel(this);
  status_->setContentsMargins(6, 0, 6, 0);
  statusBar()->addPermanentWidget(status_, 1);
  statusBar()->setSizeGripEnabled(false);
  setStyleSheet(QStringLiteral(
      "QMainWindow, QStatusBar { background: #202020; color: #ddd; }"
      "QStatusBar { border-top: 1px solid #353535; font-size: 11px; }"
      "QToolBar { background: #252525; border: 0; border-bottom: 1px solid #383838; spacing: 4px; padding: 3px 6px; }"
      "QToolButton { color: #eee; background: transparent; border: 1px solid transparent; border-radius: 3px; padding: 4px 9px; }"
      "QToolButton:hover { background: #383838; border-color: #464646; }"
      "QSplitter::handle { background: #353535; }"));
  renderTimer_.setSingleShot(true);
  renderTimer_.setInterval(120);
  connect(&renderTimer_, &QTimer::timeout, this, &MainWindow::renderDocument);
  usageTimer_.setInterval(1000);
  connect(&usageTimer_, &QTimer::timeout, this, &MainWindow::sampleProcessUsage);
  usageTimer_.start();
  connect(editor_, &QsciScintilla::textChanged, this, &MainWindow::scheduleRender);
  connect(bridge_, &PreviewBridge::browserMetricsChanged, this, &MainWindow::updateStatus);
  connect(bridge_, &PreviewBridge::clientReady, this, [this](const QString& role) {
    if (role != QStringLiteral("preview")) return;
    previewReady_ = true;
    renderDocument();
  });

  configureEditor();
  configurePreview();
  createMenus();
  sync_ = new SyncController(editor_, bridge_, options_.syncMode, this);
  connect(sync_, &SyncController::syncMetricsChanged, this, [this](const QJsonObject& metrics) {
    for (auto it = metrics.begin(); it != metrics.end(); ++it) lastBrowserMetrics_.insert(it.key(), it.value());
    updateStatus();
  });
  updateStatus();
}

void MainWindow::configureEditor() {
  auto* lexer = new QsciLexerMarkdown(editor_);
  QFont font = QFontDatabase::systemFont(QFontDatabase::FixedFont);
  font.setPointSize(11);
  lexer->setDefaultFont(font);
  lexer->setDefaultPaper(QColor("#1f1f1f"));
  lexer->setDefaultColor(QColor("#e8e8e8"));
  for (int style = 0; style <= QsciLexerMarkdown::CodeBlock; ++style) {
    lexer->setPaper(QColor("#1f1f1f"), style);
    lexer->setFont(font, style);
  }
  const QColor heading("#e8a15b"), accent("#6aa9e9"), code("#a8cc8c"), muted("#999999");
  for (int style = QsciLexerMarkdown::Header1; style <= QsciLexerMarkdown::Header6; ++style) lexer->setColor(heading, style);
  lexer->setColor(accent, QsciLexerMarkdown::Link);
  lexer->setColor(muted, QsciLexerMarkdown::BlockQuote);
  lexer->setColor(muted, QsciLexerMarkdown::HorizontalRule);
  lexer->setColor(code, QsciLexerMarkdown::CodeBackticks);
  lexer->setColor(code, QsciLexerMarkdown::CodeDoubleBackticks);
  lexer->setColor(code, QsciLexerMarkdown::CodeBlock);
  editor_->setLexer(lexer);
  editor_->setUtf8(true);
  editor_->setWrapMode(QsciScintilla::WrapWord);
  editor_->setMarginLineNumbers(0, true);
  editor_->setMarginWidth(0, "000000");
  editor_->setBraceMatching(QsciScintilla::SloppyBraceMatch);
  editor_->setMarginsBackgroundColor(QColor("#252525"));
  editor_->setMarginsForegroundColor(QColor("#8f8f8f"));
  editor_->setCaretForegroundColor(QColor("#f4f4f4"));
  editor_->setSelectionBackgroundColor(QColor("#315f8c"));
  editor_->setSelectionForegroundColor(Qt::white);
  editor_->setIndentationGuides(true);
  editor_->setIndentationsUseTabs(false);
  editor_->setTabWidth(2);
  editor_->setEolMode(QsciScintilla::EolUnix);
}

void MainWindow::configurePreview() {
  auto* channel = new QWebChannel(preview_->page());
  channel->registerObject("previewBridge", bridge_);
  preview_->page()->setWebChannel(channel);
  preview_->setUrl(QUrl::fromLocalFile(QStringLiteral(QT_EDITOR_WEB_DIR "/preview.html")));
  if (options_.hiddenMermaidPage) {
    hiddenMermaidView_ = new QWebEngineView(this);
    hiddenMermaidView_->resize(1280, 800);
    hiddenMermaidView_->hide();
    hiddenMermaidPage_ = hiddenMermaidView_->page();
    auto* hiddenChannel = new QWebChannel(hiddenMermaidPage_);
    hiddenChannel->registerObject("previewBridge", bridge_);
    hiddenMermaidPage_->setWebChannel(hiddenChannel);
    hiddenMermaidPage_->setUrl(QUrl::fromLocalFile(QStringLiteral(QT_EDITOR_WEB_DIR "/mermaid_renderer.html")));
  }
}

void MainWindow::createMenus() {
  menuBar()->hide();
  auto* toolbar = addToolBar(QStringLiteral("Document"));
  toolbar->setMovable(false);
  toolbar->setFloatable(false);
  auto* open = toolbar->addAction("Open…");
  open->setShortcut(QKeySequence::Open);
  connect(open, &QAction::triggered, this, &MainWindow::chooseFile);
  auto* spacer = new QWidget(toolbar);
  spacer->setSizePolicy(QSizePolicy::Expanding, QSizePolicy::Preferred);
  toolbar->addWidget(spacer);
  auto* mode = new QLabel(describeBenchmarkOptions(options_), toolbar);
  mode->setStyleSheet(QStringLiteral("color: #aaa; padding-right: 6px; font-size: 11px;"));
  toolbar->addWidget(mode);
}

void MainWindow::chooseFile() {
  const QString path = QFileDialog::getOpenFileName(this, "Open benchmark document", currentPath_, "Markdown (*.md *.markdown *.txt);;All files (*)");
  if (!path.isEmpty()) openFile(path);
}

void MainWindow::openFile(const QString& path) {
  QFile file(path);
  if (!file.open(QIODevice::ReadOnly)) {
    QMessageBox::critical(this, "Open failed", QString("Unable to open %1: %2").arg(path, file.errorString()));
    return;
  }
  currentPath_ = QFileInfo(path).absoluteFilePath();
  editor_->setText(MarkdownPipeline::plainContent(QString::fromUtf8(file.readAll())));
  editor_->setModified(false);
  setWindowTitle(QString("%1 — Qt editor experiment").arg(QFileInfo(path).fileName()));
  renderDocument();
}

void MainWindow::scheduleRender() {
  lastInputNs_ = std::chrono::duration_cast<std::chrono::nanoseconds>(std::chrono::steady_clock::now().time_since_epoch()).count();
  renderTimer_.start();
}

void MainWindow::renderDocument() {
  if (!previewReady_) return;
  RenderResult result = pipeline_->render(editor_->text(), ++generation_, lastInputNs_);
  lastNativeTimings_ = result.timings;
  sync_->setBlocks(result.allBlocks, result.generation);
  QJsonObject update = result.toJson(options_.patchMode);
  update.insert("katexEnabled", options_.katexEnabled);
  update.insert("mermaidEnabled", options_.mermaidEnabled);
  update.insert("overlayEnabled", options_.overlayEnabled);
  update.insert("hiddenMermaidPage", options_.hiddenMermaidPage);
  if (!currentPath_.isEmpty()) {
    const QString directory = QFileInfo(currentPath_).absolutePath() + QLatin1Char('/');
    update.insert("documentBaseUrl", QUrl::fromLocalFile(directory).toString());
  }
  bridge_->publishRender(update);
  updateStatus();
}

void MainWindow::updateStatus(const QJsonObject& browserMetrics) {
  for (auto it = browserMetrics.begin(); it != browserMetrics.end(); ++it) lastBrowserMetrics_.insert(it.key(), it.value());
  const QJsonObject& metrics = lastBrowserMetrics_;
  const double nativeMs = lastNativeTimings_.preprocessMs + lastNativeTimings_.parseMs + lastNativeTimings_.postprocessMs;
  const QString timings = QString("native %1 ms | DOM %2 ms | settle %3 ms | UI %4 FPS | render %5/s | sync %6 Hz (%7 dropped) | host CPU %8% | host RSS %9 MiB")
      .arg(nativeMs, 0, 'f', 1)
      .arg(metrics.value("domPatchMs").toDouble(), 0, 'f', 1)
      .arg(metrics.value("settleMs").toDouble(), 0, 'f', 1)
      .arg(metrics.value("uiFps").toDouble(), 0, 'f', 0)
      .arg(metrics.value("renderRate").toDouble(), 0, 'f', 1)
      .arg(metrics.value("syncRate").toDouble(), 0, 'f', 0)
      .arg(metrics.value("droppedSync").toInt())
      .arg(processCpuPercent_, 0, 'f', 1)
      .arg(processMemoryMiB_, 0, 'f', 1);
  status_->setText(describeBenchmarkOptions(options_) + " | " + timings);
}

void MainWindow::sampleProcessUsage() {
#ifdef Q_OS_LINUX
  QFile stat("/proc/self/stat");
  if (stat.open(QIODevice::ReadOnly)) {
    const QList<QByteArray> fields = stat.readAll().split(' ');
    if (fields.size() > 14) {
      const quint64 ticks = fields[13].toULongLong() + fields[14].toULongLong();
      const qint64 now = QDateTime::currentMSecsSinceEpoch();
      if (lastCpuSampleMs_ > 0 && now > lastCpuSampleMs_) {
        const long ticksPerSecond = sysconf(_SC_CLK_TCK);
        processCpuPercent_ = 100.0 * static_cast<double>(ticks - lastCpuTicks_) * 1000.0 /
            (static_cast<double>(ticksPerSecond) * static_cast<double>(now - lastCpuSampleMs_));
      }
      lastCpuTicks_ = ticks;
      lastCpuSampleMs_ = now;
    }
  }
  QFile statm("/proc/self/statm");
  if (statm.open(QIODevice::ReadOnly)) {
    const QList<QByteArray> fields = statm.readAll().split(' ');
    if (fields.size() > 1) processMemoryMiB_ = fields[1].toDouble() * static_cast<double>(sysconf(_SC_PAGESIZE)) / (1024.0 * 1024.0);
  }
#endif
  updateStatus();
}

}  // namespace qt_editor
