# Native Qt port

This directory contains the in-progress native El Baton application. The
Electron/TypeScript application remains in the repository as the behavioral
reference until the important workflows reach feature parity. It should not be
removed or reorganized during the port.

The original proof of concept in `experiments/qt_editor` is now a reusable C++
library. Its QScintilla editor, native Markdown pipeline, QWebEngine preview,
and semantic scroll protocol power `build/native/bin/el-baton`; it is no longer
an unrelated demo. See [PORT_STATUS.md](PORT_STATUS.md) for the current parity
matrix and known gaps.

## Toolchain

The canonical build uses project-local Qt 6.10.3 and QScintilla 2.14.1. The
bootstrap script also downloads the pinned PlantUML 1.2026.3 JAR. It does not
install into `/usr` or edit a shell profile.

System prerequisites include a C++20 compiler, CMake, Ninja, pkg-config,
yaml-cpp development files, Hunspell development files, an `en_US` Hunspell
dictionary, Java for local PlantUML, and Node.js with this repository's existing
`node_modules`. Qt WebEngine, WebChannel, SVG, Test, and Widgets are installed
as one local Qt toolchain. On Ubuntu, the initial system package list is
recorded in [`../NOTES.md`](../NOTES.md).

For a fresh checkout, prepare the local toolchain from the repository root:

```bash
scripts/bootstrap_qt_toolchain.sh
```

The Qt installer is interactive by default so credentials and license
acceptance are not placed on a command line. Run the script with `--help` for
non-default paths, an already installed Qt tree, or unattended installer
options. Do not mix modules from the project-local Qt with system Qt libraries.

Node is a build-time asset tool, not a runtime dependency of the native app. It
generates the emoji shortcode map and cheatsheet from the reference TypeScript
sources, and supplies the checked-in npm packages used for KaTeX, mhchem,
Mermaid, DOMPurify, and Prism assets. The native app does not launch a Node
subprocess.

## Configure, build, and test

From the repository root:

```bash
source .deps/qt-toolchain.env
qt-cmake -S . -B build/native -G Ninja -C .deps/qt-toolchain.cmake
cmake --build build/native
ctest --test-dir build/native --output-on-failure
```

The executable is `build/native/bin/el-baton`. Open the configured workspace or
pass a note directly:

```bash
build/native/bin/el-baton
build/native/bin/el-baton path/to/note.md
```

The native targets compile with the project's strict warning set, including
`-Wall -Wextra -Wpedantic -Wcast-qual -Wcast-align -Wnull-dereference
-Wimplicit-fallthrough -Wnon-virtual-dtor -Wuseless-cast -Wundef -Wshadow` and
`-fno-omit-frame-pointer`. Debug builds also enable AddressSanitizer.

Qt 6.10.3's bundled Chromium currently triggers AddressSanitizer's
`new_delete_type_mismatch` check during QtWebEngine startup in Mojo code. Debug
GUI executables narrowly disable that one check by default; unit-test
executables retain it. An explicit `ASAN_OPTIONS` overrides the application
default when investigating or after upgrading QtWebEngine.

## Workspace and configuration

For compatibility during the port, the native application reads the workspace
path and restored UI state from the reference `~/.el-baton.json` file. Opening a
note directly can infer and persist its workspace when no workspace is already
configured.

Within a workspace, notes live in `notes/` and attachments in `attachments/`,
as in the Electron application. Workspace-wide native settings are read from
the first supported configuration file found at the workspace root (including
`.el-baton.yml`, `.el-baton.yaml`, and their JSON/config-name variants). A new
configuration is written as `.el-baton.yml`. This includes editor, preview,
spellcheck, battery-mode, and PlantUML settings; note metadata remains in each
Markdown file's YAML front matter.

## Runtime diagnostics

Rendering diagnostics are enabled by default in Debug builds and disabled by
default in Release builds. Override that default with:

```text
--diagnostics
--no-diagnostics
```

The overlay separates presentation `UI FPS` from completed preview `render/s`
and reports native render, DOM patch, dynamic renderer, synchronization, CPU,
and memory measurements. `UI FPS` is zero while the preview is idle.

The proof-of-concept isolation switches remain available while the rendering
core is being promoted:

```text
--sync off|percentage|semantic
--patch full|blocks
--no-katex
--no-mermaid
--hidden-mermaid-page
--unthrottled-webengine
```

Use `--help` as the authoritative command-line reference.

## Current architecture

The native application is a Qt Widgets shell with a frameless document toolbar,
activity rail, resizable flyout, tabbed QScintilla editor, and QWebEngine
preview. File, Explorer, Search, Graph, and Info occupy the flyout; Cheatsheet
and Settings replace the main document page, matching the reference
application's routing distinction.

The primary edit/render path is:

```text
QScintilla edit
  -> debounced native cmark-gfm pipeline
  -> sanitized, source-ranged block patch
  -> QWebChannel
  -> stable preview DOM
  -> batched KaTeX, Mermaid, or PlantUML rendering
```

Stable block IDs and range-only updates keep unchanged dynamic content in the
DOM instead of making completed diagrams and equations flicker. Semantic scroll
synchronization exchanges block identity and fractional progress with explicit
ownership and document generations to prevent feedback loops.

Saving follows the reference implementation's memory-first, disk-second model.
Mutations are serialized, the canonical in-memory note is replaced before its
exact representation is written, and watcher events reread and compare against
that canonical state. Self-generated events therefore become idempotent no-ops;
conflicting external edits still require a user decision.

Workspace configuration is YAML. Markdown files keep metadata in YAML front
matter, while the editor operates on the body. The preview does not execute
note-provided JavaScript. Raw HTML is sanitized, and local file links are
confined to the configured workspace.

## Tests

The CTest suite currently covers the Markdown pipeline, edit transforms,
source/preview synchronization, document serialization, application paths,
workspace data sources and watcher behavior, PlantUML, KaTeX/mhchem, spell
checking, reference icons, and generated cheatsheet content.

Add focused Qt Test coverage for native logic as it is ported. The existing npm
tests remain the reference application's regression suite; follow the root
`AGENTS.md` instructions when changing TypeScript.

## Documentation map

- [PORT_STATUS.md](PORT_STATUS.md) — implemented, partial, and unported features.
- [`../experiments/qt_editor/README.md`](../experiments/qt_editor/README.md) — rendering-core protocol and repeatable benchmark procedure.
- [`../experiments/qt_editor/PORT_DEPENDENCY_AUDIT.md`](../experiments/qt_editor/PORT_DEPENDENCY_AUDIT.md) — historical API/dependency audit and decisions.
- [`../NOTES.md`](../NOTES.md) — original experiment brief, retained for context.
