# Porting from Electron to Qt

> **Status (2026-07-19):** This is the original proof-of-concept brief and is
> retained as a design record. The experiment succeeded and now powers an active
> native application port. Current build instructions and architecture live in
> [`docs/BUILDING.md`](docs/BUILDING.md); the feature-parity matrix is
> [`docs/PORT_STATUS.md`](docs/PORT_STATUS.md). The canonical build uses the
> project-local Qt 6.10.3/QScintilla/KDE SyntaxHighlighting toolchain created by
> `scripts/bootstrap_qt_toolchain.sh`, not the Ubuntu Qt packages listed below.

Packages installed for the initial host experiment:
```bash
sudo apt install \
    build-essential \
    cmake \
    ninja-build \
    pkg-config \
    qt6-base-dev \
    qt6-base-dev-tools \
    qt6-tools-dev \
    qt6-tools-dev-tools \
    qt6-webengine-dev \
    qt6-webchannel-dev \
    libqscintilla2-qt6-dev \
    libyaml-cpp-dev \
    libhunspell-dev
```

# Qt editor experiment instructions

## Objective

Build an isolated C++/Qt prototype that tests whether replacing Monaco and the React-managed editor path with QScintilla improves large-document editing and synchronized source/preview scrolling.

This is an experiment, not a production rewrite, specifically in terms of scope. So don't port every test and the CI builds yet.

## Constraints

* Use C++20.
* Use CMake and Ninja.
* Use Qt 6 Widgets, not QML.
* Use QScintilla for source editing.
* Use QWebEngineView for the rendered preview.
* Use QWebChannel for structured C++/JavaScript communication.
* Reuse the repository's existing Markdown preprocessing, cmark-gfm integration, postprocessing, KaTeX assets, Mermaid assets, CSS, and benchmark documents where practical.
* Preserve support for full HTML in Markdown.
* Do not modify or remove the existing Electron implementation.
* Put the prototype in a clearly isolated directory, such as `experiments/qt_editor`.
* Do not redesign the application or port unrelated features.
* Do not add a framework abstraction layer unless the prototype concretely requires it.
* Do not introduce Python, Node.js subprocesses, or another browser engine.
* Do not execute user-provided JavaScript through the QWebChannel bridge (this would be something removed from the original app if this works out).
* Keep the QWebChannel API minimal and document every exposed method.
* Report build or dependency problems explicitly. Do not silently replace required components.

## Primary question

Determine whether QScintilla plus QWebEngineView can edit and synchronously scroll a representative large Markdown document more smoothly and with less CPU usage than the current Monaco-based path.

## Required prototype

Create one window containing:

1. A horizontal `QSplitter`.
2. A QScintilla editor in the left pane.
3. A QWebEngineView preview in the right pane.
4. Basic open-file support for benchmark documents.
5. A small status area showing timing, FPS, and synchronization metrics.
6. The existing application theme where reuse is straightforward.

The prototype must build and run independently of Electron.

## Markdown rendering

Connect QScintilla changes to the existing native Markdown pipeline.

The first implementation may parse the complete document, but it must:

* retain source start and end positions for rendered blocks;
* avoid replacing the complete preview document after every edit when block-level patching is possible;
* preserve scroll position across preview updates;
* report parsing, postprocessing, JavaScript rendering, DOM patching, and layout-settling durations separately where measurable.

Basically, replicate what the current implementation on Electron does but with the new dependencies.

## KaTeX

Put KaTeX in the Chromium side of things, ideally tied to the native render pipeline rather than the preview instance.

Use a dedicated Web Worker and `katex.renderToString()` for changed math expressions. Batch expressions per document update.

This should be structured similarly to the current TS implementation, including caching.

The worker must return rendered markup or a structured error. DOM insertion remains on the visible page.

Do not run KaTeX auto-render over the complete preview DOM.

## Mermaid

Keep Mermaid in Chromium.

For the first milestone, Mermaid may render in the visible page, but only for newly inserted or changed diagram blocks. Cache generated SVG by source, Mermaid configuration, theme, fonts, and Mermaid version.

After the basic prototype works, add an optional hidden QWebEnginePage for Mermaid rendering. Treat this as a second milestone, not a blocker.

Do not attempt to run Mermaid's complete rendering API in a normal Web Worker.

## Scroll synchronization

This is tricky to get right, so just refer to the current TS implementation. There are a lot of catches about what can happen when doing this, so evaluate it closely. 

## Geometry management

Do not scan all preview elements on every scroll event.

Maintain an ordered geometry index containing block ID, top position, height, and synchronization policy. Use binary search to locate the reference block.

Invalidate geometry when:

* a rendered block changes;
* KaTeX output changes size;
* Mermaid finishes;
* an image loads;
* preview width changes;
* fonts or theme change;
* browser zoom changes.

Use `ResizeObserver` at rendered-block granularity. Do not attach observers to inline nodes.

Separate DOM reads from DOM writes to avoid forced synchronous layout.

## QWebChannel protocol

Exchange semantic data, not raw cross-pane pixels.

Example source-to-preview message:

```json
{
  "owner": "source",
  "blockId": "block-184",
  "progress": 0.43,
  "generation": 291
}
```

Example render update:

```json
{
  "generation": 52,
  "changedBlocks": [
    {
      "id": "block-184",
      "html": "<p>...</p>",
      "sourceStart": 912,
      "sourceEnd": 1048,
      "syncMode": "interpolate"
    }
  ],
  "removedBlockIds": []
}
```

Prefer one batched message per update over one bridge call per block, equation, or diagram.

## Instrumentation

Collect at least:

* editor input-to-render-start latency;
* Markdown parse time;
* native preprocessor time;
* native postprocessor time;
* KaTeX worker time;
* Mermaid render time;
* DOM patch time;
* time until geometry becomes stable;
* synchronization update rate;
* dropped or coalesced synchronization requests;
* process CPU usage where practical;
* memory usage where practical.

Provide a debug overlay or status panel that can be disabled.

Do not print per-scroll-event logs by default because logging can materially distort the benchmark.

## Benchmark modes

Add command-line options or UI toggles for:

* synchronization disabled;
* raw scroll-percentage synchronization;
* semantic synchronization;
* KaTeX disabled;
* Mermaid disabled;
* full preview replacement;
* block-level preview patching.

These modes are required so the experiment can isolate which component causes the improvement or regression.

## Tests

Add automated tests for:

* stable block IDs across an edit within one block, or however your synchronization works;
* correct source range assignment;
* synchronization generation filtering;
* ownership acquisition and release;
* suppression of reciprocal programmatic scrolling;
* progress interpolation;
* anchor-only blocks;
* handling removed blocks;
* malformed KaTeX;
* malformed Mermaid;
* documents containing raw HTML.

Add a repeatable manual benchmark procedure in the README.

## Milestones

### Milestone 1

* Buildable Qt application.
* QScintilla and QWebEngineView in a splitter.
* Open and render a Markdown file.
* Full-document native rendering.
* No synchronization yet.

### Milestone 2

* Stable block IDs and source ranges.
* Source-to-preview semantic synchronization.
* Preview-to-source semantic synchronization.
* Ownership and generation-loop prevention.

### Milestone 3

* Block-level DOM patching.
* KaTeX Web Worker.
* Mermaid result caching.
* Geometry invalidation and ResizeObserver integration.

### Milestone 4

* Hidden Mermaid rendering page.
* Instrumentation.
* Benchmark modes.
* Written comparison against the current Electron application.

Complete and verify each milestone before beginning the next.

## Deliverables

* Prototype source in `experiments/qt_editor`.
* CMake build configuration.
* Dependency and build instructions for Ubuntu 24.04.
* Architecture document.
* Scroll synchronization protocol document.
* Benchmark procedure.
* Tests.
* A final report containing measured results, observed bottlenecks, known limitations, and a recommendation on whether further migration is justified.

Do not claim a performance improvement without measured results.
