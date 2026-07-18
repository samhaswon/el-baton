#pragma once

#include "types.h"

#include <QCommandLineParser>

namespace qt_editor {

void addBenchmarkOptions(QCommandLineParser& parser);
BenchmarkOptions parseBenchmarkOptions(const QCommandLineParser& parser);
QString describeBenchmarkOptions(const BenchmarkOptions& options);

}  // namespace qt_editor

