'use strict';

importScripts('vendor/katex/katex.min.js');

const cache = new Map();

self.onmessage = event => {
  const { requestId, expressions, config } = event.data;
  const configKey = JSON.stringify(config || {});
  const results = expressions.map(expression => {
    const key = `${expression.displayMode ? 1 : 0}\0${configKey}\0${expression.tex}`;
    try {
      let html = cache.get(key);
      if (!html) {
        html = katex.renderToString(expression.tex, { throwOnError: true, strict: 'ignore', output: 'html', ...(config || {}), displayMode: expression.displayMode });
        cache.set(key, html);
        if (cache.size > 3000) cache.delete(cache.keys().next().value);
      }
      return { index: expression.index, ok: true, html };
    } catch (error) {
      return { index: expression.index, ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  self.postMessage({ requestId, results });
};
