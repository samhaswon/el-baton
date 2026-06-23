import {test} from 'node:test';
import * as assert from 'node:assert/strict';
import * as path from 'path';

const native = require ( path.resolve ( process.cwd (), 'native/markdown/build/Release/markdown_native.node' ) );

test ( 'markdown native: reports the pinned cmark-gfm version', () => {

  assert.equal ( native.version, '0.29.0.gfm.13' );

} );

test ( 'markdown native: renders configured GFM extensions', () => {

  const html = native.renderHtmlSync ( '- [x] done\n\n| a | b |\n| - | - |\n| 1 | 2 |', {
    unsafe: true,
    extensions: { autolink: true, strikethrough: true, table: true, tasklist: true }
  } );

  assert.match ( html, /type="checkbox"/ );
  assert.match ( html, /<table>/ );

} );

test ( 'markdown native: returns KaTeX placeholders as typed slots and injects resolved HTML', () => {

  const core = native.renderCore ( 'Before MDKATEXPLACEHOLDER2END after', {
    unsafe: true,
    extensions: { autolink: true }
  } );

  assert.deepEqual ( core.slots, [{ type: 'katex', index: 2 }] );
  assert.match ( core.template, /MDNATIVESLOT0END/ );
  assert.equal ( native.finalize ( core.template, ['<span class="katex">x</span>'] ), '<p>Before <span class="katex">x</span> after</p>\n' );

} );

test ( 'markdown native: prepares escaped dollars, math slots, and sup/sub in one pass', () => {

  const prepared = native.prepareMath ( 'Cost \\$ and $x^2$ with a^b^ and H~2~O.' );

  assert.equal ( prepared.text, 'Cost MDESCAPEDDOLLARPLACEHOLDER and MDKATEXPLACEHOLDER0END with a<sup>b</sup> and H<sub>2</sub>O.' );
  assert.deepEqual ( prepared.math, [{ tex: 'x^2', displayMode: false }] );

} );

test ( 'markdown native: returns rendered fenced code blocks as typed slots', () => {

  const core = native.renderCore ( '```ts\nconst value = 1;\n```', {
    unsafe: true,
    extensions: { autolink: true }
  } );

  assert.equal ( core.slots.length, 1 );
  assert.deepEqual ( core.slots[0], {
    type: 'code',
    attrs: ' class="language-ts"',
    content: 'const value = 1;\n',
    html: '<pre><code class="language-ts">const value = 1;\n</code></pre>'
  } );
  assert.equal ( native.finalize ( core.template, ['<pre>resolved</pre>'] ), '<pre>resolved</pre>\n' );

} );

test ( 'markdown native: preserves macro placeholder semantics', () => {

  const output = native.replaceMacroPlaceholders ( '[[ @toc ]]\n[[@TOC]]\n[[@pagebreak]]' );

  assert.equal ( output, '[[ @toc ]]\nMDMACROTOCPLACEHOLDER\nMDMACROPAGEBREAKPLACEHOLDER' );

} );

test ( 'markdown native: rewrites wikilinks while preserving code spans and fences', () => {

  const output = native.replaceWikilinks ( '[[Title|note]] `[[code]]`\n```\n[[fence]]\n```\n[[Existing|existing.md]]', '@note', '.md', '\\.(?:md|txt)$', 'i' );

  assert.equal ( output, '<a href="@note/note.md">Title</a> `[[code]]`\n```\n[[fence]]\n```\n<a href="@note/existing.md">Existing</a>' );

} );

test ( 'markdown native: encodes special token links while preserving code spans and fences', () => {

  const output = native.encodeSpecialLinks ( '[file](@attachment/one two\\three.pdf) `[@note/code path](@note/code path)`\n```\n[file](@tag/code path)\n```\n[tag](@tag/a b)', '@attachment', '@note', '@tag' );

  assert.equal ( output, '[file](@attachment/one%20two/three.pdf) `[@note/code path](@note/code path)`\n```\n[file](@tag/code path)\n```\n[tag](@tag/a%20b)' );

} );

test ( 'markdown native: sanitizes static markup and encoded unsafe URL protocols', () => {

  const html = [
          '<script>alert(1)</script>',
          '<a href="jav&#x61;script:alert(1)" onclick="evil()">one</a>',
          '<img src="%6a%61%76%61%73%63%72%69%70%74:alert(1)">',
          '<iframe srcdoc="<p>bad</p>" src="data:text/html;base64,AAAA"></iframe>',
          '<img src="data:image/png;base64,AAAA">',
          '<a href="https://example.com">safe</a>'
        ].join ( '' ),
        sanitized = native.sanitizeStaticHtml ( html, true );

  assert.equal ( sanitized, '<a>one</a><img><iframe></iframe><img src="data:image/png;base64,AAAA"><a href="https://example.com">safe</a>' );
  assert.equal ( native.sanitizeStaticHtml ( html, false ), html );

} );

test ( 'markdown native: matches the supported sanitizer attack matrix', () => {

  const cases = [
    ['<div>safe</div><script>alert("xss")</script><p>ok</p><SCRIPT SRC="https://evil.test/x.js"></SCRIPT>', '<div>safe</div><p>ok</p>'],
    ['<style>body{display:none}</style><plaintext>oops</plaintext><div>safe</div>', '<div>safe</div>'],
    ['<img src="a.png" onerror="alert(1)" onclick=\'doBadThing()\'><div onmouseover=evil()>safe</div>', '<img src="a.png"><div>safe</div>'],
    ['<a href="jav&#x61;script:alert(1)">entity-bad</a><a href="&#106;avascript:alert(2)">numeric-bad</a><img src="data:text/html;base64,AAAA"><img src="data:image/png;base64,AAAA">', '<a>entity-bad</a><a>numeric-bad</a><img><img src="data:image/png;base64,AAAA">'],
    ['<div>safe</div><script><script>alert(1)</script></script><SCRIPT>evil()</SCRIPT>', '<div>safe</div>']
  ];

  for ( const [input, expected] of cases ) assert.equal ( native.sanitizeStaticHtml ( input, true ), expected );

} );

test ( 'markdown native: renders heading anchors, toc, and pagebreak macros', () => {

  const output = native.renderMacros ( [
    '<p>MDMACROTOCPLACEHOLDER</p>',
    '<h2>Intro</h2>',
    '<h4>Details &amp; More</h4>',
    '<h2>Intro</h2>',
    '<p>MDMACROPAGEBREAKPLACEHOLDER</p>'
  ].join ( '' ) );

  assert.match ( output, /<h2 id="intro">Intro<\/h2>/ );
  assert.match ( output, /<h4 id="details-more">Details &amp; More<\/h4>/ );
  assert.match ( output, /<h2 id="intro-2">Intro<\/h2>/ );
  assert.match ( output, /href="#details-more">Details &amp; More<\/a>/ );
  assert.match ( output, /<hr class="pagebreak">/ );

} );

test ( 'markdown native: strips punctuation rather than adding separators to heading ids', () => {

  const output = native.renderMacros ( '<h2>16.1 - The Concept of Equilibrium</h2>' );

  assert.equal ( output, '<h2 id="161---the-concept-of-equilibrium">16.1 - The Concept of Equilibrium</h2>' );

} );

test ( 'markdown native: marks task list items so list bullets can be suppressed', () => {

  const html = native.renderHtmlSync ( '- [x] Checkbox', { unsafe: true, extensions: { tasklist: true } } ),
        output = native.numberCheckboxes ( html );

  assert.match ( output, /<li class="task-list-item"><input type="checkbox" checked="" data-nth="0" \/> Checkbox<\/li>/ );

} );
