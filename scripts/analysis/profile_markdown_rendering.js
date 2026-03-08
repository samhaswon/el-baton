#!/usr/bin/env node

/* eslint-disable no-console */

const {performance} = require('perf_hooks');
const {AllHtmlEntities: Entities} = require('html-entities');
const cmark = require('cmark-gfm');
const katex = require('katex');

let Prism;
let prismLanguages = {};

try {
  Prism = require('prismjs');
  prismLanguages = require('prismjs/components.js').languages || {};
} catch (error) {
  Prism = null;
}

const entities = new Entities();

const DEFAULT_OPTIONS = {
  warmup: 8,
  iterations: 120,
  repeat: 20,
  mode: 'full', // cmark | cmark+katex | full
  reportEvery: 25,
  continuous: false
};

const CMARK_OPTIONS = {
  unsafe: true,
  extensions: {
    autolink: true,
    strikethrough: true,
    table: true,
    tasklist: true
  }
};

const FIXTURE_BASE = String.raw`---
title: Markdown Profile Fixture
created: "2026-03-08T00:00:00.000Z"
tags: [profile, markdown, katex, stress]
---

# Markdown Rendering Profile Fixture

This fixture intentionally combines many markdown features to stress parsing and rendering.
It includes **bold**, *italic*, ~~strikethrough~~, \`inline code\`, links [example](https://example.com), and emoji :rocket: :warning:.

## Lists and Tasks

- [x] Completed task
- [ ] Pending task
  - Nested item with [external link](https://example.com/path?query=1#hash)
  - Nested item with escaped chars: \* \_ \~
1. Ordered one
2. Ordered two

> Blockquote with inline math $a^2+b^2=c^2$ and text.
> Another line with [reference link][docs-ref].

[docs-ref]: https://example.com/docs

## Tables

| Feature | Example | Notes |
| --- | --- | --- |
| Inline math | $e^{i\pi}+1=0$ | Euler identity |
| Display math | $$\int_0^1 x^2\,dx=\frac{1}{3}$$ | Integral |
| Matrix | $A\vec{x}=\vec{b}$ | Linear algebra |

## Code Fences

\`\`\`ts
type Item = { id: number; label: string; tags: string[] };

export const project = (items: Item[]): string[] => {
  return items
    .filter(item => item.tags.length > 0)
    .map(item => item.id + ':' + item.label);
};
\`\`\`

\`\`\`python
def score(values):
    total = 0
    for value in values:
        total += value * value
    return total
\`\`\`

\`\`\`bash
#!/usr/bin/env bash
set -euo pipefail
echo "profile markdown rendering"
\`\`\`

\`\`\`latex
\frac{1}{\sqrt{2\pi\sigma^2}} e^{-\frac{(x-\mu)^2}{2\sigma^2}}
\`\`\`

## KaTeX Stress

Inline:
$\alpha+\beta+\gamma$,
$\sum_{k=1}^{n}k=\frac{n(n+1)}{2}$,
$\lim_{x\to\infty}\frac{1}{x}=0$,
$\nabla \cdot \vec{E}=\frac{\rho}{\epsilon_0}$.

Display:

$$
\begin{aligned}
f(x) &= x^4 - 3x^3 + 2x - 7 \\
f'(x) &= 4x^3 - 9x^2 + 2 \\
\int_0^1 f(x)\,dx &= \left[\frac{x^5}{5} - \frac{3x^4}{4} + x^2 - 7x\right]_0^1
\end{aligned}
$$

$$
\left(
\begin{array}{ccc}
1 & 0 & 2 \\
0 & 1 & -1 \\
3 & 4 & 5
\end{array}
\right)
\left(
\begin{array}{c}
x \\
y \\
z
\end{array}
\right)
=
\left(
\begin{array}{c}
7 \\
8 \\
9
\end{array}
\right)
$$

$$
\begin{aligned}
&x=2.8~\text{atm}\\
&[\text{SO}_3]_e=x=2.8\\
&[\text{O}_2]_e=3.8-\tfrac{1}{2}x=2.4\\
&[\text{SO}_2]_e=3.1-x=0.3\\
\end{aligned}
$$

$$
\begin{aligned}
K_p&=&\cfrac{\text{P}^2_{\text{SO}_3}}{\text{P}^2_{\text{SO}_2}\text{P}_{\text{O}_2}}\\~\\
&=&\cfrac{(2.8)^2}{(0.3)^2(2.4)}\\
&=&36.2962963\\
&\approx&36.
\end{aligned}
$$

$$
\begin{aligned}
&x=0.24~\text{mol}/50~\text{L}=0.0048\\
&[\text{NH}_3]_e=0.32-2x=0.3104\\
&[\text{O}_2]_e=0.072-\tfrac{3}{2}x=0.0648\\
&[\text{N}_2]_e=0.0048\\
&[\text{H}_2\text{O}]_e=0.0144
\end{aligned}
$$

$$
\begin{aligned}
K_c&=&\cfrac{[\text{N}_2]^2[\text{H}_2\text{O}]^6}{[\text{NH}_3]^4[\text{O}_2]^3}\\
&=&\cfrac{(0.0048)^2(0.0144)^6}{(0.3104)^4(0.0648)^3}\\
&=&8.13290238\times 10^{-11}\\
&\approx&8.1\times 10^{-11}
\end{aligned}
$$

$$
\begin{aligned}
&x=1.3~\text{atm}\\
&[\text{CH}_4]_e=3.2-x=1.9\\
&[\text{H}_2\text{O}]_e=4.4-x=3.1\\
&[\text{CO}]_e=x=1.3\\
&[\text{H}_2]_e=3x=3.9
\end{aligned}
$$

$$
\begin{aligned}
K_p&=&\cfrac{\text{P}_{\text{CO}}~\text{P}_{\text{H}_2}^3}{\text{P}_{\text{CH}_4}~\text{P}_{\text{H}_2\text{O}}}\\
&=&\cfrac{(1.3)(3.9)^3}{(1.9)(3.1)}\\
&=&13.09247878\\
&\approx&13.
\end{aligned}
$$

$$
K_c=\cfrac{[\text{HCl}]^2}{[\text{H}_2][\text{Cl}_2]}
$$

$$
\begin{aligned}
0.154&=&\cfrac{(6.8-2x)^2}{(x)(3.2+x)}\\
0.154&=&\cfrac{46.24-27.2x+4x^2}{3.2x+x^2}\\
0.4928x+0.154x^2&=&46.24-27.2x+4x^2\\
0&=&46.24-27.6928x+3.846x^2\\
\end{aligned}
$$

$$
x=\cfrac{27.6928\pm\sqrt{(-27.6928)^2-4(3.846)(46.24)}}{2(3.846)}
$$
$$
x=4.569732408,2.632087665
$$

$$
\begin{aligned}
&x=4.569732408:\\
&[H_2]_e=x=4.5697\\
&[Cl_2]_e=3.2+x=7.7697\\
&[HCl]_e=6.8-2x=-2.339464816
\end{aligned}
$$

$$
\begin{aligned}
&x=2.632087665:\\
&[H_2]_e=x=2.632087665\\
&[Cl_2]_e=3.2+x=5.832087665\\
&[HCl]_e=6.8-2x=1.53582467\\
\end{aligned}
$$
$$
\text{Plugging in to }K_c=0.153659312\approx 0.154
$$

$$
K_c=\frac{[\text{NO}][\text{CO}_2]}{[\text{NO}_2][\text{CO}]}
$$

$$
\begin{aligned}
2.27&=&\cfrac{(1.2-x)(2.6-x)}{(1.40+x)(x)}\\
2.27&=&\cfrac{3.12-3.8x+x^2}{1.4x+x^2}\\
3.178x+2.27x^2&=&3.12-3.8x+x^2\\
-3.12+6.978x+1.27x^2&=&0
\end{aligned}
$$

$$
x=\cfrac{-6.978\pm\sqrt{(6.978)^2-4(1.27)(-3.12)}}{2(1.27)}
$$

$$
x=\cfrac{-6.978\pm 8.03380881}{2.54}=0.41567276
$$

## Mixed HTML

<details>
  <summary>Open payload</summary>
  <div data-profile="markdown">
    <p>Mixed <strong>HTML</strong> with <code>inline</code> nodes and <a href="https://example.org">links</a>.</p>
    <p>Inline formula inside HTML paragraph: $c=\sqrt{a^2+b^2}$</p>
  </div>
</details>
`;

function parseArgs(argv) {
  const options = {...DEFAULT_OPTIONS};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = argv[i + 1];

    if (arg === '--warmup' && value) {
      options.warmup = Math.max(0, Number(value) || 0);
      i++;
    } else if (arg === '--iterations' && value) {
      options.iterations = Math.max(1, Number(value) || 1);
      i++;
    } else if (arg === '--repeat' && value) {
      options.repeat = Math.max(1, Number(value) || 1);
      i++;
    } else if (arg === '--mode' && value) {
      if (value === 'cmark' || value === 'cmark+katex' || value === 'full') options.mode = value;
      i++;
    } else if (arg === '--report-every' && value) {
      options.reportEvery = Math.max(1, Number(value) || 1);
      i++;
    } else if (arg === '--continuous') {
      options.continuous = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
  }

  return options;
}

function usage() {
  console.log('Usage: node scripts/analysis/profile_markdown_rendering.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --mode <name>         cmark | cmark+katex | full (default: full)');
  console.log('  --warmup <n>          Warmup runs (default: 8)');
  console.log('  --iterations <n>      Timed runs (default: 120)');
  console.log('  --repeat <n>          Fixture multiplier (default: 20)');
  console.log('  --report-every <n>    Progress log cadence (default: 25)');
  console.log('  --continuous          Run until interrupted (Ctrl+C)');
}

function buildFixture(repeat) {
  const chunks = [];
  for (let i = 0; i < repeat; i++) {
    chunks.push(`\n\n<!-- profile section ${i + 1} -->\n`);
    chunks.push(FIXTURE_BASE);
  }
  return chunks.join('');
}

function sanitizeLanguage(language) {
  return String(language || '').trim().toLowerCase();
}

function inferLanguage(codeAttrs) {
  const languageMatch = String(codeAttrs || '').match(/language-([^\s"']*)/i);
  if (languageMatch) return sanitizeLanguage(languageMatch[1]);

  const altMatch = String(codeAttrs || '').match(/\blang(?:uage)?=["']?([^\s"'/>]+)/i);
  if (altMatch) return sanitizeLanguage(altMatch[1]);
}

function initPrismLanguage(language) {
  if (!Prism || !language) return false;
  if (Prism.languages[language]) return true;

  const langDef = prismLanguages[language];
  if (!langDef) return false;

  const required = Array.isArray(langDef.require) ? langDef.require : (langDef.require ? [langDef.require] : []);
  for (const dep of required) {
    if (!initPrismLanguage(dep)) return false;
  }

  try {
    require(`prismjs/components/prism-${language}.min.js`);
    return !!Prism.languages[language];
  } catch (error) {
    return false;
  }
}

function highlightCodeBlocks(html) {
  if (!Prism) return html;

  return html.replace(/<pre><code(\s[^>]*?)>([\s\S]*?)<\/code><\/pre>/g, (match, attrs, rawCode) => {
    const language = inferLanguage(attrs);
    if (!language) return match;

    const aliases = {
      js: 'javascript',
      ts: 'typescript',
      yml: 'yaml',
      sh: 'bash',
      shell: 'bash',
      py: 'python',
      tex: 'latex',
      katex: 'latex'
    };

    const resolved = aliases[language] || language;
    if (!initPrismLanguage(resolved)) return match;

    try {
      const decoded = entities.decode(rawCode);
      const highlighted = Prism.highlight(decoded, Prism.languages[resolved], resolved);
      return `<pre><code${attrs || ''}>${highlighted}</code></pre>`;
    } catch (error) {
      return match;
    }
  });
}

function renderKatexSafe(tex, displayMode) {
  try {
    return katex.renderToString(tex, {
      throwOnError: false,
      strict: 'ignore',
      displayMode
    });
  } catch (error) {
    return displayMode ? `<pre><code>${tex}</code></pre>` : `$${tex}$`;
  }
}

function renderKatexBlocks(html) {
  return html.replace(
    /<pre><code\s[^>]*language-(?:tex|latex|katex)[^>]*>([\s\S]*?)<\/code><\/pre>/gi,
    (match, encoded) => {
      const tex = entities.decode(encoded).replace(/<br\s*\/?>/gi, '\n').replace(/&nbsp;/gi, ' ');
      return renderKatexSafe(tex, true);
    }
  );
}

function renderKatexInlineAndDisplay(html) {
  const display = html.replace(/(^|[^\\])\$\$([\s\S]+?)\$\$/gm, (match, prefix, tex) => {
    return `${prefix}${renderKatexSafe(entities.decode(tex), true)}`;
  });

  return display.replace(/(^|[^\\])\$(?!\$)([^\n$]+?)\$(?!\$)/gm, (match, prefix, tex) => {
    return `${prefix}${renderKatexSafe(entities.decode(tex), false)}`;
  });
}

function renderMarkdown(markdown, mode) {
  let html = cmark.renderHtmlSync(markdown, CMARK_OPTIONS);
  if (mode === 'cmark') return html;

  html = renderKatexBlocks(html);
  html = renderKatexInlineAndDisplay(html);
  if (mode === 'cmark+katex') return html;

  return highlightCodeBlocks(html);
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[index];
}

function run(markdown, options) {
  for (let i = 0; i < options.warmup; i++) renderMarkdown(markdown, options.mode);

  const samples = [];
  let count = 0;

  while (options.continuous || count < options.iterations) {
    count++;

    const start = performance.now();
    renderMarkdown(markdown, options.mode);
    samples.push(performance.now() - start);

    if (count % options.reportEvery === 0) {
      const mean = samples.reduce((sum, v) => sum + v, 0) / samples.length;
      console.log(`[profile:markdown] progress renders=${count} mean-ms=${mean.toFixed(2)}`);
    }
  }

  return samples;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    process.exit(0);
  }

  if (!cmark || typeof cmark.renderHtmlSync !== 'function') {
    console.error('cmark-gfm did not load correctly.');
    process.exit(1);
  }

  const markdown = buildFixture(options.repeat);
  console.log('[profile:markdown] start');
  console.log(`[profile:markdown] pid=${process.pid}`);
  console.log(`[profile:markdown] mode=${options.mode} warmup=${options.warmup} iterations=${options.iterations} repeat=${options.repeat} bytes=${markdown.length}`);
  console.log(`[profile:markdown] prism=${!!Prism} katex=${!!katex} continuous=${options.continuous}`);

  const samples = run(markdown, options);
  const total = samples.reduce((sum, v) => sum + v, 0);
  const mean = samples.length ? total / samples.length : 0;
  const min = samples.length ? Math.min(...samples) : 0;
  const max = samples.length ? Math.max(...samples) : 0;
  const p95 = percentile(samples, 95);

  console.log('[profile:markdown] done');
  console.log(`[profile:markdown] renders=${samples.length} mean-ms=${mean.toFixed(2)} p95-ms=${p95.toFixed(2)} min-ms=${min.toFixed(2)} max-ms=${max.toFixed(2)}`);
}

main();
