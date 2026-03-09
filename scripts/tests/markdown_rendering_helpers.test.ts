/* IMPORT */

import {test} from 'node:test';
import * as assert from 'node:assert/strict';
import MarkdownRenderHelpers from '../../src/common/markdown_render_helpers';
const cmark = require ( 'cmark-gfm' );

const CMARK_OPTIONS = {
  unsafe: true,
  extensions: {
    autolink: true,
    strikethrough: true,
    table: true,
    tasklist: true
  }
};

const sanitize = ( html: string ): string => MarkdownRenderHelpers.sanitizeUnsafeHtml ( html );
const sanitizeDisabled = ( html: string ): string => MarkdownRenderHelpers.sanitizeUnsafeHtml ( html, false );
const renderHtml = ( markdown: string ): string => cmark.renderHtmlSync ( markdown, CMARK_OPTIONS );
const renderMathPipeline = ( markdown: string ): string => {
  const escaped = MarkdownRenderHelpers.replaceEscapedDollars ( markdown ),
        placeholders: Array<{ tex: string, displayMode: boolean }> = [],
        withPlaceholders = MarkdownRenderHelpers.replaceMathDelimiters ( escaped, ( tex, displayMode ) => {
          const index = placeholders.push ({ tex, displayMode }) - 1;
          return `MDKATEXPLACEHOLDER${index}END`;
        } ),
        rendered = MarkdownRenderHelpers.renderKatexPlaceholders ( withPlaceholders, placeholders, ( tex, displayMode ) => `<math mode="${displayMode ? 'display' : 'inline'}">${tex}</math>` );

  return MarkdownRenderHelpers.restoreEscapedDollars ( rendered );
};

/* TESTS */

test ( 'katex placeholders: renders indexed placeholder payloads', () => {

  const placeholders = [
          { tex: 'x^2', displayMode: false },
          { tex: '\\frac{1}{2}', displayMode: true }
        ],
        html = 'A MDKATEXPLACEHOLDER0END B MDKATEXPLACEHOLDER1END',
        rendered = MarkdownRenderHelpers.renderKatexPlaceholders ( html, placeholders, ( tex, displayMode ) => `<katex mode="${displayMode ? 'display' : 'inline'}">${tex}</katex>` );

  assert.equal ( rendered, 'A <katex mode="inline">x^2</katex> B <katex mode="display">\\frac{1}{2}</katex>' );

});

test ( 'katex placeholders: keeps unknown placeholders unchanged', () => {

  const html = 'MDKATEXPLACEHOLDER9END',
        rendered = MarkdownRenderHelpers.renderKatexPlaceholders ( html, [], () => 'nope' );

  assert.equal ( rendered, html );

});

test ( 'katex memoization threshold: only memoizes expressions at or above the lower bound', () => {

  const minLength = 8;

  assert.equal ( MarkdownRenderHelpers.shouldMemoizeKatex ( 'x^2', minLength ), false );
  assert.equal ( MarkdownRenderHelpers.shouldMemoizeKatex ( '  x^2  ', minLength ), false );
  assert.equal ( MarkdownRenderHelpers.shouldMemoizeKatex ( '\\frac{a}{b}', minLength ), true );
  assert.equal ( MarkdownRenderHelpers.shouldMemoizeKatex ( '1234567', minLength ), false );
  assert.equal ( MarkdownRenderHelpers.shouldMemoizeKatex ( '12345678', minLength ), true );
  assert.equal ( MarkdownRenderHelpers.shouldMemoizeKatex ( '   ', 1 ), false );

});

test ( 'katex parsing: keeps escaped currency markers while still replacing adjacent inline math', () => {

  const markdown = 'Home price = (\\$ $\\times$ sqft) + (\\$ $\\times$ quality) - $\\pm$',
        output = MarkdownRenderHelpers.replaceMathDelimiters ( markdown, ( tex, displayMode ) => `<math mode="${displayMode ? 'display' : 'inline'}">${tex}</math>` );

  assert.equal (
    output,
    'Home price = (\\$ <math mode="inline">\\times</math> sqft) + (\\$ <math mode="inline">\\times</math> quality) - <math mode="inline">\\pm</math>'
  );

});

test ( 'katex parsing: leaves escaped dollar pairs untouched instead of treating them as math delimiters', () => {

  const markdown = 'Cost: \\$ $100 and display $$x^2$$ remain distinct',
        output = MarkdownRenderHelpers.replaceMathDelimiters ( markdown, ( tex, displayMode ) => `<math mode="${displayMode ? 'display' : 'inline'}">${tex}</math>` );

  assert.equal ( output, 'Cost: \\$ $100 and display <math mode="display">x^2</math> remain distinct' );

});

test ( 'katex parsing: escaped currency placeholders survive multiple inline math spans on one line', () => {

  const markdown = 'Home price = (\\$ $\\times$ sqft) + (\\$ $\\times$ quality) - (\\$ $\\times$ Distance from water) + $\\pm$ (\\$ $\\times$ number of stories)',
        output = renderMathPipeline ( markdown );

  assert.equal (
    output,
    'Home price = ($ <math mode="inline">\\times</math> sqft) + ($ <math mode="inline">\\times</math> quality) - ($ <math mode="inline">\\times</math> Distance from water) + <math mode="inline">\\pm</math> ($ <math mode="inline">\\times</math> number of stories)'
  );

});

test ( 'katex parsing: preserves escaped currency placeholders until after math spans are rendered', () => {

  const markdown = '(\\$ $\\times$ sqft) + (\\$ $\\times$ quality)',
        escaped = MarkdownRenderHelpers.replaceEscapedDollars ( markdown ),
        placeholders: Array<{ tex: string, displayMode: boolean }> = [],
        withPlaceholders = MarkdownRenderHelpers.replaceMathDelimiters ( escaped, ( tex, displayMode ) => {
          const index = placeholders.push ({ tex, displayMode }) - 1;
          return `MDKATEXPLACEHOLDER${index}END`;
        } ),
        rendered = MarkdownRenderHelpers.renderKatexPlaceholders ( withPlaceholders, placeholders, tex => `<math>${tex}</math>` );

  assert.match ( rendered, /MDESCAPEDDOLLARPLACEHOLDER <math>\\times<\/math>/ );
  assert.doesNotMatch ( rendered, /\(\$ <math>/ );
  assert.equal ( MarkdownRenderHelpers.restoreEscapedDollars ( rendered ), '($ <math>\\times</math> sqft) + ($ <math>\\times</math> quality)' );

});

test ( 'katex parsing: renders the full repeated home-price expression without cross-consuming delimiters', () => {

  const markdown = 'Home price = (\\$ $\\times$ sqft) + (\\$ $\\times$ quality) - (\\$ $\\times$ Distance from water) - (\\$ $\\times$ distance to City Center) + (\\$ $\\times$ number of bedrooms) - (\\$ $\\times$ number of years since house was built) $\\pm$ (\\$ $\\times$ number of stories)',
        output = renderMathPipeline ( markdown );

  assert.equal (
    output,
    'Home price = ($ <math mode="inline">\\times</math> sqft) + ($ <math mode="inline">\\times</math> quality) - ($ <math mode="inline">\\times</math> Distance from water) - ($ <math mode="inline">\\times</math> distance to City Center) + ($ <math mode="inline">\\times</math> number of bedrooms) - ($ <math mode="inline">\\times</math> number of years since house was built) <math mode="inline">\\pm</math> ($ <math mode="inline">\\times</math> number of stories)'
  );

});

test ( 'macro placeholders: replaces supported markdown macros before parsing', () => {

  const markdown = 'Before\n\n[[@toc]]\n\n[[@pagebreak]]\n\nAfter',
        output = MarkdownRenderHelpers.replaceMacroPlaceholders ( markdown );

  assert.match ( output, /MDMACROTOCPLACEHOLDER/ );
  assert.match ( output, /MDMACROPAGEBREAKPLACEHOLDER/ );
  assert.doesNotMatch ( output, /\[\[@toc\]\]/ );
  assert.doesNotMatch ( output, /\[\[@pagebreak\]\]/ );

});

test ( 'macro rendering: injects heading anchors and renders a linked table of contents', () => {

  const html = [
          '<p>MDMACROTOCPLACEHOLDER</p>',
          '<h2>Intro</h2>',
          '<h4>Details &amp; More</h4>',
          '<h2>Summary</h2>'
        ].join ( '' ),
        output = MarkdownRenderHelpers.renderMacros ( html );

  assert.match ( output, /<div class="macro-toc">/ );
  assert.match ( output, /<p class="macro-toc-title">Table of Contents<\/p>/ );
  assert.match ( output, /<ul class="macro-toc-list"><li><a class="toc-item" href="#intro">Intro<\/a><ul class="macro-toc-list"><li><a class="toc-item" href="#details-more">Details &amp; More<\/a><\/li><\/ul><\/li><li><a class="toc-item" href="#summary">Summary<\/a><\/li><\/ul>/ );
  assert.match ( output, /<h2 id="intro">Intro<\/h2>/ );
  assert.match ( output, /<h4 id="details-more">Details &amp; More<\/h4>/ );
  assert.match ( output, /<h2 id="summary">Summary<\/h2>/ );

});

test ( 'macro rendering: replaces pagebreak placeholders with print break markup', () => {

  const output = MarkdownRenderHelpers.renderMacros ( '<p>MDMACROPAGEBREAKPLACEHOLDER</p>' );

  assert.equal ( output, '<hr class="pagebreak">' );

});

test ( 'mermaid block: encodes source and includes cached svg when present', () => {

  const source = 'graph TD\nA-->B',
        cachedSvg = '<svg><text>ok</text></svg>',
        html = MarkdownRenderHelpers.renderMermaidBlock ( source, cachedSvg );

  assert.match ( html, /^<div class="mermaid">/ );
  assert.match ( html, /class="mermaid-source hidden"/ );
  assert.match ( html, /graph%20TD%0AA--%3EB/ );
  assert.match ( html, /<svg><text>ok<\/text><\/svg>/ );

});

test ( 'mermaid block: returns no svg when cache is absent', () => {

  const html = MarkdownRenderHelpers.renderMermaidBlock ( 'flowchart LR\nA-->B' );

  assert.match ( html, /^<div class="mermaid"><code class="mermaid-source hidden">/ );
  assert.doesNotMatch ( html, /<svg/ );

});

test ( 'mermaid error: escapes the message and returns inline preview markup', () => {

  const html = MarkdownRenderHelpers.renderMermaidError ( 'Failed <bad> "input"' );

  assert.equal ( html, '<p class="mermaid-error text-warning">[mermaid error: Failed &lt;bad&gt; &quot;input&quot;]</p>' );

});

test ( 'mermaid external control: injects button into each mermaid container', () => {

  const input = '<div class="mermaid"></div><div class="mermaid"></div>',
        output = MarkdownRenderHelpers.injectMermaidOpenExternal ( input ),
        count = ( output.match ( /mermaid-open-external/g ) || [] ).length;

  assert.equal ( count, 2 );
  assert.match ( output, /title="Open in Separate Window"/ );

});

test ( 'plantuml block: encodes source into a hidden payload container', () => {

  const source = '@startuml\\nAlice -> Bob : hi\\n@enduml',
        html = MarkdownRenderHelpers.renderPlantUMLBlock ( source );

  assert.match ( html, /^<div class=\"plantuml\">/ );
  assert.match ( html, /class=\"plantuml-source hidden\"/ );
  assert.match ( html, /%40startuml/ );
  assert.match ( html, /%40enduml/ );

});

test ( 'plantuml error: escapes message content and labels origin', () => {

  const html = MarkdownRenderHelpers.renderPlantUMLError ( 'Failed <bad>', 'remote' );

  assert.equal ( html, '<p class=\"plantuml-error text-warning\">[plantuml remote error: Failed &lt;bad&gt;]</p>' );

});

test ( 'plantuml error: includes Graphviz download link when dot/Graphviz is missing', () => {

  const html = MarkdownRenderHelpers.renderPlantUMLError ( 'Dot Executable: /opt/local/bin/dot\nFile does not exist\nCannot find Graphviz.', 'local' );

  assert.match ( html, /Graphviz download/ );
  assert.match ( html, /https:\/\/www\.graphviz\.org\/download\// );
  assert.match ( html, /target=\"_blank\"/ );

});

test ( 'plantuml external control: injects hidden open button into each plantuml container', () => {

  const input = '<div class=\"plantuml\"></div><div class=\"plantuml\"></div>',
        output = MarkdownRenderHelpers.injectPlantUMLOpenExternal ( input ),
        count = ( output.match ( /plantuml-open-external/g ) || [] ).length;

  assert.equal ( count, 2 );
  assert.match ( output, /class=\"plantuml-open-external hidden\"/ );
  assert.match ( output, /title=\"Open External Diagram\"/ );

});

test ( 'html sanitization: strips script tags and preserves safe html', () => {

  const html = '<div>safe</div><script>alert("xss")</script><p>ok</p><SCRIPT SRC="https://evil.test/x.js"></SCRIPT>',
        sanitized = sanitize ( html );

  assert.equal ( sanitized, '<div>safe</div><p>ok</p>' );
  assert.doesNotMatch ( sanitized, /<script/i );

});

test ( 'html sanitization: can be disabled to preserve unsafe html', () => {

  const html = '<div>safe</div><script>alert("xss")</script><a href="javascript:alert(1)" onclick="evil()">bad</a>',
        sanitized = sanitize ( html ),
        unsanitized = sanitizeDisabled ( html );

  assert.equal ( sanitized, '<div>safe</div><a>bad</a>' );
  assert.equal ( unsanitized, html );
  assert.doesNotMatch ( sanitized, /<script/i );
  assert.match ( unsanitized, /<script>alert\("xss"\)<\/script>/ );
  assert.match ( unsanitized, /href="javascript:alert\(1\)"/ );
  assert.match ( unsanitized, /\sonclick="evil\(\)"/ );

});

test ( 'html sanitization: strips other disallowed raw html tags', () => {

  const html = '<style>body{display:none}</style><plaintext>oops</plaintext><div>safe</div>',
        sanitized = sanitize ( html );

  assert.equal ( sanitized, '<div>safe</div>' );
  assert.doesNotMatch ( sanitized, /<(style|plaintext)/i );

});

test ( 'html sanitization: strips inline event handlers', () => {

  const html = '<img src="a.png" onerror="alert(1)" onclick=\'doBadThing()\'><div onmouseover=evil()>safe</div>',
        sanitized = sanitize ( html );

  assert.equal ( sanitized, '<img src="a.png"><div>safe</div>' );
  assert.doesNotMatch ( sanitized, /\son[a-z]+\s*=/i );

});

test ( 'html sanitization: preserves safe tags and non-event attributes', () => {

  const html = '<table class="grid"><tr><td data-kind="x">cell</td></tr></table><img src="a.png" alt="A" class="thumb"><p id="ok">text</p>',
        sanitized = sanitize ( html );

  assert.equal ( sanitized, html );
  assert.match ( sanitized, /<table class="grid">/ );
  assert.match ( sanitized, /<img src="a\.png" alt="A" class="thumb">/ );
  assert.match ( sanitized, /<p id="ok">text<\/p>/ );

});

test ( 'cmark html: preserves inline span markup and still parses inner markdown', () => {

  const html = renderHtml ( '<span style="color: red">**Economics**</span>' );

  assert.match ( html, /<span style="color: red">/ );
  assert.match ( html, /<strong>Economics<\/strong>/ );
  assert.doesNotMatch ( html, /raw HTML omitted/i );

});

test ( 'cmark html: preserves aligned div blocks', () => {

  const html = renderHtml ( '<div align="center">\\nThe Demand and Supply of Resources\\n</div>' );

  assert.match ( html, /<div align="center">/ );
  assert.match ( html, /The Demand and Supply of Resources/ );
  assert.match ( html, /<\/div>/ );
  assert.doesNotMatch ( html, /raw HTML omitted/i );

});

test ( 'cmark html: preserves raw table markup', () => {

  const markdown = [
    '<table>',
    '\t<tr>',
    '\t\t<th colspan="2"></th>',
    '\t\t<th colspan="2">Without Trade</th>',
    '\t\t<th colspan="3">With trade</th>',
    '\t</tr>',
    '\t<tr>',
    '\t\t<th>Person</th>',
    '\t\t<th>Good</th>',
    '\t\t<th>Production</th>',
    '\t\t<th>Consumption</th>',
    '\t\t<th>Production</th>',
    '\t\t<th>Consumption</th>',
    '\t\t<th>Gains from trade</th>',
    '\t</tr>',
    '</table>'
  ].join ( '\n' );

  const html = renderHtml ( markdown );

  assert.match ( html, /^<table>/ );
  assert.match ( html, /<th colspan="2">Without Trade<\/th>/ );
  assert.match ( html, /<th colspan="3">With trade<\/th>/ );
  assert.match ( html, /<th>Gains from trade<\/th>/ );
  assert.match ( html, /<\/table>\n?$/ );
  assert.doesNotMatch ( html, /raw HTML omitted/i );

});

test ( 'cmark html + sanitizer: dangerous handlers are stripped while safe html remains', () => {

  const html = renderHtml ( '<img src="a.png" onerror="alert(1)"><table><tr><td>ok</td></tr></table>' ),
        sanitized = sanitize ( html );

  assert.match ( sanitized, /<img src="a\.png">/ );
  assert.match ( sanitized, /<table><tr><td>ok<\/td><\/tr><\/table>/ );
  assert.doesNotMatch ( sanitized, /\sonerror=/i );

});

test ( 'cmark html: preserves iframes when raw html is allowed', () => {

  const html = renderHtml ( '<iframe width="100%" height="500px" src="https://example.com/embed"></iframe>' );

  assert.equal ( html, '<iframe width="100%" height="500px" src="https://example.com/embed"></iframe>\n' );
  assert.doesNotMatch ( html, /raw HTML omitted/i );
  assert.doesNotMatch ( html, /&lt;iframe/i );

});

test ( 'cmark html + sanitizer: preserves safe iframe attrs and strips unsafe ones', () => {

  const html = renderHtml ( '<iframe width="100%" src="https://example.com/embed" onclick="evil()" srcdoc="<script>evil()</script>"></iframe>' ),
        sanitized = sanitize ( html );

  assert.match ( sanitized, /<iframe width="100%" src="https:\/\/example\.com\/embed"><\/iframe>/ );
  assert.doesNotMatch ( sanitized, /\sonclick=/i );
  assert.doesNotMatch ( sanitized, /\ssrcdoc=/i );

});

test ( 'html sanitization: strips unsafe URL schemes but preserves file and https urls', () => {

  const html = '<a href="javascript:alert(1)">bad</a><img src="file:///tmp/x.png"><iframe src="https://example.com/embed"></iframe>',
        sanitized = sanitize ( html );

  assert.equal ( sanitized, '<a>bad</a><img src="file:///tmp/x.png"><iframe src="https://example.com/embed"></iframe>' );
  assert.doesNotMatch ( sanitized, /javascript:/i );

});

test ( 'html sanitization: strips entity-obfuscated javascript and disallowed data payload urls', () => {

  const html = [
          '<a href="java&#x73;cript:alert(1)">entity-bad</a>',
          '<a href="&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;:alert(1)">numeric-bad</a>',
          '<img src="data:text/html;base64,PHNjcmlwdD5ldmlsKCk8L3NjcmlwdD4=">',
          '<img src="data:image/png;base64,AAAA">'
        ].join ( '' ),
        sanitized = sanitize ( html );

  assert.equal ( sanitized, '<a>entity-bad</a><a>numeric-bad</a><img><img src="data:image/png;base64,AAAA">' );
  assert.doesNotMatch ( sanitized, /javascript:/i );
  assert.doesNotMatch ( sanitized, /data:text\/html/i );

});

test ( 'html sanitization: removes nested script-tag payloads while preserving subsequent safe html', () => {

  const html = '<script><script>alert(1)</script></script><div>safe</div><script>alert(2)</script>',
        sanitized = sanitize ( html );

  assert.equal ( sanitized, '<div>safe</div>' );
  assert.doesNotMatch ( sanitized, /<script/i );
  assert.doesNotMatch ( sanitized, /alert\s*\(/i );

});
