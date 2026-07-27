#include "application_paths.h"
#include "benchmark_options.h"
#include "main_window.h"

#include <QApplication>
#include <QCommandLineParser>
#include <QCoreApplication>
#include <QMessageBox>
#include <QStyleFactory>

int main(int argc, char* argv[]) {
  for (int index = 1; index < argc; ++index) {
    if (QByteArray(argv[index]) != QByteArrayLiteral("--unthrottled-webengine")) continue;
    QByteArray flags = qgetenv("QTWEBENGINE_CHROMIUM_FLAGS");
    if (!flags.contains("--disable-frame-rate-limit")) {
      flags += QByteArrayLiteral(" --disable-frame-rate-limit");
    }
    qputenv("QTWEBENGINE_CHROMIUM_FLAGS", flags.trimmed());
    break;
  }

  QCoreApplication::setOrganizationName(QStringLiteral("El Baton"));
  QCoreApplication::setOrganizationDomain(QStringLiteral("el-baton.app"));
  QCoreApplication::setApplicationName(QStringLiteral("El Baton"));
  QCoreApplication::setApplicationVersion(QStringLiteral("0.1.0"));

  QApplication application(argc, argv);
  application.setStyle(QStyleFactory::create(QStringLiteral("Fusion")));

  QCommandLineParser parser;
  parser.setApplicationDescription(QStringLiteral("El Baton native Qt port"));
  parser.addHelpOption();
  parser.addVersionOption();
  parser.addPositionalArgument(QStringLiteral("file"), QStringLiteral("Markdown note to open."), QStringLiteral("[file]"));
  qt_editor::addRuntimeOptions(parser);
  parser.addOption({QStringLiteral("diagnostics"), QStringLiteral("Show the preview performance overlay.")});
  parser.addOption({QStringLiteral("no-diagnostics"), QStringLiteral("Hide all rendering diagnostics.")});
  parser.process(application);

  QString pathError;
  const el_baton::ApplicationPaths paths = el_baton::ApplicationPaths::system();
  if (!paths.ensureCreated(&pathError)) {
    QMessageBox::critical(nullptr, QObject::tr("El Baton startup failed"), pathError);
    return 1;
  }

  qt_editor::BenchmarkOptions options = qt_editor::parseBenchmarkOptions(parser, false);
#ifdef NDEBUG
  options.overlayEnabled = false;
#else
  options.overlayEnabled = true;
#endif
  if (parser.isSet(QStringLiteral("diagnostics"))) options.overlayEnabled = true;
  if (parser.isSet(QStringLiteral("no-diagnostics"))) options.overlayEnabled = false;
  qt_editor::MainWindow window(options);
  window.resize(1440, 900);
  window.show();
  if (!parser.positionalArguments().isEmpty()) {
    window.openFile(parser.positionalArguments().constFirst());
  }
  return application.exec();
}
