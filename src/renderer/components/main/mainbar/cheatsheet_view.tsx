/* IMPORT */

import * as React from 'react';
import Preview from './preview';

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

const CHEATSHEET_CONTENT = [
  '# Cheatsheets',
  '',
  'A compact reference for the markdown and diagram features built into Notable.',
  '',
  '## Table of Contents',
  '',
  '- [Markdown Basics](#markdown-basics)',
  '- [Extended Markdown](#extended-markdown)',
  '- [KaTeX](#katex)',
  '- [Mermaid](#mermaid)',
  '',
  '## Markdown Basics',
  '',
  'Standard markdown syntax works as expected for core writing features like **bold**, *italic*, ~~strikethrough~~, and `inline code`.',
  '',
  '### Headings and inline formatting',
  '',
  htmlCodeBlock ( [
    '# Heading 1',
    '## Heading 2',
    '### Heading 3',
    '',
    '**bold**',
    '*italic*',
    '~~strikethrough~~',
    '`inline code`'
  ]),
  '',
  '### Lists and tasks',
  '',
  htmlCodeBlock ( [
    '- Bullet item',
    '- Another bullet item',
    '',
    '1. Ordered item',
    '2. Ordered item',
    '',
    '- [ ] Open task',
    '- [x] Completed task'
  ]),
  '',
  '### Quotes and tables',
  '',
  htmlCodeBlock ( [
    '> Blockquotes work too.',
    '',
    '| Name | Value |',
    '| ---- | ----- |',
    '| A    | 1     |',
    '| B    | 2     |'
  ]),
  '',
  '> Blockquotes work too.',
  '',
  '| Name | Value |',
  '| ---- | ----- |',
  '| A    | 1     |',
  '| B    | 2     |',
  '',
  '### Links and images',
  '',
  htmlCodeBlock ( [
    '[OpenAI](https://openai.com)',
    '',
    '![Alt text](./image.png)'
  ]),
  '',
  '[OpenAI](https://openai.com)',
  '',
  '## Extended Markdown',
  '',
  'Notable extends standard markdown with note links, tag links, attachment links, generated tables of contents, KaTeX, and Mermaid.',
  '',
  '### Internal link syntax',
  '',
  htmlCodeBlock ( [
    '[A note](@note/My Note.md)',
    '[A tag](@tag/Project Ideas)',
    '[An attachment](@attachment/mockup.png)'
  ]),
  '',
  '### Table of contents macro',
  '',
  'Place this on its own line to generate a note-local table of contents:',
  '',
  '```markdown',
  '[[toc]]',
  '```',
  '',
  '### Math and diagram fences',
  '',
  '```markdown',
  'Inline math: $E = mc^2$',
  '',
  '$$',
  '\\int_0^1 x^2 dx = \\frac{1}{3}',
  '$$',
  '```',
  '',
  htmlCodeBlock ( [
    '```mermaid',
    'flowchart LR',
    '  Draft --> Review --> Publish',
    '```'
  ]),
  '',
  'Inline math: $E = mc^2$',
  '',
  '$$',
  '\\int_0^1 x^2 dx = \\frac{1}{3}',
  '$$',
  '',
  '```mermaid',
  'flowchart LR',
  '  Draft --> Review --> Publish',
  '```',
  '',
  '## KaTeX',
  '',
  'KaTeX renders both inline and block math.',
  '',
  '### Inline',
  '',
  '```markdown',
  '$c = \\pm\\sqrt{a^2 + b^2}$',
  '```',
  '',
  '$c = \\pm\\sqrt{a^2 + b^2}$',
  '',
  '### Display',
  '',
  '```markdown',
  '$$',
  '\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}',
  '$$',
  '```',
  '',
  '$$',
  '\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}',
  '$$',
  '',
  '### Fenced KaTeX block',
  '',
  htmlCodeBlock ( [
    '```katex',
    '\\begin{aligned}',
    'f(x) &= x^2 + 2x + 1 \\\\',
    '     &= (x + 1)^2',
    '\\end{aligned}',
    '```'
  ]),
  '',
  '```katex',
  '\\begin{aligned}',
  'f(x) &= x^2 + 2x + 1 \\\\',
  '     &= (x + 1)^2',
  '\\end{aligned}',
  '```',
  '',
  '### Chemistry via mhchem',
  '',
  htmlCodeBlock ( [
    '```katex',
    '\\ce{CO2 + C -> 2CO}',
    '```'
  ]),
  '',
  '```katex',
  '\\ce{CO2 + C -> 2CO}',
  '```',
  '',
  'Supported functions reference: <https://katex.org/docs/supported>',
  '',
  '## Mermaid',
  '',
  'Mermaid diagrams render directly from fenced `mermaid` blocks.',
  '',
  '### Flowchart',
  '',
  htmlCodeBlock ( [
    '```mermaid',
    'flowchart TD',
    '  Idea[Capture idea] --> Draft[Write draft]',
    '  Draft --> Review{Ready?}',
    '  Review -->|Yes| Ship[Ship it]',
    '  Review -->|No| Draft',
    '```'
  ]),
  '',
  '```mermaid',
  'flowchart TD',
  '  Idea[Capture idea] --> Draft[Write draft]',
  '  Draft --> Review{Ready?}',
  '  Review -->|Yes| Ship[Ship it]',
  '  Review -->|No| Draft',
  '```',
  '',
  '### Sequence diagram',
  '',
  htmlCodeBlock ( [
    '```mermaid',
    'sequenceDiagram',
    '  participant U as User',
    '  participant N as Notable',
    '  U->>N: Open note',
    '  N-->>U: Render preview',
    '```'
  ]),
  '',
  '```mermaid',
  'sequenceDiagram',
  '  participant U as User',
  '  participant N as Notable',
  '  U->>N: Open note',
  '  N-->>U: Render preview',
  '```',
  '',
  '### Gantt chart',
  '',
  htmlCodeBlock ( [
    '```mermaid',
    'gantt',
    '  title Release Plan',
    '  dateFormat  YYYY-MM-DD',
    '  section Docs',
    '  Write cheatsheet :done, docs1, 2026-03-01, 2d',
    '  section App',
    '  Ship feature :active, app1, 2026-03-03, 3d',
    '```'
  ]),
  '',
  '```mermaid',
  'gantt',
  '  title Release Plan',
  '  dateFormat  YYYY-MM-DD',
  '  section Docs',
  '  Write cheatsheet :done, docs1, 2026-03-01, 2d',
  '  section App',
  '  Ship feature :active, app1, 2026-03-03, 3d',
  '```'
].join ( '\n' );

/* CHEATSHEET VIEW */

const CheatsheetView = () => (
  <div className="cheatsheet-view layout column">
    <div className="layout-header toolbar">
      <span className="small">Cheatsheets</span>
    </div>
    <Preview content={CHEATSHEET_CONTENT} enableWorker={false} />
  </div>
);

/* EXPORT */

export default CheatsheetView;
