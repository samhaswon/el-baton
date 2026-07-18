#include "benchmark_options.h"
#include "main_window.h"

#include <QApplication>
#include <QCommandLineParser>
#include <QFileInfo>
#include <QPalette>
#include <QStyleFactory>

int main(int argc, char* argv[]) {
  for (int index = 1; index < argc; ++index) {
    if (QByteArray(argv[index]) != QByteArrayLiteral("--unthrottled-webengine")) continue;
    QByteArray flags = qgetenv("QTWEBENGINE_CHROMIUM_FLAGS");
    if (!flags.contains("--disable-frame-rate-limit")) flags += QByteArrayLiteral(" --disable-frame-rate-limit");
    qputenv("QTWEBENGINE_CHROMIUM_FLAGS", flags.trimmed());
    break;
  }
  QApplication app(argc, argv);
  app.setStyle(QStyleFactory::create(QStringLiteral("Fusion")));
  QPalette palette;
  palette.setColor(QPalette::Window, QColor("#202020"));
  palette.setColor(QPalette::WindowText, QColor("#f2f2f2"));
  palette.setColor(QPalette::Base, QColor("#1f1f1f"));
  palette.setColor(QPalette::AlternateBase, QColor("#292929"));
  palette.setColor(QPalette::Text, QColor("#f2f2f2"));
  palette.setColor(QPalette::Button, QColor("#303030"));
  palette.setColor(QPalette::ButtonText, QColor("#f2f2f2"));
  palette.setColor(QPalette::Highlight, QColor("#315f8c"));
  palette.setColor(QPalette::HighlightedText, Qt::white);
  app.setPalette(palette);
  QApplication::setApplicationName("El Baton Qt Editor Experiment");
  QApplication::setApplicationVersion("0.1.0");

  QCommandLineParser parser;
  parser.setApplicationDescription("QScintilla/QWebEngine Markdown editor benchmark prototype");
  parser.addHelpOption();
  parser.addVersionOption();
  parser.addPositionalArgument("file", "Markdown document to open.", "[file]");
  qt_editor::addBenchmarkOptions(parser);
  parser.process(app);

  qt_editor::MainWindow window(qt_editor::parseBenchmarkOptions(parser));
  window.resize(1440, 900);
  window.show();
  if (!parser.positionalArguments().isEmpty()) window.openFile(parser.positionalArguments().constFirst());
  return app.exec();
}
