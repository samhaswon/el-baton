#pragma once

#include "document_file.h"
#include "global_config_store.h"
#include "settings_store.h"
#include "spell_checker.h"
#include "types.h"
#include "workspace_repository.h"

#include <QMainWindow>
#include <QDateTime>
#include <QHash>
#include <QList>
#include <QSet>
#include <QTimer>
#include <QFutureWatcher>

class QAction;
class QLabel;
class QListWidget;
class QTreeWidget;
class QLineEdit;
class QSplitter;
class QStackedWidget;
class QTabBar;
class QToolButton;
class QCheckBox;
class QWebEngineView;
class QWebEnginePage;
class QsciScintilla;
class QCloseEvent;
class QEvent;
class QKeyEvent;

namespace qt_editor {

class MarkdownPipeline;
class PreviewBridge;
class PlantUmlRenderer;
class SyncController;
class WorkspaceWatcher;
class WorkspaceGraphView;
struct WorkspaceChange;

struct AsyncDocumentSaveResult final {
  bool success = false;
  QString errorMessage;
};

class MainWindow final : public QMainWindow {
  Q_OBJECT

 public:
  explicit MainWindow(BenchmarkOptions options, QWidget* parent = nullptr);
  ~MainWindow() override;
  void openFile(const QString& path);

 protected:
  void closeEvent(QCloseEvent* event) override;
  bool eventFilter(QObject* watched, QEvent* event) override;

 private slots:
  void chooseFile();
  void createNote();
  void duplicateNote();
  void importNotes();
  void exportMarkdown();
  void exportHtml();
  void exportPdf();
  void toggleEditing(bool editing);
  void editTags();
  void addAttachment();
  void toggleFavorite();
  void togglePinned();
  void toggleDeleted();
  void saveFile();
  void autosaveActiveDocument();
  void scheduleRender();
  void renderDocument();
  void updateStatus(const QJsonObject& browserMetrics = {});
  void sampleProcessUsage();

 private:
  enum class EditorViewMode { Edit, Split, Preview };

  void configureEditor();
  void configurePreview();
  void createMenus();
  QWidget* createApplicationChrome(QSplitter* documentSplitter);
  QWidget* createActivityBar(QWidget* navigationPane);
  QWidget* createDocumentToolbar();
  QWidget* createFindBar();
  QWidget* createNavigationPane();
  QWidget* createFilePanel();
  QWidget* createExplorerPanel();
  QWidget* createSearchPanel();
  QWidget* createGraphPage();
  QWidget* createInfoPanel();
  QWidget* createHelpPanel();
  QWidget* createSettingsPanel();
  void refreshWorkspaceViews();
  void handleWorkspaceChanges(const QVector<WorkspaceChange>& changes);
  void updateSearchResults();
  void appendSearchResultBatch(quint64 generation);
  void updateInfoPanel();
  void refreshGraphPage();
  void updateDocumentActions();
  void setGlobalConfigValue(const QString& key, const QVariant& value);
  void applyGlobalConfiguration();
  void rebuildSettingsPage();
  void activateDocument(int index);
  void closeDocument(int index);
  void storeActiveDocumentState();
  void persistOpenTabs();
  void startAutosaveWrite();
  void finishAutosaveWrite(bool startPendingWrite = true);
  void drainAutosaveWrite();
  void startRenderWrite();
  void finishRenderWrite();
  void publishRenderResult(const RenderResult& result, bool replaceAll);
  [[nodiscard]] bool saveActiveDocument(bool reportSuccess);
  [[nodiscard]] bool maybeSave();
  void updateWindowTitle();
  void showFindBar(bool replaceMode);
  void findInEditor(bool forward);
  void replaceCurrentMatch();
  void replaceAllMatches();
  void setEditorViewMode(EditorViewMode mode);
  void toggleSplitView();
  void wrapEditorSelection(const QString& open, const QString& close);
  void toggleTaskLines(bool toggleDone);
  void updateMarkdownCompletions(bool explicitRequest = false);
  void formatTouchedTables();
  [[nodiscard]] bool handleMarkdownAutoPair(QKeyEvent* event);
  void replaceEditorRange(int startByte, int endByte, const QString& replacement, int caretByte);

  BenchmarkOptions options_;
  QsciScintilla* editor_ = nullptr;
  QWebEngineView* preview_ = nullptr;
  QSplitter* documentSplitter_ = nullptr;
  QWebEnginePage* hiddenMermaidPage_ = nullptr;
  QWebEngineView* hiddenMermaidView_ = nullptr;
  QLabel* status_ = nullptr;
  QTabBar* noteTabs_ = nullptr;
  QTreeWidget* noteTree_ = nullptr;
  QListWidget* searchResults_ = nullptr;
  QListWidget* outlineList_ = nullptr;
  QListWidget* infoAttachments_ = nullptr;
  QLineEdit* navigationSearch_ = nullptr;
  QWidget* findBar_ = nullptr;
  QLineEdit* findInput_ = nullptr;
  QLineEdit* replaceInput_ = nullptr;
  QToolButton* replaceModeButton_ = nullptr;
  QToolButton* replaceCurrentButton_ = nullptr;
  QToolButton* replaceAllButton_ = nullptr;
  QLabel* findStatus_ = nullptr;
  QCheckBox* findCaseSensitive_ = nullptr;
  QCheckBox* findWholeWord_ = nullptr;
  QCheckBox* findRegex_ = nullptr;
  QStackedWidget* navigationStack_ = nullptr;
  QStackedWidget* mainContentStack_ = nullptr;
  QLabel* infoPath_ = nullptr;
  QLabel* infoCreated_ = nullptr;
  QLabel* infoModified_ = nullptr;
  QLabel* infoTags_ = nullptr;
  QLabel* infoSize_ = nullptr;
  QLabel* infoWords_ = nullptr;
  QLabel* infoLinks_ = nullptr;
  QLabel* infoAttachmentCount_ = nullptr;
  WorkspaceGraphView* graphView_ = nullptr;
  QLabel* graphStats_ = nullptr;
  QLabel* graphSelectionTitle_ = nullptr;
  QLabel* graphSelectionDetail_ = nullptr;
  QAction* openAction_ = nullptr;
  QAction* saveAction_ = nullptr;
  QAction* newAction_ = nullptr;
  QAction* duplicateAction_ = nullptr;
  QAction* importAction_ = nullptr;
  QAction* exportMarkdownAction_ = nullptr;
  QAction* exportHtmlAction_ = nullptr;
  QAction* exportPdfAction_ = nullptr;
  QAction* editAction_ = nullptr;
  QAction* splitAction_ = nullptr;
  QAction* tagsAction_ = nullptr;
  QAction* attachmentsAction_ = nullptr;
  QAction* favoriteAction_ = nullptr;
  QAction* pinAction_ = nullptr;
  QAction* trashAction_ = nullptr;
  MarkdownPipeline* pipeline_ = nullptr;
  PreviewBridge* bridge_ = nullptr;
  PlantUmlRenderer* plantUmlRenderer_ = nullptr;
  WorkspaceWatcher* workspaceWatcher_ = nullptr;
  SyncController* sync_ = nullptr;
  QTimer renderTimer_;
  QTimer usageTimer_;
  QTimer autosaveTimer_;
  QTimer infoRefreshTimer_;
  QTimer searchTimer_;
  QTimer spellcheckTimer_;
  QTimer tableFormatTimer_;
  QFutureWatcher<RenderResult> renderWatcher_;
  QFutureWatcher<AsyncDocumentSaveResult> autosaveWriteWatcher_;
  QFutureWatcher<QVector<SpellingIssue>> spellcheckWatcher_;
  QVector<SpellingIssue> spellingIssues_;
  quint64 spellcheckGeneration_ = 0;
  quint64 spellcheckRequestGeneration_ = 0;
  quint64 spellcheckAppliedGeneration_ = 0;
  qsizetype spellcheckRequestStartByte_ = 0;
  int spellcheckIndicator_ = -1;
  QSet<int> tableTouchedLines_;
  QHash<QString, QString> completionInsertions_;
  QHash<QString, QString> emojiCompletions_;
  int completionReplaceStartByte_ = -1;
  int completionReplaceEndByte_ = -1;
  QString pendingSearchQuery_;
  SearchMode pendingSearchMode_ = SearchMode::Smart;
  QVector<NoteSearchResult> pendingSearchResults_;
  qsizetype nextSearchResult_ = 0;
  quint64 searchGeneration_ = 0;
  QString currentPath_;
  QDateTime editorModifiedAt_;
  std::optional<DocumentFile> document_;
  struct AutosaveSnapshot final {
    quint64 generation = 0;
    int documentIndex = -1;
    DocumentFile previous;
    DocumentFile next;
    QString body;
  };
  std::optional<AutosaveSnapshot> activeAutosave_;
  quint64 saveGeneration_ = 0;
  bool autosavePending_ = false;
  struct OpenDocumentState final {
    DocumentFile document;
    QString body;
    bool modified = false;
    int cursorLine = 0;
    int cursorIndex = 0;
  };
  QVector<OpenDocumentState> openDocuments_;
  int activeDocumentIndex_ = -1;
  bool switchingDocuments_ = false;
  bool handlingWorkspaceChanges_ = false;
  bool refreshingExplorer_ = false;
  SettingsStore settings_;
  GlobalConfigStore globalConfig_;
  WorkspaceRepository workspace_;
  qint64 lastInputNs_ = 0;
  quint64 generation_ = 0;
  struct RenderRequest final {
    QString source;
    quint64 generation = 0;
    qint64 inputTimestampNs = 0;
    bool replaceAll = false;
  };
  std::optional<RenderRequest> activeRender_;
  std::optional<RenderRequest> pendingRender_;
  RenderTimings lastNativeTimings_;
  double lastNativeUiMs_ = 0;
  QJsonObject lastBrowserMetrics_;
  quint64 lastCpuTicks_ = 0;
  qint64 lastCpuSampleMs_ = 0;
  double processCpuPercent_ = 0;
  double processMemoryMiB_ = 0;
  bool previewReady_ = false;
  bool forceFullPreviewRender_ = false;
  bool applyingEditorTransform_ = false;
  bool updatingViewModeActions_ = false;
  EditorViewMode viewMode_ = EditorViewMode::Split;
  EditorViewMode previousSingleViewMode_ = EditorViewMode::Edit;
  QList<int> splitViewSizes_ = {720, 720};
};

}  // namespace qt_editor
