#!/usr/bin/env node

/* eslint-disable no-console */

const {performance} = require('perf_hooks');
const showdown = require('showdown');
const cmark = require('cmark-gfm');

const DEFAULT_SIZES_KIB = [8, 32, 128, 512, 1024];
const DEFAULT_WARMUP = 5;
const DEFAULT_ITERATIONS = 25;
const COMPLEX_MARKDOWN = String.raw`---
title: Benchmark Fixture
created: '2026-02-24T00:00:00.000Z'
tags: [bench, markdown, parser]
---

# Markdown Benchmark Fixture

This fixture intentionally combines markdown features: emphasis, **strong text**, ~~strikethrough~~, \`inline code\`,
emoji :rocket:, links [example.com](https://example.com), reference links [docs][docs-ref], and raw HTML.

[docs-ref]: https://example.com/docs

## Task List + Nested Lists

- [x] Completed task with a [nested link](https://github.com)
- [ ] Pending task with \`code\` and ==highlight==
  - Sub-item A
  - Sub-item B
    1. Ordered inner list one
    2. Ordered inner list two

## Table

| Feature | Example | Notes |
| --- | --- | --- |
| Inline math | $E = mc^2$ | Parser should keep symbols |
| Blockquote | > quoted text | Includes punctuation, commas, and symbols |
| Auto-link | www.example.org/docs | Should become a link in GFM |

## Blockquote + HTML

> Blockquotes can include **formatting**, [links](https://news.ycombinator.com), and line breaks.
> They often expose parser edge cases when mixed with lists and code.

<details>
  <summary>Raw HTML block</summary>
  <p>Inline HTML with <mark>mark</mark>, <kbd>Ctrl+K</kbd>, and a <span data-x="1">span</span>.</p>
</details>

## Code Fences

\`\`\`ts
type User = { id: number; name: string; tags: string[] };

export const normalize = (users: User[]): string[] => {
  return users
    .filter(u => u.tags.length > 0)
    .map(u => \`\${u.id}:\${u.name}\`);
};
\`\`\`

\`\`\`bash
#!/usr/bin/env bash
set -euo pipefail
echo "benchmarking markdown parsers"
\`\`\`

## Mermaid + Footnotes-ish Patterns

\`\`\`mermaid
graph TD
  A[Start] --> B{Parse}
  B -->|showdown| C[HTML]
  B -->|cmark-gfm| D[HTML]
  C --> E[Compare]
  D --> E
\`\`\`

Text with pseudo-footnotes [^1], [^long-note], and wiki links [[Project Roadmap|Roadmap.md]].

[^1]: short note
[^long-note]: long note with punctuation; includes commas, semicolons, and parentheses (a, b, c).

## Repeated Stress Section

Paragraph with long prose to stress parsers. Lorem ipsum dolor sit amet, consectetur adipiscing elit.
Vestibulum hendrerit, nisl nec posuere volutpat, arcu est convallis dolor, at vehicula nibh urna sit amet nisl.
Suspendisse potenti. Donec non faucibus erat. Mauris pharetra lectus vel libero bibendum, ac efficitur massa dictum.

1. Item one with \`inline\` snippets and [a URL](https://example.net/path?q=search#hash)
2. Item two with escaped chars \*literal asterisk\* and entity &amp; handling
3. Item three with mixed formatting **bold _nested italic_ bold** and ~~delete~~ markers

---
`;

const cmarkOptions = {
  unsafe: true,
  extensions: {
    autolink: true,
    strikethrough: true,
    table: true,
    tasklist: true
  }
};

function parseArgs (argv) {
  const options = {
    sizesKiB: DEFAULT_SIZES_KIB.slice(),
    warmup: DEFAULT_WARMUP,
    iterations: DEFAULT_ITERATIONS
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = argv[i + 1];

    if (arg === '--sizes' && value) {
      options.sizesKiB = value.split(',').map(Number).filter(Number.isFinite).filter(size => size > 0);
      i++;
    } else if (arg === '--warmup' && value) {
      options.warmup = Math.max(0, Number(value) || 0);
      i++;
    } else if (arg === '--iterations' && value) {
      options.iterations = Math.max(1, Number(value) || 1);
      i++;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
  }

  return options;
}

function makeSizedMarkdown (source, targetBytes) {
  if (source.length >= targetBytes) return source.slice(0, targetBytes);

  let output = source;
  while (output.length < targetBytes) {
    output += '\n\n' + source;
  }

  return output.slice(0, targetBytes);
}

function percentile (numbers, p) {
  if (!numbers.length) return 0;
  const sorted = numbers.slice().sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[index];
}

function benchmark (label, fn, markdown, warmup, iterations) {
  for (let i = 0; i < warmup; i++) fn(markdown);

  const samples = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn(markdown);
    samples.push(performance.now() - start);
  }

  const total = samples.reduce((sum, sample) => sum + sample, 0);
  const meanMs = total / samples.length;
  const p95Ms = percentile(samples, 95);
  const throughputMiBPerSec = ((markdown.length / (1024 * 1024)) / (meanMs / 1000));

  return {label, meanMs, p95Ms, throughputMiBPerSec};
}

function pad (value, width) {
  return String(value).padEnd(width, ' ');
}

function main () {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log('Usage: node scripts/analysis/benchmark_markdown_parsers.js [options]');
    console.log('');
    console.log('Options:');
    console.log('  --sizes <kib,...>     Comma-separated sizes in KiB (default: 8,32,128,512,1024)');
    console.log('  --warmup <n>          Warmup runs per parser+size (default: 5)');
    console.log('  --iterations <n>      Timed runs per parser+size (default: 25)');
    process.exit(0);
  }

  if (!Array.isArray(args.sizesKiB) || args.sizesKiB.length === 0) {
    console.error('At least one positive benchmark size must be provided with --sizes.');
    process.exit(1);
  }

  if (!cmark || typeof cmark.renderHtmlSync !== 'function') {
    console.error('cmark-gfm did not load correctly or renderHtmlSync is unavailable.');
    process.exit(1);
  }

  const source = COMPLEX_MARKDOWN;
  const showdownConverter = new showdown.Converter({metadata: true});
  showdownConverter.setFlavor('github');
  showdownConverter.setOption('disableForced4SpacesIndentedSublists', true);
  showdownConverter.setOption('ghMentions', false);
  showdownConverter.setOption('smartIndentationFix', true);
  showdownConverter.setOption('smoothLivePreview', true);

  console.log('Benchmarking source: embedded complex markdown fixture');
  console.log(`Warmup: ${args.warmup} | Iterations: ${args.iterations}`);
  console.log('');
  console.log(`${pad('Size (KiB)', 12)}${pad('Parser', 14)}${pad('Mean (ms)', 12)}${pad('P95 (ms)', 12)}${pad('MiB/s', 10)}`);
  console.log('-'.repeat(60));

  for (const sizeKiB of args.sizesKiB) {
    const sizeBytes = sizeKiB * 1024;
    const markdown = makeSizedMarkdown(source, sizeBytes);

    const showdownResult = benchmark(
      'showdown',
      input => showdownConverter.makeHtml(input),
      markdown,
      args.warmup,
      args.iterations
    );

    const cmarkResult = benchmark(
      'cmark-gfm',
      input => cmark.renderHtmlSync(input, cmarkOptions),
      markdown,
      args.warmup,
      args.iterations
    );

    const rows = [showdownResult, cmarkResult];
    for (const row of rows) {
      console.log(
        `${pad(sizeKiB, 12)}${pad(row.label, 14)}${pad(row.meanMs.toFixed(2), 12)}${pad(row.p95Ms.toFixed(2), 12)}${pad(row.throughputMiBPerSec.toFixed(2), 10)}`
      );
    }
  }
}

main();
