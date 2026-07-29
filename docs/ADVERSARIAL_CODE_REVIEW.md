# Adversarial native-port review

Date: 2026-07-29  
Reviewed branch: `dev` (`f17e0b3`) against `master`  
Scope: native C++/Qt implementation, build/release configuration, native tests,
and native fuzzers. The implementation under `reference/` was not reviewed.

## Verdict

**Do not merge into `master` yet.**

Overall rating: **5/10**.

The port has a promising structure, broad native unit coverage, sanitizer
instrumentation, hardened release flags, bounded incremental Markdown matching,
and careful local-link checks. However, the current branch has a confirmed
workspace-boundary write vulnerability, a fuzzer that fails before fuzzing,
multiple silent data-integrity failures, and an importer whose memory use is
controlled by untrusted input. Those are merge blockers for a note editor.

## Findings

### 1. High: a note symlink can overwrite a file outside the workspace

`WorkspaceRepository::refresh()` recursively accepts every readable file with a
supported extension, including symlinks, without checking the canonical path
against the canonical notes root
([`src/workspace_repository.cpp`](../src/workspace_repository.cpp), lines
77-107). `DocumentFile::load()` retains the symlink's absolute path rather than
its canonical target, and saving uses `QSaveFile` on that path
([`src/document_file.cpp`](../src/document_file.cpp), lines 146-171 and
151-181).

This was reproduced locally:

1. Create `workspace/notes/link.md` as a symlink to an outside Markdown file.
2. The `QDirIterator` configuration used by the repository returns `link.md`.
3. Load and save it through `DocumentFile`.
4. The outside target is overwritten while the symlink remains in place.

This defeats the workspace confinement asserted elsewhere in the application
and can cause data loss. Canonicalize the notes root and every candidate, reject
any candidate outside that root, and apply the same invariant immediately
before every write to defend against symlink swaps.

### 2. High: ENEX import permits input-controlled memory exhaustion

The importer reads arbitrary element text into `QString`, simplifies and copies
it, converts it to Latin-1, decodes the entire Base64 value, retains every
decoded resource in a `QVector`, and only writes resources after the whole note
has been parsed
([`src/note_transfer_service.cpp`](../src/note_transfer_service.cpp), lines
45-72 and 96-129). There is no limit on source size, note count, resource count,
encoded size, decoded size, or aggregate import size. Import also runs
synchronously from the GUI path.

A crafted or merely large `.enex` file can freeze or exhaust the application
with several simultaneous representations of the same attachment. This risk is
already acknowledged in `docs/PORT_STATUS.md`, but it remains a merge blocker.
Stream resource data to bounded temporary files, enforce per-resource and
aggregate limits, and move import work off the UI thread.

### 3. High: the ENEX fuzz target crashes during initialization

The ENEX fuzzer constructs `QCoreApplication`
([`fuzz/enex_import_fuzzer.cpp`](../fuzz/enex_import_fuzzer.cpp), lines 15-23),
but ENEX conversion calls `QTextDocument::setHtml()`, which accesses
`QFontDatabase` and requires a `QGuiApplication`. Running the prescribed fuzzer
against its seed corpus terminates immediately with:

```text
QFontDatabase: Must construct a QGuiApplication before accessing QFontDatabase
ERROR: libFuzzer: deadly signal
```

The scheduled and pull-request fuzz workflow therefore cannot exercise this
target successfully. Use an offscreen `QGuiApplication` in this harness and add
a CI assertion that the seed corpus completes before the timed fuzz run.

### 4. Medium: editing block-style metadata corrupts front matter

`metadataStringList()` can read block sequences such as:

```yaml
tags:
  - one
  - two
```

However, `setTags()` and `setAttachments()` replace or remove only the key line
matched by `metadataLine()`; they do not consume the following sequence items
([`src/document_file.cpp`](../src/document_file.cpp), lines 55-97 and
326-405). Replacing the list leaves the old `- one` / `- two` entries behind;
clearing the list leaves orphan sequence items. The result is invalid or
semantically changed YAML.

This is especially risky because the tests explicitly establish block-list
read support but never mutate one
([`tests/document_file_test.cpp`](../tests/document_file_test.cpp), lines
164-183). Parse and update front matter with a YAML-aware representation, or at
minimum replace the complete scalar/sequence span and add round-trip tests.

### 5. Medium: HTML and PDF export can silently export stale content

Both export paths call `maybeSave()` and then immediately read the current
preview DOM with `runJavaScript()`
([`src/main_window.cpp`](../src/main_window.cpp), lines 3216-3265). Saving is
synchronous, but preview rendering is separately throttled and asynchronous.
If the user edits and immediately exports, the Markdown file is current while
the DOM can still represent an older render generation. The resulting HTML or
PDF silently omits recent edits.

Export from a render result produced for the exact saved source revision, or
wait for and verify a matching generation before capturing the DOM.

### 6. Medium: PlantUML silently drops every request after the 64th

`PlantUmlRenderer::beginBatch()` reserves at most 64 requests and loops only
over the first 64
([`src/plantuml_renderer.cpp`](../src/plantuml_renderer.cpp), lines 220-232).
The omitted IDs receive neither a result nor an error. The JavaScript side has
already marked all submitted nodes as pending, so diagrams after the cutoff can
remain unresolved indefinitely.

Chunk large batches, queue all requests, or return explicit bounded errors for
every omitted ID. Add a test with at least 65 diagrams.

### 7. Medium: the supposedly irrelevant `reference/` tree remains a native
build dependency

The CMake cheatsheet target directly depends on and feeds two files from
`reference/` to a Node generator
([`CMakeLists.txt`](../CMakeLists.txt), lines 279-294). `el_baton_core` has an
unconditional dependency on that generated asset. Consequently, the native
port is not independently buildable from the native source and assets despite
the stated review premise.

Move the required content into a native-owned generated source or checked-in
asset, and make the C++ build independent of the legacy implementation.

### 8. Medium: malformed JSON configuration is accepted as empty and can be
overwritten

`GlobalConfigStore::reload()` checks neither `QJsonParseError` nor that the
document is an object; invalid JSON becomes an empty object and the method
returns success
([`src/global_config_store.cpp`](../src/global_config_store.cpp), lines
235-260). `SettingsStore` behaves similarly
([`src/settings_store.cpp`](../src/settings_store.cpp), lines 27-33). A later
settings change can overwrite the malformed file with defaults/current state,
destroying the user's recoverable configuration without warning.

Treat parse errors and non-object roots as errors, keep the original bytes
untouched, and surface the problem to the user.

### 9. Medium: workspace refresh and watching perform unbounded full-file work
on the UI thread

`WorkspaceRepository::refresh()` reads each note completely twice—once directly
and once through `DocumentFile::load()`—then rebuilds attachments and the full
graph synchronously
([`src/workspace_repository.cpp`](../src/workspace_repository.cpp), lines
77-116). `WorkspaceWatcher::takeSnapshot()` hashes every full note on every
scan, also synchronously
([`src/workspace_watcher.cpp`](../src/workspace_watcher.cpp), lines 30-38 and
138-164). Many UI operations call `workspace_.refresh()` directly.

Large workspaces or a few very large notes can make startup, filesystem events,
tag changes, and imports hang the UI. Cache file state, avoid duplicate reads,
incrementally refresh changed paths, and move scanning/hashing off the GUI
thread.

### 10. Low: apostrophes and quotes truncate titles in workspace views

New notes correctly encode apostrophes as doubled single quotes, for example
`title: 'Alpha''s Note'`. `WorkspaceRepository::readTitle()` instead uses a
regular expression that stops at the first quote
([`src/workspace_repository.cpp`](../src/workspace_repository.cpp), lines
62-74). The example is consequently indexed as `Alpha`, breaking explorer
labels, sorting, search, and title-based link resolution.

Read the title from parsed front matter rather than a quote-excluding regular
expression.

### 11. Low: invalid UTF-8 is silently rewritten

`DocumentFile::load()` converts all bytes with `QString::fromUtf8()` and does
not check for decoding errors; saves always emit `toUtf8()`
([`src/document_file.cpp`](../src/document_file.cpp), lines 151-181). Opening
and saving a file containing invalid UTF-8 replaces bytes
silently. The file dialog also permits arbitrary files.

Reject invalid UTF-8 with a clear error or explicitly support a detected source
encoding before enabling writes.

## Verification performed

- Debug build with GCC and ASan/UBSan instrumentation: passed.
- CTest with ASan/UBSan: **16/16 tests passed**.
- Prescribed Clang 18 fuzz build: all three fuzzer executables built.
- 30-second libFuzzer smoke runs:
  - Markdown pipeline: no sanitizer finding in the smoke window.
  - Document file: no sanitizer finding in the smoke window.
  - ENEX import: failed immediately due to the `QCoreApplication` /
    `QGuiApplication` defect above.
- `cppcheck` warning/performance/portability pass: no actionable application
  finding, but analysis was partially obstructed by Qt MOC macros.
- Focused symlink write reproduction: confirmed overwrite outside workspace.

The GUI-only interactions, including the stale export race, still need a manual
or automated UI test because `npm run test:ui` cannot be run in this
environment.
