# Native port status

Updated: 2026-07-19

This matrix records functional parity with the retained Electron/TypeScript
implementation. “Working” means the core workflow is usable and covered by the
native implementation; it does not imply pixel-perfect or complete Monaco API
parity. “Partial” identifies a deliberate remaining gap rather than a planned
stub being mistaken for finished work.

## Application shell and navigation

| Area | Status | Notes |
| --- | --- | --- |
| Frameless window and toolbar | Working | Uses Qt window controls and the reference SVG icon set. |
| Activity rail and flyout | Working | File, Explorer, Search, Graph, and Info share a collapsible, resizable flyout. |
| Full-page routes | Working | Cheatsheet and Settings replace the document surface rather than opening as panes. |
| Multiple note tabs | Working | Multiple notes can remain open; open tabs are restored. |
| Explorer | Working | Notes, favorites, nested tags, and collapsible sections use workspace data. |
| Graph | Not ported | The route and canvas exist, but graph visualization is still a placeholder. |
| Visual parity | Partial | Overall dark layout is close; spacing, preview styling, source token colors, and a few controls still need refinement. |

## Notes, files, and workspace state

| Area | Status | Notes |
| --- | --- | --- |
| Open, create, edit, and save | Working | Markdown body editing preserves YAML front matter. |
| Autosave and filesystem watching | Working | Event-driven, serialized, memory-first writes make self-events idempotent; external conflicts are detected. |
| Favorites, pinning, trash, tags, and attachments | Working | Backed by workspace/front-matter data and reference-style actions. |
| Note, web, attachment, and local file links | Working | `file://` navigation is restricted to the configured workspace to prevent path traversal. |
| Search | Working | Results include contextual note previews with highlighted matches and are populated incrementally. |
| Info outline | Working | Heading entries navigate to their source position. |
| Import/export | Not ported | HTML, Markdown, and PDF export controls remain disabled; ENEX and platform import flows remain in Electron. |
| Automatic note renaming | Not ported | The setting is shown as unavailable. |

## Source editor

| Area | Status | Notes |
| --- | --- | --- |
| Markdown editing | Working | QScintilla provides the native editor, dark theme, undo/redo, and line-oriented editing. |
| Find and replace | Working | Find/replace current/all, regex, case, whole-word, and next/previous navigation are available. |
| Spell checking | Working | Hunspell checks the visible source region after a 200 ms trailing debounce; context menus provide suggestions and dictionary additions. |
| Basic completion | Partial | QScintilla completion is wired to settings, but Monaco's richer Markdown suggestions and commands are not at parity. |
| Markdown syntax highlighting | Partial | Common constructs are highlighted; complex Markdown/HTML nesting is not yet identical to Monaco. |
| Advanced Monaco editing | Partial | Multi-cursor, all Monaco commands, code-fence language suggestions, and automatic table formatting need an explicit parity pass. |

## Markdown preview

| Area | Status | Notes |
| --- | --- | --- |
| GitHub-flavored Markdown | Working | Native cmark-gfm rendering retains source ranges and stable block identities. |
| Incremental preview updates | Working | Changed blocks are patched while unchanged KaTeX/Mermaid/PlantUML DOM is preserved. |
| Raw HTML and `<details>` | Working | HTML is sanitized; interactive details and task checkboxes are retained without executing arbitrary note scripts. |
| Wiki links and macros | Working | Note/tag/attachment links, heading anchors, TOC/page-break handling, and reference link behavior are present. |
| Emoji and typography extensions | Working | Emoji shortcodes plus reference superscript/subscript forms such as `N~2~` are generated/rendered. |
| KaTeX and chemistry | Working | A worker batches math; the mhchem extension supports commands such as `\ce`. |
| Mermaid | Working | Changed diagrams are batched and errors are hidden from visible layout. |
| PlantUML | Working | Local rendering uses the pinned JAR; remote rendering is available as fallback. Cache storage is currently memory-only. |
| Code highlighting | Working | Prism assets cover the common bundled languages. |
| Preview theme parity | Partial | The reference dark stylesheet is reused, with Qt-specific bridges; exact typography and element spacing still need comparison. |
| Source/preview scroll synchronization | Working | Off, percentage, and semantic modes are available; fine-grained behavior remains an area for continued testing. |

## Settings and reference content

| Area | Status | Notes |
| --- | --- | --- |
| Settings page | Working | GNOME-inspired rows read and write the workspace YAML configuration. Unsupported options are disabled rather than silently accepted. |
| Cheatsheet | Working | Content is generated from the reference TypeScript source and rendered through the native preview pipeline. |
| YAML scalar/container fidelity | Working | Strings and spellcheck word collections round-trip as their intended types rather than byte arrays. |
| Persistent diagram cache | Partial | Size/count controls exist; the native PlantUML cache has not yet moved to persistent SQLite storage. |

## Platform and release work

| Area | Status | Notes |
| --- | --- | --- |
| Diagnostics | Working | Debug defaults on, Release defaults off; command-line overrides and separate UI/render counters are available. |
| Native unit tests | Working | CTest covers rendering, serialization, watching, spellcheck, diagrams, generated assets, and paths. |
| Packaging and signing | Not ported | Production bundles, installers, signing, and release automation still target Electron. |
| Updater and notifications | Not ported | Platform services remain in the reference implementation. |
| Battery-aware behavior | Partial | User-configured throttling/disable behavior exists; native automatic battery-state integration is not complete. |

## Near-term priorities

1. Finish high-value editor parity: advanced Markdown completion/commands and
   table editing behavior.
2. Implement the graph route and complete file/attachment metadata surfaces.
3. Port export/import workflows and persistent diagram caching.
4. Continue side-by-side visual and interaction testing against the reference
   app, especially preview spacing, syntax highlighting, and scroll behavior.
5. Add packaging and platform integrations only after the core workflows are at
   parity and the Electron reference is no longer needed for comparison.
