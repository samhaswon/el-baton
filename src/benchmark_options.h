#pragma once

#include "types.h"

#include <QCommandLineParser>

namespace qt_editor {

void addRuntimeOptions(QCommandLineParser &parser);
void addBenchmarkOptions(QCommandLineParser &parser);
BenchmarkOptions parseBenchmarkOptions(const QCommandLineParser &parser,
                                       bool benchmarkOverlayOption = true);
QString describeBenchmarkOptions(const BenchmarkOptions &options);

} // namespace qt_editor
