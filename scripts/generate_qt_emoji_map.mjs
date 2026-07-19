import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gemoji } from '../node_modules/gemoji/index.js';

const outputPath = process.argv[2];

if (!outputPath) {
  throw new Error('Usage: node generate_qt_emoji_map.mjs <output.json>');
}

const entries = {};

for (const item of gemoji) {
  for (const name of item.names || []) {
    const shortcode = String(name).trim().toLowerCase();
    if (shortcode && item.emoji) entries[shortcode] = item.emoji;
  }
}

const sorted = Object.fromEntries(Object.entries(entries).sort(([left], [right]) => left.localeCompare(right)));
const destination = resolve(dirname(fileURLToPath(import.meta.url)), '..', outputPath);

await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, `${JSON.stringify(sorted)}\n`, 'utf8');
