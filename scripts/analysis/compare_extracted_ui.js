#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const EXTRACTED_RENDERER = path.join(ROOT, 'extracted', 'renderer');
const DIST_RENDERER = path.join(ROOT, 'dist', 'renderer');

const FEATURE_PATTERNS = [
  /viewlet\.register\([^)]*\)/g,
  /view\.register\([^)]*\)/g,
  /statusbarItem\.register\([^)]*\)/g,
  /exportFormat\.register\([^)]*\)/g,
  /exportMode\.register\([^)]*\)/g,
  /quickPick\.[a-zA-Z]+/g,
  /quickEditor\.[a-zA-Z]+/g,
  /quickEditor\.[a-zA-Z]+/g,
  /\"(?:changelog|cwd|debug|editor|explorer|graph|help|information|multi-editor|note|preview|search|view)\/[a-z-]+\"/g,
  /\"viewbar\/[a-z-]+\"/g,
  /\"statusbar\/[a-z-]+\"/g,
  /\"export\/[a-z-]+\"/g,
  /mermaid[-_a-zA-Z]*/g,
  /katex[-_a-zA-Z]*/g,
  /Monaco[A-Za-z]*/g
];

const ALLOWED_LOWERCASE = new Set([
  'mermaid',
  'katex',
  'mhchem'
]);

function readFilesRecursively (dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && (full.endsWith('.js') || full.endsWith('.css'))) {
        out.push(full);
      }
    }
  }
  return out;
}

function collectMarkers (files) {
  const markers = new Map();
  for (const file of files) {
    let content;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    for (const pattern of FEATURE_PATTERNS) {
      const matches = content.match(pattern) || [];
      for (const raw of matches) {
        const marker = raw.trim();
        if (marker.length < 4 || marker.length > 120) continue;
        if (!isRelevant(marker)) continue;
        if (!markers.has(marker)) markers.set(marker, []);
        markers.get(marker).push(path.relative(ROOT, file));
      }
    }
  }
  return markers;
}

function isRelevant (marker) {
  if (/^"[a-z-]+\/[a-z-]+"$/.test(marker)) return true;
  if (/^(viewlet|view|statusbarItem|exportFormat|exportMode)\.register\(/.test(marker)) return true;
  if (/^quickPick\./.test(marker)) return true;
  if (/^quickEditor\./.test(marker)) return true;
  if (/^(Monaco|mermaid|katex|mhchem)/.test(marker)) return true;
  if (ALLOWED_LOWERCASE.has(marker)) return true;
  return false;
}

function main () {
  const extractedFiles = readFilesRecursively(EXTRACTED_RENDERER);
  const distFiles = readFilesRecursively(DIST_RENDERER);

  if (!extractedFiles.length) {
    console.error('No extracted renderer files found.');
    process.exit(1);
  }

  if (!distFiles.length) {
    console.error('No dist renderer files found. Run `npm run compile` first.');
    process.exit(1);
  }

  const extractedMarkers = collectMarkers(extractedFiles);
  const distMarkers = collectMarkers(distFiles);

  const missing = [];
  for (const marker of extractedMarkers.keys()) {
    if (!distMarkers.has(marker)) {
      missing.push(marker);
    }
  }

  missing.sort((a, b) => a.localeCompare(b));

  const report = {
    generatedAt: new Date().toISOString(),
    extractedFiles: extractedFiles.length,
    distFiles: distFiles.length,
    extractedMarkers: extractedMarkers.size,
    distMarkers: distMarkers.size,
    missingCount: missing.length,
    topMissing: missing.slice(0, 300)
  };

  const reportPath = path.join(ROOT, 'scripts', 'analysis', 'compare_extracted_ui.report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`Report written: ${path.relative(ROOT, reportPath)}`);
  console.log(`Extracted markers: ${extractedMarkers.size}`);
  console.log(`Dist markers: ${distMarkers.size}`);
  console.log(`Missing markers: ${missing.length}`);

  const preview = missing.slice(0, 40);
  if (preview.length) {
    console.log('\nFirst missing markers:');
    for (const marker of preview) {
      console.log(`- ${marker}`);
    }
  }
}

main();
