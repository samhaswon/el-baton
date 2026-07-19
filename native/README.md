# Native Qt application

This directory contains the production Qt port. The Electron application stays
in place while features and their tests are moved behind native modules.

The isolated proof of concept remains in `experiments/qt_editor`. Its editor,
native Markdown pipeline, QWebEngine preview, and semantic scroll protocol are
built as a reusable library and currently power the production executable.
This avoids maintaining two rendering implementations while those modules are
moved into permanent production namespaces and directories.

## Configure and test

From the repository root:

```bash
source .deps/qt-toolchain.env
qt-cmake -S . -B build/native -G Ninja -C .deps/qt-toolchain.cmake
cmake --build build/native
ctest --test-dir build/native --output-on-failure
```

The application executable is `build/native/bin/el-baton`.

Debug GUI executables carry a narrowly scoped AddressSanitizer default that
disables `new_delete_type_mismatch`. Qt 6.10.3's bundled Chromium 134 triggers
that check in Mojo during QtWebEngine startup because it owns a variable-sized
raw allocation with `unique_ptr<uint8_t>`. Unit-test executables do not carry
the exception, so the full new/delete type check remains active for native
application code. An explicit `ASAN_OPTIONS` environment variable can override
the executable default when investigating or after upgrading QtWebEngine.

Open a note directly with:

```bash
build/native/bin/el-baton path/to/note.md
```

The current production slice provides the QScintilla source editor, native
cmark-gfm rendering, block-level WebEngine preview updates, KaTeX and Mermaid,
semantic split-view synchronization, and atomic note saves. YAML front matter
is retained byte-for-byte while the Markdown body is edited. The preview
performance UI is enabled by default in Debug builds and disabled by default in
Release builds. Pass `--diagnostics` or `--no-diagnostics` to override the build
default. The experiment's benchmark switches remain available from `--help`
during the promotion period.

The first application-chrome slice mirrors the reference hierarchy with an
activity rail, Explorer pane, document toolbar, active-note tab, source editor,
and preview. The preview uses the same `theme-dark` rules from the reference
stylesheet as the native palette; `preview.css` only bridges Qt-specific page
background and scrollbar behavior.

The activity rail now drives one collapsible flyout containing File, Explorer,
Search, Graph, Info, Cheatsheets, and Settings sketches. Clicking the active
rail button closes the flyout; clicking another button switches panels. The
flyout/document boundary is resizable and retains its splitter width while the
panel is hidden. A frameless draggable document toolbar replaces the native
title bar and contains the note-action placeholders and window controls.

Activity routing follows the reference distinction: File, Explorer, Search,
Graph, and Info use the resizable flyout; Cheatsheets and Settings replace the
main content page. The first native data-source slice reads the reference
`~/.el-baton.json` workspace path, discovers supported files under `notes/`,
feeds Explorer and in-memory global search, persists the active panel, and
populates Info from the active note's filesystem/front-matter/headings.

## Initial port order

1. Application lifecycle, paths, settings, and workspace selection.
2. Move the shared editor/preview library into permanent production modules.
3. Port note, attachment, and tag models with shared fixtures.
4. Port filesystem watching, search, import/export, and platform services.
5. Restore packaging and platform-specific integration incrementally.
