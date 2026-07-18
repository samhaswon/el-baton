#pragma once

#include "types.h"

#include <QMainWindow>
#include <QTimer>

class QLabel;
class QWebEngineView;
class QWebEnginePage;
class QsciScintilla;

namespace qt_editor {

class MarkdownPipeline;
class PreviewBridge;
class SyncController;

class MainWindow final : public QMainWindow {
  Q_OBJECT

 public:
  explicit MainWindow(BenchmarkOptions options, QWidget* parent = nullptr);
  void openFile(const QString& path);

 private slots:
  void chooseFile();
  void scheduleRender();
  void renderDocument();
  void updateStatus(const QJsonObject& browserMetrics = {});
  void sampleProcessUsage();

 private:
  void configureEditor();
  void configurePreview();
  void createMenus();

  BenchmarkOptions options_;
  QsciScintilla* editor_ = nullptr;
  QWebEngineView* preview_ = nullptr;
  QWebEnginePage* hiddenMermaidPage_ = nullptr;
  QWebEngineView* hiddenMermaidView_ = nullptr;
  QLabel* status_ = nullptr;
  MarkdownPipeline* pipeline_ = nullptr;
  PreviewBridge* bridge_ = nullptr;
  SyncController* sync_ = nullptr;
  QTimer renderTimer_;
  QTimer usageTimer_;
  QString currentPath_;
  qint64 lastInputNs_ = 0;
  quint64 generation_ = 0;
  RenderTimings lastNativeTimings_;
  QJsonObject lastBrowserMetrics_;
  quint64 lastCpuTicks_ = 0;
  qint64 lastCpuSampleMs_ = 0;
  double processCpuPercent_ = 0;
  double processMemoryMiB_ = 0;
  bool previewReady_ = false;
};

}  // namespace qt_editor
