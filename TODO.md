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
    - It is currently still wonky, especially when the source isn't pure markdown (i.e., includes tables, math, etc.)
- [X] Fix scrolling while typing in large notes.
    - When the preview renders the smaller subsection of the note, it sometimes scrolls while typing.
- [X] Allow dev tools in production build
- [X] Disable middle-click paste for relevant Linux systems (with a configuration option).
    - The likely solution is to just capture it and discard it if enabled.
- [X] Fix scroll jumping when rendering the larger preview on large notes
- [X] Make source-view markdown syntax highlighting more complete.
    - Quote text is not differentiated
    - Possibly some other styling changes for better distinction
    - Sometimes breaks when mixing HTML and markdown
    - Breaks on inline math. It's just orange, not properly highlighted.
- [ ] Rename everything from "Notable" to "El Baton", including logo creation.
    - Agents: Don't do this one until asked as it involves human input.
- [X] Add unit tests where possible, mostly for markdown rendering and features that can use it.
- [X] Correct file path handling so that it is compatible with relative paths of GFM (or just MD on GitHub).
    - As long as it lands within the data directory, call it good. We shouldn't allow `../../../../../../../../etc/passwd` or something like that.
- [X] Capture mermaid errors and place them in the preview (as text), rather than allowing them to appear at the bottom of the window.
    - There's likely a way to emit errors as text which includes more relevant information, so let's try to do that. It at least used to be a feature.
- [X] Add better global search, separate from local (note) and note (name) searches.
    - Notes themselves need CTRL + F support for searching within a note. This should support regex.
    - Should be fast, and ideally support regex as well. 
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
    - The offending file does include a lot of HTML entities and is the largest single markdown file I have. It's mostly plain markdown and HTML entities, but includes book information at the start.

## Should Implement

- [X] Fix the rendering state position (CSS).
- [X] Add line numbers to the source view
    - [X] Literal line numbers from the shown start of the file
    - [X] Configurable option for vim-style line numbers
- [ ] Add PlantUML support, with optional server parameter to use and external server for newer diagram features
    - The npm package is a bit older, and is missing some features.
    - Should have a limited client-side cache results. They're not cheap.
        - Should be memoized for a session.
        - Should have a global cache as well using SQLite.
            - On load --> read SQLite cache
            - On note save --> write SQLite cache
    - Add option to embed the rendered diagram (SVG) as an attachment.
- [X] Use natural sorting, not lexicographic sorting, for notes in the explorer view.
- [ ] Speed up explorer tab opening
    - Possibly add a cache for the list
    - See if it has to do with the API used
    - Might have to do with the amount of a given file read. We only need to read the header, so see if we can just capture the first ~10-20 lines and leave it there.
- [ ] Add emoji support and completion. 
    - E.g., `:question:` as the actual emoji
- [X] Add table of contents macro `[[@toc]]` and pagebreak macro `[[@pagebreak]]`
    - Potentially add more, and add prediction when the `@` is found.
- [ ] More strict typing (see note in [tsconfig](./tsconfig.json))
    - [X] Move the JS target to ES2017 and keep `npx tsc --noEmit` passing.
    - [ ] Continue tightening compiler flags like `noImplicitAny` and `strict`.
- [ ] Automatic table formatting
- [ ] Add a lower bound to KaTeX memoization.
- [ ] Use the React Compiler, likely `react-compiler-webpack` for this implementation
- [ ] Option to turn off script sanitization, with a clear danger warning.
- [ ] Make local search support:
    - [ ] Regex
    - [ ] Find and replace (including with regex, specifically the match)

## QoL Features


- [ ] Add code type prediction
    - As the user types, a dialogue box should pop up showing potential options they may with to use. These options should be clickable.
- [ ] Add next word prediction that is light-weight, but only for text regions.
    - Should be tab-completed
    - Should appear as darker text in dark mode, lighter text in light mode.
- [ ] Make notes tabs look like tabs on a manila folder.
- [ ] Cheat sheets, including for KaTeX supported functions (https://katex.org/docs/supported.html)
- [ ] Ensure that spell checker localization is a thing. It might be automatic, so this is mostly audit and fix if broken.

## Mobile App

- [ ] Investigate Obsidian mobile app UX, along with others if they exist
- [ ] Decide on framework, likely React Native with a webview if that can work.
- [ ] TODO: the rest of this section

## Likely Won't Implement

- [ ] LLM integration
- [ ] Replace as much rendering logic as possible and sensible with native code.
- [ ] Custom CSS/JS
- [ ] Plugins
- [ ] Double-click in preview places cursor there in the source.
- [ ] Maybe add some kind of OCR if one can be found that's good for creating markdown source.
    - Or maybe just VLLM integration somehow.
    - Pix2tex for KaTeX, possibly as some kind of plugin

## Blocked

- [ ] Upgrade to the latest Electron version when Wayland support is fixed.
