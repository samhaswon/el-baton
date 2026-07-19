#pragma once

#include "document_file.h"
#include "global_config_store.h"
#include "settings_store.h"
#include "types.h"
#include "workspace_repository.h"

#include <QMainWindow>
#include <QTimer>

class QAction;
class QLabel;
class QListWidget;
class QTreeWidget;
class QLineEdit;
class QSplitter;
class QStackedWidget;
class QTabBar;
class QToolButton;
class QWebEngineView;
class QWebEnginePage;
class QsciScintilla;
class QCloseEvent;

namespace qt_editor {

class MarkdownPipeline;
class PreviewBridge;
class PlantUmlRenderer;
class SyncController;
class WorkspaceWatcher;
struct WorkspaceChange;

class MainWindow final : public QMainWindow {
  Q_OBJECT

 public:
  explicit MainWindow(BenchmarkOptions options, QWidget* parent = nullptr);
  void openFile(const QString& path);

 protected:
  void closeEvent(QCloseEvent* event) override;

 private slots:
  void chooseFile();
  void createNote();
  void duplicateNote();
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
  void configureEditor();
  void configurePreview();
  void createMenus();
  QWidget* createApplicationChrome(QSplitter* documentSplitter);
  QWidget* createActivityBar(QWidget* navigationPane);
  QWidget* createDocumentToolbar();
  QWidget* createNavigationPane();
  QWidget* createFilePanel();
  QWidget* createExplorerPanel();
  QWidget* createSearchPanel();
  QWidget* createGraphPanel();
  QWidget* createInfoPanel();
  QWidget* createHelpPanel();
  QWidget* createSettingsPanel();
  void refreshWorkspaceViews();
  void handleWorkspaceChanges(const QVector<WorkspaceChange>& changes);
  void updateSearchResults();
  void appendSearchResultBatch(quint64 generation);
  void updateInfoPanel();
  void updateDocumentActions();
  void setGlobalConfigValue(const QString& key, const QVariant& value);
  void applyGlobalConfiguration();
  void rebuildSettingsPage();
  void activateDocument(int index);
  void closeDocument(int index);
  void storeActiveDocumentState();
  void persistOpenTabs();
  [[nodiscard]] bool saveActiveDocument(bool reportSuccess);
  [[nodiscard]] bool maybeSave();
  void updateWindowTitle();

  BenchmarkOptions options_;
  QsciScintilla* editor_ = nullptr;
  QWebEngineView* preview_ = nullptr;
  QWebEnginePage* hiddenMermaidPage_ = nullptr;
  QWebEngineView* hiddenMermaidView_ = nullptr;
  QLabel* status_ = nullptr;
  QTabBar* noteTabs_ = nullptr;
  QTreeWidget* noteTree_ = nullptr;
  QListWidget* searchResults_ = nullptr;
  QListWidget* outlineList_ = nullptr;
  QLineEdit* navigationSearch_ = nullptr;
  QStackedWidget* navigationStack_ = nullptr;
  QStackedWidget* mainContentStack_ = nullptr;
  QLabel* infoPath_ = nullptr;
  QLabel* infoCreated_ = nullptr;
  QLabel* infoModified_ = nullptr;
  QLabel* infoTags_ = nullptr;
  QAction* openAction_ = nullptr;
  QAction* saveAction_ = nullptr;
  QAction* newAction_ = nullptr;
  QAction* duplicateAction_ = nullptr;
  QAction* editAction_ = nullptr;
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
  QTimer searchTimer_;
  QString pendingSearchQuery_;
  SearchMode pendingSearchMode_ = SearchMode::Smart;
  QVector<NoteSearchResult> pendingSearchResults_;
  qsizetype nextSearchResult_ = 0;
  quint64 searchGeneration_ = 0;
  QString currentPath_;
  std::optional<DocumentFile> document_;
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
  bool refreshingExplorer_ = false;
  SettingsStore settings_;
  GlobalConfigStore globalConfig_;
  WorkspaceRepository workspace_;
  qint64 lastInputNs_ = 0;
  quint64 generation_ = 0;
  RenderTimings lastNativeTimings_;
  QJsonObject lastBrowserMetrics_;
  quint64 lastCpuTicks_ = 0;
  qint64 lastCpuSampleMs_ = 0;
  double processCpuPercent_ = 0;
  double processMemoryMiB_ = 0;
  bool previewReady_ = false;
  bool forceFullPreviewRender_ = false;
};

}  // namespace qt_editor
