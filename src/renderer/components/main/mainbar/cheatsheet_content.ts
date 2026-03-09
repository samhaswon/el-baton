/* IMPORT */

import Emoji from '@common/emoji';

/* CONTENT */

const htmlCodeBlock = ( lines: string[] ) => [
  '<pre><code>',
  ...lines.map ( line => line
    .replace ( /&/g, '&amp;' )
    .replace ( /</g, '&lt;' )
    .replace ( />/g, '&gt;' )
  ),
  '</code></pre>'
].join ( '\n' );

const EMOJI_TABLE = [
  '| Shorthand | Rendered |',
  '| --- | --- |',
  ...Emoji.getAllShortcodes ()
    .map ( shortcode => ({ shortcode, emoji: Emoji.get ( shortcode ) }))
    .filter ( entry => !!entry.emoji )
    .map ( entry => `| \`:${entry.shortcode}:\` | ${entry.emoji} |` )
].join ( '\n' );

const EMOJI_DETAILS = [
  '<details>',
  '<summary>Supported emoji shortcodes</summary>',
  '',
  EMOJI_TABLE,
  '',
  '</details>'
].join ( '\n' );

const KATEX_QUICK_REFERENCE_DETAILS = [
  '<details>',
  '<summary>KaTeX quick reference tables</summary>',
  '',
  'These are meant for source-to-rendered lookup, similar to the official KaTeX reference tables.',
  '',
  '##### Greek letters',
  '',
  '| Source | Rendered |',
  '| --- | --- |',
  '| `\\alpha` | $\\alpha$ |',
  '| `\\beta` | $\\beta$ |',
  '| `\\gamma` | $\\gamma$ |',
  '| `\\delta` | $\\delta$ |',
  '| `\\epsilon` | $\\epsilon$ |',
  '| `\\varepsilon` | $\\varepsilon$ |',
  '| `\\theta` | $\\theta$ |',
  '| `\\vartheta` | $\\vartheta$ |',
  '| `\\lambda` | $\\lambda$ |',
  '| `\\mu` | $\\mu$ |',
  '| `\\pi` | $\\pi$ |',
  '| `\\varpi` | $\\varpi$ |',
  '| `\\sigma` | $\\sigma$ |',
  '| `\\varsigma` | $\\varsigma$ |',
  '| `\\phi` | $\\phi$ |',
  '| `\\varphi` | $\\varphi$ |',
  '| `\\omega` | $\\omega$ |',
  '| `\\Gamma` | $\\Gamma$ |',
  '| `\\Delta` | $\\Delta$ |',
  '| `\\Theta` | $\\Theta$ |',
  '| `\\Lambda` | $\\Lambda$ |',
  '| `\\Pi` | $\\Pi$ |',
  '| `\\Sigma` | $\\Sigma$ |',
  '| `\\Phi` | $\\Phi$ |',
  '| `\\Omega` | $\\Omega$ |',
  '',
  '##### Operators and structures',
  '',
  '| Source | Rendered |',
  '| --- | --- |',
  '| `\\frac{a}{b}` | $\\frac{a}{b}$ |',
  '| `\\sqrt{x}` | $\\sqrt{x}$ |',
  '| `\\sqrt[n]{x}` | $\\sqrt[n]{x}$ |',
  '| `\\binom{n}{k}` | $\\binom{n}{k}$ |',
  '| `\\sum_{i=1}^{n} i` | $\\sum_{i=1}^{n} i$ |',
  '| `\\prod_{i=1}^{n} i` | $\\prod_{i=1}^{n} i$ |',
  '| `\\int_0^1 x^2 dx` | $\\int_0^1 x^2 dx$ |',
  '| `\\lim_{x \\to 0}` | $\\lim_{x \\to 0}$ |',
  '| `\\sin x` | $\\sin x$ |',
  '| `\\log x` | $\\log x$ |',
  '| `\\operatorname{foo}(x)` | $\\operatorname{foo}(x)$ |',
  '| `\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}` | $\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}$ |',
  '',
  '##### Relations and arrows',
  '',
  '| Source | Rendered |',
  '| --- | --- |',
  '| `\\leq` | $\\leq$ |',
  '| `\\geq` | $\\geq$ |',
  '| `\\neq` | $\\neq$ |',
  '| `\\approx` | $\\approx$ |',
  '| `\\equiv` | $\\equiv$ |',
  '| `\\subseteq` | $\\subseteq$ |',
  '| `\\supseteq` | $\\supseteq$ |',
  '| `\\in` | $\\in$ |',
  '| `\\notin` | $\\notin$ |',
  '| `\\to` | $\\to$ |',
  '| `\\mapsto` | $\\mapsto$ |',
  '| `\\Rightarrow` | $\\Rightarrow$ |',
  '| `\\iff` | $\\iff$ |',
  '| `\\xrightarrow{n\\to\\infty}` | $\\xrightarrow{n\\to\\infty}$ |',
  '',
  '##### Symbols and notation',
  '',
  '| Source | Rendered |',
  '| --- | --- |',
  '| `\\infty` | $\\infty$ |',
  '| `\\partial` | $\\partial$ |',
  '| `\\nabla` | $\\nabla$ |',
  '| `\\forall` | $\\forall$ |',
  '| `\\exists` | $\\exists$ |',
  '| `\\emptyset` | $\\emptyset$ |',
  '| `\\varnothing` | $\\varnothing$ |',
  '| `\\therefore` | $\\therefore$ |',
  '| `\\because` | $\\because$ |',
  '| `\\angle` | $\\angle$ |',
  '| `\\triangle` | $\\triangle$ |',
  '| `\\Box` | $\\Box$ |',
  '| `\\heartsuit` | $\\heartsuit$ |',
  '| `\\spadesuit` | $\\spadesuit$ |',
  '| `\\cdots` | $\\cdots$ |',
  '| `\\ddots` | $\\ddots$ |',
  '',
  '</details>'
].join ( '\n' );

const CHEATSHEET_CONTENT = String.raw`
# Cheatsheets

A compact reference for the editor, markdown, and diagram features built into El Baton.

## Table of Contents

- [Tutorial](#tutorial)
- [Markdown Basics](#markdown-basics)
- [Extended Markdown](#extended-markdown)
  - [Emojis](#emojis)
- [KaTeX](#katex)
- [Mermaid](#mermaid)
- [PlantUML](#plantuml)

## Tutorial

Get to know El Baton and how it helps you conduct your knowledge. This section is a quick tour of the main features so you can start writing right away.

### Start Here

1. Pick a data directory.
2. Create or open a note.
3. Write in source, preview, or split view.
4. Use settings to tailor editing behavior to your workflow.

### Your Files Stay Yours

El Baton stores notes and attachments as normal files:

\`\`\`dircolors
/path/to/your/data_directory
├─┬ attachments
│ ├── file.ext
│ └── …
└─┬ notes
  ├── note.md
  └── …
\`\`\`

- Notes are plain markdown files.
- Attachments are regular files in \`attachments/\`.
- Edits made outside El Baton are picked up automatically.

### Navigation at a Glance

- **Activity bar + side panel panes**: Switch between Explorer, Search, File menu, Info, and other panes.
- **Explorer pane**: Browse All Notes, Favorites, Notebooks, Tags, Templates, Untagged, and Trash.
- **Search pane**: Search and sort visible notes/results.
- **Mainbar**: Open multiple notes as tabs, close tabs, and create new notes quickly.

### Editing Modes

- **Preview** for clean reading.
- **Source** for direct markdown editing in Monaco.
- **Split view** to edit and preview side by side.

Editor highlights:

- Configurable line numbers (absolute, relative, hidden).
- Configurable tab size.
- Optional split-view scroll sync.
- Optional automatic markdown table formatting with configurable delay.
- Code-fence language suggestions while typing fenced blocks.
- Emoji shortcodes (\`:\`) if you're into that.

### Find What You Need

#### In-note search (\`Ctrl/Cmd+F\`)

- Search inside the current note.
- Regex search with the \`.*\` toggle.
- In source view, replace one match or replace all.
- Keyboard control: \`Enter\` next, \`Shift+Enter\` previous.

#### Cross-note search

- Search across all of your notes in the search panel.
- Open results with contextual snippets.
- Jump directly to matching content.

### Spellcheck and Dictionary

- Misspellings are marked in source editing.
- Right-click suggestions and add-to-dictionary are supported.
- Personal dictionary words are persistent and editable in Settings.
- Spellcheck language follows available system locales when possible.

### On-Battery Mode

Use the toolbar battery button or Settings to reduce editor/preview work on battery power.

Options include:

- Manual on-battery mode.
- Auto-detect battery power.
- Split-sync FPS cap.
- Extra render delay while typing.
- Optional battery-only disabling of spellcheck, autocomplete, and animations.

### Settings You'll Likely Use

Settings are stored in global config (for example \`.el-baton.yml\`) in your data directory.

- **General**: update checks, animations, \`Use GPU\`.
- **Editor**: line numbers, tab size, split sync, table formatting, large-note preview delay.
- **Spellcheck Dictionary**: disable spellcheck and manage saved words.
- **PlantUML**: optional external server, timeout, cache limits.
- **Input**: optional Linux/X11 middle-click paste disable.

### Links and Organization

Use built-in markdown link helpers:

\`\`\`markdown
![Attachment](@attachment/file.png)
[Note](@note/Some Note.md)
[Tag](@tag/Projects)
[[Wiki Link|Some Note.md]]
[[Some Note]]
\`\`\`

You can also organize notes with nested tags, notebooks (\`Notebooks/*\`), and templates (\`Templates/*\`).

### Advanced Workflows

Because your notes are file-based, you can easily add:

- Folder sync tools (Dropbox, Drive, Syncthing, etc.)
- Git version history
- Encrypted volumes/containers

### Need More Help?

- This tutorial is available at any time from the cheatsheet button at the bottom left.
  - Need other markdown or syntax help? Keep reading for more.
- Issues and feature requests: <https://github.com/samhaswon/el-baton/issues>

## Markdown Basics

Standard markdown syntax, with writing features like **bold**, *italic*, _other italic_, ***bold italic***, ~~strikethrough~~, and \`inline code\`.

### Headings and inline formatting

${htmlCodeBlock ( [
    '# Heading 1',
    '## Heading 2',
    '### Heading 3',
    '',
    '**bold**',
    '*italic*',
    '_other italic_',
    '***bold italic***',
    '~~strikethrough~~',
    '`inline code`'
  ])}

### Lists, tasks, and horizontal rules

${htmlCodeBlock ( [
    '- Bullet item',
    '- Another bullet item',
    '',
    '1. Ordered item',
    '2. Ordered item',
    '',
    '---',
    '',
    '1. Ordered item',
    '1. Ordered item',
    '',
    '- [ ] Open task',
    '- [x] Completed task'
  ])}
- Bullet item
- Another bullet item

1. Ordered item
2. Ordered item

---

1. Ordered item
1. Ordered item

- [ ] Open task
- [x] Completed task

### Quotes and tables

${htmlCodeBlock ( [
    '> Blockquotes work too.',
    '',
    '| Name | Value |',
    '| ---- | ----- |',
    '| A    | 1     |',
    '| B    | 2     |'
  ])}

> Blockquotes work too.

| Name | Value |
| ---- | ----- |
| A    | 1     |
| B    | 2     |

### Links and images

${htmlCodeBlock ( [
    '[OpenAI](https://openai.com)',
    '',
    '![Alt text](./image.png)'
  ])}

[OpenAI](https://openai.com)

## Extended Markdown

El Baton extends standard markdown with note links, tag links, attachment links, generated tables of contents, KaTeX, and Mermaid.

### Internal link syntax

${htmlCodeBlock ( [
    '[A note](@note/My Note.md)',
    '[A tag](@tag/Project Ideas)',
    '[An attachment](@attachment/mockup.png)'
  ])}

### Table of contents macro

Place this on its own line to generate a note-local table of contents:

\`\`\`markdown
[[toc]]
\`\`\`

### Common HTML syntax

Some inline HTML is useful inside markdown when you need formatting markdown does not provide directly.

\`\`\`markdown
<!-- Comments won't render in the preview -->

<sub>subscript</sub>

<sup>superscript</sup>

<u>underlined with u</u>

<ins>underlined with ins</ins>

a<sup>super<sup>duper script</sup></sup>

<mark>highlighting</mark>

<small>Small</small> text

<details open>
  <summary>Summary...</summary>
  Details...
</details>

<kbd>CTRL + ALT + DELETE</kbd>
\`\`\`

<!-- Comments won't render in the preview -->

<sub>subscript</sub>

<sup>superscript</sup>

<u>underlined with u</u>

<ins>underlined with ins</ins>

a<sup>super<sup>duper script</sup></sup>

<mark>highlighting</mark>

<small>Small</small> text

<details open>
  <summary>Summary...</summary>
  Details...
</details>

<kbd>CTRL + ALT + DELETE</kbd>


### Emojis

Use GitHub-style shortcodes like \`:rocket:\`. Supported shortcodes and their rendered output are listed below.

${EMOJI_DETAILS}

### Math syntax

\`\`\`markdown
Inline math: $E = mc^2$

$$
\int_0^1 x^2 dx = \frac{1}{3}
$$
\`\`\`

Inline math: $E = mc^2$

$$
\int_0^1 x^2 dx = \frac{1}{3}
$$

### Mermaid fences

${htmlCodeBlock ( [
    '```mermaid',
    'flowchart LR',
    '  Draft --> Review --> Publish',
    '```'
  ])}

\`\`\`mermaid
flowchart LR
  Draft --> Review --> Publish
\`\`\`

## KaTeX

KaTeX renders both inline and block math.

### Inline

\`\`\`markdown
$c = \pm\sqrt{a^2 + b^2}$
\`\`\`

$c = \pm\sqrt{a^2 + b^2}$

### Display

\`\`\`markdown
$$
\sum_{i=1}^{n} i = \frac{n(n+1)}{2}
$$
\`\`\`

$$
\sum_{i=1}^{n} i = \frac{n(n+1)}{2}
$$

### Fenced KaTeX block

${htmlCodeBlock ( [
    '```katex',
    '\\begin{aligned}',
    'f(x) &= x^2 + 2x + 1 \\\\',
    '     &= (x + 1)^2',
    '\\end{aligned}',
    '```'
  ])}

\`\`\`katex
\begin{aligned}
f(x) &= x^2 + 2x + 1 \\
     &= (x + 1)^2
\end{aligned}
\`\`\`

### Chemistry via mhchem

${htmlCodeBlock ( [
    '```katex',
    '\\ce{CO2 + C -> 2CO}',
    '```'
  ])}

\`\`\`katex
\ce{CO2 + C -> 2CO}
\`\`\`

### Supported functions overview

A quick reference of some supported KaTeX functions and their usage.

<details>
<summary>General KaTeX functions</summary>

#### Accents

\`\`\`katex
\hat{x} + \vec{v} + \overline{AB} + \underbrace{a+b+c}_{3\ terms}
\`\`\`

Accents and annotations include \`\acute\`, \`\bar\`, \`\breve\`, \`\check\`, \`\ddot\`, \`\dot\`, \`\grave\`, \`\hat\`, \`\mathring\`, \`\tilde\`, \`\vec\`, \`\widehat\`, \`\widetilde\`, \`\overline\`, \`\underline\`, \`\overbrace\`, and \`\underbrace\`.

#### Delimiters

\`\`\`katex
\left\langle \frac{x}{y} \middle| z \right\rangle \quad \Big( x+y \Big)
\`\`\`

Includes paired delimiters like \`()\`, \`[]\`, \`\{\}\`, \`\langle\rangle\`, \`|\`, \`\|\`, plus sizing helpers \`\left\`, \`\right\`, \`\middle\`, \`\big\`, \`\Big\`, \`\bigg\`, and \`\Bigg\`.

#### Environments

\`\`\`katex
\begin{bmatrix} a & b \\ c & d \end{bmatrix} \qquad \begin{cases} x^2 & x \ge 0 \\ -x & x < 0 \end{cases}
\`\`\`

Matrix, array, and display environments include \`matrix\`, \`array\`, \`pmatrix\`, \`bmatrix\`, \`Bmatrix\`, \`vmatrix\`, \`Vmatrix\`, \`smallmatrix\`, \`cases\`, \`rcases\`, \`subarray\`, and display layouts such as \`equation\`, \`split\`, \`align\`, \`alignat\`, \`gather\`, \`CD\`, and their starred or aligned variants.

#### HTML

\`\`\`katex
\href{https://katex.org}{KaTeX} \quad \url{https://katex.org/docs/supported}
\`\`\`

Trusted HTML helpers include \`\href\`, \`\url\`, \`\includegraphics\`, \`\htmlId\`, \`\htmlClass\`, \`\htmlStyle\`, and \`\htmlData\`. The \`\html...\` extensions require permissive trust/strict settings when enabled.

Currently, this is disabled in the app by default, and there is no option to enable it.

#### Letters and Unicode

\`\`\`katex
\alpha + \beta = \Gamma \qquad \partial f + \nabla g \qquad x² + y₁
\`\`\`

Greek letters, symbols such as \`\aleph\`, \`\beth\`, \`\partial\`, \`\nabla\`, \`\Re\`, \`\Im\`, \`\wp\`, and a wide range of direct Unicode math characters, including subscript and superscript forms. There is more in the "KaTeX quick reference tables" dropdown.

#### Layout

\`\`\`katex
\boxed{E=mc^2} \quad \cancel{x} \quad \overset{def}{=} \quad \underset{n\to\infty}{\lim}
\`\`\`

Layout tools cover annotation (\`\cancel\`, \`\bcancel\`, \`\xcancel\`, \`\sout\`, \`\boxed\`, \`\not\`, \`\tag\`), line breaks (\`\\\`, \`\newline\`, \`\allowbreak\`, \`\nobreak\`), vertical layout (\`\stackrel\`, \`\overset\`, \`\underset\`, \`\atop\`, \`\substack\`, \`\raisebox\`, \`\hbox\`, \`\vcenter\`), and spacing or overlap helpers like \`\mathllap\`, \`\mathclap\`, \`\phantom\`, \`\kern\`, \`\quad\`, and the negative spaces.

#### Logic and set theory

\`\`\`katex
\forall x \in A,\; x \notin B \implies A \cap B = \varnothing
\`\`\`

Examples in this section include \`\forall\`, \`\exists\`, \`\nexists\`, \`\in\`, \`\notin\`, \`\ni\`, \`\mid\`, \`\land\`, \`\lor\`, \`\neg\`, \`\subset\`, \`\supset\`, \`\complement\`, \`\emptyset\`, \`\varnothing\`, \`\mapsto\`, \`\to\`, \`\gets\`, \`\leftrightarrow\`, \`\implies\`, \`\impliedby\`, \`\iff\`, \`\therefore\`, \`\because\`, \`\Set{...}\`, and \`\set{...}\`.

#### Macros

\`\`\`katex
\def\foo#1{\frac{#1}{1+#1}} \foo{x}
\`\`\`

KaTeX supports macro definition and expansion commands including \`\def\`, \`\gdef\`, \`\edef\`, \`\xdef\`, \`\newcommand\`, \`\renewcommand\`, \`\providecommand\`, \`\let\`, and \`\futurelet\`, plus helper primitives like \`\mathchoice\` and \`\expandafter\`.

#### Operators

\`\`\`katex
\sum_{i=1}^{n} i^2 \quad \frac{a}{b} \quad \binom{n}{k} \quad \operatorname*{arg\,max}_{x} f(x)
\`\`\`

This section covers big operators (\`\sum\`, \`\prod\`, \`\int\`, \`\bigcap\`, \`\bigcup\`, and related forms), binary operators (\`\times\`, \`\div\`, \`\cdot\`, \`\cap\`, \`\cup\`, \`\oplus\`, \`\otimes\`, \`\setminus\`, \`\mod\`, and more), fractions and combinatorics (\`\frac\`, \`\dfrac\`, \`\tfrac\`, \`\cfrac\`, \`\genfrac\`, \`\binom\`, \`\choose\`, \`\over\`, \`\above\`), named operators (\`\sin\`, \`\cos\`, \`\log\`, \`\ln\`, \`\det\`, \`\gcd\`, \`\lim\`, \`\argmax\`, \`\operatorname\`, \`\operatorname*\`), and roots via \`\sqrt\` and \`\sqrt[n]{...}\`.

#### Relations

\`\`\`katex
a \leq b \neq c \quad A \subseteq B \quad f \xrightarrow[n\to\infty]{} L
\`\`\`

The reference groups standard relations (\`=\`, \`<\`, \`>\`, \`\approx\`, \`\cong\`, \`\equiv\`, \`\leq\`, \`\geq\`, \`\subseteq\`, \`\supseteq\`, \`\prec\`, \`\succ\`, \`\parallel\`, \`\perp\`, \`\models\`, \`\vdash\`, \`\coloneqq\`, and more), negated relations (\`\neq\`, \`\nleq\`, \`\ngeq\`, \`\nsubseteq\`, \`\nsupseteq\`, \`\precnsim\`, \`\succnsim\`, and similar), and arrow relations (\`\leftarrow\`, \`\rightarrow\`, \`\leftrightarrow\`, \`\Rightarrow\`, \`\mapsto\`, \`\hookrightarrow\`, \`\leadsto\`, plus extensible arrows like \`\xleftarrow\`, \`\xrightarrow\`, \`\xmapsto\`, and \`\xlongequal\`).

#### Special notation

\`\`\`katex
\bra{\psi} A \ket{\phi} = \braket{\psi | A | \phi}
\`\`\`

Bra-ket helpers include \`\bra\`, \`\ket\`, \`\braket\`, \`\Bra\`, \`\Ket\`, and \`\Braket\`.

#### Style, color, size, and font

\`\`\`katex
\color{blue}{x+y} \quad \mathbb{R} \quad \mathbf{F} \quad \textsf{sans} \quad \Huge X
\`\`\`

This category includes class assignment helpers (\`\mathbin\`, \`\mathclose\`, \`\mathinner\`, \`\mathop\`, \`\mathopen\`, \`\mathord\`, \`\mathpunct\`, \`\mathrel\`), color commands (\`\color\`, \`\textcolor\`, \`\colorbox\`, \`\fcolorbox\`), font and text-style commands (\`\mathrm\`, \`\mathbf\`, \`\mathsf\`, \`\mathnormal\`, \`\mathit\`, \`\mathtt\`, \`\mathbb\`, \`\mathfrak\`, \`\mathcal\`, \`\mathscr\`, \`\text\`, \`\textbf\`, \`\textit\`, \`\emph\`, \`\boldsymbol\`, \`\bm\`, \`\bold\`, \`\mathsfit\`, \`\pmb\`), and size/style switches like \`\tiny\` through \`\Huge\`, along with \`\displaystyle\`, \`\textstyle\`, \`\scriptstyle\`, \`\scriptscriptstyle\`, \`\limits\`, \`\nolimits\`, and \`\verb\`.

#### Symbols and punctuation

\`\`\`katex
\infty, \nabla, \angle ABC, \heartsuit, \checkmark, \ddots
\`\`\`

The symbols section includes escaped text symbols (\`\%\`, \`\#\`, \`\&\`, \`\_\`, \`\$\`), dots (\`\dots\`, \`\cdots\`, \`\ldots\`, \`\vdots\`, \`\ddots\`), branding commands (\`\KaTeX\`, \`\LaTeX\`, \`\TeX\`), geometric and card-suit symbols (\`\Box\`, \`\square\`, \`\triangle\`, \`\diamond\`, \`\lozenge\`, \`\clubsuit\`, \`\diamondsuit\`, \`\heartsuit\`, \`\spadesuit\`), and symbols like \`\infty\`, \`\nabla\`, \`\checkmark\`, \`\dagger\`, \`\ddagger\`, \`\angle\`, \`\measuredangle\`, \`\sphericalangle\`, \`\top\`, \`\bot\`, \`\flat\`, \`\natural\`, \`\sharp\`, \`\maltese\`, \`\diagdown\`, and \`\diagup\`.

#### Units

\`\`\`katex
\rule{1cm}{0.4pt} \qquad \kern1em x \kern2mu y
\`\`\`

Length units include \`em\`, \`ex\`, \`mu\`, \`pt\`, \`mm\`, \`cm\`, \`in\`, \`bp\`, \`pc\`, \`dd\`, \`cc\`, \`nd\`, \`nc\`, and \`sp\`. These are TeX units rather than CSS lengths and show up in commands such as \`\kern\`, \`\mkern\`, \`\hspace\`, \`\rule\`, and related spacing helpers.

</details>

#### Quick reference tables

${KATEX_QUICK_REFERENCE_DETAILS}

Supported functions reference: <https://katex.org/docs/supported>

## Mermaid

Mermaid diagrams render directly from fenced \`mermaid\` blocks.

Here are a few examples, but more can be found at <https://mermaid.js.org/intro/>

### Flowchart

${htmlCodeBlock ( [
    '```mermaid',
    'flowchart TD',
    '  Idea[Capture idea] --> Draft[Write draft]',
    '  Draft --> Review{Ready?}',
    '  Review -->|Yes| Ship[Ship it]',
    '  Review -->|No| Draft',
    '```'
  ])}

\`\`\`mermaid
flowchart TD
  Idea[Capture idea] --> Draft[Write draft]
  Draft --> Review{Ready?}
  Review -->|Yes| Ship[Ship it]
  Review -->|No| Draft
\`\`\`

### Sequence diagram

${htmlCodeBlock ( [
    '```mermaid',
    'sequenceDiagram',
    '  participant U as User',
    '  participant N as El Baton',
    '  U->>N: Open note',
    '  N-->>U: Render preview',
    '```'
  ])}

\`\`\`mermaid
sequenceDiagram
  participant U as User
  participant N as El Baton
  U->>N: Open note
  N-->>U: Render preview
\`\`\`

### Gantt chart

${htmlCodeBlock ( [
    '```mermaid',
    'gantt',
    '  title Release Plan',
    '  dateFormat  YYYY-MM-DD',
    '  section Docs',
    '  Write cheatsheet :done, docs1, 2026-03-01, 2d',
    '  section App',
    '  Ship feature :active, app1, 2026-03-03, 3d',
    '```'
  ])}

\`\`\`mermaid
gantt
  title Release Plan
  dateFormat  YYYY-MM-DD
  section Docs
  Write cheatsheet :done, docs1, 2026-03-01, 2d
  section App
  Ship feature :active, app1, 2026-03-03, 3d
\`\`\`


## PlantUML

PlantUML diagrams render from fenced \`plantuml\`, \`puml\`, or \`uml\` code blocks.

### Basic sequence diagram

${htmlCodeBlock ( [
    '```plantuml',
    '@startuml',
    'Bob -> Alice : hello',
    '@enduml',
    '```'
  ])}

\`\`\`plantuml
@startuml
Bob -> Alice : hello
@enduml
\`\`\`

### Class diagram

${htmlCodeBlock ( [
    '```plantuml',
    '@startuml',
    'class User {',
    '  +id: string',
    '  +name: string',
    '}',
    'class Note {',
    '  +title: string',
    '}',
    'User "1" --> "*" Note : owns',
    '@enduml',
    '```'
  ])}

\`\`\`plantuml
@startuml
class User {
  +id: string
  +name: string
}
class Note {
  +title: string
}
User "1" --> "*" Note : owns
@enduml
\`\`\`

### Local rendering requirement (Graphviz)

Local PlantUML rendering requires Graphviz (the \`dot\` executable) to be installed and available in your PATH.

Download Graphviz: <https://www.graphviz.org/download/>

If you prefer, configure an external PlantUML server in Settings -> PlantUML and use the **Test Server** button to verify connectivity.
`.trim ().replace ( /\\`/g, '`' );

/* EXPORT */

export default CHEATSHEET_CONTENT;
