# El Baton TODO

## MVP Features

- [X] CSS refinement for the info pane.
    - Looks pretty rough right now
    - Indent headings by their level
- [X] Add global configuration options.
    - Ideally YAML, possibly JSON.
- [X] Store editor state somewhere.
    - Just use JSON somewhere, we'll decide where. There might already be state stored somewhere, so that would be ideal.
- [X] Fix the scroll synchronization for the split view.
    - It is currently still wonky, especially when the source isn't pure Markdown (i.e., includes tables, math, etc.)
- [X] Fix scrolling while typing in large notes.
    - When the preview renders the smaller subsection of the note, it sometimes scrolls while typing.
- [X] Allow dev tools in production build
- [X] Disable middle-click paste for relevant Linux systems (with a configuration option).
    - The likely solution is to just capture it and discard it if enabled.
- [X] Fix scroll jumping when rendering the larger preview on large notes
- [X] Make source-view Markdown syntax highlighting more complete.
    - Quote text is not differentiated
    - Possibly some other styling changes for better distinction
    - Sometimes breaks when mixing HTML and Markdown
    - Breaks on inline math. It's just orange, not properly highlighted.
- [X] Rename everything from "Notable" to "El Baton", including logo creation.
- [X] Add unit tests where possible, mostly for Markdown rendering and features that can use it.
- [X] Correct file path handling so that it is compatible with relative paths of GFM (or just MD on GitHub).
    - As long as it lands within the data directory, call it good. We shouldn't allow `../../../../../../../../etc/passwd` or something like that.
- [X] Capture mermaid errors and place them in the preview (as text), rather than allowing them to appear at the bottom of the window.
    - There's likely a way to emit errors as text which includes more relevant information, so let's try to do that. It at least used to be a feature.
- [X] Add better global search, separate from local (note) and note (name) searches.
    - Notes themselves need CTRL + F support for searching within a note. This should support regular expression.
    - Should be fast, and ideally support regular expression as well. 
    - Would be nice to use fuzzy string matching, but that will likely be too heavy for larger notes.
    - Could build a search index ahead of time, depending on which implementation we go for.
- [X] Add spellcheck
    - [X] Basic working prototype
    - [X] Including right-click suggestions.
    - [X] Underline with red squiggle
- [X] Add close button for note tabs.
- [X] Katex: This breaks rendering `Home price = (\$ $\times$ sqft) + (\$ $\times$ quality) - (\$ $\times$ Distance from water) - (\$ $\times$ distance to City Center) + (\$ $\times$ number of bedrooms) - (\$ $\times$ number of years since house was built) $\pm$ (\$ $\times$ number of stories)`
    - [X] Add unit tests for KaTeX
    - [X] Add more tests as well to ensure the parsing of KaTeX goes right.
    - [X] The dollar signs are also breaking syntax highlighting.
- [X] Fix preview issue when the title is not the first line of the file?
    - Preview of the split view is truncated to mostly just what is visible when formatted for pandoc
    - Preview view truncates to the first two chapters.
    - The offending file does include a lot of HTML entities and is the largest single Markdown file I have. It's mostly plain Markdown and HTML entities, but includes book information at the start.

## Should Implement

- [X] Fix the rendering state position (CSS).
- [X] Add line numbers to the source view
    - [X] Literal line numbers from the shown start of the file
    - [X] Configurable option for vim-style line numbers
- [X] Add PlantUML support, with optional server parameter to use and external server for newer diagram features
    - The npm package is a bit older, and is missing some features.
    - Should have a limited client-side cache results. They're not cheap.
        - Should be memoized for a session.
        - Should have a global cache as well using SQLite.
            - On load --> read SQLite cache for PlantUML first.
            - On note save --> write SQLite cache
            - Should be large enough to have a high hit rate, but capped at some configurable number of diagrams.
    - Add option to embed the rendered diagram (SVG) as an attachment.
    - External server example URL: https://plantuml.samhaswondom.duckdns.org/svg/SyfFKj2rKt3CoKnELR1Io4ZDoSa70000
      That is the default example,
      ```plantuml
      @startuml
      Bob -> Alice : hello
      @enduml
      ```

- [X] Use natural sorting, not lexicographic sorting, for notes in the explorer view.
- [X] Speed up explorer tab opening
    - Possibly add a cache for the list
    - See if it has to do with the API used
    - Might have to do with the amount of a given file read. We only need to read the header, so see if we can just capture the first ~10-20 lines and leave it there.
- [X] Add emoji support
    - E.g., `:question:` as the actual emoji
    - [X] Unit test this
- [X] Add table of contents macro `[[@toc]]` and pagebreak macro `[[@pagebreak]]`
    - Potentially add more, and add prediction when the `@` is found.
- [ ] More strict typing (see note in [tsconfig](./tsconfig.json))
    - [X] Move the JS target to ES2017 and keep `npx tsc --noEmit` passing.
    - [ ] Continue tightening compiler flags like `noImplicitAny` and `strict`.
- [X] Automatic table formatting
    - [X] Autoformat tables
    - [X] Unit test for the correct styling. 
        - Depending on the alignment of the column, the source should be similarly aligned. There will be cases for which this won't fit perfectly, so that should be kept in mind.
        - A column formatted `|:-:|` should be turned into `| :-: |`, with the middle hyphen count being determined by the width of the column. Specifically, the maximum character count of the column should line up with the character count of the format specifier (`:-:`) for the column.
        - Similar tests should be done for all column format specifiers.
    - [X] Add a configurable delay between typing and table formatting.
- [X] Add a lower bound to KaTeX memoization.
- [X] Use the React Compiler
- [X] Option to turn off script sanitization, with a clear danger warning.
- [X] Make local search support:
    - [X] Regular expressions
    - [X] Find and replace (including with regular expression, specifically the match)
- [ ] More unit tests for things that should be tested
    - [ ] Make sure footnotes work per the GFM spec.
- [X] Brighten up the settings page in dark mode.
    - [X] Currently, contrast is rather poor, making it hard to read.
- [X] Make spell check added words persistent, exposing the list in the settings menu. 
    - [X] This should involve some kind of collapsed view initially as to not clog up the UI. 
    - [X] Users should be able to add/delete from this list.
    - [ ] Ideally should also import from Notable's settings, specifically as handled in the version extracted in `./extracted`.

## QoL Features

- [X] Add code type prediction
    - As the user types, a dialogue box should pop up showing potential options they may with to use. These options should be clickable.
- [X] Add next word prediction that is light-weight, but only for text regions.
    - Should be tab-completed
    - Should appear as darker text in dark mode, lighter text in light mode.
    - Should include emojis.
- [X] Make notes tabs look like tabs on a manila folder.
- [X] Cheat sheets, including for KaTeX supported functions (https://katex.org/docs/supported.html)
    - [X] Markdown features
    - [X] Extended Markdown features
    - [X] KaTeX support:
        - [X] Code blocks, `$...$` and `$$\n...\n$$`
        - [X] Syntax
    - [X] Mermaid support:
        - [X] Code blocks
        - [X] Key syntax points
    - [X] Basic PlantUML usage
        - Link to Graphviz in the cheatsheet for local usage: https://www.graphviz.org/download/
- [X] Ensure that spell checker localization is a thing. It might be automatic, so this is mostly audit and fix if broken.
- [X] Additional settings:
    - [X] Add option to disable sync for the split view. 
    - [X] Add option to disable automatic table formatting.
    - [X] Add option to disable automatic renaming of notes
    - [X] Add option to disable spell check
- [X] Build-in the tutorial as pages, rather than files, so it can more easily be referenced.
- [X] Evaluate memory usage in the production build.
    - See if it's good, bad, what. Dev is a bit heavy, but that's dev.
- [X] On-battery mode with toolbar toggle.
    - [X] Look into what features Electron supports for this.
        - See if it can be automated cross-platform
        - See what all can be done outside of what's listed below.
    - [X] Reduce the framerate to 30FPS (default), editable in settings as 15FPS, 20FPS, 30FPS, and 60FPS.
    - [X] Optimize rendering for battery life.
        - Maybe do something like the large note preview, where there is a delay between the user stopping typing and the note actually rendering.
            - If done, this should be a toggle in the settings, as well as a configurable delay
    - [X] Disable spellcheck on battery toggle 
        - Default off, meaning that spellcheck is active on battery
    - [X] Disable autocomplete on battery toggle
        - Default of autocomplete still on when on battery.
    - [X] Disable animations when on battery toggle
        - Default of animations off when on battery.
    - Toggles here do not supersede global options.
        - If a user disables animations globally, they should still be disabled. Similar for other options.
- [X] Persist sidebar panel open/closed state.
- [X] Run tests with GHA.
- [X] Cross-platform CI with GHA, because you can't build for Mac on Linux.

## Polish

- [X] First, address the Dependabot PRs for deps. This likely includes breaking changes.
- [ ] Fix this build warning: `[DEP0147] DeprecationWarning: In future versions of Node.js, fs.rmdir(path, { recursive: true }) will be removed. Use fs.rm(path, { recursive: true }) instead`
- [ ] Optimize Markdown string ops to reduce GC pressure.
    - Measure first, then optimize what ranks highest.
- [X] PlantUML issue: `[plantuml remote error: The "path" argument must be of type string. Received type number (6292)]`
    Example diagram:
    ```plantuml
    @startuml
    !include <awslib/AWSCommon>
    !include <awslib/AWSSimplified.puml>
    !include <awslib/Compute/all.puml>
    !include <awslib/general/all.puml>
    !include <awslib/GroupIcons/all.puml>
    !include <C4/C4_Context.puml>
    !include <office/Users/user.puml>

    listsprites
    @enduml
    ```
- [X] Correct scroll handling for details tags, both open and closed.
    - Might require some amount of non-linearity in scrolling.
    - Could be helped by making the last source line (with text) being aligned to the last part of the preview with rendered content, specifically in terms of absolute scroll position.
        - This is specific to scrolling toward the end of a large note with disproportionate source lines to output height. Scrolling to the end/past of the source content should scroll the preview to the end/past the rendered content. 
        - Might involve adding more padding to the bottom of the preview pane.
    - [X] Related: Scroll sync doesn't quite work correctly in the smaller preview of a large note. It sometimes scrolls to far.
    - [X] Diagrams (Mermaid and PlantUML) and likely images sometimes scroll the preview further than they should.
        - Not particularly bad, this is mostly a slight tuning issue. 
        - Sometimes jumps around with mermaid rendering in and out.
    - `iframe` and `details` tags also contribute to this issue.
- [X] Retain explorer dropdown state
- [ ] Expand Vim-like options
    - [ ] <kbd>INSERT</kbd> should toggle the edit/preview/split-view mode, similar to Vim, in vim mode.
    - [ ] <kbd>Esc</kbd> should toggle command mode for things like jumps, replacements, etc.
- [ ] CSS: the note tabs should just be trapezoids with a border color.
- [ ] Split view: lightly highlight the edit location when typing.
- [X] Bug: window randomly scrolls to the top when switching to another app for a while. Cursor remains, but the scroll moves on its own.
    - Might be related to the user scrolling the preview pane last?
    - Might be related to the app going into the background and attempting to trigger the on-battery state? Kind of hard to tell.
    - Preview "rendering" state button in the toolbar gets stuck in its rendering indication. Might be related?
- [X] Suggestions for tags based on what exists, excluding what the note is already tagged with.
- [ ] Use `react-window` on the explorer pane.
    - Or maybe `contain: layout paint !important;`?
- [ ] Investigate removing the smaller preview for large notes
    - [ ] Identify how rendering changes could be made more efficient
        - Potentially, could involve applying some form of delta.
        - Could keep the smaller rendering window, but leave the rest of the note intact. Basically, hide that we're only rendering a smaller part of the document. Then, after the specified delay, actually re-render the whole document. If we do this well, the delay could be long.
- [ ] Ensure mermaid is rendered in a worker and is memoized.
- ~~[ ] Add loading state for large notes' source view.~~
    - Opening large notes hangs for a second, which makes the app feel unresponsive. 
- ~~[ ] KaTeX: Add support for ChatGPT's preferred parenthesis format.~~
    - `\(...\)` inline
    - `\[...\]` block
    - Document in the cheat sheet
    - Discourage its use for GFM compatibility. 
    - Edit: the copy button strips the escape characters now, so this won't practically work.
- [X] KaTeX: Placeholder leaks through:
    - `Since with every union, a vertex in a smaller set transfers from a set of size $s$ to a set of size $\ge 2s$, the number of times it spends $\$1$ is at most $\log_2 n$.`
    - This issue comes from escaped dollar signs within a math block, which breaks placeholders.
- [X] Support formatting keyboard shortcuts
    - Bold: CTRL + b
    - Italic: CTRL + i
    - ...
- [X] Auto-close brackets, braces, parenthesis, and formatting.
    - If a user types `(`, autofill the closing `)`.
        - If the user types some and then types the closing `)`, do not add a duplicate parenthesis.
    - [X] When a user highlights text and types a brace/bracket/parenthesis or formatting that wraps text (`*`, `_`, `~`, ...), autofill on both sides and do not delete the text.
    - [X] Add UI test for this after it is known to work to catch regressions.
- [ ] Syntax highlighting breaks within quote blocks (`> `).
    - Source view
    - Quote blocks themselves are still not differentiated in the source view. Should be a slightly lighter gray in the source view, akin to the rendered styling.
- ~~[ ] Window does not re-open to previous size.~~
- [ ] Scrollbar:
    - [ ] The scrollbar for the preview should have the same styling as the source view.
    - [ ] The scrollbar for sidebar panels should have the same styling as the source view.
- [X] When editing, diagrams (Mermaid/PlantUML) flash in and out. 
    - Might need to figure out how to keep them persistent.
    - Could be related to how we replace the whole preview every time.
- [X] Allow on-battery mode to be turned off when on battery.
- [X] Code fence language suggestions should only appear on the opening part of a fence, not a closing part.
- [ ] Drop usage of overstated (unmaintained now).
- [ ] Seed autocomplete from other notes
    - possibly with an upper bound or most recently opened constraint.
    - Should be done asynchronously at app startup. 
    - Markov chain?
- [ ] Scrolling a video element from the preview causes the source to ghost in a temporary position.
    - Test note: global Matthew 7 notes
    - Probably just need to account for the height of the video.
- [ ] When typing a path, folders and files should be suggested that exist from what has already been typed.
- [ ] Paths to files should support spaces in filenames.
- [ ] Disabling middle-click paste should enable middle-click to make multiple cursors for selection.
    - If a user clicks in a position with the middle mouse button and drags down, another cursor should be created there that follows the original horizontally.
- [ ] Some emojis aren't replaced correctly.
    - E.g., :mermaid: does not become 🧜‍♀️ as shown in the dialogue boxes.

## Mobile App

- [ ] Investigate Obsidian mobile app UX, along with others if they exist
- [ ] Decide on framework, likely React Native with a webview if that can work.
- [ ] TODO: the rest of this section

## Likely Won't Implement

- [ ] Implement a presentation mode similar to whatever Pandoc has.
    - https://pandoc.org/MANUAL.html#slide-shows
- [ ] (V)LLM integration
- [ ] Replace as much rendering logic as possible and sensible with native code.
- [ ] Custom CSS/JS
- [ ] Plugins
- [ ] Double-click in preview places cursor there in the source.
    - It would be nice if this, at the very least, dropped the cursor on the correct source line. That might be doable with the current scroll synchronization implementation.
- [ ] Maybe add some kind of OCR if one can be found that's good for creating Markdown source.
    - Or maybe just VLLM integration somehow.
    - Pix2tex for KaTeX, possibly as some kind of plugin
- [ ] ~~Rust~~ C rewrite.

## Blocked

- [ ] Upgrade to the latest Electron version when Wayland support is fixed.
    - https://github.com/electron/electron/issues/49244
- [ ] Move to built-in `node:sqlite` when the project can be upgraded to a later ~~node~~ Electron version.
    - There appears to be a disconnect between the project and Electron node versions.
