# Native port status

Updated: 2026-08-05

This matrix records functional parity with the retained Electron/TypeScript
implementation. “Working” means the core workflow is usable and covered by the
native implementation; it does not imply pixel-perfect or complete Monaco API
parity. “Partial” identifies a deliberate remaining gap rather than a planned
stub being mistaken for finished work.

## Application shell and navigation

| Area | Status | Notes |
| --- | --- | --- |
| Frameless window and toolbar | Working | Uses Qt window controls and the reference SVG icon set. |
| Activity rail and flyout | Working | File, Explorer, Search, and Info share a collapsible, resizable flyout. |
| Full-page routes | Working | Graph, Cheatsheet, and Settings replace the document surface rather than opening as panes. |
| Multiple note tabs | Working | Multiple notes can remain open; open tabs are restored. |
| Explorer | Working | Notes, favorites, nested tags, and collapsible sections use workspace data. |
| Graph | Working | A native, idle-settling force graph visualizes notes, tags, attachments, note links, memberships, and references with search, filters, layout controls, zoom/pan, selection metadata, navigation, and PNG export. |
| Visual parity | Partial | Overall dark layout is close; spacing, preview styling, source token colors, and a few controls still need refinement. |

## Notes, files, and workspace state

| Area | Status | Notes |
| --- | --- | --- |
| Open, create, edit, and save | Working | Markdown body editing preserves YAML front matter. |
| Autosave and filesystem watching | Working | Editing uses a 750 ms trailing debounce and serialized background commits; edits made during a commit are coalesced into the next save. Focus/view/tab transitions flush immediately. Memory-first writes make self-events idempotent and external conflicts are detected. Watcher rescans hash only new, metadata-changed, or explicitly signaled files while still detecting same-size/same-timestamp edits. |
| Workspace refresh scalability | Working | Refreshes strictly decode changed notes once, reuse unchanged note and attachment metadata, and retain the graph when its inputs are unchanged. The first workspace discovery remains synchronous and is a future startup-time optimization target. |
| Text integrity | Working | Documents with invalid UTF-8 are rejected without rewriting their bytes and are omitted from workspace indexes until repaired. |
| Favorites, pinning, trash, tags, and attachments | Working | Backed by workspace/front-matter data and reference-style actions. |
| Note, web, attachment, and local file links | Working | `file://` navigation is restricted to the configured workspace to prevent path traversal. |
| Search | Working | Results include contextual note previews with highlighted matches and are populated incrementally. |
| Info and attachment metadata | Working | Heading entries navigate to source positions; file size/timestamps/text counts/link counts and referenced attachment MIME/size/timestamps are exposed with open actions. |
| Import/export | Partial | Markdown and ENEX imports run natively off the UI thread. ENEX source files are capped at 64 MiB and resources are streamed through bounded temporary files with a 32 MiB decoded-resource limit. The active note exports to canonical Markdown, self-contained HTML, or a paginated print-CSS PDF with rendered diagrams; HTML/PDF capture waits for the exact saved preview generation. Multi-note archives and the remaining platform import formats still need parity work. |
| Automatic note renaming | Working | Changing the first non-empty Markdown line updates the title metadata and, when enabled, safely renames the note without surfacing the app-owned watcher event. |

## Source editor

| Area | Status | Notes |
| --- | --- | --- |
| Markdown editing | Working | QScintilla provides the native editor, dark theme, undo/redo, and line-oriented editing. |
| Find and replace | Working | Find/replace current/all, regex, case, whole-word, and next/previous navigation are available. |
| Spell checking | Working | Hunspell checks the visible source region after a 200 ms trailing debounce; context menus provide suggestions and dictionary additions. |
| Markdown completion | Working | Current-document words plus contextual emoji, opening code-fence language, and workspace-confined path suggestions are available. |
| Markdown commands | Working | Reference shortcuts cover bold, italic, strikethrough, task state transitions, delimiter pairing, and explicit completion. |
| Table editing | Working | Valid tables are normalized after the configured idle delay with alignment, indentation, escaped pipes, cursor, and viewport preservation. |
| Edit/split/preview modes | Working | `Ctrl+E`, `Ctrl+Alt+S`, Escape, toolbar buttons, and persisted state switch among the three reference modes. |
| Markdown syntax highlighting | Partial | KDE SyntaxHighlighting now provides stateful Markdown, YAML metadata, table, link, emoji, and embedded fenced-language highlighting through a native QScintilla adapter. El Baton-specific math and diagram regions still need dedicated definition rules. |
| Remaining Monaco parity | Partial | QScintilla does not yet mirror Monaco multi-cursor editing or every lower-value built-in command. |

## Markdown preview

| Area | Status | Notes |
| --- | --- | --- |
| GitHub-flavored Markdown | Working | Native cmark-gfm rendering retains source ranges and stable block identities. |
| Incremental preview updates | Working | Native parsing/diffing runs on a serialized worker at a bounded continuous cadence while typing. Edits reparse a guarded, block-aligned source window and reuse cached parsed blocks outside it; unstable HTML boundaries expand the window or safely fall back to a full parse. Document-wide heading/TOC/control normalization still runs before changed blocks are patched, preserving unchanged KaTeX/Mermaid/PlantUML DOM. |
| Raw HTML and `<details>` | Working | HTML is sanitized; interactive details and task checkboxes are retained without executing arbitrary note scripts. |
| Wiki links and macros | Working | Note/tag/attachment links, heading anchors, TOC/page-break handling, and reference link behavior are present. |
| Emoji and typography extensions | Working | Emoji shortcodes plus reference superscript/subscript forms such as `N~2~` are generated/rendered. |
| KaTeX and chemistry | Working | A worker batches math; the mhchem extension supports commands such as `\ce`. |
| Mermaid | Working | Changed diagrams are batched, errors are hidden from visible layout, and successful SVG output is persisted in the shared bounded diagram cache. |
| PlantUML | Working | Local rendering uses the pinned JAR; remote rendering is available as fallback, with successful output persisted across launches. |
| Code highlighting | Working | Prism assets cover the common bundled languages. |
| Preview theme parity | Partial | The reference dark stylesheet is reused, with Qt-specific bridges; exact typography and element spacing still need comparison. |
| Source/preview scroll synchronization | Working | Off, percentage, and semantic modes are available; fine-grained behavior remains an area for continued testing. |

## Settings and reference content

| Area | Status | Notes |
| --- | --- | --- |
| Settings page | Working | GNOME-style switch controls read and write the workspace YAML configuration. Settings shown by the native port drive runtime behavior; irrelevant animation and GPU controls are hidden while their existing YAML values are preserved. The unsafe script-sanitization escape hatch remains deliberately locked. Personal dictionary and persistent diagram cache management are included. |
| Cheatsheet | Working | Content is generated from the reference TypeScript source and rendered through the native preview pipeline. |
| YAML scalar/container fidelity | Working | Strings and spellcheck word collections round-trip as their intended types rather than byte arrays. |
| Persistent diagram cache | Working | Versioned Mermaid and PlantUML results share a compressed SQLite LRU cache bounded by the configured entry and byte limits. |
| Embedded WebEngine confinement | Working | Preview, cheatsheet, and hidden Mermaid pages use an off-the-record profile with in-memory cache/cookies/permissions. Main-frame reload/navigation, popups, downloads, file pickers, browser dialogs, privileged permissions, and the default Chromium context menu are disabled. Requests are limited to packaged app assets, workspace media, data media, and HTTPS images; external links still open through the native bridge in the user's browser. Qt 6.10.2/MSVC permission denial uses the compatibility feature signal to avoid a missing `QWebEnginePermission` import-library symbol. |

## Platform and release work

| Area | Status | Notes |
| --- | --- | --- |
| Diagnostics | Working | Debug defaults on, Release defaults off; command-line overrides and separate UI/render counters are available. |
| Release optimization | Working | GCC/Clang use `-O3` and LTO; MSVC uses `/O2 /Qpar` and `/GL` when the capability probe succeeds. |
| C/C++ formatting | Working | Native application and test sources have been normalized with `clang-format`; contributor and build documentation records the format/check commands and excludes vendored code. |
| Native unit tests | Working | CTest covers rendering, serialization, watching, spellcheck, diagrams, generated assets, and paths. Data-integrity and scalability regressions additionally assert strict UTF-8 rejection, unchanged-note/attachment reuse, graph invalidation, and watcher detection when file size and timestamps are unchanged. Scroll-sync tests cover ownership, stale generations, rate-limit coalescing, queued end events, and runtime mode/frame-rate changes. WebEngine policy tests cover navigation, reload, request types, schemes, and symlink confinement. |
| Code scanning | Working | CodeQL analyzes workflow and JavaScript/TypeScript sources plus a manual native C/C++ build on Ubuntu. |
| Build CI | Working | Clean Release builds and CTest run on Ubuntu x64/ARM64, Windows x64, and macOS ARM64. Linux publishes AppImage, DEB, and RPM artifacts for both architectures; Windows publishes a deployed x64 ZIP and a smoke-tested NSIS installer. Intel macOS is intentionally excluded, while Windows ARM64 is unavailable because the official Qt packages omit Qt WebEngine. |
| Packaging and signing | Partial | CI publishes tagged releases and nightly prereleases with ZIP/tar bundles, a Windows NSIS installer, AppImage, DEB, RPM, and SHA-256 manifests. Windows installation/uninstallation is covered by a silent CI smoke test. Self-signed development artifacts are acceptable for the initial native releases; public-trust signing and macOS notarization remain later work. |
| Updater and notifications | Working | Channel-aware stable/nightly checks run at startup, daily, and on demand. Available releases are reported with a link that opens the official HTTPS GitHub release page in the user's browser; the native port intentionally does not perform in-place updates. Background failures remain silent. |
| Battery-aware behavior | Working | The toolbar uses the reference AC/battery icons with native power-source detection on Linux, Windows, and macOS. Manual and automatic activation drive preview render delay, spellcheck/autocomplete policy, and a coalescing bidirectional scroll-sync frame-rate cap. |

## Near-term priorities

1. Finish multi-note export archives and the lower-use import formats retained
   in the Electron dumper.
2. Continue side-by-side visual and interaction testing against the reference
   app, especially preview spacing, syntax highlighting, and scroll behavior.
3. Add packaging and platform integrations only after the core workflows are at
   parity and the Electron reference is no longer needed for comparison.
4. Profile and improve startup time using Release builds so sanitizer startup
   overhead is not mistaken for application work.
5. Continue adversarial WebEngine testing against the packaged application,
   including external/local images, link handoff, copy actions, and denied
   reload/navigation paths.
6. Reduce executable and packaged binary size after the functionality and
   feature-parity work is complete. This may include auditing deployed Qt
   modules, plugins, translations, resources, and release linker settings.
