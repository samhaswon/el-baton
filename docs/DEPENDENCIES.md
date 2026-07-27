# Qt port dependency audit

Audit date: 2026-07-18

> **Current decision (2026-07-19):** This file preserves the dependency and API
> audit that informed the port; its “current host” sections are a dated snapshot,
> not present-day setup instructions. The selected production toolchain is
> project-local Qt 6.10.3 with QScintilla 2.14.1, KDE SyntaxHighlighting
> 6.28.1, and PlantUML 1.2026.3, managed by
> `scripts/bootstrap_qt_toolchain.sh`. See [BUILDING.md](BUILDING.md) for the
> canonical setup and [PORT_STATUS.md](PORT_STATUS.md) for implementation status.

This inventory covers the current Electron implementation, the isolated Qt
prototype, and the Ubuntu 24.04 development host. It distinguishes libraries
that must be installed from capabilities that should be implemented with Qt or
small project-owned adapters.

No packages were installed as part of this audit.

## Executive summary

The complete port does not need a C++ replacement for most npm packages. Qt 6
already covers windows, menus, dialogs, clipboard access, filesystem access,
processes, networking, JSON, XML, SQLite, hashing, MIME lookup, printing to PDF,
desktop URL opening, WebEngine profiles, WebChannel, and the test harness.

Three additional development dependencies are justified for the first complete
port:

```text
libyaml-cpp-dev    YAML workspace configuration and Markdown front matter
libhunspell-dev    source-editor spellchecking and suggestions
qt6-svg-dev        native SVG icons and SVG rendering
```

The machine already has the required Hunspell dictionaries, SQLite Qt driver,
zlib development files, OpenJDK 21, Qt Test, Qt SQL, Qt Network, Qt XML,
Qt PrintSupport, Qt WebChannel, Qt WebEngine, QScintilla, CMake, and Ninja.

The larger decision is the Qt version. Ubuntu's installed Qt 6.4.2 embeds
Chromium 102.0.5005.177. The reference Electron 42 build uses a substantially
newer Chromium. Chromium 102 runs the preview's Workers, ResizeObserver,
requestIdleCallback, structured cloning, and clipboard APIs, but it does not
support CSS `:has()`. The reference stylesheet uses `:has()`, so Qt 6.4 cannot
produce a completely faithful preview without CSS fallbacks.

For a long-lived port, use one consistent Qt toolchain (including WebEngine,
WebChannel, SVG, and tools) and build QScintilla against it. Qt 6.8 is a sensible
minimum API level. The continuing 6.8 LTS patch stream is primarily a commercial
offering, however, so an open-source/AGPL build should use a currently maintained
community Qt release rather than freezing its Chromium on the last public 6.8
patch. If the project intentionally stays on Ubuntu's Qt 6.4 packages, add and
test generated CSS fallbacks for unsupported selectors. Do not mix an official
Qt installation with arbitrary system Qt development modules in one build.

## Current host

Installed and already exercised by the prototype:

- Qt 6.4.2 Core, Gui, Widgets, Concurrent, Network, SQL, XML, DBus,
  PrintSupport, Test, WebChannel, WebEngineCore, and WebEngineWidgets.
- `libqt6sql6-sqlite`, so Qt SQL can open the PlantUML cache without another
  database library.
- QScintilla 2.14.1 for Qt 6.
- CMake 3.28.3, Ninja, a C++20 compiler, and pkg-config.
- `zlib1g-dev` for compression and PlantUML URL encoding.
- OpenJDK 21, suitable for the existing local PlantUML renderer.
- Hunspell runtime libraries and several English/French dictionaries, but not
  the C++ development headers.
- Qt SVG runtime support, but not the SVG development module.
- yaml-cpp runtime, but not its development headers.

The prototype vendors cmark-gfm sources from `third_party/cmark-gfm`; a system
cmark package is neither needed nor desirable.

## Recommended installation delta on Ubuntu 24.04

If retaining the Ubuntu Qt 6.4 toolchain, the proposed package delta is:

```bash
sudo apt install \
    libyaml-cpp-dev \
    libhunspell-dev \
    qt6-svg-dev
```

This is a recommendation only. Installation should wait until the Qt-version
decision is made. An official Qt installation already supplies its matching Qt
SVG module, in which case only yaml-cpp and Hunspell should come from apt and
QScintilla should be built against that Qt installation.

### Optional packages, not initial prerequisites

- `libarchive-dev`: useful only if an in-application archive format is added.
  Current note import/export does not require it.
- `libsecret-1-dev`: unnecessary today because the app stores no credentials.
  Add it only if tokens or secrets become a product feature.
- `qt6-pdf-dev`: already installed, but PDF export uses
  `QWebEnginePage::printToPdf`; Qt PDF is needed only for an embedded PDF viewer.
- A native notification library: not initially required. Qt's tray/DBus
  facilities are enough for a first implementation.

## Electron and Node capability mapping

| Reference capability | Qt/C++ replacement | Extra dependency |
| --- | --- | --- |
| `BrowserWindow`, window state, fullscreen | `QMainWindow`, `QWindow`, `QSettings` or project JSON | None |
| application/context menus | `QMenuBar`, `QMenu`, `QAction` | None |
| IPC between main and renderer | direct signals/slots; QWebChannel only for preview JS | None |
| open/save/folder dialogs | `QFileDialog`, `QMessageBox` | None |
| clipboard | `QGuiApplication::clipboard()` | None |
| external URLs | `QDesktopServices::openUrl()` | None |
| reveal file in folder | small per-platform adapter | None |
| filesystem and paths | `QFile`, `QSaveFile`, `QDir`, `QFileInfo`, `QStandardPaths` | None |
| Chokidar watching | `QFileSystemWatcher` plus recursive registration, rescan, debounce, and rename coalescing | None |
| `child_process` | `QProcess` | None |
| `fetch`/remote PlantUML/update checks | `QNetworkAccessManager` | None |
| SHA and CRC | `QCryptographicHash`; zlib `crc32` | zlib already present |
| MIME lookup | `QMimeDatabase` | None |
| JSON settings/cache records | `QJsonDocument`, `QJsonObject`, `QSaveFile` | None |
| YAML config/front matter | yaml-cpp | `libyaml-cpp-dev` |
| `node:sqlite` PlantUML cache | `QSqlDatabase` with SQLite driver | Already present |
| zlib cache compression | zlib or `qCompress` with an explicit compatible format | Already present |
| ENEX parsing (`@notable/dumper`) | streaming `QXmlStreamReader`, incremental Base64 decoding, project dumper | None |
| note/attachment globbing | `QDirIterator` | None |
| native spellchecker/WebFrame suggestions | Hunspell service feeding QScintilla indicators and context actions | `libhunspell-dev` |
| desktop notifications | `QSystemTrayIcon::showMessage`, with platform adapter if needed | None initially |
| power/battery monitor | Linux UPower over Qt DBus; Windows/macOS native adapters | None on Linux |
| auto-update | project update service over Qt Network; platform installer handoff | No adequate Qt built-in |
| PDF export | `QWebEnginePage::printToPdf()` | None |
| Chromium cache clearing | `QWebEngineProfile::clearHttpCache()` | None |
| spellchecking inside WebEngine | `QWebEngineProfile::setSpellCheckEnabled/Languages()` | None, but not sufficient for QScintilla |
| React/Overstated UI | native Qt Widgets and QObject models | None |
| Monaco editor | QScintilla | Already present |
| SVG/icon rendering | `QIcon`, `QSvgRenderer` where direct rendering is needed | `qt6-svg-dev` or matching Qt module |

## Chromium-side inventory

The native port should keep the browser boundary narrow. Only preview behavior
belongs in QWebEngine; file operations, settings, window operations, imports,
exports, search state, and note mutations belong in C++.

### Available in the installed Qt WebEngine

These APIs are present and were either exercised by the prototype or probed in
the live page:

- dedicated Web Workers and structured messages;
- `ResizeObserver`, DOM mutation/events, `requestAnimationFrame`, and
  `requestIdleCallback`;
- Fetch, Blob/object URLs, local storage, and clipboard objects;
- CSS/SVG rendering, DOMPurify, Prism, KaTeX, and Mermaid;
- QWebChannel structured C++/JavaScript calls;
- WebEngine profiles, cache clearing, downloads, context-menu spellcheck
  suggestions, and PDF printing;
- DevTools/remote debugging for integration diagnostics.

KaTeX, Mermaid, Prism, DOMPurify, fonts, and the reference preview CSS can remain
versioned web assets. They do not need C++ ports or system packages.

### Compatibility risks

1. **Chromium age.** The installed engine reports Chrome 102. Electron 42 and
   modern frontend dependencies target a newer engine. Every retained web asset
   must be tested against the selected Qt WebEngine version.
2. **CSS `:has()`.** It is unsupported in the installed engine, but occurs in
   the reference CSS. Upgrade WebEngine or generate fallback selectors/classes.
3. **Mermaid output.** Mermaid must remain in strict security mode. Its generated
   SVG contains safe `foreignObject` label trees and should be installed the same
   way as the reference implementation; an SVG-only sanitizer destroys labels.
4. **Document JavaScript.** Raw Markdown HTML support must not imply arbitrary
   document script execution. Continue sanitizing document markup and expose a
   small semantic QWebChannel API.
5. **WebEngine processes.** `QtWebEngineProcess`, resource packs, locales, and
   subprocess deployment are mandatory packaging artifacts. A hidden Mermaid
   page may create another renderer process and should remain optional.
6. **File URLs and origin policy.** Prefer a registered read-only custom URL
   scheme or carefully scoped interceptors over broad local-file access flags.
7. **API assumptions in CSS/JS.** Add a startup capability test for required DOM
   and CSS features, and fail with a useful diagnostic rather than silently
   degrading the preview.

## Feature-specific conclusions

### Markdown and metadata

- Keep the vendored cmark-gfm C implementation.
- Port the existing preprocessors and postprocessors to C++ with fixture parity
  tests before optimizing.
- Use yaml-cpp for the workspace YAML files and front matter. Preserve the
  reference scalar/sequence/date behavior in tests; do not rely on yaml-cpp's
  implicit type choices without normalization.
- JSON-only settings can use Qt directly. Keeping the current YAML and JSON
  workspace filenames avoids a migration requirement.

### Editing and spellchecking

QScintilla supplies editing, undo, margins, indicators, autocomplete hooks, and
basic Markdown lexing. It does not replace Monaco's complete Markdown tokenization,
language services, or Electron's spellchecker.

Use Hunspell in a bounded worker/service and mark misspellings with QScintilla
indicators. Dictionary selection, added words, cancellation, and suggestions
need explicit ports and tests. Qt WebEngine spellchecking applies to browser edit
controls, not the QScintilla source view.

The npm `diff` package is used for character/word edits that preserve cursors.
Port a small tested Myers-style diff implementation or vendor a compact
header-only implementation; no operating-system package is necessary.

### Notes, attachments, imports, and watching

Qt covers ordinary note and attachment I/O. The nontrivial part is behavioral:
atomic saves, self-write suppression, recursive watching, rename detection,
case sensitivity, Unicode filenames, and conflict handling must match tests.

`QFileSystemWatcher` is not a drop-in Chokidar replacement. Build a watcher that
registers directories recursively, rescans after directory notifications, and
retains the reference 175 ms unlink/add rename-coalescing behavior. Use `QSaveFile`
for crash-safe note/config writes.

ENEX can be streamed with `QXmlStreamReader`, avoiding another XML library and
avoiding loading large exports and attachments into memory at once.

### PlantUML

The native local path launches the explicitly pinned upstream PlantUML 1.2026.3
jar with `QProcess`; OpenJDK 21 is already installed. The checksum-verified jar
is downloaded into `.deps` by `scripts/bootstrap_qt_toolchain.sh`, copied into
the build, and does not rely on the older transitive `node-plantuml` artifact.
Rendering uses PlantUML's `SANDBOX` security profile so note content cannot read
local files or fetch URLs through `!include` directives.

Remote rendering now uses Qt Network with POST-first and encoded-GET fallback,
and the native PlantUML URL encoder uses zlib's raw DEFLATE mode. Persistent
caching still maps to Qt SQL/SQLite; the current renderer cache is in memory.
No additional system library is needed beyond the audited zlib package.

### Export and printing

HTML and Markdown export use Qt filesystem APIs plus the retained preview
assets. PDF export maps directly to WebEngine PDF printing. The `critically`
developer feature can be replaced with a static exported template or a narrowly
scoped DOM transform in a hidden page; it should not force a Node runtime into
the shipped application.

### Updates, notifications, and power state

These need platform adapters, not generic third-party dependencies:

- Start auto-update parity with a signed release-manifest check and an external
  installer/download handoff. In-place updating can follow after packaging and
  signing are settled.
- Use Qt notifications first; add native portal/OS integration only where the
  Qt implementation proves insufficient.
- Use UPower over Qt DBus on Linux and native power APIs on Windows/macOS.
  Battery-aware rendering must tolerate an unavailable power service.

## Packaging implications

Replace electron-builder with CMake install rules, Qt's deployment tooling, and
CPack/platform packaging. A WebEngine package must include the WebEngine helper
process, `.pak` resources, locales, plugins, and translations. Windows and macOS
also need their normal Qt deployment tools and signing/notarization flows.

Do not choose the updater before deciding the produced artifacts and signing
model. The existing AppImage/deb/rpm/snap, NSIS/portable/zip, and dmg/pkg/zip
matrix should be restored incrementally rather than treated as one milestone.

## Test-port implications

- Translate pure logic suites to Qt Test data-driven tests first: filename/path,
  URL, metadata/YAML, Markdown helpers, tables, KaTeX ranges, code fences,
  sorting, editor tabs, PlantUML, cache, and ENEX import.
- Keep golden Markdown fixtures shared between Electron and Qt while both
  implementations exist. Compare normalized HTML and metadata, not incidental
  allocation or object layout.
- Test filesystem behavior in `QTemporaryDir`, including atomic writes,
  recursive watching, rename windows, and case-sensitive/case-insensitive
  expectations.
- Test QScintilla operations with Qt Test: selections, multi-edit behavior,
  undo/redo, cursor preservation, indicators, and scroll synchronization.
- Test preview JavaScript in a real QWebEnginePage. Unit tests of only the C++
  bridge cannot catch DOM container, sanitizer, CSS-feature, or geometry bugs.
- Rewrite the Playwright/Electron UI smoke suite. Playwright cannot drive native
  Qt widgets; use Qt Test for widget actions and QWebEngine JavaScript/CDP only
  for the embedded preview.
- Keep CTest as the top-level runner and label pure, WebEngine, filesystem, and
  platform integration suites separately.

No new testing framework is required initially. A commercial GUI automation
tool can be evaluated later only if Qt Test cannot cover release-critical native
workflows.

## Recommended decision sequence

1. Set Qt 6.8 as the minimum API level. Use the latest 6.8 LTS patch with a
   commercial Qt license, or a maintained community Qt release (currently Qt
   6.10.3 or newer) for an open-source build. Otherwise explicitly accept the Qt
   6.4 WebEngine/CSS fallback burden.
2. Establish one reproducible toolchain for Linux, Windows, and macOS; build
   QScintilla against it.
3. Install/add yaml-cpp, Hunspell, and matching Qt SVG development support.
4. Create the production CMake target and a small platform-services boundary.
5. Port models, settings, metadata, filesystem services, and pure tests before
   porting the complete widget hierarchy.
6. Preserve the proven native-Markdown/WebEngine preview architecture, adding
   browser integration tests before expanding it.
7. Add PlantUML, imports/exports, platform integration, packaging, and updater
   parity in separate milestones.

## Primary Qt references

- Qt WebEngine overview: <https://doc.qt.io/qt-6.8/qtwebengine-overview.html>
- Qt WebEngine platform notes: <https://doc.qt.io/qt-6.8/qtwebengine-platform-notes.html>
- Deploying Qt WebEngine: <https://doc.qt.io/qt-6.8/qtwebengine-deploying.html>
- Qt CMake deployment: <https://doc.qt.io/qt-6.8/cmake-deployment.html>
- Qt WebEngine features: <https://doc.qt.io/qt-6/qtwebengine-features.html>
