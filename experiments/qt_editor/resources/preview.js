'use strict';

(() => {
  const root = document.getElementById('preview');
  const scrollContainer = document.getElementById('preview-shell');
  const overlay = document.getElementById('debug-overlay');
  const state = {
    bridge: null, generation: 0, geometry: [], geometryDirty: true, blockNodes: new Map(), blockRanges: new Map(),
    resizeObserver: null, applyingSourceScroll: false, previewScrollFrame: 0,
    applyingUpdate: false, pendingUpdate: null, syncTimes: [], droppedSync: 0,
    frameTimes: [], renderTimes: [], activeUntil: 0, samplingFrames: false, lastFrameReportAt: 0,
    metrics: {}, documentBaseUrl: '', mermaidCache: new Map(), hiddenMermaidNodes: new Map(),
    katexMarkupCache: new Map(), katexRequest: 0, katexPending: new Map()
  };

  const katexWorker = new Worker('katex_worker.js');
  katexWorker.onmessage = event => {
    const pending = state.katexPending.get(event.data.requestId);
    if (!pending || pending.generation !== state.generation) return;
    state.katexPending.delete(event.data.requestId);
    const started = pending.started;
    for (const result of event.data.results) {
      const node = pending.nodes[result.index];
      if (!node?.isConnected) continue;
      if (result.ok) {
        const markup = DOMPurify.sanitize(result.html);
        node.innerHTML = markup;
        node.dataset.rendered = '1';
        state.katexMarkupCache.set(pending.keys[result.index], markup);
        if (state.katexMarkupCache.size > 3000) state.katexMarkupCache.delete(state.katexMarkupCache.keys().next().value);
      }
      else { node.className += ' qt-render-error'; node.textContent = `[KaTeX: ${result.error}]`; }
    }
    state.metrics.katexWorkerMs = performance.now() - started;
    invalidateGeometry();
    reportWhenStable();
  };

  function decodePayload(value) {
    // HTML parsing already decodes entities in data attributes. Applying URI
    // decoding here would corrupt legitimate TeX and Mermaid percent escapes.
    return value || '';
  }

  function mermaidSource(node) {
    const encoded = node.dataset.sourceB64;
    if (!encoded) return decodePayload(node.dataset.source);
    try {
      const binary = atob(encoded);
      return new TextDecoder().decode(Uint8Array.from(binary, character => character.charCodeAt(0)));
    } catch {
      return '';
    }
  }

  function captureAnchor() {
    rebuildGeometry();
    const item = geometryAt(scrollContainer.scrollTop);
    return item ? { id: item.id, offset: scrollContainer.scrollTop - item.top } : null;
  }

  function restoreAnchor(anchor) {
    if (!anchor) return;
    const node = state.blockNodes.get(anchor.id);
    if (!node) return;
    const containerRect = scrollContainer.getBoundingClientRect();
    const nodeTop = node.getBoundingClientRect().top - containerRect.top
      - scrollContainer.clientTop + scrollContainer.scrollTop;
    scrollContainer.scrollTo({ top: nodeTop + anchor.offset, behavior: 'instant' });
  }

  function katexKey(node, config) {
    return `${node.dataset.display === '1' ? 1 : 0}\0${JSON.stringify(config || {})}\0${decodePayload(node.dataset.tex)}`;
  }

  function mermaidKey(source, update) {
    return JSON.stringify([source, update.mermaidTheme || 'default', update.fonts || '', update.mermaidVersion || '11.15.0']);
  }

  function installMermaidSvg(node, svg) {
    // Mermaid runs with securityLevel=strict and sanitizes document-provided
    // labels while generating this SVG. The reference preview installs that
    // generated output directly. A second SVG-only DOMPurify pass removes the
    // safe foreignObject/HTML subtree that Mermaid uses for node labels.
    node.innerHTML = svg;
    node.dataset.rendered = '1';
  }

  function makeBlock(block, update) {
    const node = document.createElement('section');
    node.className = 'render-block';
    node.dataset.blockId = block.id;
    node.dataset.sourceStart = String(block.sourceStart);
    node.dataset.sourceEnd = String(block.sourceEnd);
    node.dataset.syncMode = block.syncMode || 'interpolate';
    node.innerHTML = DOMPurify.sanitize(block.html, { ADD_ATTR: ['data-tex', 'data-display', 'data-source-b64'] });
    if (state.documentBaseUrl) {
      node.querySelectorAll('[src]').forEach(element => {
        const value = element.getAttribute('src');
        if (value && !/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(value)) element.setAttribute('src', new URL(value, state.documentBaseUrl).href);
      });
      node.querySelectorAll('a[href]').forEach(element => {
        const value = element.getAttribute('href');
        if (value && !/^(?:[a-z][a-z0-9+.-]*:|\/|#|@)/i.test(value)) element.setAttribute('href', new URL(value, state.documentBaseUrl).href);
      });
    }
    node.querySelectorAll('pre code[class*="language-"]').forEach(code => Prism.highlightElement(code));
    node.querySelectorAll('.qt-katex').forEach(math => {
      const cached = state.katexMarkupCache.get(katexKey(math, update.katexConfig));
      if (cached) { math.innerHTML = cached; math.dataset.rendered = '1'; }
    });
    node.querySelectorAll('.qt-mermaid').forEach(diagram => {
      const source = mermaidSource(diagram).trim();
      if (!source) { diagram.hidden = true; return; }
      const cached = state.mermaidCache.get(mermaidKey(source, update));
      if (cached) { diagram.innerHTML = cached; diagram.dataset.rendered = '1'; }
    });
    node.querySelectorAll('img').forEach(image => image.addEventListener('load', invalidateGeometry, { once: true }));
    state.resizeObserver.observe(node);
    return node;
  }

  async function renderDynamic(changedNodes, update) {
    const mathNodes = changedNodes.flatMap(node => [...node.querySelectorAll('.qt-katex:not([data-rendered])')]);
    if (update.katexEnabled !== false && mathNodes.length) {
      const requestId = ++state.katexRequest;
      const expressions = mathNodes.map((node, index) => ({
        index, tex: decodePayload(node.dataset.tex), displayMode: node.dataset.display === '1'
      }));
      state.katexPending.set(requestId, { generation: state.generation, nodes: mathNodes,
        keys: mathNodes.map(node => katexKey(node, update.katexConfig)), started: performance.now() });
      katexWorker.postMessage({ requestId, expressions, config: update.katexConfig || {} });
    }

    const diagrams = changedNodes.flatMap(node => [...node.querySelectorAll('.qt-mermaid:not([data-rendered])')])
      .filter(node => mermaidSource(node).trim());
    if (update.mermaidEnabled === false || !diagrams.length) return;
    const started = performance.now();
    if (update.hiddenMermaidPage) {
      const requests = diagrams.map((node, index) => {
        const source = mermaidSource(node);
        const id = `${update.generation}:${index}:${Math.random().toString(36).slice(2)}`;
        const cacheKey = mermaidKey(source, update);
        state.hiddenMermaidNodes.set(id, { node, cacheKey });
        return { id, source, cacheKey };
      });
      state.bridge.requestMermaidRender({ generation: update.generation, requests, theme: update.mermaidTheme || 'default' });
      return;
    }
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: update.mermaidTheme || 'default' });
    for (let index = 0; index < diagrams.length; index++) {
      const node = diagrams[index];
      const source = mermaidSource(node);
      const key = mermaidKey(source, update);
      try {
        let svg = state.mermaidCache.get(key);
        if (!svg) {
          svg = (await mermaid.render(`qt-mermaid-${state.generation}-${index}`, source)).svg;
          state.mermaidCache.set(key, svg);
          if (state.mermaidCache.size > 256) state.mermaidCache.delete(state.mermaidCache.keys().next().value);
        }
        if (node.isConnected && state.generation === update.generation) {
          installMermaidSvg(node, svg);
          state.mermaidCache.set(key, svg);
        }
      } catch (error) {
        // Reference behavior keeps malformed diagrams out of visible layout.
        node.hidden = true;
      }
    }
    state.metrics.mermaidMs = performance.now() - started;
    invalidateGeometry();
  }

  async function applyUpdate(update) {
    if (update.generation <= state.generation) return;
    markUiActive(1000);
    state.generation = update.generation;
    state.documentBaseUrl = update.documentBaseUrl || '';
    state.metrics = { ...state.metrics, ...(update.timings || {}) };
    overlay.hidden = update.overlayEnabled === false;
    const patchStarted = performance.now();
    const anchor = captureAnchor();
    const changedNodes = [];
    let structureChanged = Boolean(update.replaceAll || (update.removedBlockIds || []).length);

    if (update.replaceAll) {
      state.resizeObserver.disconnect();
      root.replaceChildren();
      state.blockNodes.clear();
      state.blockRanges.clear();
    }
    for (const id of update.removedBlockIds || []) {
      state.blockNodes.get(id)?.remove();
      state.blockNodes.delete(id);
      state.blockRanges.delete(id);
    }
    for (const block of update.changedBlocks || []) {
      const replacement = makeBlock(block, update);
      const existing = state.blockNodes.get(block.id);
      if (existing) existing.replaceWith(replacement);
      else { root.append(replacement); structureChanged = true; }
      state.blockNodes.set(block.id, replacement);
      state.blockRanges.set(block.id, { sourceStart: block.sourceStart, sourceEnd: block.sourceEnd, syncMode: block.syncMode || 'interpolate' });
      changedNodes.push(replacement);
    }
    for (const range of update.rangeUpdates || []) {
      const node = state.blockNodes.get(range.id);
      if (!node) continue;
      state.blockRanges.set(range.id, { sourceStart: range.sourceStart, sourceEnd: range.sourceEnd, syncMode: range.syncMode || 'interpolate' });
    }
    if (structureChanged && Array.isArray(update.blockOrder)) {
      for (const id of update.blockOrder) {
        const node = state.blockNodes.get(id);
        if (node) root.append(node);
      }
    }
    restoreAnchor(anchor);
    state.metrics.domPatchMs = performance.now() - patchStarted;
    invalidateGeometry();
    await renderDynamic(changedNodes, update);
    if (update.generation === state.generation) state.renderTimes.push(performance.now());
    reportWhenStable();
  }

  function invalidateGeometry() { state.geometryDirty = true; }

  function rebuildGeometry() {
    if (!state.geometryDirty) return;
    const scrollTop = scrollContainer.scrollTop;
    const containerTop = scrollContainer.getBoundingClientRect().top + scrollContainer.clientTop;
    state.geometry = [...root.children].map(node => {
      const rect = node.getBoundingClientRect();
      const range = state.blockRanges.get(node.dataset.blockId) || {};
      return { id: node.dataset.blockId, top: rect.top - containerTop + scrollTop, height: rect.height,
        sourceStart: Number(range.sourceStart), sourceEnd: Number(range.sourceEnd), syncMode: range.syncMode };
    });
    state.geometryDirty = false;
  }

  function geometryAt(y) {
    rebuildGeometry();
    let low = 0, high = state.geometry.length - 1, answer = null;
    while (low <= high) {
      const mid = (low + high) >> 1, item = state.geometry[mid];
      if (item.top <= y) { answer = item; low = mid + 1; } else high = mid - 1;
    }
    return answer || state.geometry[0];
  }

  function onPreviewScroll() {
    markUiActive(500);
    if (state.applyingSourceScroll) return;
    if (state.previewScrollFrame) { state.droppedSync++; return; }
    state.previewScrollFrame = requestAnimationFrame(() => {
      state.previewScrollFrame = 0;
      const scrollTop = scrollContainer.scrollTop;
      const item = geometryAt(scrollTop);
      if (!item || !state.bridge) return;
      const progress = item.height > 0 ? Math.max(0, Math.min(1, (scrollTop - item.top) / item.height)) : 0;
      state.bridge.reportPreviewScroll({ owner: 'preview', blockId: item.id, progress, generation: state.generation,
        percentage: scrollTop / Math.max(1, scrollContainer.scrollHeight - scrollContainer.clientHeight) });
      state.syncTimes.push(performance.now());
    });
  }

  function applySourceScroll(target) {
    if (target.generation !== state.generation) return;
    let top;
    if (typeof target.percentage === 'number') {
      top = target.percentage * Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
    }
    else {
      rebuildGeometry();
      const item = state.geometry.find(candidate => candidate.id === target.blockId);
      if (!item) return;
      top = item.top + item.height * Math.max(0, Math.min(1, target.progress || 0));
    }
    state.applyingSourceScroll = true;
    markUiActive(500);
    scrollContainer.scrollTo({ top, behavior: 'instant' });
    requestAnimationFrame(() => { state.applyingSourceScroll = false; });
  }

  function applyHiddenMermaidResults(batch) {
    if (batch.generation !== state.generation) {
      for (const result of batch.results || []) state.hiddenMermaidNodes.delete(result.id);
      return;
    }
    for (const result of batch.results || []) {
      const pending = state.hiddenMermaidNodes.get(result.id);
      state.hiddenMermaidNodes.delete(result.id);
      const node = pending?.node;
      if (!node?.isConnected) continue;
      if (result.ok) {
        installMermaidSvg(node, result.svg);
        state.mermaidCache.set(pending.cacheKey, result.svg);
        if (state.mermaidCache.size > 256) state.mermaidCache.delete(state.mermaidCache.keys().next().value);
      } else {
        node.hidden = true;
      }
    }
    state.metrics.mermaidMs = batch.mermaidMs || 0;
    invalidateGeometry();
    reportWhenStable();
  }

  function reportWhenStable() {
    const started = performance.now();
    let lastHeight = -1, stableFrames = 0;
    function sample() {
      const height = scrollContainer.scrollHeight;
      stableFrames = height === lastHeight ? stableFrames + 1 : 0;
      lastHeight = height;
      if (stableFrames < 2 && performance.now() - started < 2000) return requestAnimationFrame(sample);
      state.metrics.settleMs = performance.now() - started;
      reportMetrics();
    }
    requestAnimationFrame(sample);
  }

  function reportMetrics() {
    if (!state.bridge) return;
    const now = performance.now();
    state.frameTimes = state.frameTimes.filter(time => time >= now - 1000);
    state.renderTimes = state.renderTimes.filter(time => time >= now - 1000);
    state.syncTimes = state.syncTimes.filter(time => time >= now - 1000);
    // DevTools-style presentation FPS: animation frames observed during active
    // paint/scroll windows. Render rate is deliberately separate and counts
    // document generations whose DOM patch has completed.
    const uiFps = now <= state.activeUntil && state.frameTimes.length > 1
      ? (state.frameTimes.length - 1) * 1000 / (state.frameTimes.at(-1) - state.frameTimes[0]) : 0;
    const metrics = { ...state.metrics, uiFps, renderRate: state.renderTimes.length,
      syncRate: state.syncTimes.length, droppedSync: state.droppedSync };
    state.bridge.reportMetrics(metrics);
    overlay.textContent = Object.entries(metrics).map(([key, value]) => `${key}: ${typeof value === 'number' ? value.toFixed(1) : value}`).join('\n');
  }

  function countActiveFrame(now) {
    state.frameTimes.push(now);
    if (now - state.lastFrameReportAt >= 250) {
      state.lastFrameReportAt = now;
      reportMetrics();
    }
    if (now < state.activeUntil) requestAnimationFrame(countActiveFrame);
    else {
      state.samplingFrames = false;
      reportMetrics();
    }
  }

  function markUiActive(durationMs) {
    state.activeUntil = Math.max(state.activeUntil, performance.now() + durationMs);
    if (state.samplingFrames) return;
    state.samplingFrames = true;
    state.frameTimes = [];
    requestAnimationFrame(countActiveFrame);
  }

  async function enqueueUpdate(update) {
    if (update.generation <= state.generation) return;
    state.pendingUpdate = update;
    if (state.applyingUpdate) {
      state.metrics.coalescedRenders = (state.metrics.coalescedRenders || 0) + 1;
      return;
    }
    state.applyingUpdate = true;
    try {
      while (state.pendingUpdate) {
        const next = state.pendingUpdate;
        state.pendingUpdate = null;
        await applyUpdate(next);
      }
    } finally {
      state.applyingUpdate = false;
    }
  }

  root.addEventListener('click', event => {
    const copy = event.target.closest('.copy');
    if (copy) {
      const code = copy.parentElement?.querySelector('pre code');
      if (code) navigator.clipboard.writeText(code.textContent || '');
      return;
    }
    const anchor = event.target.closest('a[href]');
    if (!anchor) return;
    const href = anchor.getAttribute('href') || '';
    if (href.startsWith('#')) {
      const destination = document.getElementById(decodeURIComponent(href.slice(1)));
      if (destination) { event.preventDefault(); destination.scrollIntoView({ block: 'start' }); }
    } else if (/^https?:/i.test(anchor.href)) {
      event.preventDefault(); state.bridge?.requestExternalLink(anchor.href);
    }
  });

  state.resizeObserver = new ResizeObserver(invalidateGeometry);
  scrollContainer.addEventListener('scroll', onPreviewScroll, { passive: true });
  addEventListener('resize', invalidateGeometry, { passive: true });
  document.fonts?.addEventListener('loadingdone', invalidateGeometry);

  new QWebChannel(qt.webChannelTransport, channel => {
    state.bridge = channel.objects.previewBridge;
    state.bridge.renderPublished.connect(enqueueUpdate);
    state.bridge.sourceScrollPublished.connect(applySourceScroll);
    state.bridge.mermaidResultsPublished.connect(applyHiddenMermaidResults);
    state.bridge.reportReady('preview');
  });
})();
