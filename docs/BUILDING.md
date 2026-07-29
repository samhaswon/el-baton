# Native Qt port

The native El Baton application is the repository's primary build. Its C++
sources live in `src/`, tests in `tests/`, preview assets in
`resources/preview/`, and top-level build definition in `CMakeLists.txt`.
The former Electron/TypeScript application is retained under `reference/` as a
behavioral reference until the important workflows reach feature parity.

The initial `experiments/qt_editor` proof of concept has been retired. Its
QScintilla editor, native Markdown pipeline, QWebEngine preview, and semantic
scroll protocol now directly power `build/native/bin/el-baton`. See
[PORT_STATUS.md](PORT_STATUS.md) for the current parity matrix and known gaps.

## Toolchain

The canonical build uses project-local Qt 6.10.3, QScintilla 2.14.1, and KDE
SyntaxHighlighting 6.28.1. The bootstrap builds the required Extra CMake
Modules 6.28.0 locally and also downloads the pinned PlantUML 1.2026.3 JAR. It
does not install into `/usr` or edit a shell profile.

System prerequisites include a C++20 compiler, CMake, Ninja, pkg-config,
yaml-cpp development files, Hunspell development files, an `en_US` Hunspell
dictionary, Java for local PlantUML, and Node.js 24. Run `npm install
--ignore-scripts` once to provide the build-only web assets. Qt WebEngine,
WebChannel, SVG, Test, and Widgets are installed
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

The bootstrap uses the CMake distributed with Qt Tools when building KDE
SyntaxHighlighting because that framework requires CMake 3.29 or newer. The
generated environment places that CMake on `PATH`; no system KDE Frameworks
packages are used.

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

CMake's Release configuration supplies `-O3` for GCC/Clang or `/O2` for MSVC;
the project also requests `/Qpar` for MSVC. Interprocedural optimization is
enabled after a compiler capability check, which supplies LTO (`-flto` for
GCC/Clang, or `/GL` and the corresponding link step for MSVC). Configure with
`-DEL_BATON_ENABLE_IPO=OFF` to disable LTO for a toolchain that passes the probe
but has a downstream linker or packaging issue.

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

## Editor shortcuts

The high-value Markdown commands follow the retained reference application:

| Shortcut | Action |
| --- | --- |
| `Ctrl+E` | Toggle between source editing and preview. |
| `Ctrl+Alt+S` | Enter or leave split view, restoring the previous single-pane mode. |
| `Escape` | Close Find, leave split view, or leave source editing, in that order. |
| `Ctrl+B` / `Ctrl+I` | Wrap the selection with bold or italic Markdown. |
| `Ctrl+Shift+X` | Wrap the selection with strikethrough Markdown. |
| `Alt+Enter` | Toggle selected lines between plain text and incomplete tasks. |
| `Alt+D` | Toggle selected lines between incomplete and completed tasks. |
| `Ctrl+Space` | Request contextual Markdown completions. |

Typing Markdown delimiters automatically pairs parentheses, brackets, braces,
emphasis markers, tildes, and backticks; typing a closing delimiter over an
existing pair advances the caret. Contextual completion covers emoji
shortcodes, opening code-fence languages, and note/attachment/relative paths.
Filesystem suggestions use the same workspace boundary checks as link opening.

Valid Markdown tables are normalized after the configured idle delay while
preserving column alignment, escaped pipes, indentation, selection/caret
position, and the visible source region. Programmatic file/preview updates do
not trigger table formatting.

## Current architecture

The native application is a Qt Widgets shell with a frameless document toolbar,
activity rail, resizable flyout, tabbed QScintilla editor, and QWebEngine
preview. File, Explorer, Search, and Info occupy the flyout; Graph, Cheatsheet,
and Settings replace the main document page. The native graph consumes a
cached workspace snapshot of note links, tags, and attachment references and
settles its force simulation to zero idle work after layout.

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

Add focused Qt Test coverage for native logic as it is ported. The old npm test
suite remains under `reference/` for historical comparison, but is not part of
the native CI pipeline.

## Continuous integration

`.github/workflows/ci.yml` performs a clean Release build and runs the complete
CTest suite on Ubuntu x64/ARM64, Windows x64, and macOS ARM64. macOS
intentionally has no Intel build. Windows ARM64 is excluded because the
official Qt ARM64 packages do not provide Qt WebEngine, which the preview
currently requires. CI installs Qt 6.10.2, builds QScintilla and KDE
SyntaxHighlighting against that exact Qt installation, and downloads PlantUML
with the same pinned checksum used by the local bootstrap.

Linux jobs publish AppImage, DEB, and RPM artifacts for both architectures.
The Windows x64 job publishes a deployed ZIP artifact, and the macOS ARM64 job
publishes its deployed application bundle.

The same matrix is reused for tag publication. Tags matching `*-nightly*`
produce a GitHub prerelease through `.github/workflows/nightly.yml`; tags
matching `v*` (excluding nightly tags) produce a normal GitHub release through
`.github/workflows/release.yml`. Publication happens only after every platform
build and test succeeds. Each release includes all native packages and a
`SHA256SUMS` manifest. Packages are currently unsigned.

The root `package.json` contains only native build-time JavaScript assets and
their generators. Electron packaging, linting, and tests remain isolated in
`reference/package.json` and are not installed by native CI.

## Documentation map

- [PORT_STATUS.md](PORT_STATUS.md) — implemented, partial, and unported features.
- [EXPERIMENT_HISTORY.md](EXPERIMENT_HISTORY.md) — historical prototype protocol and benchmark procedure.
- [DEPENDENCIES.md](DEPENDENCIES.md) — API/dependency audit and decisions.
- [`../NOTES.md`](../NOTES.md) — original experiment brief, retained for context.
