#include "main_window.h"

#include "benchmark_options.h"
#include "markdown_completion.h"
#include "markdown_edits.h"
#include "markdown_pipeline.h"
#include "markdown_syntax_lexer.h"
#include "note_transfer_service.h"
#include "preview_bridge.h"
#include "reference_icons.h"
#include "plantuml_renderer.h"
#include "sync_controller.h"
#include "workspace_watcher.h"
#include "workspace_graph_view.h"

#include <Qsci/qsciscintilla.h>
#include <QAction>
#include <QAbstractButton>
#include <QButtonGroup>
#include <QCheckBox>
#include <QCloseEvent>
#include <QComboBox>
#include <QCoreApplication>
#include <QContextMenuEvent>
#include <QCompleter>
#include <QDialog>
#include <QDialogButtonBox>
#include <QEvent>
#include <QFile>
#include <QFileDialog>
#include <QFileInfo>
#include <QFontDatabase>
#include <QFormLayout>
#include <QtConcurrentRun>
#include <QFrame>
#include <QGroupBox>
#include <QHBoxLayout>
#include <QLabel>
#include <QInputDialog>
#include <QIcon>
#include <QKeyEvent>
#include <QLineEdit>
#include <QListWidget>
#include <QListWidgetItem>
#include <QLocale>
#include <QMenuBar>
#include <QMenu>
#include <QMessageBox>
#include <QMimeDatabase>
#include <QMouseEvent>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QPushButton>
#include <QPainter>
#include <QPointer>
#include <QScrollArea>
#include <QSaveFile>
#include <QScopedValueRollback>
#include <QScrollBar>
#include <QSlider>
#include <QShowEvent>
#include <QSignalBlocker>
#include <QStackedWidget>
#include <QStringListModel>
#include <QTabBar>
#include <QTemporaryFile>
#include <QToolButton>
#include <QSplitter>
#include <QStatusBar>
#include <QStyle>
#include <QTextStream>
#include <QTextBrowser>
#include <QTreeWidget>
#include <QTreeWidgetItem>
#include <QDateTime>
#include <QDesktopServices>
#include <QDebug>
#include <QDir>
#include <QVBoxLayout>
#include <QWebChannel>
#include <QWebEnginePage>
#include <QWebEngineProfile>
#include <QWebEngineSettings>
#include <QWebEngineUrlRequestInfo>
#include <QWebEngineUrlRequestInterceptor>
#include <QWebEngineView>
#include <QWindow>

#include <chrono>
#include <functional>
#include <memory>
#ifdef Q_OS_LINUX
#include <unistd.h>
#endif

namespace qt_editor {
namespace {

QPixmap tintedReferencePixmap(const QString& name, int size, const QColor& color) {
  initializeReferenceIcons();
  QPixmap pixmap = QIcon(QStringLiteral(":/reference-icons/") + name +
                         QStringLiteral(".svg")).pixmap(size, size);
  if (pixmap.isNull()) return pixmap;
  QPainter painter(&pixmap);
  painter.setCompositionMode(QPainter::CompositionMode_SourceIn);
  painter.fillRect(pixmap.rect(), color);
  return pixmap;
}

QIcon referenceIcon(const QString& name) {
  QIcon icon;
  static constexpr int sizes[] = {16, 20, 24, 32, 48};
  for (const int size : sizes) {
    icon.addPixmap(tintedReferencePixmap(name, size, QColor(QStringLiteral("#eeeeee"))),
                   QIcon::Normal, QIcon::Off);
    icon.addPixmap(tintedReferencePixmap(name, size, QColor(QStringLiteral("#777777"))),
                   QIcon::Disabled, QIcon::Off);
  }
  return icon;
}

QIcon referenceToggleIcon(const QString& offName, const QString& onName) {
  QIcon icon;
  static constexpr int sizes[] = {16, 20, 24, 32, 48};
  for (const int size : sizes) {
    icon.addPixmap(tintedReferencePixmap(offName, size, QColor(QStringLiteral("#eeeeee"))),
                   QIcon::Normal, QIcon::Off);
    icon.addPixmap(tintedReferencePixmap(onName, size, QColor(QStringLiteral("#ffffff"))),
                   QIcon::Normal, QIcon::On);
    icon.addPixmap(tintedReferencePixmap(offName, size, QColor(QStringLiteral("#777777"))),
                   QIcon::Disabled, QIcon::Off);
    icon.addPixmap(tintedReferencePixmap(onName, size, QColor(QStringLiteral("#777777"))),
                   QIcon::Disabled, QIcon::On);
  }
  return icon;
}

QIcon referenceNoteStateIcon(bool pinned, bool favorited) {
  if (!pinned && !favorited) return {};
  if (!pinned) return referenceIcon(QStringLiteral("star"));
  if (!favorited) return referenceIcon(QStringLiteral("pin"));
  QPixmap combined(32, 16);
  combined.fill(Qt::transparent);
  QPainter painter(&combined);
  painter.drawPixmap(0, 0, tintedReferencePixmap(QStringLiteral("pin"), 16,
                                                  QColor(QStringLiteral("#eeeeee"))));
  painter.drawPixmap(16, 0, tintedReferencePixmap(QStringLiteral("star"), 16,
                                                   QColor(QStringLiteral("#eeeeee"))));
  painter.end();
  QIcon icon;
  icon.addPixmap(combined);
  return icon;
}

class WindowDragBar final : public QWidget {
 public:
  explicit WindowDragBar(QWidget* parent = nullptr) : QWidget(parent) {
    setSizePolicy(QSizePolicy::Expanding, QSizePolicy::Expanding);
  }

 protected:
  void mousePressEvent(QMouseEvent* event) override {
    if (event->button() == Qt::LeftButton && window()->windowHandle() != nullptr) {
      window()->windowHandle()->startSystemMove();
      event->accept();
      return;
    }
    QWidget::mousePressEvent(event);
  }

  void mouseDoubleClickEvent(QMouseEvent* event) override {
    if (event->button() == Qt::LeftButton) {
      window()->isMaximized() ? window()->showNormal() : window()->showMaximized();
      event->accept();
      return;
    }
    QWidget::mouseDoubleClickEvent(event);
  }
};

class LazyPanel final : public QWidget {
 public:
  explicit LazyPanel(QWidget* parent = nullptr) : QWidget(parent) {}

  void setFirstShowCallback(std::function<void()> callback) {
    callback_ = std::move(callback);
  }

 protected:
  void showEvent(QShowEvent* event) override {
    QWidget::showEvent(event);
    if (!callback_) return;
    std::function<void()> callback = std::move(callback_);
    callback_ = {};
    callback();
  }

 private:
  std::function<void()> callback_;
};

class ElidingTabBar final : public QTabBar {
 public:
  explicit ElidingTabBar(QWidget* parent = nullptr) : QTabBar(parent) {
    setElideMode(Qt::ElideRight);
    setUsesScrollButtons(true);
  }

 protected:
  QSize tabSizeHint(int index) const override {
    QSize size = QTabBar::tabSizeHint(index);
    const int tabCount = count();
    if (tabCount <= 0) return size;
    const int availablePerTab = std::max(90, (width() - 12) / tabCount);
    size.setWidth(std::min(size.width(), std::min(220, availablePerTab)));
    return size;
  }
};

class WorkspaceRequestInterceptor final : public QWebEngineUrlRequestInterceptor {
 public:
  explicit WorkspaceRequestInterceptor(std::function<QString()> workspaceRoot, QObject* parent = nullptr)
      : QWebEngineUrlRequestInterceptor(parent), workspaceRoot_(std::move(workspaceRoot)) {}

  void interceptRequest(QWebEngineUrlRequestInfo& info) override {
    const QUrl url = info.requestUrl();
    if (url.scheme() != QStringLiteral("file")) return;
    const QString candidate = QFileInfo(url.toLocalFile()).canonicalFilePath();
    if (candidate.isEmpty()) {
      info.block(true);
      return;
    }
    const QString webRoot = QFileInfo(QStringLiteral(QT_EDITOR_WEB_DIR)).canonicalFilePath();
    if (isInside(webRoot, candidate)) return;
    const QString workspace = QFileInfo(workspaceRoot_()).canonicalFilePath();
    if (!isInside(workspace, candidate)) info.block(true);
  }

 private:
  static bool isInside(const QString& parent, const QString& child) {
    if (parent.isEmpty() || child.isEmpty()) return false;
    const QString prefix = parent.endsWith(QLatin1Char('/')) ? parent : parent + QLatin1Char('/');
    return child == parent || child.startsWith(prefix);
  }

  std::function<QString()> workspaceRoot_;
};

QLabel* panelHeading(const QString& text, QWidget* parent) {
  auto* heading = new QLabel(text, parent);
  heading->setObjectName(QStringLiteral("paneHeading"));
  return heading;
}

QLabel* panelDescription(const QString& text, QWidget* parent) {
  auto* label = new QLabel(text, parent);
  label->setWordWrap(true);
  label->setObjectName(QStringLiteral("panelDescription"));
  return label;
}

QString highlightedSnippetHtml(const SearchSnippet& snippet) {
  if (snippet.matchLength <= 0 || snippet.matchStart < 0 ||
      snippet.matchStart + snippet.matchLength > snippet.text.size()) {
    return snippet.text.toHtmlEscaped();
  }
  return snippet.text.first(snippet.matchStart).toHtmlEscaped() +
      QStringLiteral("<mark style='background:#315f8c;color:white;border-radius:2px'>") +
      snippet.text.sliced(snippet.matchStart, snippet.matchLength).toHtmlEscaped() +
      QStringLiteral("</mark>") +
      snippet.text.sliced(snippet.matchStart + snippet.matchLength).toHtmlEscaped();
}

bool writeExportFile(const QString& path, const QByteArray& content, QString* errorMessage) {
  QSaveFile file(path);
  if (!file.open(QIODevice::WriteOnly) || file.write(content) != content.size() || !file.commit()) {
    if (errorMessage != nullptr) *errorMessage = file.errorString();
    return false;
  }
  return true;
}

QString inlineCssResources(QString css, const QString& cssPath) {
  static const QRegularExpression resource(
      QStringLiteral("url\\(\\s*['\"]?([^)'\"]+)['\"]?\\s*\\)"),
      QRegularExpression::CaseInsensitiveOption);
  QMimeDatabase mimeDatabase;
  auto matches = resource.globalMatch(css);
  QVector<QPair<QString, QString>> replacements;
  while (matches.hasNext()) {
    const QRegularExpressionMatch match = matches.next();
    const QString reference = match.captured(1);
    if (reference.startsWith(QStringLiteral("data:")) || reference.contains(QStringLiteral("://"))) continue;
    QFile file(QDir(QFileInfo(cssPath).absolutePath()).filePath(reference));
    if (!file.open(QIODevice::ReadOnly)) continue;
    const QString mime = mimeDatabase.mimeTypeForFile(file.fileName()).name();
    replacements.append({match.captured(0), QStringLiteral("url(data:%1;base64,%2)")
        .arg(mime, QString::fromLatin1(file.readAll().toBase64()))});
  }
  for (const auto& replacement : replacements) css.replace(replacement.first, replacement.second);
  return css;
}

QString selfContainedPreviewHtml(QString fragment, const QString& title,
                                 const QString& currentPath,
                                 const WorkspaceRepository& workspace,
                                 bool printLayout = false) {
  static const QRegularExpression fileSource(
      QStringLiteral("(src|href)=['\"](file:[^'\"]+)['\"]"),
      QRegularExpression::CaseInsensitiveOption);
  QMimeDatabase mimeDatabase;
  auto links = fileSource.globalMatch(fragment);
  QVector<QPair<QString, QString>> replacements;
  while (links.hasNext()) {
    const QRegularExpressionMatch match = links.next();
    const QString safePath = workspace.resolveLocalFileTarget(match.captured(2), currentPath);
    QFile file(safePath);
    if (safePath.isEmpty() || !file.open(QIODevice::ReadOnly)) continue;
    const QString data = QStringLiteral("%1=\"data:%2;base64,%3\"")
        .arg(match.captured(1), mimeDatabase.mimeTypeForFile(safePath).name(),
             QString::fromLatin1(file.readAll().toBase64()));
    replacements.append({match.captured(0), data});
  }
  for (const auto& replacement : replacements) fragment.replace(replacement.first, replacement.second);

  QString css;
  for (const QString& path : {
           QStringLiteral(QT_EDITOR_WEB_DIR "/vendor/notable.css"),
           QStringLiteral(QT_EDITOR_WEB_DIR "/vendor/katex/katex.min.css"),
           QStringLiteral(QT_EDITOR_WEB_DIR "/preview.css"),
       }) {
    QFile file(path);
    if (file.open(QIODevice::ReadOnly)) {
      css += inlineCssResources(QString::fromUtf8(file.readAll()), path) + QLatin1Char('\n');
    }
  }
  if (printLayout) {
    css += QStringLiteral(R"CSS(
@page { margin: 14mm 16mm; }
@media print {
  :root { color-scheme: light !important; }
  html, body {
    width: auto !important;
    height: auto !important;
    min-height: 0 !important;
    overflow: visible !important;
    background: #fff !important;
    color: #111 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  body { margin: 0 !important; }
  main.preview {
    box-sizing: border-box;
    width: auto !important;
    max-width: none !important;
    min-height: 0 !important;
    padding: 0 !important;
    overflow: visible !important;
  }
  .render-block {
    display: block !important;
    overflow: visible !important;
  }
  .render-block[data-kind="heading"], h1, h2, h3, h4, h5, h6 {
    break-after: avoid-page;
    page-break-after: avoid;
  }
  pre {
    white-space: pre-wrap !important;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  table {
    display: table !important;
    width: 100% !important;
    overflow: visible !important;
  }
  thead { display: table-header-group; }
  tr, img, pre, blockquote, details, .qt-katex-display, .qt-mermaid, .qt-plantuml {
    break-inside: avoid-page;
    page-break-inside: avoid;
  }
  img, svg, .qt-mermaid > svg, .qt-plantuml > svg {
    max-width: 100% !important;
    max-height: 240mm;
    height: auto !important;
  }
  .copy-wrapper button, .mermaid-open-external, #debug-overlay {
    display: none !important;
  }
  hr.pagebreak {
    height: 0 !important;
    margin: 0 !important;
    border: 0 !important;
    break-after: page;
    page-break-after: always;
  }
}
)CSS");
  }
  const QString printScripts = printLayout
      ? QStringLiteral("<script src=\"%1\"></script>").arg(
            QUrl::fromLocalFile(QStringLiteral(
                QT_EDITOR_WEB_DIR "/vendor/mermaid.min.js"))
                .toString(QUrl::FullyEncoded)
                .toHtmlEscaped())
      : QString();
  return QStringLiteral("<!doctype html><html><head><meta charset=\"utf-8\">"
                        "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
                        "<title>%1</title><style>%2</style></head>"
                        "<body class=\"theme-light\"><main class=\"preview\">%3</main>%4</body></html>")
      .arg(title.toHtmlEscaped(), css, fragment, printScripts);
}

}  // namespace

MainWindow::MainWindow(BenchmarkOptions options, QWidget* parent)
    : QMainWindow(parent), options_(options), pipeline_(new MarkdownPipeline), bridge_(new PreviewBridge(this)),
      plantUmlRenderer_(new PlantUmlRenderer(QStringLiteral(QT_EDITOR_PLANTUML_JAR), this)),
      workspaceWatcher_(new WorkspaceWatcher(this)),
      settings_(SettingsStore::referencePath()) {
  setWindowFlag(Qt::FramelessWindowHint, true);
  workspace_.setWorkspaceRoot(settings_.value(QStringLiteral("cwd")).toString());
  workspace_.refresh();
  globalConfig_.setWorkspaceRoot(workspace_.workspaceRoot());
  createMenus();
  documentSplitter_ = new QSplitter(Qt::Horizontal, this);
  editor_ = new QsciScintilla(documentSplitter_);
  preview_ = new QWebEngineView(documentSplitter_);
  documentSplitter_->addWidget(editor_);
  documentSplitter_->addWidget(preview_);
  documentSplitter_->setSizes(splitViewSizes_);
  documentSplitter_->setHandleWidth(2);
  setCentralWidget(createApplicationChrome(documentSplitter_));
  if (!settings_.value(QStringLiteral("editor.split"), true).toBool()) {
    setEditorViewMode(settings_.value(QStringLiteral("editor.editing"), true).toBool()
                          ? EditorViewMode::Edit
                          : EditorViewMode::Preview);
  }
  refreshWorkspaceViews();

  if (options_.overlayEnabled) {
    status_ = new QLabel(this);
    status_->setContentsMargins(6, 0, 6, 0);
    statusBar()->addPermanentWidget(status_, 1);
    statusBar()->setSizeGripEnabled(false);
  } else {
    statusBar()->hide();
  }
  setStyleSheet(QStringLiteral(
      "QMainWindow, QStatusBar { background: #1f1f1f; color: #f6f6f6; }"
      "QStatusBar { border-top: 1px solid #000; font-size: 11px; }"
      "QToolBar { background: #262626; border: 0; border-bottom: 1px solid #000; spacing: 4px; padding: 4px 8px; }"
      "QToolButton { color: #eee; background: transparent; border: 1px solid transparent; border-radius: 6px; padding: 5px 9px; }"
      "QToolButton:hover { background: rgba(255,255,255,0.07); border-color: #3f3f3f; }"
      "QToolButton:pressed, QToolButton:checked { background: rgba(255,255,255,0.11); }"
      "QPushButton#fileMenuButton { color: #ededed; background: transparent; border: 0; border-radius: 6px; padding: 7px 9px; text-align: left; }"
      "QPushButton#fileMenuButton:hover { background: rgba(255,255,255,0.06); }"
      "QPushButton#fileMenuButton:pressed { background: rgba(255,255,255,0.1); }"
      "QPushButton#fileMenuButton:disabled { color: #666; }"
      "QWidget#documentToolbar { background: #262626; border-bottom: 1px solid #000; }"
      "QToolButton#windowButton { border-radius: 0; min-width: 34px; padding: 5px 8px; }"
      "QToolButton#closeWindowButton { border-radius: 0; min-width: 38px; padding: 5px 8px; }"
      "QToolButton#closeWindowButton:hover { background: #c42b1c; border-color: #c42b1c; }"
      "QSplitter::handle { background: #000; }"
      "QWidget#activityBar { background: #0f0f0f; border-right: 1px solid #000; }"
      "QWidget#navigationPane { background: #161616; border-right: 1px solid #000; }"
      "QWidget#graphPage, QWidget#workspaceGraph { background: #202020; }"
      "QWidget#graphControls { background: #1b1b1b; border-right: 1px solid #000; }"
      "QWidget#graphToolbar, QWidget#graphZoomControls { background: #171717; border-bottom: 1px solid #333; }"
      "QWidget#graphZoomControls { border-top: 1px solid #333; border-bottom: 0; }"
      "QLabel#paneHeading { color: #b9b9b9; font-size: 11px; font-weight: 600; letter-spacing: 1px; }"
      "QLabel#panelDescription { color: #999; line-height: 1.4; }"
      "QGroupBox { color: #ddd; border: 1px solid #353535; border-radius: 7px; margin-top: 10px; padding: 10px 7px 7px; font-weight: 600; }"
      "QGroupBox::title { subcontrol-origin: margin; left: 8px; padding: 0 4px; }"
      "QCheckBox, QComboBox { color: #ddd; }"
      "QComboBox { background: #242424; border: 1px solid #3b3b3b; border-radius: 5px; padding: 4px 7px; }"
      "QLineEdit#navigationSearch { background: #242424; color: #f6f6f6; border: 1px solid #363636; border-radius: 6px; padding: 6px 8px; }"
      "QLineEdit#navigationSearch:focus { border-color: #6796e6; }"
      "QWidget#findBar { background: #252525; border-bottom: 1px solid #3b3b3b; }"
      "QWidget#findBar QLineEdit { background: #1b1b1b; color: #eee; border: 1px solid #474747; border-radius: 4px; padding: 4px 6px; }"
      "QListWidget#noteList, QTreeWidget#noteList { background: transparent; color: #e8e8e8; border: 0; outline: 0; }"
      "QListWidget#noteList::item, QTreeWidget#noteList::item { min-height: 28px; padding: 2px 5px; border-radius: 6px; }"
      "QListWidget#noteList::item:hover, QTreeWidget#noteList::item:hover { background: rgba(255,255,255,0.05); }"
      "QListWidget#noteList::item:selected, QTreeWidget#noteList::item:selected { background: rgba(255,255,255,0.09); color: white; }"
      "QWidget#noteTabs { background: #202020; border-bottom: 1px solid #000; }"
      "QTabBar#noteTabs { background: #202020; border-bottom: 1px solid #000; }"
      "QTabBar#noteTabs::tab { background: #292929; color: #ddd; border: 1px solid #3a3a3a; border-bottom: 0; border-radius: 7px 7px 0 0; padding: 6px 13px; margin: 4px 2px 0; min-width: 90px; }"
      "QTabBar#noteTabs::tab:selected { background: #1f1f1f; color: white; border-color: #777; }"
      "QTabBar#noteTabs::tab:hover:!selected { background: #343434; }"
      "QWidget#settingsPage { background: #171717; }"
      "QFrame#settingsHero, QFrame#settingsCard { background: #2d3035; border: 1px solid #4a4f57; border-radius: 16px; }"
      "QLabel#settingsPageTitle { color: #fff; font-size: 21px; font-weight: 700; }"
      "QLabel#settingsSectionTitle { color: #f6f6f6; font-size: 16px; font-weight: 700; }"
      "QLabel#settingsRowTitle { color: #f5f5f5; font-weight: 600; }"
      "QLabel#settingsCopy { color: #b7bac0; }"
      "QFrame#settingsSeparator { background: #45494f; border: 0; max-height: 1px; }"
      "QCheckBox#settingsSwitch { spacing: 0; }"
      "QCheckBox#settingsSwitch::indicator { width: 42px; height: 22px; border-radius: 11px; border: 1px solid #73777f; background: #454950; }"
      "QCheckBox#settingsSwitch::indicator:checked { background: #3584e4; border-color: #62a0ea; }"
      "QCheckBox#settingsSwitch::indicator:disabled { background: #3b3e43; border-color: #555960; }"
      "QComboBox#settingsControl, QLineEdit#settingsControl { min-width: 150px; background: #232529; color: #eee; border: 1px solid #555a62; border-radius: 7px; padding: 6px 9px; }"));
  renderTimer_.setSingleShot(true);
  renderTimer_.setInterval(120);
  connect(&renderTimer_, &QTimer::timeout, this, &MainWindow::renderDocument);
  connect(&renderWatcher_, &QFutureWatcher<RenderResult>::finished,
          this, &MainWindow::finishRenderWrite);
  autosaveTimer_.setSingleShot(true);
  autosaveTimer_.setInterval(750);
  connect(&autosaveTimer_, &QTimer::timeout,
          this, &MainWindow::autosaveActiveDocument);
  connect(&autosaveWriteWatcher_,
          &QFutureWatcher<AsyncDocumentSaveResult>::finished,
          this, [this] { finishAutosaveWrite(); });
  infoRefreshTimer_.setSingleShot(true);
  infoRefreshTimer_.setInterval(1250);
  connect(&infoRefreshTimer_, &QTimer::timeout,
          this, &MainWindow::updateInfoPanel);
  if (options_.overlayEnabled) {
    usageTimer_.setInterval(1000);
    connect(&usageTimer_, &QTimer::timeout, this, &MainWindow::sampleProcessUsage);
    usageTimer_.start();
  }
  connect(editor_, &QsciScintilla::textChanged, this, &MainWindow::scheduleRender);
  connect(editor_, &QsciScintilla::textChanged, this, [this] {
    if (!switchingDocuments_ && document_.has_value()) {
      editorModifiedAt_ = QDateTime::currentDateTimeUtc();
      if (!handlingWorkspaceChanges_) {
        autosaveTimer_.start();
        infoRefreshTimer_.start();
      }
    }
    ++spellcheckGeneration_;
    spellcheckTimer_.start();
    if (!switchingDocuments_ && !handlingWorkspaceChanges_ && !applyingEditorTransform_ &&
        !globalConfig_.value(QStringLiteral("monaco.disableAutomaticTableFormatting"), false).toBool()) {
      int line = 0;
      int index = 0;
      editor_->getCursorPosition(&line, &index);
      tableTouchedLines_.insert(std::max(0, line - 1));
      tableTouchedLines_.insert(line);
      tableTouchedLines_.insert(std::min(editor_->lines() - 1, line + 1));
      tableFormatTimer_.start();
    }
  });
  tableFormatTimer_.setSingleShot(true);
  connect(&tableFormatTimer_, &QTimer::timeout, this, &MainWindow::formatTouchedTables);
  emojiCompletions_ = MarkdownCompletion::loadEmojiMap(QStringLiteral(QT_EDITOR_EMOJI_JSON));
  connect(editor_, &QsciScintilla::SCN_CHARADDED, this, [this](int) {
    updateMarkdownCompletions();
  });
  connect(editor_, &QsciScintilla::userListActivated, this,
          [this](int id, const QString& label) {
    if (id != 71 || completionReplaceStartByte_ < 0 ||
        !completionInsertions_.contains(label)) return;
    const QByteArray replacement = completionInsertions_.value(label).toUtf8();
    replaceEditorRange(completionReplaceStartByte_, completionReplaceEndByte_,
                       QString::fromUtf8(replacement),
                       completionReplaceStartByte_ + replacement.size());
    completionInsertions_.clear();
    completionReplaceStartByte_ = -1;
    completionReplaceEndByte_ = -1;
  });
  spellcheckTimer_.setSingleShot(true);
  spellcheckTimer_.setInterval(200);
  connect(editor_->verticalScrollBar(), &QScrollBar::valueChanged, this, [this] {
    ++spellcheckGeneration_;
    spellcheckTimer_.start();
  });
  connect(&spellcheckTimer_, &QTimer::timeout, this, [this] {
    const bool batterySpellcheckDisabled =
        globalConfig_.value(QStringLiteral("battery.enabled"), false).toBool() &&
        globalConfig_.value(QStringLiteral("battery.disableSpellcheck"), false).toBool();
    if (spellcheckWatcher_.isRunning() ||
        globalConfig_.value(QStringLiteral("spellcheck.disable"), false).toBool() ||
        batterySpellcheckDisabled ||
        !SpellChecker::isAvailable()) return;

    const int lineCount = editor_->lines();
    if (lineCount <= 0) return;
    constexpr int lineBuffer = 8;
    const int firstVisibleLine = std::clamp(editor_->firstVisibleLine(), 0, lineCount - 1);
    const int visibleLineCount = std::max(
        1, static_cast<int>(editor_->SendScintilla(QsciScintilla::SCI_LINESONSCREEN)));
    const int startLine = std::max(0, firstVisibleLine - lineBuffer);
    const int endLine = std::min(lineCount - 1, firstVisibleLine + visibleLineCount + lineBuffer);
    const int startByte = editor_->positionFromLineIndex(startLine, 0);
    const int endByte = endLine + 1 < lineCount
        ? editor_->positionFromLineIndex(endLine + 1, 0)
        : editor_->length();
    QByteArray visibleUtf8(endByte - startByte + 1, '\0');
    editor_->SendScintilla(QsciScintilla::SCI_GETTEXTRANGE,
                           static_cast<long>(startByte), static_cast<long>(endByte),
                           visibleUtf8.data());
    visibleUtf8.truncate(endByte - startByte);

    spellcheckRequestGeneration_ = spellcheckGeneration_;
    spellcheckRequestStartByte_ = startByte;
    QStringList addedWords;
    const QVariant words = globalConfig_.value(QStringLiteral("spellcheck.addedWords"));
    for (const QVariant& word : words.toList()) addedWords.append(word.toString());
    if (addedWords.isEmpty()) addedWords = words.toStringList();
    spellcheckWatcher_.setFuture(QtConcurrent::run(
        [source = QString::fromUtf8(visibleUtf8), addedWords] {
          return SpellChecker::check(source, addedWords);
        }));
  });
  connect(&spellcheckWatcher_, &QFutureWatcher<QVector<SpellingIssue>>::finished, this, [this] {
    if (spellcheckRequestGeneration_ != spellcheckGeneration_) {
      spellcheckTimer_.start();
      return;
    }
    spellingIssues_ = spellcheckWatcher_.result();
    for (SpellingIssue& issue : spellingIssues_) {
      issue.startByte += spellcheckRequestStartByte_;
    }
    editor_->SendScintilla(QsciScintilla::SCI_SETINDICATORCURRENT, spellcheckIndicator_);
    editor_->SendScintilla(QsciScintilla::SCI_INDICATORCLEARRANGE,
                           0, editor_->length());
    for (const SpellingIssue& issue : spellingIssues_) {
      editor_->SendScintilla(QsciScintilla::SCI_INDICATORFILLRANGE,
                             issue.startByte, issue.lengthBytes);
    }
    spellcheckAppliedGeneration_ = spellcheckRequestGeneration_;
  });
  editor_->installEventFilter(this);
  editor_->viewport()->installEventFilter(this);
  connect(editor_, &QsciScintilla::modificationChanged, this, &MainWindow::updateWindowTitle);
  connect(bridge_, &PreviewBridge::browserMetricsChanged, this, &MainWindow::updateStatus);
  connect(bridge_, &PreviewBridge::plantUmlRenderRequested,
          plantUmlRenderer_, &PlantUmlRenderer::requestRenderBatch);
  connect(plantUmlRenderer_, &PlantUmlRenderer::resultsReady,
          bridge_, &PreviewBridge::publishPlantUmlResults);
  connect(workspaceWatcher_, &WorkspaceWatcher::changesDetected,
          this, &MainWindow::handleWorkspaceChanges);
  connect(bridge_, &PreviewBridge::internalLinkRequested, this,
          [this](const QString& kind, const QString& target) {
    if (kind == QStringLiteral("note")) {
      const QString path = workspace_.resolveNoteTarget(target);
      if (!path.isEmpty()) openFile(path);
      else statusBar()->showMessage(QStringLiteral("Note link target was not found."), 4000);
      return;
    }
    if (kind == QStringLiteral("attachment")) {
      const QString path = workspace_.resolveAttachmentTarget(target);
      if (!path.isEmpty()) QDesktopServices::openUrl(QUrl::fromLocalFile(path));
      else statusBar()->showMessage(QStringLiteral("Attachment link target was not found."), 4000);
      return;
    }
    if (kind == QStringLiteral("file")) {
      const QString path = workspace_.resolveLocalFileTarget(target, currentPath_);
      if (!path.isEmpty()) QDesktopServices::openUrl(QUrl::fromLocalFile(path));
      else statusBar()->showMessage(QStringLiteral("Local file link was blocked because it is outside the workspace."), 5000);
      return;
    }
    const QString tag = QUrl::fromPercentEncoding(target.toUtf8());
    const QList<QTreeWidgetItem*> items = noteTree_->findItems(
        QStringLiteral("*"), Qt::MatchWildcard | Qt::MatchRecursive);
    for (QTreeWidgetItem* item : items) {
      if (item->data(0, Qt::UserRole + 1).toString().compare(tag, Qt::CaseInsensitive) != 0) continue;
      for (QTreeWidgetItem* ancestor = item->parent(); ancestor != nullptr; ancestor = ancestor->parent()) {
        ancestor->setExpanded(true);
      }
      noteTree_->setCurrentItem(item);
      noteTree_->scrollToItem(item);
      break;
    }
  });
  const auto applyPreviewEdit = [this](const QString& nextSource) {
    if (nextSource == editor_->text()) return;
    QScopedValueRollback applying(applyingEditorTransform_, true);
    int line = 0;
    int index = 0;
    editor_->getCursorPosition(&line, &index);
    const long firstVisibleLine = editor_->SendScintilla(QsciScintilla::SCI_GETFIRSTVISIBLELINE);
    editor_->setText(nextSource);
    editor_->setModified(true);
    editor_->setCursorPosition(line, index);
    editor_->SendScintilla(QsciScintilla::SCI_SETFIRSTVISIBLELINE, firstVisibleLine);
  };
  connect(bridge_, &PreviewBridge::taskToggleRequested, this,
          [this, applyPreviewEdit](qsizetype taskIndex, bool checked) {
    applyPreviewEdit(MarkdownEdits::setTaskChecked(editor_->text(), taskIndex, checked));
    autosaveActiveDocument();
  });
  connect(bridge_, &PreviewBridge::detailsToggleRequested, this,
          [this, applyPreviewEdit](qsizetype detailsIndex, bool open) {
    applyPreviewEdit(MarkdownEdits::setDetailsOpen(editor_->text(), detailsIndex, open));
    autosaveActiveDocument();
  });
  connect(bridge_, &PreviewBridge::clientReady, this, [this](const QString& role) {
    if (role != QStringLiteral("preview")) return;
    previewReady_ = true;
    renderDocument();
  });

  configureEditor();
  applyGlobalConfiguration();
  configurePreview();
  const SyncMode configuredSyncMode = globalConfig_.value(QStringLiteral("preview.disableSplitViewSync"), false).toBool()
      ? SyncMode::Disabled : options_.syncMode;
  sync_ = new SyncController(editor_, bridge_, configuredSyncMode, this);
  connect(sync_, &SyncController::syncMetricsChanged, this, [this](const QJsonObject& metrics) {
    for (auto it = metrics.begin(); it != metrics.end(); ++it) lastBrowserMetrics_.insert(it.key(), it.value());
    updateStatus();
  });
  QStringList restoredTabs;
  const QVariant restoredTabsValue = settings_.value(QStringLiteral("editor.openTabs"));
  for (const QVariant& path : restoredTabsValue.toList()) restoredTabs.append(path.toString());
  if (restoredTabs.isEmpty()) restoredTabs = restoredTabsValue.toStringList();
  for (const QString& path : restoredTabs) {
    if (QFileInfo(path).isFile()) openFile(path);
  }
  const QString restoredActive = settings_.value(QStringLiteral("editor.activeTab")).toString();
  for (int index = 0; index < openDocuments_.size(); ++index) {
    if (openDocuments_.at(index).document.path() == restoredActive) {
      noteTabs_->setCurrentIndex(index);
      break;
    }
  }
  if (!workspace_.workspaceRoot().isEmpty()) {
    workspaceWatcher_->setWorkspaceRoot(workspace_.workspaceRoot());
    workspaceWatcher_->start();
  }
  updateStatus();
}

MainWindow::~MainWindow() {
  if (renderWatcher_.isRunning()) renderWatcher_.future().waitForFinished();
  delete pipeline_;
}

QWidget* MainWindow::createApplicationChrome(QSplitter* documentSplitter) {
  auto* root = new QWidget(this);
  auto* rootLayout = new QHBoxLayout(root);
  rootLayout->setContentsMargins(0, 0, 0, 0);
  rootLayout->setSpacing(0);

  QWidget* navigationPane = createNavigationPane();
  rootLayout->addWidget(createActivityBar(navigationPane));

  auto* documentView = new QWidget(root);
  auto* documentLayout = new QVBoxLayout(documentView);
  documentLayout->setContentsMargins(0, 0, 0, 0);
  documentLayout->setSpacing(0);

  noteTabs_ = new ElidingTabBar(documentView);
  noteTabs_->setObjectName(QStringLiteral("noteTabs"));
  noteTabs_->setTabsClosable(true);
  noteTabs_->setMovable(true);
  noteTabs_->setExpanding(false);
  noteTabs_->setDocumentMode(true);
  connect(noteTabs_, &QTabBar::currentChanged, this, &MainWindow::activateDocument);
  connect(noteTabs_, &QTabBar::tabCloseRequested, this, &MainWindow::closeDocument);
  connect(noteTabs_, &QTabBar::tabMoved, this, [this](int from, int to) {
    if (from == to || from < 0 || to < 0 || from >= openDocuments_.size() || to >= openDocuments_.size()) return;
    openDocuments_.move(from, to);
    activeDocumentIndex_ = noteTabs_->currentIndex();
    persistOpenTabs();
  });
  documentLayout->addWidget(noteTabs_);
  documentLayout->addWidget(createFindBar());
  documentLayout->addWidget(documentSplitter, 1);
  mainContentStack_ = new QStackedWidget(root);
  mainContentStack_->addWidget(documentView);
  mainContentStack_->addWidget(createGraphPage());
  mainContentStack_->addWidget(createHelpPanel());
  mainContentStack_->addWidget(createSettingsPanel());
  const QString initialPanel = settings_.value(QStringLiteral("window.panel"), QStringLiteral("explorer")).toString();
  if (initialPanel == QStringLiteral("graph")) {
    navigationPane->hide();
    mainContentStack_->setCurrentIndex(1);
  } else if (initialPanel == QStringLiteral("help")) {
    navigationPane->hide();
    mainContentStack_->setCurrentIndex(2);
  } else if (initialPanel == QStringLiteral("settings")) {
    navigationPane->hide();
    mainContentStack_->setCurrentIndex(3);
  }

  auto* mainArea = new QWidget(root);
  auto* mainAreaLayout = new QVBoxLayout(mainArea);
  mainAreaLayout->setContentsMargins(0, 0, 0, 0);
  mainAreaLayout->setSpacing(0);
  mainAreaLayout->addWidget(createDocumentToolbar());
  mainAreaLayout->addWidget(mainContentStack_, 1);

  auto* workspaceSplitter = new QSplitter(Qt::Horizontal, root);
  workspaceSplitter->setObjectName(QStringLiteral("workspaceSplitter"));
  workspaceSplitter->setHandleWidth(2);
  workspaceSplitter->setChildrenCollapsible(false);
  workspaceSplitter->addWidget(navigationPane);
  workspaceSplitter->addWidget(mainArea);
  workspaceSplitter->setStretchFactor(0, 0);
  workspaceSplitter->setStretchFactor(1, 1);
  workspaceSplitter->setSizes({275, 1165});
  rootLayout->addWidget(workspaceSplitter, 1);
  return root;
}

QWidget* MainWindow::createFindBar() {
  findBar_ = new QWidget(this);
  findBar_->setObjectName(QStringLiteral("findBar"));
  auto* layout = new QHBoxLayout(findBar_);
  layout->setContentsMargins(8, 5, 8, 5);
  layout->setSpacing(5);
  findInput_ = new QLineEdit(findBar_);
  findInput_->setPlaceholderText(QStringLiteral("Find"));
  findInput_->setClearButtonEnabled(true);
  replaceInput_ = new QLineEdit(findBar_);
  replaceInput_->setPlaceholderText(QStringLiteral("Replace"));
  replaceInput_->setClearButtonEnabled(true);
  findCaseSensitive_ = new QCheckBox(QStringLiteral("Aa"), findBar_);
  findCaseSensitive_->setToolTip(QStringLiteral("Match case"));
  findWholeWord_ = new QCheckBox(QStringLiteral("Word"), findBar_);
  findWholeWord_->setToolTip(QStringLiteral("Match whole word"));
  findRegex_ = new QCheckBox(QStringLiteral(".*"), findBar_);
  findRegex_->setToolTip(QStringLiteral("Use regular expression"));
  findStatus_ = new QLabel(findBar_);
  findStatus_->setMinimumWidth(70);
  const auto button = [this, layout](const QString& text, const QString& tooltip, auto callback) {
    auto* result = new QToolButton(findBar_);
    result->setText(text);
    result->setToolTip(tooltip);
    connect(result, &QToolButton::clicked, this, callback);
    layout->addWidget(result);
    return result;
  };
  replaceModeButton_ = new QToolButton(findBar_);
  replaceModeButton_->setText(QStringLiteral("▸ Replace"));
  replaceModeButton_->setToolTip(QStringLiteral("Show or hide replace controls (Ctrl+H)"));
  replaceModeButton_->setCheckable(true);
  connect(replaceModeButton_, &QToolButton::toggled, this, [this](bool visible) {
    replaceModeButton_->setText(visible ? QStringLiteral("▾ Replace")
                                        : QStringLiteral("▸ Replace"));
    replaceInput_->setVisible(visible);
    replaceCurrentButton_->setVisible(visible);
    replaceAllButton_->setVisible(visible);
    if (visible) replaceInput_->setFocus();
  });
  layout->addWidget(replaceModeButton_);
  layout->addWidget(findInput_, 2);
  layout->addWidget(replaceInput_, 2);
  layout->addWidget(findCaseSensitive_);
  layout->addWidget(findWholeWord_);
  layout->addWidget(findRegex_);
  layout->addWidget(findStatus_);
  button(QStringLiteral("↑"), QStringLiteral("Previous match (Shift+F3)"), [this] { findInEditor(false); });
  button(QStringLiteral("↓"), QStringLiteral("Next match (F3)"), [this] { findInEditor(true); });
  replaceCurrentButton_ = button(QStringLiteral("Replace"), QStringLiteral("Replace current match"),
                                 [this] { replaceCurrentMatch(); });
  replaceAllButton_ = button(QStringLiteral("All"), QStringLiteral("Replace all matches"),
                             [this] { replaceAllMatches(); });
  button(QStringLiteral("×"), QStringLiteral("Close"), [this] { findBar_->hide(); editor_->setFocus(); });
  connect(findInput_, &QLineEdit::returnPressed, this, [this] { findInEditor(true); });
  connect(replaceInput_, &QLineEdit::returnPressed, this, &MainWindow::replaceCurrentMatch);
  replaceInput_->hide();
  replaceCurrentButton_->hide();
  replaceAllButton_->hide();
  findBar_->hide();
  return findBar_;
}

QWidget* MainWindow::createActivityBar(QWidget* navigationPane) {
  auto* activityBar = new QWidget(this);
  activityBar->setObjectName(QStringLiteral("activityBar"));
  activityBar->setFixedWidth(58);
  auto* layout = new QVBoxLayout(activityBar);
  layout->setContentsMargins(5, 8, 5, 8);
  layout->setSpacing(5);

  const auto addButton = [activityBar, layout](const QIcon& icon, const QString& tooltip) {
    auto* button = new QToolButton(activityBar);
    button->setIcon(icon);
    button->setIconSize(QSize(23, 23));
    button->setToolTip(tooltip);
    button->setFixedSize(46, 42);
    button->setCheckable(true);
    layout->addWidget(button, 0, Qt::AlignHCenter);
    return button;
  };

  auto* panelGroup = new QButtonGroup(activityBar);
  panelGroup->setExclusive(true);
  QToolButton* file = addButton(referenceIcon(QStringLiteral("notebook-multiple")),
                                QStringLiteral("File and note actions"));
  QToolButton* explorer = addButton(referenceIcon(QStringLiteral("notebook")),
                                    QStringLiteral("Explorer"));
  QToolButton* search = addButton(referenceIcon(QStringLiteral("magnify")),
                                  QStringLiteral("Global search"));
  QToolButton* graph = addButton(referenceIcon(QStringLiteral("tag-multiple")),
                                 QStringLiteral("Graph"));
  QToolButton* info = addButton(referenceIcon(QStringLiteral("info")),
                                QStringLiteral("Note information"));
  panelGroup->addButton(file, 0);
  panelGroup->addButton(explorer, 1);
  panelGroup->addButton(search, 2);
  panelGroup->addButton(graph, 3);
  panelGroup->addButton(info, 4);
  connect(panelGroup, &QButtonGroup::idClicked, this, [this, navigationPane, panelGroup](int index) {
    QAbstractButton* selected = panelGroup->button(index);
    static const QStringList panelNames = {
        QStringLiteral("file"), QStringLiteral("explorer"), QStringLiteral("search"),
        QStringLiteral("graph"), QStringLiteral("info"), QStringLiteral("help"), QStringLiteral("settings")};
    const auto persistPanel = [this](const QVariant& value) {
      settings_.setValue(QStringLiteral("window.panel"), value);
      QString errorMessage;
      if (!settings_.save(&errorMessage)) qWarning() << "Unable to save panel setting:" << errorMessage;
    };
    const int pageIndex = index == 3 ? 1 : index == 5 ? 2 : index == 6 ? 3 : -1;
    if (pageIndex >= 0) {
      if (mainContentStack_->currentIndex() == pageIndex) {
        mainContentStack_->setCurrentIndex(0);
        panelGroup->setExclusive(false);
        selected->setChecked(false);
        panelGroup->setExclusive(true);
        persistPanel(QVariant());
      } else {
        navigationPane->hide();
        mainContentStack_->setCurrentIndex(pageIndex);
        selected->setChecked(true);
        persistPanel(panelNames.at(index));
      }
      return;
    }
    mainContentStack_->setCurrentIndex(0);
    const int navigationIndex = index == 4 ? 3 : index;
    if (navigationPane->isVisible() && navigationStack_->currentIndex() == navigationIndex) {
      navigationPane->hide();
      panelGroup->setExclusive(false);
      selected->setChecked(false);
      panelGroup->setExclusive(true);
      persistPanel(QVariant());
      return;
    }
    navigationStack_->setCurrentIndex(navigationIndex);
    navigationPane->show();
    selected->setChecked(true);
    persistPanel(panelNames.at(index));
  });
  layout->addStretch();
  QToolButton* help = addButton(referenceIcon(QStringLiteral("note")),
                                QStringLiteral("Cheatsheets"));
  QToolButton* settings = addButton(
      QIcon::fromTheme(QStringLiteral("preferences-system"),
                       referenceIcon(QStringLiteral("pencil"))),
      QStringLiteral("Settings"));
  panelGroup->addButton(help, 5);
  panelGroup->addButton(settings, 6);
  const QString initialPanel = settings_.value(QStringLiteral("window.panel"), QStringLiteral("explorer")).toString();
  const QStringList names = {
      QStringLiteral("file"), QStringLiteral("explorer"), QStringLiteral("search"),
      QStringLiteral("graph"), QStringLiteral("info"), QStringLiteral("help"), QStringLiteral("settings")};
  const int initialIndex = static_cast<int>(std::max<qsizetype>(0, names.indexOf(initialPanel)));
  if (QAbstractButton* initialButton = panelGroup->button(initialIndex)) initialButton->setChecked(true);
  if (initialIndex == 0 || initialIndex == 1 || initialIndex == 2) {
    navigationStack_->setCurrentIndex(initialIndex);
  } else if (initialIndex == 4) {
    navigationStack_->setCurrentIndex(3);
  }
  return activityBar;
}

QWidget* MainWindow::createDocumentToolbar() {
  auto* toolbar = new QWidget(this);
  toolbar->setObjectName(QStringLiteral("documentToolbar"));
  toolbar->setFixedHeight(40);
  auto* layout = new QHBoxLayout(toolbar);
  layout->setContentsMargins(7, 3, 0, 3);
  layout->setSpacing(3);

  const auto addTool = [toolbar, layout](const QIcon& icon, const QString& tooltip, bool enabled = false) {
    auto* button = new QToolButton(toolbar);
    button->setIcon(icon);
    button->setIconSize(QSize(19, 19));
    button->setToolTip(tooltip);
    button->setEnabled(enabled);
    button->setFixedHeight(31);
    layout->addWidget(button);
    return button;
  };
  const auto bindAction = [](QToolButton* button, QAction* action) {
    button->setEnabled(action->isEnabled());
    QObject::connect(action, &QAction::changed, button, [button, action] {
      button->setEnabled(action->isEnabled());
      if (button->isCheckable()) button->setChecked(action->isChecked());
    });
  };
  auto* edit = addTool(referenceIcon(QStringLiteral("pencil")), QStringLiteral("Toggle editing"), true);
  edit->setCheckable(true);
  edit->setChecked(true);
  connect(edit, &QToolButton::toggled, editAction_, &QAction::setChecked);
  bindAction(edit, editAction_);
  auto* split = addTool(referenceIcon(QStringLiteral("split-view")),
                        QStringLiteral("Toggle split view (Ctrl+Alt+S)"), true);
  split->setCheckable(true);
  split->setChecked(true);
  connect(split, &QToolButton::clicked, splitAction_, &QAction::trigger);
  bindAction(split, splitAction_);
  auto* tags = addTool(referenceIcon(QStringLiteral("tag-multiple")), QStringLiteral("Edit tags"), true);
  connect(tags, &QToolButton::clicked, tagsAction_, &QAction::trigger);
  bindAction(tags, tagsAction_);
  auto* attachments = addTool(referenceIcon(QStringLiteral("paperclip")), QStringLiteral("Add attachment"), true);
  connect(attachments, &QToolButton::clicked, attachmentsAction_, &QAction::trigger);
  bindAction(attachments, attachmentsAction_);
  auto* favorite = addTool(referenceToggleIcon(QStringLiteral("star-outline"), QStringLiteral("star")),
                           QStringLiteral("Favorite or unfavorite"), true);
  favorite->setCheckable(true);
  connect(favorite, &QToolButton::clicked, favoriteAction_, &QAction::trigger);
  bindAction(favorite, favoriteAction_);
  auto* pin = addTool(referenceToggleIcon(QStringLiteral("pin-outline"), QStringLiteral("pin")),
                      QStringLiteral("Pin or unpin"), true);
  pin->setCheckable(true);
  connect(pin, &QToolButton::clicked, pinAction_, &QAction::trigger);
  bindAction(pin, pinAction_);
  auto* trash = addTool(referenceIcon(QStringLiteral("delete")),
                        QStringLiteral("Move to trash or restore"), true);
  connect(trash, &QToolButton::clicked, trashAction_, &QAction::trigger);
  bindAction(trash, trashAction_);

  layout->addWidget(new WindowDragBar(toolbar), 1);

  auto* minimize = addTool(QIcon(), QStringLiteral("Minimize"), true);
  minimize->setObjectName(QStringLiteral("windowButton"));
  minimize->setIcon(style()->standardIcon(QStyle::SP_TitleBarMinButton));
  minimize->setIconSize(QSize(13, 13));
  minimize->setFixedSize(34, 28);
  connect(minimize, &QToolButton::clicked, this, &QWidget::showMinimized);
  auto* maximize = addTool(QIcon(), QStringLiteral("Maximize or restore"), true);
  maximize->setObjectName(QStringLiteral("windowButton"));
  maximize->setIcon(style()->standardIcon(QStyle::SP_TitleBarMaxButton));
  maximize->setIconSize(QSize(13, 13));
  maximize->setFixedSize(34, 28);
  connect(maximize, &QToolButton::clicked, this, [this] {
    isMaximized() ? showNormal() : showMaximized();
  });
  auto* close = addTool(QIcon(), QStringLiteral("Close"), true);
  close->setObjectName(QStringLiteral("closeWindowButton"));
  close->setIcon(style()->standardIcon(QStyle::SP_TitleBarCloseButton));
  close->setIconSize(QSize(14, 14));
  close->setFixedSize(38, 28);
  connect(close, &QToolButton::clicked, this, &QWidget::close);
  return toolbar;
}

QWidget* MainWindow::createNavigationPane() {
  auto* navigationPane = new QWidget(this);
  navigationPane->setObjectName(QStringLiteral("navigationPane"));
  navigationPane->setMinimumWidth(190);
  navigationPane->setMaximumWidth(520);
  auto* layout = new QVBoxLayout(navigationPane);
  layout->setContentsMargins(0, 0, 0, 0);
  layout->setSpacing(0);

  navigationStack_ = new QStackedWidget(navigationPane);
  navigationStack_->addWidget(createFilePanel());
  navigationStack_->addWidget(createExplorerPanel());
  navigationStack_->addWidget(createSearchPanel());
  navigationStack_->addWidget(createInfoPanel());
  navigationStack_->setCurrentIndex(1);
  layout->addWidget(navigationStack_);
  return navigationPane;
}

QWidget* MainWindow::createFilePanel() {
  auto* panel = new QWidget(this);
  auto* layout = new QVBoxLayout(panel);
  layout->setContentsMargins(10, 11, 10, 10);
  layout->setSpacing(4);

  auto* heading = new QLabel(QStringLiteral("FILE"), panel);
  heading->setObjectName(QStringLiteral("paneHeading"));
  layout->addWidget(heading);

  const auto addSection = [layout, panel](const QString& title) {
    auto* label = new QLabel(title, panel);
    label->setObjectName(QStringLiteral("paneHeading"));
    label->setStyleSheet(QStringLiteral("margin-top: 12px; color: #777;"));
    layout->addWidget(label);
  };
  const auto addButton = [layout, panel](const QString& text, QAction* action) {
    auto* button = new QPushButton(text, panel);
    button->setObjectName(QStringLiteral("fileMenuButton"));
    button->setEnabled(action == nullptr || action->isEnabled());
    if (action != nullptr) {
      QObject::connect(button, &QPushButton::clicked, action, &QAction::trigger);
      QObject::connect(action, &QAction::changed, button, [button, action] { button->setEnabled(action->isEnabled()); });
    }
    layout->addWidget(button);
    return button;
  };

  addSection(QStringLiteral("DOCUMENT"));
  addButton(QStringLiteral("Open…                         Ctrl+O"), openAction_);
  addButton(QStringLiteral("Save                            Ctrl+S"), saveAction_);
  addButton(QStringLiteral("New                              Ctrl+N"), newAction_);
  addButton(QStringLiteral("Duplicate          Ctrl+Shift+D"), duplicateAction_);
  addButton(QStringLiteral("Import Notes…"), importAction_);
  addSection(QStringLiteral("NOTE"));
  addButton(QStringLiteral("Edit / Preview                 Ctrl+E"), editAction_);
  addButton(QStringLiteral("Split View              Ctrl+Alt+S"), splitAction_);
  addButton(QStringLiteral("Edit Tags"), tagsAction_);
  addButton(QStringLiteral("Add Attachment"), attachmentsAction_);
  addButton(QStringLiteral("Favorite"), favoriteAction_);
  addButton(QStringLiteral("Pin"), pinAction_);
  addButton(QStringLiteral("Move to Trash"), trashAction_);
  addSection(QStringLiteral("EXPORT"));
  addButton(QStringLiteral("Export HTML…"), exportHtmlAction_);
  addButton(QStringLiteral("Export Markdown…"), exportMarkdownAction_);
  addButton(QStringLiteral("Export PDF…"), exportPdfAction_);
  layout->addStretch();
  return panel;
}

QWidget* MainWindow::createExplorerPanel() {
  auto* panel = new QWidget(this);
  auto* layout = new QVBoxLayout(panel);
  layout->setContentsMargins(10, 11, 10, 10);
  layout->setSpacing(8);

  auto* heading = new QLabel(QStringLiteral("EXPLORER"), panel);
  heading->setObjectName(QStringLiteral("paneHeading"));
  layout->addWidget(heading);
  navigationSearch_ = new QLineEdit(panel);
  navigationSearch_->setObjectName(QStringLiteral("navigationSearch"));
  navigationSearch_->setPlaceholderText(QStringLiteral("Filter notes"));
  layout->addWidget(navigationSearch_);

  noteTree_ = new QTreeWidget(panel);
  noteTree_->setObjectName(QStringLiteral("noteList"));
  noteTree_->setHeaderHidden(true);
  noteTree_->setIndentation(14);
  noteTree_->setIconSize(QSize(32, 16));
  noteTree_->setAnimated(false);
  layout->addWidget(noteTree_, 1);

  connect(navigationSearch_, &QLineEdit::textChanged, this, [this](const QString& query) {
    const QStringList tokens = query.simplified().split(QLatin1Char(' '), Qt::SkipEmptyParts);
    std::function<bool(QTreeWidgetItem*)> filter = [&](QTreeWidgetItem* item) {
      bool childVisible = false;
      for (int index = 0; index < item->childCount(); ++index) childVisible |= filter(item->child(index));
      const bool isNote = !item->data(0, Qt::UserRole).toString().isEmpty();
      const bool matches = tokens.isEmpty() || (isNote && std::all_of(tokens.begin(), tokens.end(), [item](const QString& token) {
        return item->text(0).contains(token, Qt::CaseInsensitive);
      }));
      const bool visible = isNote ? matches : (tokens.isEmpty() || childVisible);
      item->setHidden(!visible);
      if (!tokens.isEmpty() && childVisible) item->setExpanded(true);
      return visible;
    };
    for (int index = 0; index < noteTree_->topLevelItemCount(); ++index) filter(noteTree_->topLevelItem(index));
  });
  connect(noteTree_, &QTreeWidget::itemActivated, this, [this](QTreeWidgetItem* item) {
    const QString path = item->data(0, Qt::UserRole).toString();
    if (!path.isEmpty()) openFile(path);
  });
  connect(noteTree_, &QTreeWidget::itemClicked, this, [this](QTreeWidgetItem* item) {
    const QString path = item->data(0, Qt::UserRole).toString();
    if (!path.isEmpty()) {
      openFile(path);
    } else if (item->childCount() > 0) {
      item->setExpanded(!item->isExpanded());
    }
  });
  const auto persistCollapse = [this](QTreeWidgetItem* item, bool collapsed) {
    if (refreshingExplorer_) return;
    const QString key = item->data(0, Qt::UserRole + 1).toString();
    if (key.isEmpty()) return;
    const bool section = key.startsWith(QStringLiteral("section:"));
    const QString settingKey = section
        ? QStringLiteral("window.explorerSectionsCollapsed")
        : QStringLiteral("window.explorerTagsCollapsed");
    QVariantMap state = settings_.value(settingKey).toMap();
    state.insert(section ? key.sliced(8) : key, collapsed);
    settings_.setValue(settingKey, state);
    QString errorMessage;
    if (!settings_.save(&errorMessage)) qWarning() << "Unable to save explorer state:" << errorMessage;
  };
  connect(noteTree_, &QTreeWidget::itemExpanded, this, [persistCollapse](QTreeWidgetItem* item) { persistCollapse(item, false); });
  connect(noteTree_, &QTreeWidget::itemCollapsed, this, [persistCollapse](QTreeWidgetItem* item) { persistCollapse(item, true); });
  return panel;
}

QWidget* MainWindow::createSearchPanel() {
  auto* panel = new QWidget(this);
  auto* layout = new QVBoxLayout(panel);
  layout->setContentsMargins(10, 11, 10, 10);
  layout->setSpacing(8);
  layout->addWidget(panelHeading(QStringLiteral("GLOBAL SEARCH"), panel));

  auto* search = new QLineEdit(panel);
  search->setObjectName(QStringLiteral("navigationSearch"));
  search->setPlaceholderText(QStringLiteral("Search notes"));
  layout->addWidget(search);

  auto* mode = new QComboBox(panel);
  mode->setObjectName(QStringLiteral("settingsControl"));
  mode->addItem(QStringLiteral("Smart"), static_cast<int>(SearchMode::Smart));
  mode->addItem(QStringLiteral("Title"), static_cast<int>(SearchMode::Title));
  mode->addItem(QStringLiteral("Content"), static_cast<int>(SearchMode::Content));
  mode->addItem(QStringLiteral("Regular expression"), static_cast<int>(SearchMode::Regex));
  layout->addWidget(mode);

  auto* scope = new QGroupBox(QStringLiteral("SCOPE"), panel);
  auto* scopeLayout = new QVBoxLayout(scope);
  auto* notes = new QCheckBox(QStringLiteral("Notes"), scope);
  notes->setChecked(true);
  auto* attachments = new QCheckBox(QStringLiteral("Attachments"), scope);
  attachments->setChecked(true);
  scopeLayout->addWidget(notes);
  scopeLayout->addWidget(attachments);
  layout->addWidget(scope);
  searchResults_ = new QListWidget(panel);
  searchResults_->setObjectName(QStringLiteral("noteList"));
  layout->addWidget(searchResults_, 1);
  connect(search, &QLineEdit::textChanged, this, [this](const QString& query) {
    pendingSearchQuery_ = query;
    pendingSearchResults_.clear();
    nextSearchResult_ = 0;
    ++searchGeneration_;
    searchTimer_.start();
  });
  connect(mode, &QComboBox::currentIndexChanged, this, [this, mode] {
    pendingSearchMode_ = static_cast<SearchMode>(mode->currentData().toInt());
    pendingSearchResults_.clear();
    nextSearchResult_ = 0;
    ++searchGeneration_;
    searchTimer_.start();
  });
  searchTimer_.setSingleShot(true);
  searchTimer_.setInterval(140);
  connect(&searchTimer_, &QTimer::timeout, this, &MainWindow::updateSearchResults);
  connect(searchResults_, &QListWidget::itemActivated, this, [this](QListWidgetItem* item) {
    const QString path = item->data(Qt::UserRole).toString();
    if (path.isEmpty()) return;
    openFile(path);
    const qsizetype sourceOffset = item->data(Qt::UserRole + 1).toLongLong();
    const qsizetype matchLength = item->data(Qt::UserRole + 2).toLongLong();
    if (sourceOffset < 0 || matchLength <= 0) return;
    const QByteArray prefix = editor_->text().first(sourceOffset).toUtf8();
    const QByteArray match = editor_->text().sliced(sourceOffset, matchLength).toUtf8();
    const long startPosition = prefix.size();
    const long endPosition = startPosition + match.size();
    const int startLine = static_cast<int>(editor_->SendScintilla(QsciScintilla::SCI_LINEFROMPOSITION, startPosition));
    const int endLine = static_cast<int>(editor_->SendScintilla(QsciScintilla::SCI_LINEFROMPOSITION, endPosition));
    const long startLinePosition = editor_->SendScintilla(QsciScintilla::SCI_POSITIONFROMLINE, startLine);
    const long endLinePosition = editor_->SendScintilla(QsciScintilla::SCI_POSITIONFROMLINE, endLine);
    editor_->setSelection(startLine, static_cast<int>(startPosition - startLinePosition),
                          endLine, static_cast<int>(endPosition - endLinePosition));
    editor_->ensureLineVisible(startLine);
    editor_->setFocus();
  });
  return panel;
}

void MainWindow::updateSearchResults() {
  ++searchGeneration_;
  const quint64 generation = searchGeneration_;
  searchResults_->clear();
  pendingSearchResults_ = workspace_.searchWithSnippets(pendingSearchQuery_, pendingSearchMode_);
  nextSearchResult_ = 0;
  if (pendingSearchQuery_.trimmed().isEmpty()) return;
  if (pendingSearchResults_.isEmpty()) {
    auto* empty = new QListWidgetItem(QStringLiteral("No notes found"), searchResults_);
    empty->setFlags(Qt::NoItemFlags);
    return;
  }
  appendSearchResultBatch(generation);
}

void MainWindow::appendSearchResultBatch(quint64 generation) {
  if (generation != searchGeneration_ || searchResults_ == nullptr) return;
  constexpr qsizetype batchSize = 16;
  const qsizetype end = std::min(pendingSearchResults_.size(), nextSearchResult_ + batchSize);
  for (; nextSearchResult_ < end; ++nextSearchResult_) {
    const NoteSearchResult& result = pendingSearchResults_.at(nextSearchResult_);
    auto* item = new QListWidgetItem(searchResults_);
    item->setToolTip(result.note.relativePath);
    item->setData(Qt::UserRole, result.note.filePath);
    if (!result.snippets.isEmpty()) {
      item->setData(Qt::UserRole + 1, result.snippets.constFirst().sourceMatchStart);
      item->setData(Qt::UserRole + 2, result.snippets.constFirst().matchLength);
    }
    auto* card = new QWidget(searchResults_);
    auto* cardLayout = new QVBoxLayout(card);
    cardLayout->setContentsMargins(8, 7, 8, 7);
    cardLayout->setSpacing(4);
    auto* title = new QLabel(result.note.title, card);
    title->setStyleSheet(QStringLiteral("font-weight:600;color:#f4f4f4;"));
    cardLayout->addWidget(title);
    for (const SearchSnippet& snippet : result.snippets) {
      auto* preview = new QLabel(highlightedSnippetHtml(snippet), card);
      preview->setTextFormat(Qt::RichText);
      preview->setWordWrap(true);
      preview->setStyleSheet(QStringLiteral("color:#aaa;font-size:11px;"));
      cardLayout->addWidget(preview);
    }
    item->setSizeHint(card->sizeHint());
    searchResults_->setItemWidget(item, card);
  }
  if (nextSearchResult_ < pendingSearchResults_.size()) {
    QTimer::singleShot(0, searchResults_, [this, generation] { appendSearchResultBatch(generation); });
  }
}

QWidget* MainWindow::createGraphPage() {
  auto* panel = new QWidget(this);
  panel->setObjectName(QStringLiteral("graphPage"));
  auto* layout = new QHBoxLayout(panel);
  layout->setContentsMargins(0, 0, 0, 0);
  layout->setSpacing(0);

  auto* controls = new QWidget(panel);
  controls->setObjectName(QStringLiteral("graphControls"));
  controls->setMinimumWidth(260);
  controls->setMaximumWidth(420);
  auto* controlsLayout = new QVBoxLayout(controls);
  controlsLayout->setContentsMargins(12, 12, 12, 12);
  controlsLayout->setSpacing(9);
  controlsLayout->addWidget(panelHeading(QStringLiteral("WORKSPACE GRAPH"), controls));
  auto* search = new QLineEdit(controls);
  search->setObjectName(QStringLiteral("navigationSearch"));
  search->setPlaceholderText(QStringLiteral("Search nodes…"));
  search->setClearButtonEnabled(true);
  controlsLayout->addWidget(search);

  auto* types = new QGroupBox(QStringLiteral("NODE TYPES"), controls);
  auto* typesLayout = new QVBoxLayout(types);
  auto* notes = new QCheckBox(QStringLiteral("Notes"), types);
  auto* tags = new QCheckBox(QStringLiteral("Tags"), types);
  auto* attachments = new QCheckBox(QStringLiteral("Attachments"), types);
  notes->setChecked(true);
  tags->setChecked(true);
  attachments->setChecked(true);
  typesLayout->addWidget(notes);
  typesLayout->addWidget(tags);
  typesLayout->addWidget(attachments);
  controlsLayout->addWidget(types);

  auto* linkState = new QGroupBox(QStringLiteral("CONNECTIONS"), controls);
  auto* linkStateLayout = new QVBoxLayout(linkState);
  auto* linked = new QCheckBox(QStringLiteral("Linked nodes"), linkState);
  auto* unlinked = new QCheckBox(QStringLiteral("Unlinked nodes"), linkState);
  linked->setChecked(true);
  unlinked->setChecked(true);
  linkStateLayout->addWidget(linked);
  linkStateLayout->addWidget(unlinked);
  controlsLayout->addWidget(linkState);

  auto* forces = new QGroupBox(QStringLiteral("LAYOUT"), controls);
  auto* forcesLayout = new QFormLayout(forces);
  const auto addSlider = [forces, forcesLayout](const QString& label, int minimum, int maximum,
                                                int value) {
    auto* slider = new QSlider(Qt::Horizontal, forces);
    slider->setRange(minimum, maximum);
    slider->setValue(value);
    forcesLayout->addRow(label, slider);
    return slider;
  };
  QSlider* collision = addSlider(QStringLiteral("Collision radius"), 4, 64, 16);
  QSlider* linkStrength = addSlider(QStringLiteral("Link strength"), 0, 100, 45);
  QSlider* repulsion = addSlider(QStringLiteral("Repulsion"), 0, 100, 55);
  controlsLayout->addWidget(forces);

  auto* selected = new QGroupBox(QStringLiteral("SELECTION"), controls);
  auto* selectedLayout = new QVBoxLayout(selected);
  graphSelectionTitle_ = new QLabel(QStringLiteral("No node selected"), selected);
  graphSelectionTitle_->setWordWrap(true);
  graphSelectionTitle_->setStyleSheet(QStringLiteral("font-weight:600;color:#f4f4f4;"));
  graphSelectionDetail_ = panelDescription(
      QStringLiteral("Select a node for metadata; double-click to open it."), selected);
  selectedLayout->addWidget(graphSelectionTitle_);
  selectedLayout->addWidget(graphSelectionDetail_);
  controlsLayout->addWidget(selected);
  controlsLayout->addStretch();
  layout->addWidget(controls);

  auto* graphArea = new QWidget(panel);
  auto* graphLayout = new QVBoxLayout(graphArea);
  graphLayout->setContentsMargins(0, 0, 0, 0);
  graphLayout->setSpacing(0);
  auto* graphToolbar = new QWidget(graphArea);
  graphToolbar->setObjectName(QStringLiteral("graphToolbar"));
  auto* toolbarLayout = new QHBoxLayout(graphToolbar);
  toolbarLayout->setContentsMargins(8, 5, 8, 5);
  toolbarLayout->setSpacing(4);
  graphStats_ = new QLabel(QStringLiteral("0 nodes · 0 links"), graphToolbar);
  graphStats_->setStyleSheet(QStringLiteral("color:#999;"));
  toolbarLayout->addWidget(graphStats_);
  toolbarLayout->addStretch();
  const auto graphButton = [graphToolbar, toolbarLayout](const QString& text,
                                                         const QString& tooltip) {
    auto* button = new QToolButton(graphToolbar);
    button->setText(text);
    button->setToolTip(tooltip);
    toolbarLayout->addWidget(button);
    return button;
  };
  QToolButton* reset = graphButton(QStringLiteral("Reheat"), QStringLiteral("Restart force layout"));
  QToolButton* fit = graphButton(QStringLiteral("Fit"), QStringLiteral("Fit all visible nodes"));
  QToolButton* exportImage = graphButton(QStringLiteral("Export"), QStringLiteral("Export graph as PNG"));
  graphLayout->addWidget(graphToolbar);
  graphView_ = new WorkspaceGraphView(graphArea);
  graphLayout->addWidget(graphView_, 1);
  auto* zoomControls = new QWidget(graphArea);
  zoomControls->setObjectName(QStringLiteral("graphZoomControls"));
  auto* zoomLayout = new QHBoxLayout(zoomControls);
  zoomLayout->setContentsMargins(6, 4, 6, 4);
  zoomLayout->addStretch();
  auto* zoomOut = new QToolButton(zoomControls);
  zoomOut->setText(QStringLiteral("−"));
  zoomOut->setToolTip(QStringLiteral("Zoom out"));
  auto* zoomIn = new QToolButton(zoomControls);
  zoomIn->setText(QStringLiteral("+"));
  zoomIn->setToolTip(QStringLiteral("Zoom in"));
  zoomLayout->addWidget(zoomOut);
  zoomLayout->addWidget(zoomIn);
  graphLayout->addWidget(zoomControls);
  layout->addWidget(graphArea, 1);

  const auto updateTypes = [this, notes, tags, attachments] {
    graphView_->setNodeKindsVisible(notes->isChecked(), tags->isChecked(), attachments->isChecked());
  };
  const auto updateLinks = [this, linked, unlinked] {
    graphView_->setLinkStatesVisible(linked->isChecked(), unlinked->isChecked());
  };
  connect(search, &QLineEdit::textChanged, graphView_, &WorkspaceGraphView::setSearchQuery);
  connect(notes, &QCheckBox::toggled, this, updateTypes);
  connect(tags, &QCheckBox::toggled, this, updateTypes);
  connect(attachments, &QCheckBox::toggled, this, updateTypes);
  connect(linked, &QCheckBox::toggled, this, updateLinks);
  connect(unlinked, &QCheckBox::toggled, this, updateLinks);
  connect(collision, &QSlider::valueChanged, this,
          [this](int value) { graphView_->setCollisionRadius(value); });
  connect(linkStrength, &QSlider::valueChanged, this,
          [this](int value) { graphView_->setLinkStrength(value / 1000.0); });
  connect(repulsion, &QSlider::valueChanged, this,
          [this](int value) { graphView_->setRepulsionStrength(value * 18.0); });
  connect(reset, &QToolButton::clicked, graphView_, &WorkspaceGraphView::reheat);
  connect(fit, &QToolButton::clicked, graphView_, &WorkspaceGraphView::fitToView);
  connect(zoomOut, &QToolButton::clicked, this, [this] { graphView_->zoomBy(0.8); });
  connect(zoomIn, &QToolButton::clicked, this, [this] { graphView_->zoomBy(1.25); });
  connect(exportImage, &QToolButton::clicked, this, [this] {
    const QString initial = QDir(workspace_.workspaceRoot()).filePath(QStringLiteral("workspace-graph.png"));
    const QString path = QFileDialog::getSaveFileName(
        this, QStringLiteral("Export workspace graph"), initial, QStringLiteral("PNG image (*.png)"));
    if (!path.isEmpty() && !graphView_->saveImage(path)) {
      QMessageBox::warning(this, QStringLiteral("Graph export failed"),
                           QStringLiteral("The graph image could not be written."));
    }
  });
  connect(graphView_, &WorkspaceGraphView::visibleCountsChanged, this,
          [this](int nodeCount, int edgeCount) {
    graphStats_->setText(QStringLiteral("%1 nodes · %2 links").arg(nodeCount).arg(edgeCount));
  });
  connect(graphView_, &WorkspaceGraphView::nodeSelected, this,
          [this](const WorkspaceGraphNode& node, int connections) {
    const QString kind = node.kind == WorkspaceGraphNodeKind::Note ? QStringLiteral("Note")
        : node.kind == WorkspaceGraphNodeKind::Tag ? QStringLiteral("Tag")
        : QStringLiteral("Attachment");
    graphSelectionTitle_->setText(node.label);
    graphSelectionDetail_->setText(
        QStringLiteral("%1 · %2 connections\n%3").arg(kind).arg(connections).arg(node.detail));
  });
  connect(graphView_, &WorkspaceGraphView::nodeActivated, this,
          [this](const WorkspaceGraphNode& node) {
    if (node.kind == WorkspaceGraphNodeKind::Note && !node.filePath.isEmpty()) {
      openFile(node.filePath);
    } else if (node.kind == WorkspaceGraphNodeKind::Attachment && !node.filePath.isEmpty()) {
      QDesktopServices::openUrl(QUrl::fromLocalFile(node.filePath));
    }
  });
  refreshGraphPage();
  return panel;
}

QWidget* MainWindow::createInfoPanel() {
  auto* panel = new QWidget(this);
  auto* layout = new QVBoxLayout(panel);
  layout->setContentsMargins(10, 11, 10, 10);
  layout->setSpacing(8);
  layout->addWidget(panelHeading(QStringLiteral("INFO"), panel));

  auto* contents = new QGroupBox(QStringLiteral("CONTENTS"), panel);
  auto* contentsLayout = new QVBoxLayout(contents);
  outlineList_ = new QListWidget(contents);
  outlineList_->setObjectName(QStringLiteral("noteList"));
  outlineList_->setMinimumHeight(160);
  connect(outlineList_, &QListWidget::itemClicked, this, [this](QListWidgetItem* item) {
    const int headingIndex = item->data(Qt::UserRole).toInt();
    if (headingIndex < 0 || preview_ == nullptr) return;
    preview_->page()->runJavaScript(QStringLiteral(
        "document.querySelectorAll('#preview h1,#preview h2,#preview h3,#preview h4,#preview h5,#preview h6')"
        "[%1]?.scrollIntoView({behavior:'smooth',block:'start'});").arg(headingIndex));
  });
  contentsLayout->addWidget(outlineList_);
  layout->addWidget(contents);

  auto* properties = new QGroupBox(QStringLiteral("PROPERTIES"), panel);
  auto* form = new QFormLayout(properties);
  infoPath_ = new QLabel(QStringLiteral("—"), properties);
  infoPath_->setWordWrap(true);
  infoCreated_ = new QLabel(QStringLiteral("—"), properties);
  infoModified_ = new QLabel(QStringLiteral("—"), properties);
  infoTags_ = new QLabel(QStringLiteral("None"), properties);
  infoTags_->setWordWrap(true);
  infoSize_ = new QLabel(QStringLiteral("—"), properties);
  infoWords_ = new QLabel(QStringLiteral("—"), properties);
  infoLinks_ = new QLabel(QStringLiteral("—"), properties);
  infoAttachmentCount_ = new QLabel(QStringLiteral("0"), properties);
  form->addRow(QStringLiteral("Path"), infoPath_);
  form->addRow(QStringLiteral("Created"), infoCreated_);
  form->addRow(QStringLiteral("Modified"), infoModified_);
  form->addRow(QStringLiteral("Size"), infoSize_);
  form->addRow(QStringLiteral("Text"), infoWords_);
  form->addRow(QStringLiteral("Links"), infoLinks_);
  form->addRow(QStringLiteral("Tags"), infoTags_);
  form->addRow(QStringLiteral("Attachments"), infoAttachmentCount_);
  layout->addWidget(properties);

  auto* attachments = new QGroupBox(QStringLiteral("ATTACHMENTS"), panel);
  auto* attachmentsLayout = new QVBoxLayout(attachments);
  infoAttachments_ = new QListWidget(attachments);
  infoAttachments_->setObjectName(QStringLiteral("noteList"));
  infoAttachments_->setMinimumHeight(100);
  connect(infoAttachments_, &QListWidget::itemActivated, this, [](QListWidgetItem* item) {
    const QString path = item->data(Qt::UserRole).toString();
    if (!path.isEmpty()) QDesktopServices::openUrl(QUrl::fromLocalFile(path));
  });
  attachmentsLayout->addWidget(infoAttachments_);
  layout->addWidget(attachments);
  layout->addStretch();
  return panel;
}

QWidget* MainWindow::createHelpPanel() {
  auto* panel = new LazyPanel(this);
  auto* layout = new QVBoxLayout(panel);
  layout->setContentsMargins(0, 0, 0, 0);
  layout->setSpacing(0);
  auto* header = new QLabel(QStringLiteral("Cheatsheet"), panel);
  header->setStyleSheet(QStringLiteral("background:#262626;color:#aaa;border-bottom:1px solid #000;padding:9px 12px;"));
  layout->addWidget(header);
  auto* content = new QWebEngineView(panel);
  auto* helpBridge = new PreviewBridge(content);
  auto helpPipeline = std::make_shared<MarkdownPipeline>();
  auto* channel = new QWebChannel(content->page());
  channel->registerObject(QStringLiteral("previewBridge"), helpBridge);
  content->page()->setWebChannel(channel);
  connect(helpBridge, &PreviewBridge::plantUmlRenderRequested,
          plantUmlRenderer_, &PlantUmlRenderer::requestRenderBatch);
  connect(plantUmlRenderer_, &PlantUmlRenderer::resultsReady,
          helpBridge, &PreviewBridge::publishPlantUmlResults);
  connect(helpBridge, &PreviewBridge::clientReady, content,
          [this, helpBridge, helpPipeline](const QString& role) {
    if (role != QStringLiteral("preview")) return;
    QFile file(QStringLiteral(QT_EDITOR_CHEATSHEET_MARKDOWN));
    if (!file.open(QIODevice::ReadOnly)) {
      qWarning() << "Unable to load generated cheatsheet:" << file.errorString();
      return;
    }
    RenderResult result = helpPipeline->render(QString::fromUtf8(file.readAll()), 1);
    QJsonObject update = result.toJson(PatchMode::FullDocument);
    update.insert(QStringLiteral("katexEnabled"), true);
    update.insert(QStringLiteral("mermaidEnabled"), true);
    update.insert(QStringLiteral("mermaidTheme"), QStringLiteral("dark"));
    update.insert(QStringLiteral("plantUmlServerUrl"), PlantUmlRenderer::normalizeServerUrl(
        globalConfig_.value(QStringLiteral("plantuml.externalServerUrl")).toString()));
    update.insert(QStringLiteral("overlayEnabled"), false);
    update.insert(QStringLiteral("hiddenMermaidPage"), false);
    helpBridge->publishRender(update);
  });
  panel->setFirstShowCallback([content] {
    content->setUrl(QUrl::fromLocalFile(QStringLiteral(QT_EDITOR_WEB_DIR "/preview.html")));
  });
  layout->addWidget(content, 1);
  return panel;
}

QWidget* MainWindow::createSettingsPanel() {
  auto* panel = new QWidget(this);
  panel->setObjectName(QStringLiteral("settingsPage"));
  auto* panelLayout = new QVBoxLayout(panel);
  panelLayout->setContentsMargins(0, 0, 0, 0);
  panelLayout->setSpacing(0);

  auto* scroll = new QScrollArea(panel);
  scroll->setWidgetResizable(true);
  scroll->setFrameShape(QFrame::NoFrame);
  scroll->setStyleSheet(QStringLiteral("QScrollArea{background:#171717;border:0;}"));
  auto* content = new QWidget(scroll);
  content->setObjectName(QStringLiteral("settingsPage"));
  auto* outer = new QHBoxLayout(content);
  outer->setContentsMargins(28, 24, 28, 36);
  outer->addStretch();
  auto* sheet = new QWidget(content);
  sheet->setMaximumWidth(900);
  sheet->setSizePolicy(QSizePolicy::Expanding, QSizePolicy::Preferred);
  auto* layout = new QVBoxLayout(sheet);
  layout->setContentsMargins(0, 0, 0, 0);
  layout->setSpacing(18);

  auto* hero = new QFrame(sheet);
  hero->setObjectName(QStringLiteral("settingsHero"));
  auto* heroLayout = new QVBoxLayout(hero);
  heroLayout->setContentsMargins(22, 20, 22, 20);
  heroLayout->setSpacing(7);
  auto* pageTitle = new QLabel(QStringLiteral("Global Configuration"), hero);
  pageTitle->setObjectName(QStringLiteral("settingsPageTitle"));
  heroLayout->addWidget(pageTitle);
  auto* heroCopy = new QLabel(QStringLiteral("Preferences shared by this El Baton workspace."), hero);
  heroCopy->setObjectName(QStringLiteral("settingsCopy"));
  heroLayout->addWidget(heroCopy);
  auto* workspacePath = new QLabel(
      globalConfig_.filePath().isEmpty() ? QStringLiteral("Select a data directory to create a config file.") : globalConfig_.filePath(), hero);
  workspacePath->setWordWrap(true);
  workspacePath->setStyleSheet(QStringLiteral("background:#202226;color:#d8d8d8;border-radius:8px;padding:9px 11px;font-family:monospace;"));
  heroLayout->addWidget(workspacePath);
  auto* reloadConfig = new QPushButton(QStringLiteral("Reload From Disk"), hero);
  reloadConfig->setEnabled(!globalConfig_.filePath().isEmpty());
  connect(reloadConfig, &QPushButton::clicked, this, [this] {
    QString errorMessage;
    if (!globalConfig_.reload(&errorMessage)) {
      QMessageBox::critical(this, QStringLiteral("Settings reload failed"), errorMessage);
      return;
    }
    applyGlobalConfiguration();
    rebuildSettingsPage();
  });
  heroLayout->addWidget(reloadConfig, 0, Qt::AlignRight);
  layout->addWidget(hero);

  const auto toggle = [this](QWidget* parent, const QString& key, bool inverted = false, bool unavailable = false) {
    auto* control = new QCheckBox(parent);
    control->setObjectName(QStringLiteral("settingsSwitch"));
    control->setChecked(inverted ? !globalConfig_.value(key).toBool() : globalConfig_.value(key).toBool());
    control->setEnabled(!globalConfig_.filePath().isEmpty() && !unavailable);
    connect(control, &QCheckBox::toggled, this, [this, key, inverted](bool checked) {
      setGlobalConfigValue(key, inverted ? !checked : checked);
    });
    return control;
  };
  const auto combo = [this](const QStringList& labels, const QVariantList& values, const QString& key, QWidget* parent) {
    auto* control = new QComboBox(parent);
    control->setObjectName(QStringLiteral("settingsControl"));
    for (int index = 0; index < labels.size(); ++index) control->addItem(labels.at(index), values.value(index));
    const int selected = control->findData(globalConfig_.value(key));
    if (selected >= 0) control->setCurrentIndex(selected);
    control->setEnabled(!globalConfig_.filePath().isEmpty());
    connect(control, &QComboBox::currentIndexChanged, this, [this, control, key](int index) {
      setGlobalConfigValue(key, control->itemData(index));
    });
    return control;
  };
  const auto addSection = [layout, sheet](const QString& title, const QString& copy) {
    auto* section = new QWidget(sheet);
    auto* sectionLayout = new QVBoxLayout(section);
    sectionLayout->setContentsMargins(0, 0, 0, 0);
    sectionLayout->setSpacing(7);
    auto* titleLabel = new QLabel(title, section);
    titleLabel->setObjectName(QStringLiteral("settingsSectionTitle"));
    sectionLayout->addWidget(titleLabel);
    if (!copy.isEmpty()) {
      auto* copyLabel = new QLabel(copy, section);
      copyLabel->setObjectName(QStringLiteral("settingsCopy"));
      copyLabel->setWordWrap(true);
      sectionLayout->addWidget(copyLabel);
    }
    auto* card = new QFrame(section);
    card->setObjectName(QStringLiteral("settingsCard"));
    auto* cardLayout = new QVBoxLayout(card);
    cardLayout->setContentsMargins(0, 0, 0, 0);
    cardLayout->setSpacing(0);
    sectionLayout->addWidget(card);
    layout->addWidget(section);
    return cardLayout;
  };
  const auto addRow = [](QVBoxLayout* card, const QString& title, const QString& copy, QWidget* control) {
    if (card->count() > 0) {
      auto* separator = new QFrame;
      separator->setObjectName(QStringLiteral("settingsSeparator"));
      card->addWidget(separator);
    }
    auto* row = new QWidget;
    auto* rowLayout = new QHBoxLayout(row);
    rowLayout->setContentsMargins(18, 13, 18, 13);
    rowLayout->setSpacing(22);
    auto* text = new QWidget(row);
    auto* textLayout = new QVBoxLayout(text);
    textLayout->setContentsMargins(0, 0, 0, 0);
    textLayout->setSpacing(3);
    auto* titleLabel = new QLabel(title, text);
    titleLabel->setObjectName(QStringLiteral("settingsRowTitle"));
    textLayout->addWidget(titleLabel);
    if (!copy.isEmpty()) {
      auto* copyLabel = new QLabel(copy, text);
      copyLabel->setObjectName(QStringLiteral("settingsCopy"));
      copyLabel->setWordWrap(true);
      textLayout->addWidget(copyLabel);
    }
    rowLayout->addWidget(text, 1);
    rowLayout->addWidget(control, 0, Qt::AlignVCenter | Qt::AlignRight);
    card->addWidget(row);
  };

  auto* general = addSection(QStringLiteral("General"), QStringLiteral("Application-wide behavior and rendering."));
  addRow(general, QStringLiteral("Automatic update checks"), QStringLiteral("Check for new releases when the application starts."), toggle(sheet, QStringLiteral("autoupdate")));
  addRow(general, QStringLiteral("Disable animations"), QStringLiteral("Reduce interface motion throughout the application."), toggle(sheet, QStringLiteral("ui.disableAnimations")));
  addRow(general, QStringLiteral("Use GPU acceleration"), QStringLiteral("Accelerate the editor and preview where supported. Requires restart."), toggle(sheet, QStringLiteral("performance.highPerformanceMode")));

  auto* battery = addSection(QStringLiteral("On-Battery Mode"), QStringLiteral("Reduce background work and preview cost while unplugged."));
  addRow(battery, QStringLiteral("Manual on-battery mode"), QStringLiteral("Force battery optimizations while external power is connected."), toggle(sheet, QStringLiteral("battery.enabled")));
  addRow(battery, QStringLiteral("Automatic power detection"), QStringLiteral("Apply this profile when the system switches to battery power."), toggle(sheet, QStringLiteral("battery.autoDetect")));
  addRow(battery, QStringLiteral("Preview target frame rate"), QStringLiteral("Limit interactive preview updates."), combo(
      {QStringLiteral("5 FPS"), QStringLiteral("10 FPS"), QStringLiteral("15 FPS"), QStringLiteral("20 FPS"), QStringLiteral("30 FPS"), QStringLiteral("60 FPS")},
      {5, 10, 15, 20, 30, 60}, QStringLiteral("battery.targetFps"), sheet));
  addRow(battery, QStringLiteral("Optimize preview rendering"), QStringLiteral("Delay expensive diagram and math updates while typing."), toggle(sheet, QStringLiteral("battery.optimizeRendering")));
  addRow(battery, QStringLiteral("On-battery render delay"), QStringLiteral("Extra delay before preview updates while battery mode is active."), combo(
      {QStringLiteral("Off"), QStringLiteral("200 ms"), QStringLiteral("300 ms"), QStringLiteral("400 ms"), QStringLiteral("500 ms"), QStringLiteral("750 ms"), QStringLiteral("1 second"), QStringLiteral("1.5 seconds")},
      {0, 200, 300, 400, 500, 750, 1000, 1500}, QStringLiteral("battery.renderDelayMs"), sheet));
  addRow(battery, QStringLiteral("Disable spellcheck on battery"), QStringLiteral("Run spellcheck only while connected to AC power."), toggle(sheet, QStringLiteral("battery.disableSpellcheck")));
  addRow(battery, QStringLiteral("Disable autocomplete on battery"), QStringLiteral("Run suggestions only while connected to AC power."), toggle(sheet, QStringLiteral("battery.disableAutocomplete")));
  addRow(battery, QStringLiteral("Disable animations on battery"), QStringLiteral("Reduce interface motion while on battery power."), toggle(sheet, QStringLiteral("battery.disableAnimations")));

  auto* editor = addSection(QStringLiteral("Editor"), QStringLiteral("Source view behavior and formatting."));
  addRow(editor, QStringLiteral("Line numbers"), QString(), combo(
      {QStringLiteral("On"), QStringLiteral("Off"), QStringLiteral("Relative")},
      {QStringLiteral("on"), QStringLiteral("off"), QStringLiteral("relative")}, QStringLiteral("monaco.editorOptions.lineNumbers"), sheet));
  addRow(editor, QStringLiteral("Tab size"), QString(), combo(
      {QStringLiteral("2 spaces"), QStringLiteral("4 spaces"), QStringLiteral("8 spaces")},
      {2, 4, 8}, QStringLiteral("monaco.editorOptions.tabSize"), sheet));
  addRow(editor, QStringLiteral("Suggestions"), QStringLiteral("Show completion suggestions while editing."), toggle(sheet, QStringLiteral("monaco.editorOptions.disableSuggestions"), true));
  addRow(editor, QStringLiteral("Automatic table formatting"), QStringLiteral("Keep Markdown table columns aligned."), toggle(sheet, QStringLiteral("monaco.disableAutomaticTableFormatting"), true));
  addRow(editor, QStringLiteral("Automatic table format delay"), QStringLiteral("Wait before normalizing Markdown table spacing."), combo(
      {QStringLiteral("250 ms"), QStringLiteral("500 ms"), QStringLiteral("750 ms"), QStringLiteral("1 second"), QStringLiteral("1.5 seconds"), QStringLiteral("2 seconds"), QStringLiteral("3 seconds")},
      {250, 500, 750, 1000, 1500, 2000, 3000}, QStringLiteral("monaco.tableFormattingDelay"), sheet));

  auto* preview = addSection(QStringLiteral("Preview"), QStringLiteral("Markdown rendering and split-view behavior."));
  addRow(preview, QStringLiteral("Synchronize scrolling"), QStringLiteral("Keep the editor and preview at corresponding document positions. Restart required."), toggle(sheet, QStringLiteral("preview.disableSplitViewSync"), true));
  addRow(preview, QStringLiteral("Large note full preview delay"), QStringLiteral("Wait before expanding a large note from its live preview to a full render."), combo(
      {QStringLiteral("250 ms"), QStringLiteral("500 ms"), QStringLiteral("750 ms"), QStringLiteral("1 second"), QStringLiteral("1.5 seconds"), QStringLiteral("2 seconds")},
      {250, 500, 750, 1000, 1500, 2000}, QStringLiteral("preview.largeNoteFullRenderDelay"), sheet));
  addRow(preview, QStringLiteral("Sanitize embedded scripts"), QStringLiteral("Required by the native preview security boundary."), toggle(sheet, QStringLiteral("preview.disableScriptSanitization"), true, true));

  auto* spellcheck = addSection(QStringLiteral("Spellcheck Dictionary"), QStringLiteral("User dictionary and source spellchecking behavior."));
  addRow(spellcheck, QStringLiteral("Disable spellcheck"), QStringLiteral("Turn off misspelling markers and suggestions."), toggle(sheet, QStringLiteral("spellcheck.disable")));

  auto* notes = addSection(QStringLiteral("Notes and Input"), QString());
  addRow(notes, QStringLiteral("Automatic note renaming"), QStringLiteral("Rename files when their title changes."), toggle(sheet, QStringLiteral("notes.disableAutomaticRenaming"), true));
  addRow(notes, QStringLiteral("Middle-click paste"), QStringLiteral("Use the primary selection clipboard on Linux."), toggle(sheet, QStringLiteral("input.disableMiddleClickPaste"), true));

  auto* plantUml = addSection(QStringLiteral("PlantUML"), QStringLiteral("Local rendering and optional server configuration."));
  auto* server = new QLineEdit(sheet);
  server->setObjectName(QStringLiteral("settingsControl"));
  server->setPlaceholderText(QStringLiteral("Server URL"));
  server->setText(globalConfig_.value(QStringLiteral("plantuml.externalServerUrl")).toString());
  server->setEnabled(!globalConfig_.filePath().isEmpty());
  connect(server, &QLineEdit::editingFinished, this, [this, server] {
    setGlobalConfigValue(QStringLiteral("plantuml.externalServerUrl"), server->text().trimmed());
  });
  addRow(plantUml, QStringLiteral("Server"), QStringLiteral("Leave empty to use the pinned local renderer."), server);
  auto* testServer = new QPushButton(QStringLiteral("Test Server"), sheet);
  testServer->setEnabled(!globalConfig_.filePath().isEmpty());
  connect(testServer, &QPushButton::clicked, this, [this, server, testServer] {
    const QString serverUrl = PlantUmlRenderer::normalizeServerUrl(server->text());
    if (serverUrl.isEmpty()) {
      QMessageBox::warning(this, QStringLiteral("PlantUML server"),
                           QStringLiteral("Enter a valid HTTP or HTTPS PlantUML server URL first."));
      return;
    }
    testServer->setEnabled(false);
    testServer->setText(QStringLiteral("Testing…"));
    auto* manager = new QNetworkAccessManager(testServer);
    QNetworkRequest request(QUrl(PlantUmlRenderer::buildRemoteRenderUrl(serverUrl)));
    request.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::NoLessSafeRedirectPolicy);
    request.setRawHeader("Accept", "image/svg+xml,text/plain;q=0.9,*/*;q=0.1");
    request.setHeader(QNetworkRequest::ContentTypeHeader, QStringLiteral("text/plain; charset=utf-8"));
    QNetworkReply* reply = manager->post(
        request, QByteArray("@startuml\nBob -> Alice : hello\n@enduml"));
    auto* timeout = new QTimer(reply);
    timeout->setSingleShot(true);
    connect(timeout, &QTimer::timeout, reply, &QNetworkReply::abort);
    timeout->start(std::clamp(globalConfig_.value(QStringLiteral("plantuml.requestTimeoutMs"), 12000).toInt(),
                              1000, 120000));
    connect(reply, &QNetworkReply::finished, this, [this, reply, manager, testServer] {
      const QString response = QString::fromUtf8(reply->readAll());
      const bool ok = reply->error() == QNetworkReply::NoError && response.contains(QStringLiteral("<svg"));
      const QString error = reply->error() == QNetworkReply::NoError
          ? QStringLiteral("The server did not return an SVG response.") : reply->errorString();
      testServer->setEnabled(true);
      testServer->setText(QStringLiteral("Test Server"));
      reply->deleteLater();
      manager->deleteLater();
      if (ok) QMessageBox::information(this, QStringLiteral("PlantUML server"), QStringLiteral("Remote rendering succeeded."));
      else QMessageBox::warning(this, QStringLiteral("PlantUML server"), error);
    });
  });
  addRow(plantUml, QStringLiteral("Test external server"),
         QStringLiteral("Render a sample diagram remotely to verify the endpoint."), testServer);
  addRow(plantUml, QStringLiteral("Request timeout"), QString(), combo(
      {QStringLiteral("5000 ms"), QStringLiteral("12000 ms"), QStringLiteral("30000 ms")},
      {5000, 12000, 30000}, QStringLiteral("plantuml.requestTimeoutMs"), sheet));
  addRow(plantUml, QStringLiteral("Cache max diagrams"), QString(), combo(
      {QStringLiteral("100"), QStringLiteral("400"), QStringLiteral("1000")},
      {100, 400, 1000}, QStringLiteral("plantuml.cacheMaxEntries"), sheet));

  auto* readOnly = new QLabel(QStringLiteral("Changes are written immediately to the workspace configuration file."), sheet);
  readOnly->setObjectName(QStringLiteral("settingsCopy"));
  readOnly->setAlignment(Qt::AlignCenter);
  layout->addWidget(readOnly);
  outer->addWidget(sheet, 1);
  outer->addStretch();

  scroll->setWidget(content);
  panelLayout->addWidget(scroll);
  return panel;
}

void MainWindow::setGlobalConfigValue(const QString& key, const QVariant& value) {
  globalConfig_.setValue(key, value);
  QString errorMessage;
  if (!globalConfig_.save(&errorMessage)) {
    QMessageBox::critical(this, QStringLiteral("Settings update failed"), errorMessage);
    return;
  }
  applyGlobalConfiguration();
  if (key == QStringLiteral("plantuml.externalServerUrl")) {
    forceFullPreviewRender_ = true;
    renderTimer_.start(0);
  }
}

void MainWindow::applyGlobalConfiguration() {
  if (editor_ == nullptr) return;
  const QString lineNumbers = globalConfig_.value(
      QStringLiteral("monaco.editorOptions.lineNumbers"), QStringLiteral("on")).toString();
  editor_->setMarginLineNumbers(0, lineNumbers != QStringLiteral("off"));
  if (lineNumbers == QStringLiteral("off")) editor_->setMarginWidth(0, 0);
  else editor_->setMarginWidth(0, QStringLiteral("000000"));
  editor_->setTabWidth(std::clamp(globalConfig_.value(QStringLiteral("monaco.editorOptions.tabSize"), 2).toInt(), 1, 8));
  const bool batteryMode = globalConfig_.value(QStringLiteral("battery.enabled"), false).toBool();
  const bool suggestionsDisabled = globalConfig_.value(
      QStringLiteral("monaco.editorOptions.disableSuggestions"), false).toBool() ||
      (batteryMode && globalConfig_.value(QStringLiteral("battery.disableAutocomplete"), false).toBool());
  editor_->setAutoCompletionSource(suggestionsDisabled ? QsciScintilla::AcsNone : QsciScintilla::AcsDocument);
  editor_->setAutoCompletionThreshold(suggestionsDisabled ? -1 : 2);
  tableFormatTimer_.setInterval(std::clamp(
      globalConfig_.value(QStringLiteral("monaco.tableFormattingDelay"), 2000).toInt(), 0, 5000));
  if (globalConfig_.value(QStringLiteral("monaco.disableAutomaticTableFormatting"), false).toBool()) {
    tableFormatTimer_.stop();
    tableTouchedLines_.clear();
  }
  const bool delayedRendering = batteryMode && globalConfig_.value(
      QStringLiteral("battery.optimizeRendering"), true).toBool();
  renderTimer_.setInterval(delayedRendering
      ? std::max(120, globalConfig_.value(QStringLiteral("battery.renderDelayMs"), 400).toInt())
      : 120);
  const bool spellcheckDisabled = globalConfig_.value(
      QStringLiteral("spellcheck.disable"), false).toBool() ||
      (batteryMode && globalConfig_.value(
          QStringLiteral("battery.disableSpellcheck"), false).toBool());
  if (spellcheckIndicator_ >= 0) {
    editor_->SendScintilla(QsciScintilla::SCI_SETINDICATORCURRENT, spellcheckIndicator_);
    if (spellcheckDisabled) {
      editor_->SendScintilla(QsciScintilla::SCI_INDICATORCLEARRANGE, 0,
                             editor_->SendScintilla(QsciScintilla::SCI_GETLENGTH));
      spellingIssues_.clear();
    } else {
      spellcheckTimer_.start();
    }
  }
  if (plantUmlRenderer_ != nullptr) {
    const int cacheMaxEntries =
        globalConfig_.value(QStringLiteral("plantuml.cacheMaxEntries"), 400).toInt();
    const qint64 cacheMaxBytes = globalConfig_
        .value(QStringLiteral("plantuml.cacheMaxBytes"), 64 * 1024 * 1024).toLongLong();
    plantUmlRenderer_->configure(
        globalConfig_.value(QStringLiteral("plantuml.requestTimeoutMs"), 12000).toInt(),
        cacheMaxEntries, cacheMaxBytes,
        globalConfig_.value(QStringLiteral("plantuml.externalServerUrl")).toString());
    bridge_->configureDiagramCache(cacheMaxEntries, cacheMaxBytes);
  }
}

void MainWindow::rebuildSettingsPage() {
  if (mainContentStack_ == nullptr || mainContentStack_->count() < 4) return;
  QWidget* previous = mainContentStack_->widget(3);
  const bool wasCurrent = mainContentStack_->currentWidget() == previous;
  mainContentStack_->removeWidget(previous);
  mainContentStack_->insertWidget(3, createSettingsPanel());
  if (wasCurrent) mainContentStack_->setCurrentIndex(3);
  previous->deleteLater();
}

void MainWindow::refreshWorkspaceViews() {
  if (noteTree_ == nullptr) return;
  refreshingExplorer_ = true;
  noteTree_->clear();
  const QVariantMap sectionState = settings_.value(QStringLiteral("window.explorerSectionsCollapsed")).toMap();
  const QVariantMap tagState = settings_.value(QStringLiteral("window.explorerTagsCollapsed")).toMap();

  const auto addBranch = [this, &sectionState, &tagState](
      QTreeWidgetItem* parent, const QString& title, const QString& key, bool section = false) {
    auto* item = parent == nullptr ? new QTreeWidgetItem(noteTree_) : new QTreeWidgetItem(parent);
    item->setText(0, title);
    item->setData(0, Qt::UserRole + 1, section ? QStringLiteral("section:") + key : key);
    item->setFlags(Qt::ItemIsEnabled);
    const bool collapsed = (section ? sectionState : tagState).value(key, false).toBool();
    item->setExpanded(!collapsed);
    if (section) {
      QFont font = item->font(0);
      font.setBold(true);
      item->setFont(0, font);
      item->setForeground(0, QColor(QStringLiteral("#b9b9b9")));
    }
    return item;
  };
  const auto addNote = [this](QTreeWidgetItem* parent, const NoteSummary& note) {
    auto* item = new QTreeWidgetItem(parent);
    item->setText(0, note.title);
    item->setIcon(0, referenceNoteStateIcon(note.pinned, note.favorited));
    item->setToolTip(0, note.relativePath);
    item->setData(0, Qt::UserRole, note.filePath);
    if (QFileInfo(note.filePath) == QFileInfo(currentPath_)) noteTree_->setCurrentItem(item);
  };

  QTreeWidgetItem* notesSection = addBranch(nullptr, QStringLiteral("Notes"), QStringLiteral("notes"), true);
  QTreeWidgetItem* allNotes = addBranch(notesSection, QStringLiteral("All Notes"), QStringLiteral("__ALL__"));
  QTreeWidgetItem* favorites = addBranch(notesSection, QStringLiteral("Favorites"), QStringLiteral("__FAVORITES__"));
  QTreeWidgetItem* untagged = addBranch(notesSection, QStringLiteral("Untagged"), QStringLiteral("__UNTAGGED__"));
  QTreeWidgetItem* trash = addBranch(notesSection, QStringLiteral("Trash"), QStringLiteral("__TRASH__"));
  for (const NoteSummary& note : workspace_.notes()) {
    if (note.deleted) {
      addNote(trash, note);
      continue;
    }
    addNote(allNotes, note);
    if (note.favorited) addNote(favorites, note);
    if (note.tags.isEmpty()) addNote(untagged, note);
  }

  QTreeWidgetItem* notebooksSection = addBranch(nullptr, QStringLiteral("Notebooks"), QStringLiteral("notebooks"), true);
  QTreeWidgetItem* tagsSection = addBranch(nullptr, QStringLiteral("Tags"), QStringLiteral("tags"), true);
  QHash<QString, QTreeWidgetItem*> tagItems;
  const auto ensureTag = [&](const QString& fullTag, bool notebook, auto&& ensureTagRef) -> QTreeWidgetItem* {
    const QString mapKey = (notebook ? QStringLiteral("notebook:") : QStringLiteral("tag:")) + fullTag;
    if (tagItems.contains(mapKey)) return tagItems.value(mapKey);
    QStringList parts = fullTag.split(QLatin1Char('/'), Qt::SkipEmptyParts);
    if (notebook && !parts.isEmpty() && parts.constFirst() == QStringLiteral("Notebooks")) parts.removeFirst();
    if (parts.isEmpty()) return notebook ? notebooksSection : tagsSection;
    const QString visiblePath = parts.join(QLatin1Char('/'));
    const qsizetype separator = visiblePath.lastIndexOf(QLatin1Char('/'));
    QTreeWidgetItem* parent = notebook ? notebooksSection : tagsSection;
    if (separator >= 0) {
      const QString parentVisible = visiblePath.first(separator);
      const QString parentFull = notebook ? QStringLiteral("Notebooks/") + parentVisible : parentVisible;
      parent = ensureTagRef(parentFull, notebook, ensureTagRef);
    }
    QTreeWidgetItem* item = addBranch(parent, parts.constLast(), fullTag);
    tagItems.insert(mapKey, item);
    return item;
  };
  for (const NoteSummary& note : workspace_.notes()) {
    if (note.deleted) continue;
    for (const QString& tag : note.tags) {
      const bool notebook = tag == QStringLiteral("Notebooks") || tag.startsWith(QStringLiteral("Notebooks/"));
      const bool templated = tag == QStringLiteral("Templates") || tag.startsWith(QStringLiteral("Templates/"));
      if (templated) continue;
      QTreeWidgetItem* tagItem = ensureTag(tag, notebook, ensureTag);
      addNote(tagItem, note);
    }
  }
  noteTree_->resizeColumnToContents(0);
  refreshingExplorer_ = false;
  refreshGraphPage();
}

void MainWindow::refreshGraphPage() {
  if (graphView_ == nullptr) return;
  graphView_->setGraph(workspace_.graph());
  QTimer::singleShot(0, graphView_, [this] {
    if (graphView_ != nullptr) graphView_->fitToView();
  });
}

void MainWindow::handleWorkspaceChanges(const QVector<WorkspaceChange>& changes) {
  const QScopedValueRollback<bool> handlingChanges(handlingWorkspaceChanges_, true);
  const auto findOpenDocument = [this](const QString& path) {
    for (int index = 0; index < openDocuments_.size(); ++index) {
      if (openDocuments_.at(index).document.path() == path) return index;
    }
    return -1;
  };
  const auto reloadDocument = [this](int index, const DocumentFile& reloaded) {
    if (index < 0 || index >= openDocuments_.size()) return;
    OpenDocumentState& state = openDocuments_[index];
    int restoreLine = state.cursorLine;
    int restoreIndex = state.cursorIndex;
    if (index == activeDocumentIndex_) editor_->getCursorPosition(&restoreLine, &restoreIndex);
    state.document = reloaded;
    workspaceWatcher_->acceptDiskState(reloaded.path(), reloaded.serializedContent());
    state.body = reloaded.body();
    state.modified = false;
    state.cursorLine = restoreLine;
    state.cursorIndex = restoreIndex;
    if (noteTabs_ != nullptr && index < noteTabs_->count()) {
      noteTabs_->setTabData(index, reloaded.path());
      noteTabs_->setTabText(index, QFileInfo(reloaded.path()).fileName());
    }
    if (index != activeDocumentIndex_) return;
    switchingDocuments_ = true;
    document_ = reloaded;
    currentPath_ = reloaded.path();
    editor_->setText(reloaded.body());
    editor_->setModified(false);
    editor_->setCursorPosition(restoreLine, restoreIndex);
    switchingDocuments_ = false;
    updateInfoPanel();
    updateWindowTitle();
    renderDocument();
  };

  for (const WorkspaceChange& change : changes) {
    if (change.kind == WorkspaceChangeKind::Added) continue;

    const QString lookupPath = change.kind == WorkspaceChangeKind::Renamed
        ? change.previousPath : change.path;
    const int index = findOpenDocument(lookupPath);
    if (index < 0) continue;
    const bool active = index == activeDocumentIndex_;
    const bool dirty = active ? editor_->isModified() : openDocuments_.at(index).modified;

    if (change.kind == WorkspaceChangeKind::Removed) {
      if (dirty) {
        statusBar()->showMessage(
            QStringLiteral("%1 was deleted outside El Baton; unsaved editor changes were kept.")
                .arg(QFileInfo(change.path).fileName()),
            7000);
        continue;
      }
      closeDocument(index);
      continue;
    }

    QString errorMessage;
    const std::optional<DocumentFile> reloaded = DocumentFile::load(change.path, &errorMessage);
    if (!reloaded.has_value()) {
      qWarning() << "Unable to reload externally changed note" << change.path << errorMessage;
      continue;
    }

    const DocumentFile& canonical = openDocuments_.at(index).document;
    const std::optional<QDateTime> canonicalModified = canonical.modifiedAt();
    const std::optional<QDateTime> incomingModified = reloaded->modifiedAt();
    if (canonicalModified.has_value() && incomingModified.has_value() &&
        canonicalModified->toMSecsSinceEpoch() > incomingModified->toMSecsSinceEpoch()) {
      continue;
    }
    if (reloaded->serializedContent().isEmpty() && !canonical.serializedContent().isEmpty() &&
        canonicalModified.has_value()) {
      const qint64 diskModifiedMs = QFileInfo(change.path).lastModified().toMSecsSinceEpoch();
      if (std::abs(diskModifiedMs - canonicalModified->toMSecsSinceEpoch()) < 1500) {
        continue;
      }
    }

    // Match the reference implementation's Note.is check. Filesystem events
    // from our last save can arrive after the editor already contains a newer,
    // dirty revision. The dirty flag alone therefore cannot identify an
    // external write: first compare disk with the canonical last-saved model.
    if (change.kind == WorkspaceChangeKind::Modified &&
        openDocuments_.at(index).document.hasSameContent(*reloaded)) {
      continue;
    }

    if (change.kind == WorkspaceChangeKind::Renamed) {
      OpenDocumentState& state = openDocuments_[index];
      const QString retainedBody = active ? editor_->text() : state.body;
      const bool retainedModified = dirty;
      reloadDocument(index, *reloaded);
      if (dirty) {
        state.body = retainedBody;
        state.modified = retainedModified;
        if (active) {
          document_ = *reloaded;
          currentPath_ = reloaded->path();
          editor_->setText(state.body);
          editor_->setModified(true);
          updateWindowTitle();
        }
      }
      continue;
    }

    if (dirty) {
      if (!active) {
        statusBar()->showMessage(
            QStringLiteral("%1 changed on disk; its unsaved tab was left unchanged.")
                .arg(QFileInfo(change.path).fileName()),
            7000);
        continue;
      }
      const QMessageBox::StandardButton choice = QMessageBox::question(
          this,
          QStringLiteral("Note changed on disk"),
          QStringLiteral("%1 was changed by another application. Reload it and discard the unsaved editor changes?")
              .arg(QFileInfo(change.path).fileName()),
          QMessageBox::Yes | QMessageBox::No,
          QMessageBox::No);
      if (choice != QMessageBox::Yes) {
        (void)saveActiveDocument(false);
        continue;
      }
    }
    reloadDocument(index, *reloaded);
  }

  workspace_.refresh();
  refreshWorkspaceViews();
  persistOpenTabs();
}

void MainWindow::updateInfoPanel() {
  if (infoPath_ == nullptr || infoModified_ == nullptr) return;
  if (currentPath_.isEmpty()) {
    infoPath_->setText(QStringLiteral("—"));
    infoModified_->setText(QStringLiteral("—"));
    return;
  }
  const QFileInfo info(currentPath_);
  infoPath_->setText(workspace_.workspaceRoot().isEmpty()
      ? QDir::toNativeSeparators(currentPath_)
      : QDir(workspace_.workspaceRoot()).relativeFilePath(currentPath_));
  infoModified_->setText(QLocale().toString(info.lastModified(), QLocale::ShortFormat));
  if (infoSize_ != nullptr) infoSize_->setText(QLocale().formattedDataSize(info.size()));
  if (infoWords_ != nullptr) {
    const QString body = editor_ == nullptr ? QString() : editor_->text();
    const qsizetype wordCount = body.split(
        QRegularExpression(QStringLiteral("\\s+")), Qt::SkipEmptyParts).size();
    infoWords_->setText(QStringLiteral("%1 words · %2 characters")
                            .arg(wordCount).arg(body.size()));
  }
  if (document_.has_value()) {
    const QString metadata = document_->metadataPrefix();
    static const QRegularExpression createdPattern(
        QStringLiteral("(?:^|\\n)created:[ \\t]*['\"]?([^'\"\\r\\n]+)"),
        QRegularExpression::CaseInsensitiveOption);
    const auto created = createdPattern.match(metadata);
    const QString fallbackCreated = info.birthTime().isValid()
        ? QLocale().toString(info.birthTime(), QLocale::ShortFormat) : QStringLiteral("—");
    infoCreated_->setText(created.hasMatch() ? created.captured(1).trimmed() : fallbackCreated);
    infoTags_->setText(document_->tags().isEmpty()
        ? QStringLiteral("None") : document_->tags().join(QStringLiteral(", ")));
  }
  const QVector<AttachmentSummary> attachments = workspace_.attachmentsForNote(currentPath_);
  if (infoAttachmentCount_ != nullptr) infoAttachmentCount_->setText(QString::number(attachments.size()));
  if (infoAttachments_ != nullptr) {
    infoAttachments_->clear();
    for (const AttachmentSummary& attachment : attachments) {
      auto* item = new QListWidgetItem(attachment.displayName, infoAttachments_);
      item->setData(Qt::UserRole, attachment.filePath);
      item->setToolTip(QStringLiteral("%1\n%2 · %3\nModified %4")
                           .arg(attachment.relativePath, attachment.mimeType,
                                QLocale().formattedDataSize(attachment.sizeBytes),
                                QLocale().toString(attachment.modified, QLocale::ShortFormat)));
    }
    if (attachments.isEmpty()) {
      auto* empty = new QListWidgetItem(QStringLiteral("No referenced attachments"), infoAttachments_);
      empty->setFlags(Qt::NoItemFlags);
    }
  }
  if (infoLinks_ != nullptr) {
    const WorkspaceGraph& graph = workspace_.graph();
    QString noteId;
    for (const WorkspaceGraphNode& node : graph.nodes) {
      if (node.kind == WorkspaceGraphNodeKind::Note &&
          QFileInfo(node.filePath) == QFileInfo(currentPath_)) {
        noteId = node.id;
        break;
      }
    }
    int outgoing = 0;
    int backlinks = 0;
    for (const WorkspaceGraphEdge& edge : graph.edges) {
      if (edge.kind != WorkspaceGraphEdgeKind::NoteLink) continue;
      if (edge.sourceId == noteId) ++outgoing;
      if (edge.targetId == noteId) ++backlinks;
    }
    infoLinks_->setText(QStringLiteral("%1 outgoing · %2 backlinks").arg(outgoing).arg(backlinks));
  }
  if (outlineList_ != nullptr) {
    outlineList_->clear();
    struct Heading final { QString text; int level; int line; };
    QVector<Heading> headings;
    const QStringList lines = editor_->text().split(QLatin1Char('\n'));
    static const QRegularExpression fencePattern(QStringLiteral("^\\s*(```|~~~)"));
    static const QRegularExpression atxPattern(QStringLiteral("^\\s{0,3}(#{1,6})[ \\t]+(.+?)[ \\t]*#*[ \\t]*$"));
    static const QRegularExpression setextPattern(QStringLiteral("^\\s{0,3}(=+|-+)\\s*$"));
    bool inFence = false;
    for (int lineIndex = 0; lineIndex < lines.size(); ++lineIndex) {
      const QString& line = lines.at(lineIndex);
      if (fencePattern.match(line).hasMatch()) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;
      const QRegularExpressionMatch atx = atxPattern.match(line);
      if (atx.hasMatch()) {
        headings.append({atx.captured(2).trimmed(), static_cast<int>(atx.captured(1).size()), lineIndex});
        continue;
      }
      if (lineIndex + 1 >= lines.size() || line.trimmed().isEmpty()) continue;
      const QRegularExpressionMatch setext = setextPattern.match(lines.at(lineIndex + 1));
      if (!setext.hasMatch()) continue;
      headings.append({line.trimmed(), setext.captured(1).startsWith(QLatin1Char('=')) ? 1 : 2, lineIndex});
      ++lineIndex;
    }
    int minimumLevel = 6;
    for (const Heading& heading : headings) minimumLevel = std::min(minimumLevel, heading.level);
    for (int index = 0; index < headings.size(); ++index) {
      const Heading& heading = headings.at(index);
      const int relativeLevel = std::max(1, heading.level - minimumLevel + 1);
      auto* item = new QListWidgetItem(QString(relativeLevel - 1, QLatin1Char(' ')) + heading.text, outlineList_);
      item->setData(Qt::UserRole, index);
      item->setData(Qt::UserRole + 1, heading.line);
      item->setToolTip(QStringLiteral("Line %1").arg(heading.line + 1));
    }
    if (outlineList_->count() == 0) {
      auto* empty = new QListWidgetItem(QStringLiteral("No headings"), outlineList_);
      empty->setFlags(Qt::NoItemFlags);
    }
  }
}

void MainWindow::configureEditor() {
  editor_->setLexer(new MarkdownSyntaxLexer(editor_));
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
  spellcheckIndicator_ = editor_->indicatorDefine(QsciScintilla::SquiggleIndicator);
  editor_->setIndicatorForegroundColor(QColor(QStringLiteral("#e06c75")), spellcheckIndicator_);
  spellcheckTimer_.start();
}

void MainWindow::configurePreview() {
  auto* interceptor = new WorkspaceRequestInterceptor(
      [this] { return workspace_.workspaceRoot(); }, this);
  preview_->page()->profile()->setUrlRequestInterceptor(interceptor);
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
  openAction_ = new QAction(QStringLiteral("Open…"), this);
  openAction_->setShortcut(QKeySequence::Open);
  connect(openAction_, &QAction::triggered, this, &MainWindow::chooseFile);
  addAction(openAction_);

  saveAction_ = new QAction(QStringLiteral("Save"), this);
  saveAction_->setShortcut(QKeySequence::Save);
  connect(saveAction_, &QAction::triggered, this, &MainWindow::saveFile);
  addAction(saveAction_);

  newAction_ = new QAction(QStringLiteral("New Note"), this);
  newAction_->setShortcut(QKeySequence::New);
  connect(newAction_, &QAction::triggered, this, &MainWindow::createNote);
  addAction(newAction_);

  duplicateAction_ = new QAction(QStringLiteral("Duplicate Note"), this);
  duplicateAction_->setShortcut(QKeySequence(Qt::CTRL | Qt::SHIFT | Qt::Key_D));
  duplicateAction_->setEnabled(false);
  connect(duplicateAction_, &QAction::triggered, this, &MainWindow::duplicateNote);
  addAction(duplicateAction_);

  importAction_ = new QAction(QStringLiteral("Import Notes…"), this);
  connect(importAction_, &QAction::triggered, this, &MainWindow::importNotes);
  addAction(importAction_);
  exportMarkdownAction_ = new QAction(QStringLiteral("Export Markdown…"), this);
  connect(exportMarkdownAction_, &QAction::triggered, this, &MainWindow::exportMarkdown);
  addAction(exportMarkdownAction_);
  exportHtmlAction_ = new QAction(QStringLiteral("Export HTML…"), this);
  connect(exportHtmlAction_, &QAction::triggered, this, &MainWindow::exportHtml);
  addAction(exportHtmlAction_);
  exportPdfAction_ = new QAction(QStringLiteral("Export PDF…"), this);
  connect(exportPdfAction_, &QAction::triggered, this, &MainWindow::exportPdf);
  addAction(exportPdfAction_);

  const auto addEditorAction = [this](const QString& text, const QKeySequence& shortcut, auto callback) {
    auto* action = new QAction(text, this);
    action->setShortcut(shortcut);
    connect(action, &QAction::triggered, this, callback);
    addAction(action);
    return action;
  };
  addEditorAction(QStringLiteral("Find"), QKeySequence::Find,
                  [this] { showFindBar(false); });
  addEditorAction(QStringLiteral("Replace"), QKeySequence(Qt::CTRL | Qt::Key_H),
                  [this] { showFindBar(true); });
  addEditorAction(QStringLiteral("Find Next"), QKeySequence(Qt::Key_F3),
                  [this] { findInEditor(true); });
  addEditorAction(QStringLiteral("Find Previous"), QKeySequence(Qt::SHIFT | Qt::Key_F3),
                  [this] { findInEditor(false); });
  addEditorAction(QStringLiteral("Close Find or Preview"), QKeySequence(Qt::Key_Escape), [this] {
    if (findBar_ != nullptr && findBar_->isVisible()) {
      findBar_->hide();
      editor_->setFocus();
    } else if (editor_->isListActive()) {
      editor_->cancelList();
    } else if (viewMode_ == EditorViewMode::Split) {
      toggleSplitView();
    } else if (viewMode_ == EditorViewMode::Edit) {
      setEditorViewMode(EditorViewMode::Preview);
    }
  });
  addEditorAction(QStringLiteral("Bold"), QKeySequence::Bold,
                  [this] { wrapEditorSelection(QStringLiteral("**"), QStringLiteral("**")); });
  addEditorAction(QStringLiteral("Italic"), QKeySequence::Italic,
                  [this] { wrapEditorSelection(QStringLiteral("*"), QStringLiteral("*")); });
  addEditorAction(QStringLiteral("Strikethrough"), QKeySequence(Qt::CTRL | Qt::SHIFT | Qt::Key_X),
                  [this] { wrapEditorSelection(QStringLiteral("~~"), QStringLiteral("~~")); });
  addEditorAction(QStringLiteral("Toggle Task"), QKeySequence(Qt::ALT | Qt::Key_Return),
                  [this] { toggleTaskLines(false); });
  addEditorAction(QStringLiteral("Toggle Task Done"), QKeySequence(Qt::ALT | Qt::Key_D),
                  [this] { toggleTaskLines(true); });
  addEditorAction(QStringLiteral("Show Markdown Completions"), QKeySequence(QStringLiteral("Ctrl+Space")),
                  [this] { updateMarkdownCompletions(true); });

  editAction_ = new QAction(QStringLiteral("Edit"), this);
  editAction_->setCheckable(true);
  editAction_->setChecked(true);
  editAction_->setShortcut(QKeySequence(Qt::CTRL | Qt::Key_E));
  connect(editAction_, &QAction::toggled, this, &MainWindow::toggleEditing);
  addAction(editAction_);

  splitAction_ = new QAction(QStringLiteral("Split View"), this);
  splitAction_->setCheckable(true);
  splitAction_->setChecked(true);
  splitAction_->setShortcut(QKeySequence(Qt::CTRL | Qt::ALT | Qt::Key_S));
  connect(splitAction_, &QAction::triggered, this, &MainWindow::toggleSplitView);
  addAction(splitAction_);

  tagsAction_ = new QAction(QStringLiteral("Edit Tags"), this);
  connect(tagsAction_, &QAction::triggered, this, &MainWindow::editTags);
  attachmentsAction_ = new QAction(QStringLiteral("Add Attachment"), this);
  connect(attachmentsAction_, &QAction::triggered, this, &MainWindow::addAttachment);

  favoriteAction_ = new QAction(QStringLiteral("Favorite"), this);
  favoriteAction_->setCheckable(true);
  connect(favoriteAction_, &QAction::triggered, this, &MainWindow::toggleFavorite);
  pinAction_ = new QAction(QStringLiteral("Pin"), this);
  pinAction_->setCheckable(true);
  connect(pinAction_, &QAction::triggered, this, &MainWindow::togglePinned);
  trashAction_ = new QAction(QStringLiteral("Move to Trash"), this);
  connect(trashAction_, &QAction::triggered, this, &MainWindow::toggleDeleted);
  updateDocumentActions();
}

void MainWindow::showFindBar(bool replaceMode) {
  if (findBar_ == nullptr) return;
  replaceModeButton_->setChecked(replaceMode);
  const QString selection = editor_->selectedText();
  if (!selection.isEmpty() && !selection.contains(QLatin1Char('\n'))) findInput_->setText(selection);
  findBar_->show();
  QLineEdit* focusInput = replaceMode ? replaceInput_ : findInput_;
  focusInput->setFocus();
  focusInput->selectAll();
}

void MainWindow::findInEditor(bool forward) {
  if (findBar_ == nullptr || !findBar_->isVisible()) showFindBar(false);
  const QString expression = findInput_->text();
  if (expression.isEmpty()) {
    findStatus_->clear();
    return;
  }
  int startLine = -1;
  int startIndex = -1;
  int fromLine = 0;
  int fromIndex = 0;
  int toLine = 0;
  int toIndex = 0;
  if (editor_->hasSelectedText()) {
    editor_->getSelection(&fromLine, &fromIndex, &toLine, &toIndex);
    startLine = forward ? toLine : fromLine;
    startIndex = forward ? toIndex : fromIndex;
  }
  const bool found = editor_->findFirst(
      expression, findRegex_->isChecked(), findCaseSensitive_->isChecked(),
      findWholeWord_->isChecked(), true, forward, startLine, startIndex, true);
  findStatus_->setText(found ? QStringLiteral("Match") : QStringLiteral("No matches"));
}

void MainWindow::replaceCurrentMatch() {
  if (findBar_ == nullptr || !findBar_->isVisible()) showFindBar(true);
  if (!editor_->hasSelectedText()) {
    findInEditor(true);
    return;
  }
  editor_->replace(replaceInput_->text());
  findInEditor(true);
}

void MainWindow::replaceAllMatches() {
  if (findInput_ == nullptr || findInput_->text().isEmpty()) return;
  int replacements = 0;
  editor_->beginUndoAction();
  bool found = editor_->findFirst(
      findInput_->text(), findRegex_->isChecked(), findCaseSensitive_->isChecked(),
      findWholeWord_->isChecked(), false, true, 0, 0, true);
  while (found) {
    editor_->replace(replaceInput_->text());
    ++replacements;
    found = editor_->findNext();
  }
  editor_->endUndoAction();
  findStatus_->setText(QStringLiteral("%1 replaced").arg(replacements));
}

void MainWindow::chooseFile() {
  const QString path = QFileDialog::getOpenFileName(this, "Open benchmark document", currentPath_, "Markdown (*.md *.markdown *.txt);;All files (*)");
  if (!path.isEmpty()) openFile(path);
}

void MainWindow::createNote() {
  if (workspace_.workspaceRoot().isEmpty()) {
    QMessageBox::information(this, QStringLiteral("New note"), QStringLiteral("Open a workspace note before creating another note."));
    return;
  }
  bool accepted = false;
  QString title = QInputDialog::getText(
      this, QStringLiteral("New note"), QStringLiteral("Title"), QLineEdit::Normal,
      QStringLiteral("Untitled"), &accepted).trimmed();
  if (!accepted) return;
  if (title.isEmpty()) title = QStringLiteral("Untitled");

  QString fileName = title;
  fileName.replace(QRegularExpression(QStringLiteral("[<>:\"/\\\\|?*\\x00-\\x1f]")), QStringLiteral("-"));
  fileName = fileName.trimmed();
  while (fileName.endsWith(QLatin1Char('.'))) fileName.chop(1);
  if (fileName.isEmpty()) fileName = QStringLiteral("Untitled");
  const QDir workspaceRoot(workspace_.workspaceRoot());
  QDir notesDirectory(workspaceRoot.exists(QStringLiteral("notes"))
      ? workspaceRoot.filePath(QStringLiteral("notes")) : workspace_.workspaceRoot());
  QString path = notesDirectory.filePath(fileName + QStringLiteral(".md"));
  int suffix = 2;
  while (QFileInfo::exists(path)) {
    path = notesDirectory.filePath(QStringLiteral("%1 %2.md").arg(fileName).arg(suffix++));
  }
  QString errorMessage;
  const std::optional<DocumentFile> created = DocumentFile::create(path, title, &errorMessage);
  if (!created.has_value()) {
    QMessageBox::critical(this, QStringLiteral("New note failed"), errorMessage);
    return;
  }
  workspaceWatcher_->acknowledgeWrite(path, created->serializedContent());
  workspace_.refresh();
  refreshWorkspaceViews();
  openFile(path);
}

void MainWindow::duplicateNote() {
  if (!document_.has_value()) return;
  storeActiveDocumentState();
  const QFileInfo source(document_->path());
  const QDir directory = source.absoluteDir();
  const QString stem = source.completeBaseName();
  const QString extension = source.suffix().isEmpty() ? QStringLiteral("md") : source.suffix();
  int copyNumber = 2;
  QString title = QStringLiteral("%1 %2").arg(stem).arg(copyNumber);
  QString path = directory.filePath(QStringLiteral("%1.%2").arg(title, extension));
  while (QFileInfo::exists(path)) {
    title = QStringLiteral("%1 %2").arg(stem).arg(++copyNumber);
    path = directory.filePath(QStringLiteral("%1.%2").arg(title, extension));
  }
  QString errorMessage;
  QByteArray writtenContent;
  if (!document_->writeCopy(path, title, editor_->text(), &errorMessage, &writtenContent)) {
    QMessageBox::critical(this, QStringLiteral("Duplicate failed"), errorMessage);
    return;
  }
  workspaceWatcher_->acknowledgeWrite(path, writtenContent);
  workspace_.refresh();
  refreshWorkspaceViews();
  openFile(path);
}

void MainWindow::importNotes() {
  if (workspace_.workspaceRoot().isEmpty()) return;
  const QStringList paths = QFileDialog::getOpenFileNames(
      this, QStringLiteral("Import notes"), QString(),
      QStringLiteral("Supported notes (*.enex *.md *.mkd *.mdwn *.mdown *.markdown *.markdn *.mdtxt *.mdtext *.txt);;"
                     "Evernote export (*.enex);;Markdown (*.md *.mkd *.mdwn *.mdown *.markdown *.markdn *.mdtxt *.mdtext *.txt)"));
  if (paths.isEmpty()) return;
  const ImportResult result = NoteTransferService::importFiles(paths, workspace_.workspaceRoot());
  workspace_.refresh();
  refreshWorkspaceViews();
  QString summary = QStringLiteral("Imported %1 notes and %2 attachments.")
                        .arg(result.notesImported).arg(result.attachmentsImported);
  if (!result.errors.isEmpty()) {
    summary += QStringLiteral("\n\n%1").arg(result.errors.join(QLatin1Char('\n')));
    QMessageBox::warning(this, QStringLiteral("Import completed with errors"), summary);
  } else {
    QMessageBox::information(this, QStringLiteral("Import complete"), summary);
  }
}

void MainWindow::exportMarkdown() {
  if (!document_.has_value() || !maybeSave()) return;
  const QString path = QFileDialog::getSaveFileName(
      this, QStringLiteral("Export Markdown"), QFileInfo(currentPath_).fileName(),
      QStringLiteral("Markdown (*.md)"));
  if (path.isEmpty()) return;
  QString error;
  if (!writeExportFile(path, document_->serializedContent(), &error)) {
    QMessageBox::critical(this, QStringLiteral("Export failed"), error);
  } else {
    statusBar()->showMessage(QStringLiteral("Exported %1").arg(path), 3000);
  }
}

void MainWindow::exportHtml() {
  if (!document_.has_value() || !maybeSave()) return;
  const QString suggested = QFileInfo(currentPath_).completeBaseName() + QStringLiteral(".html");
  const QString destination = QFileDialog::getSaveFileName(
      this, QStringLiteral("Export HTML"), suggested, QStringLiteral("HTML document (*.html)"));
  if (destination.isEmpty()) return;
  const QString sourcePath = currentPath_;
  const QString title = QFileInfo(currentPath_).completeBaseName();
  const QPointer<MainWindow> guard(this);
  preview_->page()->runJavaScript(
      QStringLiteral("document.getElementById('preview')?.innerHTML || ''"),
      [guard, destination, sourcePath, title](const QVariant& value) {
    if (guard.isNull()) return;
    const QString html = selfContainedPreviewHtml(value.toString(), title, sourcePath, guard->workspace_);
    QString error;
    if (!writeExportFile(destination, html.toUtf8(), &error)) {
      QMessageBox::critical(guard, QStringLiteral("Export failed"), error);
    } else {
      guard->statusBar()->showMessage(QStringLiteral("Exported %1").arg(destination), 3000);
    }
  });
}

void MainWindow::exportPdf() {
  if (!document_.has_value() || !maybeSave()) return;
  const QString suggested = QFileInfo(currentPath_).completeBaseName() + QStringLiteral(".pdf");
  const QString destination = QFileDialog::getSaveFileName(
      this, QStringLiteral("Export PDF"), suggested, QStringLiteral("PDF document (*.pdf)"));
  if (destination.isEmpty()) return;
  const QString sourcePath = currentPath_;
  const QString title = QFileInfo(currentPath_).completeBaseName();
  const QPointer<MainWindow> guard(this);
  preview_->page()->runJavaScript(
      QStringLiteral("document.getElementById('preview')?.innerHTML || ''"),
      [guard, destination, sourcePath, title](const QVariant& value) {
    if (guard.isNull()) return;
    const QString html = selfContainedPreviewHtml(
        value.toString(), title, sourcePath, guard->workspace_, true);

    QTemporaryFile temporary(
        QDir(QDir::tempPath()).filePath(QStringLiteral("el-baton-print-XXXXXX.html")));
    temporary.setAutoRemove(false);
    const QByteArray encodedHtml = html.toUtf8();
    if (!temporary.open() ||
        temporary.write(encodedHtml) != encodedHtml.size()) {
      QMessageBox::critical(guard, QStringLiteral("Export failed"),
                            QStringLiteral("Unable to create the temporary print document."));
      return;
    }
    const QString temporaryPath = temporary.fileName();
    temporary.close();

    auto* profile = new QWebEngineProfile(guard);
    auto* page = new QWebEnginePage(profile, guard);
    page->settings()->setAttribute(
        QWebEngineSettings::PrintElementBackgrounds, true);
    page->settings()->setAttribute(
        QWebEngineSettings::PreferCSSMarginsForPrinting, true);
    QObject::connect(guard, &QObject::destroyed, page,
                     [temporaryPath] { QFile::remove(temporaryPath); });
    QObject::connect(page, &QWebEnginePage::loadFinished, guard,
                     [guard, page, profile, temporaryPath, destination](bool loaded) {
      const auto cleanup = [page, profile, temporaryPath] {
        QFile::remove(temporaryPath);
        page->deleteLater();
        profile->deleteLater();
      };
      if (guard.isNull()) {
        cleanup();
        return;
      }
      if (!loaded) {
        cleanup();
        QMessageBox::critical(guard, QStringLiteral("Export failed"),
                              QStringLiteral("Unable to load the temporary print document."));
        return;
      }
      page->runJavaScript(QStringLiteral(R"JS(
        (async () => {
          document.querySelectorAll('details').forEach(node => { node.open = true; });
          if (window.mermaid) {
            mermaid.initialize({
              startOnLoad: false,
              securityLevel: 'strict',
              theme: 'default',
              themeVariables: { background: 'transparent' }
            });
            const diagrams = [...document.querySelectorAll('.qt-mermaid[data-source-b64]')];
            for (let index = 0; index < diagrams.length; index++) {
              const node = diagrams[index];
              try {
                const binary = atob(node.dataset.sourceB64);
                const source = new TextDecoder().decode(
                  Uint8Array.from(binary, character => character.charCodeAt(0)));
                const result = await mermaid.render(`qt-print-mermaid-${index}`, source);
                node.innerHTML = typeof result === 'string' ? result : result.svg;
                node.hidden = false;
              } catch {
                node.hidden = true;
              }
            }
          }
          if (document.fonts?.ready) await document.fonts.ready;
          await new Promise(resolve => requestAnimationFrame(
            () => requestAnimationFrame(resolve)));
          return document.documentElement.scrollHeight;
        })()
      )JS"), [guard, page, profile, temporaryPath, destination](const QVariant&) {
        if (guard.isNull()) {
          QFile::remove(temporaryPath);
          page->deleteLater();
          profile->deleteLater();
          return;
        }
        page->printToPdf(
            [guard, page, profile, temporaryPath, destination](const QByteArray& pdf) {
          QFile::remove(temporaryPath);
          page->deleteLater();
          profile->deleteLater();
          if (guard.isNull()) return;
          QString error;
          if (pdf.isEmpty() || !writeExportFile(destination, pdf, &error)) {
            QMessageBox::critical(
                guard, QStringLiteral("Export failed"),
                error.isEmpty()
                    ? QStringLiteral("Qt WebEngine did not produce a PDF.")
                    : error);
          } else {
            guard->statusBar()->showMessage(
                QStringLiteral("Exported %1").arg(destination), 3000);
          }
        });
      });
    });
    page->load(QUrl::fromLocalFile(temporaryPath));
  });
}

void MainWindow::toggleEditing(bool editing) {
  if (updatingViewModeActions_) return;
  if (viewMode_ == EditorViewMode::Split) {
    QScopedValueRollback updating(updatingViewModeActions_, true);
    editAction_->setChecked(true);
    return;
  }
  setEditorViewMode(editing ? EditorViewMode::Edit : EditorViewMode::Preview);
}

void MainWindow::setEditorViewMode(EditorViewMode mode) {
  if (editor_ == nullptr || preview_ == nullptr || documentSplitter_ == nullptr) return;
  if (viewMode_ == mode) return;
  if (viewMode_ == EditorViewMode::Split) splitViewSizes_ = documentSplitter_->sizes();
  if ((viewMode_ == EditorViewMode::Edit && mode != EditorViewMode::Edit) ||
      (viewMode_ == EditorViewMode::Split && mode != EditorViewMode::Split)) {
    autosaveActiveDocument();
  }
  viewMode_ = mode;
  editor_->setVisible(mode != EditorViewMode::Preview);
  preview_->setVisible(mode != EditorViewMode::Edit);
  if (mode == EditorViewMode::Split) documentSplitter_->setSizes(splitViewSizes_);
  {
    QScopedValueRollback updating(updatingViewModeActions_, true);
    editAction_->setChecked(mode != EditorViewMode::Preview);
    splitAction_->setChecked(mode == EditorViewMode::Split);
  }
  settings_.setValue(QStringLiteral("editor.editing"), mode != EditorViewMode::Preview);
  settings_.setValue(QStringLiteral("editor.split"), mode == EditorViewMode::Split);
  QString errorMessage;
  if (!settings_.save(&errorMessage)) qWarning() << "Unable to save editor view mode:" << errorMessage;
  if (mode != EditorViewMode::Preview) editor_->setFocus();
}

void MainWindow::toggleSplitView() {
  if (viewMode_ == EditorViewMode::Split) {
    setEditorViewMode(previousSingleViewMode_);
    return;
  }
  previousSingleViewMode_ = viewMode_;
  setEditorViewMode(EditorViewMode::Split);
}

void MainWindow::replaceEditorRange(
    int startByte,
    int endByte,
    const QString& replacement,
    int caretByte) {
  if (startByte < 0 || endByte < startByte || endByte > editor_->length()) return;
  const QByteArray bytes = replacement.toUtf8();
  QScopedValueRollback applying(applyingEditorTransform_, true);
  editor_->beginUndoAction();
  editor_->SendScintilla(QsciScintilla::SCI_SETTARGETSTART, startByte);
  editor_->SendScintilla(QsciScintilla::SCI_SETTARGETEND, endByte);
  editor_->SendScintilla(QsciScintilla::SCI_REPLACETARGET, bytes.size(), bytes.constData());
  editor_->SendScintilla(QsciScintilla::SCI_SETSEL, caretByte, caretByte);
  editor_->endUndoAction();
}

void MainWindow::wrapEditorSelection(const QString& open, const QString& close) {
  if (viewMode_ == EditorViewMode::Preview || !document_.has_value()) return;
  int startLine = 0;
  int startIndex = 0;
  int endLine = 0;
  int endIndex = 0;
  if (editor_->hasSelectedText()) {
    editor_->getSelection(&startLine, &startIndex, &endLine, &endIndex);
  } else {
    editor_->getCursorPosition(&startLine, &startIndex);
    endLine = startLine;
    endIndex = startIndex;
  }
  const int start = editor_->positionFromLineIndex(startLine, startIndex);
  const int end = editor_->positionFromLineIndex(endLine, endIndex);
  const QByteArray selected = editor_->text().toUtf8().mid(start, end - start);
  const QByteArray openBytes = open.toUtf8();
  const QByteArray replacement = openBytes + selected + close.toUtf8();
  QScopedValueRollback applying(applyingEditorTransform_, true);
  editor_->beginUndoAction();
  editor_->SendScintilla(QsciScintilla::SCI_SETTARGETSTART, start);
  editor_->SendScintilla(QsciScintilla::SCI_SETTARGETEND, end);
  editor_->SendScintilla(QsciScintilla::SCI_REPLACETARGET, replacement.size(), replacement.constData());
  if (start == end) {
    editor_->SendScintilla(QsciScintilla::SCI_SETSEL, start + openBytes.size(), start + openBytes.size());
  } else {
    editor_->SendScintilla(QsciScintilla::SCI_SETSEL, start + openBytes.size(),
                           start + openBytes.size() + selected.size());
  }
  editor_->endUndoAction();
}

void MainWindow::toggleTaskLines(bool toggleDone) {
  if (viewMode_ == EditorViewMode::Preview || !document_.has_value()) return;
  int startLine = 0;
  int startIndex = 0;
  int endLine = 0;
  int endIndex = 0;
  if (editor_->hasSelectedText()) {
    editor_->getSelection(&startLine, &startIndex, &endLine, &endIndex);
    if (endIndex == 0 && endLine > startLine) --endLine;
  } else {
    editor_->getCursorPosition(&startLine, &startIndex);
    endLine = startLine;
  }
  QScopedValueRollback applying(applyingEditorTransform_, true);
  editor_->beginUndoAction();
  for (int line = endLine; line >= startLine; --line) {
    QString before = editor_->text(line);
    while (before.endsWith(QLatin1Char('\n')) || before.endsWith(QLatin1Char('\r'))) before.chop(1);
    const QString after = MarkdownEdits::toggleTaskLine(before, toggleDone);
    if (before == after) continue;
    const int start = editor_->positionFromLineIndex(line, 0);
    const QByteArray beforeBytes = before.toUtf8();
    const QByteArray afterBytes = after.toUtf8();
    editor_->SendScintilla(QsciScintilla::SCI_SETTARGETSTART, start);
    editor_->SendScintilla(QsciScintilla::SCI_SETTARGETEND,
                           start + static_cast<int>(beforeBytes.size()));
    editor_->SendScintilla(QsciScintilla::SCI_REPLACETARGET, afterBytes.size(), afterBytes.constData());
  }
  editor_->endUndoAction();
}

void MainWindow::updateMarkdownCompletions(bool explicitRequest) {
  const bool batteryMode = globalConfig_.value(QStringLiteral("battery.enabled"), false).toBool();
  if (viewMode_ == EditorViewMode::Preview ||
      globalConfig_.value(QStringLiteral("monaco.editorOptions.disableSuggestions"), false).toBool() ||
      (batteryMode && globalConfig_.value(QStringLiteral("battery.disableAutocomplete"), false).toBool())) return;
  const QString source = editor_->text();
  const int cursorByte = static_cast<int>(editor_->SendScintilla(QsciScintilla::SCI_GETCURRENTPOS));
  const qsizetype cursorCharacter = QString::fromUtf8(source.toUtf8().first(cursorByte)).size();
  const MarkdownCompletionResult result = MarkdownCompletion::suggestions(
      source, cursorCharacter, workspace_.workspaceRoot(), currentPath_, emojiCompletions_);
  if (result.isEmpty()) {
    if (explicitRequest) statusBar()->showMessage(QStringLiteral("No Markdown completions here."), 2000);
    return;
  }
  completionInsertions_.clear();
  QStringList labels;
  for (const MarkdownCompletionItem& item : result.items) {
    QString label = item.label;
    while (completionInsertions_.contains(label)) label += QLatin1Char(' ');
    completionInsertions_.insert(label, item.insertText);
    labels.append(label);
  }
  completionReplaceStartByte_ = source.first(result.replaceStart).toUtf8().size();
  completionReplaceEndByte_ = source.first(result.replaceStart + result.replaceLength).toUtf8().size();
  editor_->showUserList(71, labels);
}

void MainWindow::formatTouchedTables() {
  if (tableTouchedLines_.isEmpty() || applyingEditorTransform_ ||
      globalConfig_.value(QStringLiteral("monaco.disableAutomaticTableFormatting"), false).toBool()) return;
  QList<int> lines = tableTouchedLines_.values();
  tableTouchedLines_.clear();
  std::sort(lines.begin(), lines.end());
  QString source = editor_->text();
  const QByteArray originalUtf8 = source.toUtf8();
  const int anchorByte = static_cast<int>(editor_->SendScintilla(QsciScintilla::SCI_GETANCHOR));
  const int caretByte = static_cast<int>(editor_->SendScintilla(QsciScintilla::SCI_GETCURRENTPOS));
  QVector<qsizetype> offsets = {
      QString::fromUtf8(originalUtf8.first(anchorByte)).size(),
      QString::fromUtf8(originalUtf8.first(caretByte)).size()};
  bool changed = false;
  for (const int line : lines) {
    MarkdownTableFormatResult result = MarkdownEdits::formatTableAtLine(source, line, offsets);
    if (!result.changed()) continue;
    source = std::move(result.source);
    offsets = std::move(result.mappedOffsets);
    changed = true;
  }
  if (!changed) return;
  const int firstVisible = editor_->firstVisibleLine();
  const QByteArray replacement = source.toUtf8();
  const int nextAnchor = source.first(offsets.at(0)).toUtf8().size();
  const int nextCaret = source.first(offsets.at(1)).toUtf8().size();
  QScopedValueRollback applying(applyingEditorTransform_, true);
  editor_->beginUndoAction();
  editor_->SendScintilla(QsciScintilla::SCI_SETTARGETSTART, 0);
  editor_->SendScintilla(QsciScintilla::SCI_SETTARGETEND, editor_->length());
  editor_->SendScintilla(QsciScintilla::SCI_REPLACETARGET, replacement.size(), replacement.constData());
  editor_->SendScintilla(QsciScintilla::SCI_SETSEL, nextAnchor, nextCaret);
  editor_->setFirstVisibleLine(firstVisible);
  editor_->endUndoAction();
}

bool MainWindow::handleMarkdownAutoPair(QKeyEvent* event) {
  if (event->isAutoRepeat() || event->text().size() != 1 ||
      (event->modifiers() & (Qt::ControlModifier | Qt::AltModifier | Qt::MetaModifier))) return false;
  const QChar typed = event->text().at(0);
  const QHash<QChar, QChar> pairs = {
      {QLatin1Char('('), QLatin1Char(')')}, {QLatin1Char('['), QLatin1Char(']')},
      {QLatin1Char('{'), QLatin1Char('}')}, {QLatin1Char('*'), QLatin1Char('*')},
      {QLatin1Char('_'), QLatin1Char('_')}, {QLatin1Char('~'), QLatin1Char('~')},
      {QLatin1Char('`'), QLatin1Char('`')}};
  const QSet<QChar> closing = {QLatin1Char(')'), QLatin1Char(']'), QLatin1Char('}')};
  if (!pairs.contains(typed) && !closing.contains(typed)) return false;
  if (editor_->hasSelectedText()) {
    const QChar open = pairs.contains(typed) ? typed
        : typed == QLatin1Char(')') ? QLatin1Char('(')
        : typed == QLatin1Char(']') ? QLatin1Char('[') : QLatin1Char('{');
    wrapEditorSelection(open, pairs.value(open));
    return true;
  }
  const int cursor = static_cast<int>(editor_->SendScintilla(QsciScintilla::SCI_GETCURRENTPOS));
  const QByteArray source = editor_->text().toUtf8();
  if ((closing.contains(typed) || typed == QLatin1Char('`')) &&
      cursor < source.size() && source.at(cursor) == typed.toLatin1()) {
    editor_->SendScintilla(QsciScintilla::SCI_SETSEL, cursor + 1, cursor + 1);
    return true;
  }
  if (typed == QLatin1Char('`') && source.first(cursor).endsWith("``")) {
    const QByteArray insertion("`\n```");
    replaceEditorRange(cursor, cursor, QString::fromUtf8(insertion), cursor + 1);
    return true;
  }
  if (!pairs.contains(typed)) return false;
  const QString insertion = QString(typed) + pairs.value(typed);
  replaceEditorRange(cursor, cursor, insertion, cursor + QString(typed).toUtf8().size());
  return true;
}

void MainWindow::editTags() {
  if (!document_.has_value()) return;
  drainAutosaveWrite();
  QDialog dialog(this);
  dialog.setWindowTitle(QStringLiteral("Edit Tags"));
  dialog.setMinimumWidth(390);
  auto* layout = new QVBoxLayout(&dialog);
  layout->setContentsMargins(14, 14, 14, 14);
  layout->setSpacing(9);
  auto* heading = new QLabel(QStringLiteral("Tags on this note"), &dialog);
  heading->setObjectName(QStringLiteral("paneHeading"));
  layout->addWidget(heading);
  auto* currentTags = new QListWidget(&dialog);
  currentTags->setObjectName(QStringLiteral("noteList"));
  currentTags->setMinimumHeight(120);
  currentTags->addItems(document_->tags());
  layout->addWidget(currentTags);
  const auto persistTags = [this, currentTags, &dialog] {
    QStringList tags;
    for (int index = 0; index < currentTags->count(); ++index) tags.append(currentTags->item(index)->text());
    tags.sort(Qt::CaseInsensitive);
    QString errorMessage;
    if (!document_->setTags(tags, &errorMessage)) {
      QMessageBox::critical(&dialog, QStringLiteral("Tag update failed"), errorMessage);
      return;
    }
    workspaceWatcher_->acknowledgeWrite(document_->path(), document_->serializedContent());
    if (activeDocumentIndex_ >= 0) openDocuments_[activeDocumentIndex_].document = *document_;
    workspace_.refresh();
    refreshWorkspaceViews();
    updateInfoPanel();
  };

  auto* remove = new QPushButton(QStringLiteral("Remove Selected"), &dialog);
  remove->setEnabled(currentTags->currentItem() != nullptr);
  connect(currentTags, &QListWidget::currentItemChanged, remove, [remove](QListWidgetItem* item) {
    remove->setEnabled(item != nullptr);
  });
  connect(remove, &QPushButton::clicked, currentTags, [currentTags, persistTags] {
    delete currentTags->takeItem(currentTags->currentRow());
    persistTags();
  });
  layout->addWidget(remove, 0, Qt::AlignRight);

  auto* addRow = new QWidget(&dialog);
  auto* addLayout = new QHBoxLayout(addRow);
  addLayout->setContentsMargins(0, 0, 0, 0);
  auto* input = new QLineEdit(addRow);
  input->setObjectName(QStringLiteral("navigationSearch"));
  input->setPlaceholderText(QStringLiteral("Add tags…"));
  QStringList suggestions;
  const QStringList assignedTags = document_->tags();
  for (const NoteSummary& note : workspace_.notes()) {
    for (const QString& tag : note.tags) {
      if (!assignedTags.contains(tag, Qt::CaseInsensitive) && !suggestions.contains(tag, Qt::CaseInsensitive)) suggestions.append(tag);
    }
  }
  suggestions.sort(Qt::CaseInsensitive);
  auto* completionModel = new QStringListModel(suggestions, input);
  auto* completer = new QCompleter(completionModel, input);
  completer->setCaseSensitivity(Qt::CaseInsensitive);
  completer->setFilterMode(Qt::MatchContains);
  input->setCompleter(completer);
  auto* add = new QPushButton(QStringLiteral("Add"), addRow);
  addLayout->addWidget(input, 1);
  addLayout->addWidget(add);
  layout->addWidget(addRow);
  const auto addTags = [input, currentTags, persistTags] {
    const QStringList values = input->text().split(QLatin1Char(','), Qt::SkipEmptyParts);
    for (const QString& value : values) {
      const QString tag = value.trimmed();
      if (tag.isEmpty()) continue;
      bool exists = false;
      for (int index = 0; index < currentTags->count(); ++index) {
        if (currentTags->item(index)->text().compare(tag, Qt::CaseInsensitive) == 0) {
          exists = true;
          break;
        }
      }
      if (!exists) currentTags->addItem(tag);
    }
    if (!values.isEmpty()) persistTags();
    input->clear();
    input->setFocus();
  };
  connect(add, &QPushButton::clicked, &dialog, addTags);
  connect(input, &QLineEdit::returnPressed, &dialog, addTags);
  connect(currentTags, &QListWidget::itemDoubleClicked, currentTags, [currentTags, persistTags](QListWidgetItem* item) {
    delete currentTags->takeItem(currentTags->row(item));
    persistTags();
  });

  auto* buttons = new QDialogButtonBox(QDialogButtonBox::Close, &dialog);
  connect(buttons, &QDialogButtonBox::rejected, &dialog, &QDialog::reject);
  layout->addWidget(buttons);
  input->setFocus();
  dialog.exec();
}

void MainWindow::addAttachment() {
  if (!document_.has_value() || workspace_.workspaceRoot().isEmpty()) return;
  const QString sourcePath = QFileDialog::getOpenFileName(this, QStringLiteral("Add Attachment"));
  if (sourcePath.isEmpty()) return;
  QDir attachmentsDirectory(QDir(workspace_.workspaceRoot()).filePath(QStringLiteral("attachments")));
  if (!attachmentsDirectory.exists() && !QDir().mkpath(attachmentsDirectory.absolutePath())) {
    QMessageBox::critical(this, QStringLiteral("Attachment failed"), QStringLiteral("Unable to create the attachments directory."));
    return;
  }
  const QFileInfo source(sourcePath);
  const QString stem = source.completeBaseName();
  const QString suffix = source.suffix();
  QString fileName = source.fileName();
  QString destination = attachmentsDirectory.filePath(fileName);
  int copyNumber = 2;
  while (QFileInfo::exists(destination)) {
    fileName = suffix.isEmpty()
        ? QStringLiteral("%1 %2").arg(stem).arg(copyNumber++)
        : QStringLiteral("%1 %2.%3").arg(stem).arg(copyNumber++).arg(suffix);
    destination = attachmentsDirectory.filePath(fileName);
  }
  if (!QFile::copy(sourcePath, destination)) {
    QMessageBox::critical(this, QStringLiteral("Attachment failed"), QStringLiteral("Unable to copy %1.").arg(source.fileName()));
    return;
  }
  editor_->insert(QStringLiteral("[%1](@attachment/%2)").arg(fileName, QString::fromUtf8(QUrl::toPercentEncoding(fileName))));
  editor_->setFocus();
}

void MainWindow::toggleFavorite() {
  if (!document_.has_value()) return;
  drainAutosaveWrite();
  const bool enabled = !document_->metadataFlag(NoteFlag::Favorited);
  QString errorMessage;
  if (!document_->setMetadataFlag(NoteFlag::Favorited, enabled, &errorMessage)) {
    QMessageBox::critical(this, QStringLiteral("Favorite failed"), errorMessage);
    return;
  }
  workspaceWatcher_->acknowledgeWrite(document_->path(), document_->serializedContent());
  if (activeDocumentIndex_ >= 0) openDocuments_[activeDocumentIndex_].document = *document_;
  workspace_.refresh();
  refreshWorkspaceViews();
  updateDocumentActions();
}

void MainWindow::togglePinned() {
  if (!document_.has_value()) return;
  drainAutosaveWrite();
  const bool enabled = !document_->metadataFlag(NoteFlag::Pinned);
  QString errorMessage;
  if (!document_->setMetadataFlag(NoteFlag::Pinned, enabled, &errorMessage)) {
    QMessageBox::critical(this, QStringLiteral("Pin failed"), errorMessage);
    return;
  }
  workspaceWatcher_->acknowledgeWrite(document_->path(), document_->serializedContent());
  if (activeDocumentIndex_ >= 0) openDocuments_[activeDocumentIndex_].document = *document_;
  workspace_.refresh();
  refreshWorkspaceViews();
  updateDocumentActions();
}

void MainWindow::toggleDeleted() {
  if (!document_.has_value()) return;
  drainAutosaveWrite();
  const bool enabled = !document_->metadataFlag(NoteFlag::Deleted);
  if (enabled && QMessageBox::question(
      this, QStringLiteral("Move to Trash"),
      QStringLiteral("Move %1 to Trash?").arg(QFileInfo(currentPath_).fileName())) != QMessageBox::Yes) return;
  QString errorMessage;
  if (!document_->setMetadataFlag(NoteFlag::Deleted, enabled, &errorMessage)) {
    QMessageBox::critical(this, QStringLiteral("Trash operation failed"), errorMessage);
    return;
  }
  workspaceWatcher_->acknowledgeWrite(document_->path(), document_->serializedContent());
  if (activeDocumentIndex_ >= 0) openDocuments_[activeDocumentIndex_].document = *document_;
  workspace_.refresh();
  refreshWorkspaceViews();
  updateDocumentActions();
}

void MainWindow::openFile(const QString& path) {
  const QString absolutePath = QFileInfo(path).absoluteFilePath();
  for (int index = 0; index < openDocuments_.size(); ++index) {
    if (openDocuments_.at(index).document.path() != absolutePath) continue;
    if (noteTabs_->currentIndex() == index) {
      activateDocument(index);
    } else {
      noteTabs_->setCurrentIndex(index);
    }
    return;
  }

  QString errorMessage;
  std::optional<DocumentFile> document = DocumentFile::load(absolutePath, &errorMessage);
  if (!document.has_value()) {
    QMessageBox::critical(
        this,
        "Open failed",
        QString("Unable to open %1: %2").arg(path, errorMessage));
    return;
  }

  storeActiveDocumentState();
  const int newIndex = openDocuments_.size();
  openDocuments_.append({*document, document->body(), false, 0, 0});
  {
    const QSignalBlocker blocker(noteTabs_);
    noteTabs_->addTab(QFileInfo(document->path()).fileName());
    noteTabs_->setTabData(newIndex, document->path());
    noteTabs_->setTabToolTip(newIndex, QFileInfo(document->path()).fileName());
    noteTabs_->setCurrentIndex(newIndex);
  }
  activateDocument(newIndex);
  persistOpenTabs();
}

void MainWindow::storeActiveDocumentState() {
  if (switchingDocuments_ || activeDocumentIndex_ < 0 || activeDocumentIndex_ >= openDocuments_.size() || !document_.has_value()) return;
  OpenDocumentState& state = openDocuments_[activeDocumentIndex_];
  state.document = *document_;
  state.body = editor_->text();
  state.modified = editor_->isModified();
  editor_->getCursorPosition(&state.cursorLine, &state.cursorIndex);
}

void MainWindow::activateDocument(int index) {
  if (switchingDocuments_ || index < 0 || index >= openDocuments_.size()) return;
  if (document_.has_value() && editor_->isModified() && !saveActiveDocument(false)) {
    const QSignalBlocker blocker(noteTabs_);
    noteTabs_->setCurrentIndex(activeDocumentIndex_);
    return;
  }
  storeActiveDocumentState();
  switchingDocuments_ = true;
  activeDocumentIndex_ = index;
  OpenDocumentState& state = openDocuments_[index];
  document_ = state.document;
  currentPath_ = state.document.path();
  if (workspace_.workspaceRoot().isEmpty()) {
    workspace_.inferFromDocument(currentPath_);
    globalConfig_.setWorkspaceRoot(workspace_.workspaceRoot());
    rebuildSettingsPage();
    settings_.setValue(QStringLiteral("cwd"), workspace_.workspaceRoot());
    QString settingsError;
    if (!settings_.save(&settingsError)) {
      qWarning() << "Unable to save inferred workspace:" << settingsError;
    }
    workspaceWatcher_->setWorkspaceRoot(workspace_.workspaceRoot());
    workspaceWatcher_->start();
  }
  workspace_.refresh();
  editor_->setText(state.body);
  editor_->setModified(state.modified);
  editorModifiedAt_ = {};
  editor_->setCursorPosition(state.cursorLine, state.cursorIndex);
  const QString fileName = QFileInfo(currentPath_).fileName();
  refreshWorkspaceViews();
  updateInfoPanel();
  updateWindowTitle();
  switchingDocuments_ = false;
  renderDocument();
  persistOpenTabs();
}

void MainWindow::closeDocument(int index) {
  if (index < 0 || index >= openDocuments_.size()) return;
  drainAutosaveWrite();
  storeActiveDocumentState();
  OpenDocumentState& state = openDocuments_[index];
  if (state.modified) {
    const auto decision = QMessageBox::warning(
        this,
        QStringLiteral("Unsaved changes"),
        QStringLiteral("Save changes to %1?").arg(QFileInfo(state.document.path()).fileName()),
        QMessageBox::Save | QMessageBox::Discard | QMessageBox::Cancel,
        QMessageBox::Save);
    if (decision == QMessageBox::Cancel) return;
    if (decision == QMessageBox::Save) {
      QString errorMessage;
      if (!state.document.saveBody(state.body, &errorMessage, true)) {
        QMessageBox::critical(this, QStringLiteral("Save failed"), errorMessage);
        return;
      }
      workspaceWatcher_->acknowledgeWrite(
          state.document.path(), state.document.serializedContent());
    }
  }

  const bool wasActive = index == activeDocumentIndex_;
  {
    const QSignalBlocker blocker(noteTabs_);
    noteTabs_->removeTab(index);
  }
  openDocuments_.removeAt(index);
  if (openDocuments_.isEmpty()) {
    switchingDocuments_ = true;
    activeDocumentIndex_ = -1;
    document_.reset();
    currentPath_.clear();
    editor_->clear();
    editor_->setModified(false);
    switchingDocuments_ = false;
    setWindowTitle(QCoreApplication::applicationName());
    updateDocumentActions();
    persistOpenTabs();
    return;
  }
  if (!wasActive) {
    if (activeDocumentIndex_ > index) --activeDocumentIndex_;
    const QSignalBlocker blocker(noteTabs_);
    noteTabs_->setCurrentIndex(activeDocumentIndex_);
    persistOpenTabs();
    return;
  }
  activeDocumentIndex_ = -1;
  const int nextIndex = std::min(index, static_cast<int>(openDocuments_.size()) - 1);
  {
    const QSignalBlocker blocker(noteTabs_);
    noteTabs_->setCurrentIndex(nextIndex);
  }
  activateDocument(nextIndex);
}

void MainWindow::persistOpenTabs() {
  QStringList paths;
  for (const OpenDocumentState& state : openDocuments_) paths.append(state.document.path());
  settings_.setValue(QStringLiteral("editor.openTabs"), paths);
  settings_.setValue(QStringLiteral("editor.activeTab"), currentPath_);
  QString errorMessage;
  if (!settings_.save(&errorMessage)) qWarning() << "Unable to save open tabs:" << errorMessage;
}

void MainWindow::saveFile() {
  autosaveTimer_.stop();
  (void)saveActiveDocument(true);
}

void MainWindow::autosaveActiveDocument() {
  autosaveTimer_.stop();
  if (switchingDocuments_ || handlingWorkspaceChanges_ ||
      !document_.has_value() || !editor_->isModified()) return;
  if (activeAutosave_.has_value()) {
    autosavePending_ = true;
    return;
  }
  startAutosaveWrite();
}

void MainWindow::startAutosaveWrite() {
  if (activeAutosave_.has_value() || !document_.has_value() ||
      !editor_->isModified()) return;

  const QString bodySnapshot = editor_->text();
  if (bodySnapshot == document_->body()) {
    editor_->setModified(false);
    editorModifiedAt_ = {};
    return;
  }

  const DocumentFile previous = *document_;
  const DocumentFile next =
      document_->withBody(bodySnapshot, true, editorModifiedAt_);
  const int documentIndex = activeDocumentIndex_;
  const quint64 saveGeneration = ++saveGeneration_;
  activeAutosave_.emplace(AutosaveSnapshot{
      saveGeneration, documentIndex, previous, next, bodySnapshot});
  autosavePending_ = false;

  // Match the reference implementation's memory-first ordering. The watcher
  // can now treat the exact bytes written below as an idempotent self-event.
  document_ = next;
  if (documentIndex >= 0 && documentIndex < openDocuments_.size()) {
    OpenDocumentState& state = openDocuments_[documentIndex];
    state.document = next;
    state.body = bodySnapshot;
    state.modified = true;
  }
  workspaceWatcher_->acceptDiskState(next.path(), next.serializedContent());

  autosaveWriteWatcher_.setFuture(QtConcurrent::run(
      [next] {
        QString errorMessage;
        const bool success = next.writeToDisk(&errorMessage);
        return AsyncDocumentSaveResult{success, errorMessage};
      }));
}

void MainWindow::finishAutosaveWrite(bool startPendingWrite) {
  if (!activeAutosave_.has_value() ||
      autosaveWriteWatcher_.isRunning()) return;

  const AsyncDocumentSaveResult result = autosaveWriteWatcher_.result();
  const AutosaveSnapshot snapshot = *activeAutosave_;
  activeAutosave_.reset();
  const bool currentGeneration = snapshot.generation == saveGeneration_;

  if (!result.success) {
    if (currentGeneration) {
      document_ = snapshot.previous;
      workspaceWatcher_->acceptDiskState(
          snapshot.previous.path(), snapshot.previous.serializedContent());
      if (snapshot.documentIndex >= 0 &&
          snapshot.documentIndex < openDocuments_.size()) {
        OpenDocumentState& state = openDocuments_[snapshot.documentIndex];
        state.document = snapshot.previous;
        state.modified = true;
      }
    }
    qWarning() << "Autosave failed for" << snapshot.next.path()
               << result.errorMessage;
    statusBar()->showMessage(
        QStringLiteral("Autosave failed: %1").arg(result.errorMessage), 5000);
  } else if (currentGeneration) {
    workspaceWatcher_->acknowledgeWrite(
        snapshot.next.path(), snapshot.next.serializedContent());
    const bool editorStillMatches =
        currentPath_ == snapshot.next.path() &&
        editor_->text() == snapshot.body;
    if (editorStillMatches) {
      editor_->setModified(false);
      editorModifiedAt_ = {};
      if (snapshot.documentIndex >= 0 &&
          snapshot.documentIndex < openDocuments_.size()) {
        OpenDocumentState& state = openDocuments_[snapshot.documentIndex];
        state.document = snapshot.next;
        state.body = snapshot.body;
        state.modified = false;
      }
    }
  }

  if (!startPendingWrite) {
    autosavePending_ = false;
    return;
  }
  if (autosavePending_) {
    autosavePending_ = false;
    startAutosaveWrite();
  }
}

void MainWindow::drainAutosaveWrite() {
  autosaveTimer_.stop();
  autosavePending_ = false;
  if (!activeAutosave_.has_value()) return;
  autosaveWriteWatcher_.future().waitForFinished();
  finishAutosaveWrite(false);
}

bool MainWindow::saveActiveDocument(bool reportSuccess) {
  drainAutosaveWrite();
  if (!document_.has_value() || !editor_->isModified()) return true;

  const QString bodySnapshot = editor_->text();
  const DocumentFile previous = *document_;
  const DocumentFile next = document_->withBody(bodySnapshot, true, editorModifiedAt_);
  ++saveGeneration_;
  const int documentIndex = activeDocumentIndex_;
  if (documentIndex >= 0 && documentIndex < openDocuments_.size()) {
    OpenDocumentState& state = openDocuments_[documentIndex];
    state.document = next;
    state.body = bodySnapshot;
  }
  document_ = next;
  workspaceWatcher_->acceptDiskState(next.path(), next.serializedContent());

  QString errorMessage;
  if (!next.writeToDisk(&errorMessage)) {
    document_ = previous;
    workspaceWatcher_->acceptDiskState(previous.path(), previous.serializedContent());
    if (documentIndex >= 0 && documentIndex < openDocuments_.size()) {
      openDocuments_[documentIndex].document = previous;
    }
    const QString message = QString("Unable to save %1: %2").arg(currentPath_, errorMessage);
    if (reportSuccess) QMessageBox::critical(this, QStringLiteral("Save failed"), message);
    else {
      qWarning() << message;
      statusBar()->showMessage(QStringLiteral("Autosave failed: %1").arg(errorMessage), 5000);
    }
    return false;
  }
  workspaceWatcher_->acknowledgeWrite(document_->path(), document_->serializedContent());

  editor_->setModified(false);
  editorModifiedAt_ = {};
  if (activeDocumentIndex_ >= 0 && activeDocumentIndex_ < openDocuments_.size()) {
    OpenDocumentState& state = openDocuments_[activeDocumentIndex_];
    state.document = *document_;
    state.body = bodySnapshot;
    state.modified = false;
  }
  updateInfoPanel();
  if (reportSuccess) statusBar()->showMessage(QString("Saved %1").arg(QDir::toNativeSeparators(currentPath_)), 3000);
  return true;
}

bool MainWindow::maybeSave() {
  if (!editor_->isModified()) return true;

  const QMessageBox::StandardButton decision = QMessageBox::warning(
      this,
      "Unsaved changes",
      "Save changes to the current note?",
      QMessageBox::Save | QMessageBox::Discard | QMessageBox::Cancel,
      QMessageBox::Save);
  if (decision == QMessageBox::Cancel) return false;
  if (decision == QMessageBox::Discard) return true;

  saveFile();
  return !editor_->isModified();
}

void MainWindow::updateWindowTitle() {
  const QString fileName = currentPath_.isEmpty() ? QStringLiteral("Untitled") : QFileInfo(currentPath_).fileName();
  const QString dirtyMarker = editor_->isModified() ? QStringLiteral("*") : QString();
  if (noteTabs_ != nullptr && activeDocumentIndex_ >= 0 && activeDocumentIndex_ < noteTabs_->count()) {
    noteTabs_->setTabText(activeDocumentIndex_, fileName + dirtyMarker);
    noteTabs_->setTabToolTip(activeDocumentIndex_, fileName);
  }
  updateDocumentActions();
  setWindowTitle(QString("%1%2 — %3").arg(
      fileName,
      dirtyMarker,
      QCoreApplication::applicationName()));
}

void MainWindow::updateDocumentActions() {
  const bool hasDocument = document_.has_value();
  if (duplicateAction_ != nullptr) duplicateAction_->setEnabled(hasDocument);
  if (importAction_ != nullptr) importAction_->setEnabled(!workspace_.workspaceRoot().isEmpty());
  if (exportMarkdownAction_ != nullptr) exportMarkdownAction_->setEnabled(hasDocument);
  if (exportHtmlAction_ != nullptr) exportHtmlAction_->setEnabled(hasDocument);
  if (exportPdfAction_ != nullptr) exportPdfAction_->setEnabled(hasDocument);
  if (editAction_ != nullptr) editAction_->setEnabled(hasDocument);
  if (splitAction_ != nullptr) splitAction_->setEnabled(hasDocument);
  if (tagsAction_ != nullptr) tagsAction_->setEnabled(hasDocument);
  if (attachmentsAction_ != nullptr) attachmentsAction_->setEnabled(hasDocument);
  if (favoriteAction_ != nullptr) {
    const bool favorited = hasDocument && document_->metadataFlag(NoteFlag::Favorited);
    favoriteAction_->setEnabled(hasDocument);
    favoriteAction_->setChecked(favorited);
    favoriteAction_->setText(favorited ? QStringLiteral("Unfavorite") : QStringLiteral("Favorite"));
  }
  if (pinAction_ != nullptr) {
    const bool pinned = hasDocument && document_->metadataFlag(NoteFlag::Pinned);
    pinAction_->setEnabled(hasDocument);
    pinAction_->setChecked(pinned);
    pinAction_->setText(pinned ? QStringLiteral("Unpin") : QStringLiteral("Pin"));
  }
  if (trashAction_ != nullptr) {
    const bool deleted = hasDocument && document_->metadataFlag(NoteFlag::Deleted);
    trashAction_->setEnabled(hasDocument);
    trashAction_->setText(deleted ? QStringLiteral("Restore from Trash") : QStringLiteral("Move to Trash"));
  }
}

void MainWindow::closeEvent(QCloseEvent* event) {
  (void)saveActiveDocument(false);
  storeActiveDocumentState();
  for (OpenDocumentState& state : openDocuments_) {
    if (!state.modified) continue;
    const auto decision = QMessageBox::warning(
        this,
        QStringLiteral("Unsaved changes"),
        QStringLiteral("Save changes to %1 before closing?").arg(QFileInfo(state.document.path()).fileName()),
        QMessageBox::Save | QMessageBox::Discard | QMessageBox::Cancel,
        QMessageBox::Save);
    if (decision == QMessageBox::Cancel) {
      event->ignore();
      return;
    }
    if (decision == QMessageBox::Save) {
      QString errorMessage;
      if (!state.document.saveBody(state.body, &errorMessage, true)) {
        QMessageBox::critical(this, QStringLiteral("Save failed"), errorMessage);
        event->ignore();
        return;
      }
      workspaceWatcher_->acknowledgeWrite(
          state.document.path(), state.document.serializedContent());
    }
  }
  event->accept();
}

bool MainWindow::eventFilter(QObject* watched, QEvent* event) {
  const bool editorEventTarget = watched == editor_ || watched == editor_->viewport();
  if (editorEventTarget && event->type() == QEvent::KeyPress &&
      handleMarkdownAutoPair(static_cast<QKeyEvent*>(event))) {
    event->accept();
    return true;
  }
  if (watched == editor_ && event->type() == QEvent::FocusOut) {
    autosaveActiveDocument();
  }
  const bool editorContextMenu =
      event->type() == QEvent::ContextMenu &&
      editorEventTarget;
  if (editorContextMenu) {
    auto* context = static_cast<QContextMenuEvent*>(event);
    const QPoint viewportPosition = watched == editor_->viewport()
        ? context->pos()
        : editor_->viewport()->mapFrom(editor_, context->pos());
    const long position = editor_->SendScintilla(
        QsciScintilla::SCI_POSITIONFROMPOINTCLOSE,
        viewportPosition.x(), viewportPosition.y());
    const bool spellingIsCurrent = spellcheckAppliedGeneration_ == spellcheckGeneration_;
    const auto issue = std::find_if(spellingIssues_.cbegin(), spellingIssues_.cend(),
                                    [position](const SpellingIssue& candidate) {
      return position >= candidate.startByte &&
          position <= candidate.startByte + candidate.lengthBytes;
    });
    QMenu menu(this);
    if (spellingIsCurrent && issue != spellingIssues_.cend()) {
      if (issue->suggestions.isEmpty()) {
        QAction* unavailable = menu.addAction(QStringLiteral("No spelling suggestions"));
        unavailable->setEnabled(false);
      } else {
        for (const QString& suggestion : issue->suggestions) {
          connect(menu.addAction(QStringLiteral("Replace with “%1”").arg(suggestion)),
                  &QAction::triggered, this,
                  [this, start = issue->startByte, length = issue->lengthBytes,
                   word = issue->word, suggestion] {
            const QByteArray currentText = editor_->text().toUtf8();
            const QByteArray expectedWord = word.toUtf8();
            if (start < 0 || length < 0 || start + length > currentText.size() ||
                currentText.mid(start, length) != expectedWord) {
              spellcheckTimer_.start();
              return;
            }

            int startLine = 0;
            int startIndex = 0;
            int endLine = 0;
            int endIndex = 0;
            editor_->lineIndexFromPosition(static_cast<int>(start), &startLine, &startIndex);
            editor_->lineIndexFromPosition(static_cast<int>(start + length), &endLine, &endIndex);
            editor_->beginUndoAction();
            editor_->setSelection(startLine, startIndex, endLine, endIndex);
            editor_->replaceSelectedText(suggestion);
            editor_->endUndoAction();
          });
        }
      }
      connect(menu.addAction(QStringLiteral("Add “%1” to dictionary").arg(issue->word)),
              &QAction::triggered, this, [this, word = issue->word] {
        QStringList words;
        const QVariant configured = globalConfig_.value(QStringLiteral("spellcheck.addedWords"));
        for (const QVariant& value : configured.toList()) words.append(value.toString());
        if (words.isEmpty()) words = configured.toStringList();
        if (!words.contains(word, Qt::CaseInsensitive)) words.append(word.toLower());
        words.sort(Qt::CaseInsensitive);
        setGlobalConfigValue(QStringLiteral("spellcheck.addedWords"), words);
        spellcheckTimer_.start();
      });
      menu.addSeparator();
    }
    connect(menu.addAction(QStringLiteral("Cut")), &QAction::triggered, editor_, &QsciScintilla::cut);
    connect(menu.addAction(QStringLiteral("Copy")), &QAction::triggered, editor_, &QsciScintilla::copy);
    connect(menu.addAction(QStringLiteral("Paste")), &QAction::triggered, editor_, &QsciScintilla::paste);
    menu.addSeparator();
    connect(menu.addAction(QStringLiteral("Select All")), &QAction::triggered, editor_, &QsciScintilla::selectAll);
    menu.exec(context->globalPos());
    context->accept();
    return true;
  }
  return QMainWindow::eventFilter(watched, event);
}

void MainWindow::scheduleRender() {
  if (switchingDocuments_) return;
  lastInputNs_ = std::chrono::duration_cast<std::chrono::nanoseconds>(std::chrono::steady_clock::now().time_since_epoch()).count();
  // Fixed-window throttling keeps the preview moving during sustained input.
  // Restarting this timer on every keystroke would turn it into a trailing
  // debounce and starve rendering until typing stopped.
  if (!renderTimer_.isActive()) renderTimer_.start();
}

void MainWindow::renderDocument() {
  if (!previewReady_) return;
  RenderRequest request{
      editor_->text(), ++generation_, lastInputNs_, forceFullPreviewRender_};
  forceFullPreviewRender_ = false;
  if (activeRender_.has_value()) {
    if (pendingRender_.has_value()) {
      request.replaceAll =
          request.replaceAll || pendingRender_->replaceAll;
    }
    pendingRender_ = std::move(request);
    return;
  }
  activeRender_ = std::move(request);
  startRenderWrite();
}

void MainWindow::startRenderWrite() {
  if (!activeRender_.has_value()) return;
  const RenderRequest request = *activeRender_;
  renderWatcher_.setFuture(QtConcurrent::run(
      [pipeline = pipeline_, request] {
        return pipeline->render(
            request.source, request.generation, request.inputTimestampNs);
      }));
}

void MainWindow::finishRenderWrite() {
  if (!activeRender_.has_value() || renderWatcher_.isRunning()) return;
  const RenderResult result = renderWatcher_.result();
  const RenderRequest completed = *activeRender_;
  activeRender_.reset();
  publishRenderResult(result, completed.replaceAll);

  if (pendingRender_.has_value()) {
    activeRender_ = std::move(pendingRender_);
    pendingRender_.reset();
    startRenderWrite();
  }
}

void MainWindow::publishRenderResult(
    const RenderResult& result, bool replaceAll) {
  QElapsedTimer uiTimer;
  uiTimer.start();
  lastNativeTimings_ = result.timings;
  sync_->setBlocks(result.allBlocks, result.generation);
  QJsonObject update = result.toJson(
      replaceAll ? PatchMode::FullDocument : options_.patchMode);
  update.insert("katexEnabled", options_.katexEnabled);
  update.insert("mermaidEnabled", options_.mermaidEnabled);
  update.insert("mermaidTheme", QStringLiteral("dark"));
  update.insert("plantUmlServerUrl", PlantUmlRenderer::normalizeServerUrl(
      globalConfig_.value(QStringLiteral("plantuml.externalServerUrl")).toString()));
  update.insert("overlayEnabled", options_.overlayEnabled);
  update.insert("hiddenMermaidPage", options_.hiddenMermaidPage);
  if (!currentPath_.isEmpty()) {
    const QString directory = QFileInfo(currentPath_).absolutePath() + QLatin1Char('/');
    update.insert("documentBaseUrl", QUrl::fromLocalFile(directory).toString());
  }
  bridge_->publishRender(update);
  lastNativeUiMs_ = uiTimer.nsecsElapsed() / 1'000'000.0;
  updateStatus();
}

void MainWindow::updateStatus(const QJsonObject& browserMetrics) {
  if (!options_.overlayEnabled || status_ == nullptr) return;
  for (auto it = browserMetrics.begin(); it != browserMetrics.end(); ++it) lastBrowserMetrics_.insert(it.key(), it.value());
  const QJsonObject& metrics = lastBrowserMetrics_;
  const double nativeMs = lastNativeTimings_.preprocessMs + lastNativeTimings_.parseMs + lastNativeTimings_.postprocessMs;
  const QString timings = QString("native %1 ms + UI %2 ms | DOM %3 ms | settle %4 ms | UI %5 FPS | render %6/s | sync %7 Hz (%8 dropped) | host CPU %9% | host RSS %10 MiB")
      .arg(nativeMs, 0, 'f', 1)
      .arg(lastNativeUiMs_, 0, 'f', 1)
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
