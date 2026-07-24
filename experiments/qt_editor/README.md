# Qt editor experiment

This directory began as an isolated comparison of QScintilla plus
QWebEngineView against Monaco/Electron. The experiment established a viable
native editing and rendering path, and its code is now built as `qt_editor_core`
for the native application in `native/`.

The directory remains useful for focused rendering benchmarks and protocol
tests. It does not replace or modify the retained Electron reference
implementation. Current application status belongs in
[`../../native/PORT_STATUS.md`](../../native/PORT_STATUS.md); this document
describes the rendering core and its repeatable comparison modes.

## Build

The canonical build uses the repository's project-local toolchain:

```bash
source .deps/qt-toolchain.env
qt-cmake -S . -B build/native -G Ninja -C .deps/qt-toolchain.cmake
cmake --build build/native
ctest --test-dir build/native --output-on-failure
```

That produces the full application at `build/native/bin/el-baton` and runs the
rendering-core tests along with the native application tests.

For an intentionally standalone experiment build, first prepare the same local
Qt, QScintilla, and PlantUML dependencies with
`scripts/bootstrap_qt_toolchain.sh`, then configure this subdirectory with the
generated initial cache:

```bash
source .deps/qt-toolchain.env
qt-cmake -S experiments/qt_editor -B experiments/qt_editor/build -G Ninja \
  -C .deps/qt-toolchain.cmake -DCMAKE_BUILD_TYPE=Release -DBUILD_TESTING=ON
cmake --build experiments/qt_editor/build
ctest --test-dir experiments/qt_editor/build --output-on-failure
```

The configure step intentionally fails when Qt WebEngine, WebChannel, SVG,
QScintilla, yaml-cpp, Hunspell, the pinned PlantUML JAR, Node, or the
repository-pinned web assets are unavailable. It does not substitute another
editor, renderer, or JavaScript runtime. Node generates/copies assets at build
time and is not launched by the application.

Run with a document path:

```bash
experiments/qt_editor/build/qt_editor resources/demo_data/seed/notes/\
"Malformer Dataset Notes.md"
```

The File/Open action can load another Markdown or benchmark document. Prefer
the full native executable for application feature testing.

## Benchmark modes

Use `--help` for the complete command-line reference. The isolating modes are:

```text
--sync off|percentage|semantic
--patch full|blocks
--no-katex
--no-mermaid
--no-overlay
--hidden-mermaid-page
--unthrottled-webengine
```

`semantic` synchronization exchanges a block ID, fractional progress through
that block, ownership, and a document generation. `percentage` is the baseline.
The preview never receives a request to evaluate document-provided JavaScript.
Raw HTML is parsed as Markdown HTML and sanitized before insertion; script and
event-handler execution is not part of “full HTML” support.

The file loader mirrors the Electron note model by keeping YAML front matter at
the file level and placing only the Markdown body in the editor/preview. The
prototype also carries over heading anchors and TOC/page-break macros,
wikilinks/app-token links, interactive task-list markup, code-block wrappers,
syntax highlighting for the common bundled languages, and note-relative media
URLs. This is the fidelity baseline for the experiment, not a full port of
every application extension.

Block patches distinguish HTML changes from source-range-only changes. Editing
near the top therefore updates later blocks' synchronization metadata without
replacing their DOM, preserving completed KaTeX and Mermaid nodes. The visible
page also caches dynamic markup and coalesces pending generations so only the
newest queued update is applied. Empty or malformed Mermaid output is excluded
from visible layout, matching the reference preview's error behavior.

Successful Mermaid and PlantUML renders are also stored in a compressed SQLite
LRU cache under the platform cache directory. Cache keys include the renderer
version and rendering inputs, and the configured entry/byte limits are enforced
after writes. In-memory caches remain the first-level fast path.

The native File surface imports Markdown and Evernote ENEX files. ENEX notes,
tags, timestamps, and resources are converted directly into the workspace note
and attachment model rather than invoking the TypeScript dumper at runtime.
The active note can be exported as its canonical Markdown representation, a
self-contained HTML document with local assets embedded, or a PDF produced by
a dedicated light-theme print document. The PDF path expands details, waits for
embedded fonts and layout, retains rendered diagram SVG, honors page-break
macros, wraps code, and paginates the full note rather than printing the live
scrollable preview viewport.

## QWebChannel API

The registered object is `previewBridge`. Its deliberately small API is:

- `renderPublished(update)` — C++ signal carrying one batched block patch for a
  document generation.
- `sourceScrollPublished(target)` — C++ signal carrying a semantic or percentage
  source-owned scroll target.
- `reportPreviewScroll(position)` — JavaScript reports one coalesced semantic
  preview-owned position.
- `reportMetrics(metrics)` — JavaScript reports aggregated DOM patch, dynamic
  rendering, layout-settling, FPS, and synchronization measurements.
- `requestMermaidRender(batch)` / `mermaidRenderRequested(batch)` — the visible
  page sends changed diagram sources to the optional hidden WebEngine page.
- `reportMermaidResults(batch)` / `mermaidResultsPublished(batch)` — the hidden
  page returns a batched SVG-or-structured-error result.
- `reportReady(role)` — a page announces channel readiness so the first render
  or hidden-page request is queued rather than lost during startup.
- `requestExternalLink(url)` — JavaScript asks C++ to open an HTTP(S) URL. Other
  schemes are rejected.

No method accepts or evaluates JavaScript source.

## Repeatable manual comparison

1. Build the Electron application and this prototype in release mode. Close
   unrelated CPU-heavy applications and use the same display scaling.
2. Choose a representative large document. Record its byte size and SHA-256.
   Use the same physical file for every run.
3. Warm each application once by opening the file, scrolling end-to-end, and
   waiting for fonts, KaTeX, Mermaid, and images to settle. Do not record this
   run.
4. For each mode, restart the application, open the file, wait five seconds,
   type the same ten-character sequence in the same block, undo it, then scroll
   from top to bottom and back for 30 seconds using the same input device.
5. Record the status/overlay parse, postprocess, worker, DOM-patch, settling,
   FPS, synchronization-rate, coalescing, CPU, and memory values. Also record
   visible desynchronization or jumps.
6. Run at least five trials for each mode in randomized order. Compare medians
   and the slowest trial; a single warm-cache run is not representative.

Suggested sequence:

```bash
qt_editor DOC --sync off --no-katex --no-mermaid --patch full
qt_editor DOC --sync percentage --no-katex --no-mermaid --patch blocks
qt_editor DOC --sync semantic --no-katex --no-mermaid --patch blocks
qt_editor DOC --sync semantic --patch blocks
qt_editor DOC --sync semantic --patch full
```

The important result is not only average FPS: compare input-to-render-start
latency, CPU while continuously scrolling, memory after the warm-up, dropped
synchronization updates, and whether the panes remain semantically aligned.
The built-in Linux CPU/RSS counters cover the Qt host process; use the same
system process monitor in every trial when comparing totals that include
WebEngine's renderer/GPU child processes.

`UI FPS` is a rolling presentation-frame measurement during active preview
paint/scroll windows, similar in intent to Chromium's rendering meter. It is
zero while idle. `render/s` is separate: it counts completed document-generation
DOM updates in the preceding second and should not be interpreted as display
frame rate.
`--unthrottled-webengine` is an explicit diagnostic mode for high-refresh-rate
testing. It passes Chromium's `--disable-frame-rate-limit`; because that also
removes compositor pacing, compare its CPU use separately and do not enable it
for the normal idle-CPU baseline.
The normal preview has no perpetual animation-frame or metrics timer; frame
sampling starts only for active paint/scroll windows and stops when idle.
