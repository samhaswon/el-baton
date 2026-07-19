import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from '../node_modules/typescript/lib/typescript.js';

const outputPath = process.argv[2];

if (!outputPath) {
  throw new Error('Usage: node generate_qt_cheatsheet.mjs <output.md>');
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const evaluateTypeScript = (source, globals = {}) => {
  const javascript = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    }
  }).outputText;
  const module = { exports: {} };
  const context = vm.createContext({ ...globals, module, exports: module.exports });
  vm.runInContext(javascript, context, { timeout: 5000 });
  return module.exports.default;
};

const emojiSource = await readFile(resolve(root, 'src/common/emoji.ts'), 'utf8');
const emoji = evaluateTypeScript(emojiSource);
let cheatsheetSource = await readFile(
  resolve(root, 'src/renderer/components/main/mainbar/cheatsheet_content.ts'),
  'utf8'
);
cheatsheetSource = cheatsheetSource.replace(
  /import Emoji from '@common\/emoji';/,
  'const Emoji = globalThis.__qtEmoji;'
);
const content = evaluateTypeScript(cheatsheetSource, { __qtEmoji: emoji });

if (typeof content !== 'string' || !content.includes('# Cheatsheets')) {
  throw new Error('Reference cheatsheet did not evaluate to Markdown content');
}

const destination = resolve(root, outputPath);
await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, `${content}\n`, 'utf8');
