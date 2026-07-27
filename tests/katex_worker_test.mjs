import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';

const webDirectory = process.argv[2];
if (!webDirectory) throw new Error('Usage: node katex_worker_test.mjs <web-directory>');

let response;
const context = vm.createContext({
  console,
  postMessage: message => { response = message; }
});
context.self = context;
context.globalThis = context;
context.importScripts = (...paths) => {
  for (const path of paths) {
    const source = context.__sources.get(path);
    if (source === undefined) throw new Error(`Missing worker dependency: ${path}`);
    vm.runInContext(source, context, { filename: path });
  }
};
context.__sources = new Map();

for (const path of [
  'vendor/katex/katex.min.js',
  'vendor/katex/mhchem.min.js'
]) {
  context.__sources.set(path, await readFile(resolve(webDirectory, path), 'utf8'));
}

const worker = await readFile(resolve(webDirectory, 'katex_worker.js'), 'utf8');
vm.runInContext(worker, context, { filename: 'katex_worker.js' });
context.self.onmessage({
  data: {
    requestId: 1,
    expressions: [{ index: 0, tex: String.raw`\ce{CO2 + C -> 2CO}`, displayMode: true }],
    config: {}
  }
});

assert.equal(response.requestId, 1);
assert.equal(response.results.length, 1);
assert.equal(response.results[0].ok, true, response.results[0].error);
assert.match(response.results[0].html, /class="mrel x-arrow"/);
