'use strict';

new QWebChannel(qt.webChannelTransport, channel => {
  const bridge = channel.objects.previewBridge;
  const cache = new Map();
  bridge.mermaidRenderRequested.connect(async batch => {
    const started = performance.now();
    const results = [];
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: batch.theme || 'default' });
    for (let index = 0; index < batch.requests.length; index++) {
      const request = batch.requests[index];
      try {
        let svg = cache.get(request.cacheKey);
        if (!svg) {
          svg = (await mermaid.render(`qt-hidden-mermaid-${batch.generation}-${index}`, request.source)).svg;
          cache.set(request.cacheKey, svg);
          if (cache.size > 256) cache.delete(cache.keys().next().value);
        }
        results.push({ id: request.id, ok: true, svg });
      } catch (error) {
        results.push({ id: request.id, ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    }
    bridge.reportMermaidResults({ generation: batch.generation, results, mermaidMs: performance.now() - started });
  });
  bridge.reportReady('mermaid');
});
