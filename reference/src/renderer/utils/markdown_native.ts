/* IMPORT */

import * as fs from 'fs';
import * as path from 'path';

/* TYPES */

type CmarkOptions = { unsafe?: boolean, extensions?: Record<string, boolean> };
type MarkdownNativeSlot =
  | { type: 'katex'; index: number }
  | { type: 'code'; attrs: string; content: string; html: string };

type MarkdownNativeBinding = {
  renderHtmlSync: ( markdown: string, options?: CmarkOptions ) => string;
  renderCore: ( markdown: string, options?: CmarkOptions ) => { template: string, slots: MarkdownNativeSlot[] };
  finalize: ( template: string, slots?: string[] ) => string;
  replaceMacroPlaceholders: ( markdown: string ) => string;
  replaceEscapedDollars: ( markdown: string ) => string;
  replaceEmojiShortcodes: ( markdown: string ) => string;
  replaceWikilinks: ( markdown: string, notesToken: string, notesExt: string, notesReSource: string, notesReFlags: string ) => string;
  encodeSpecialLinks: ( markdown: string, attachmentsToken: string, notesToken: string, tagsToken: string ) => string;
  replaceSuperscriptSubscript: ( markdown: string ) => string;
  extractMathDelimiters: ( markdown: string ) => { text: string, math: Array<{ tex: string, displayMode: boolean }> };
  prepareMath: ( markdown: string ) => { text: string, math: Array<{ tex: string, displayMode: boolean }> };
  numberCheckboxes: ( html: string ) => string;
  addBlankTargets: ( html: string ) => string;
  normalizeLinkProtocols: ( html: string ) => string;
  wrapCodeBlocks: ( html: string ) => string;
  injectDiagramControls: ( html: string ) => string;
  renderMacros: ( html: string ) => string;
  sanitizeStaticHtml: ( html: string, enabled: boolean ) => string;
  version: string;
};

/* NATIVE ADDON */

const getCandidates = (): string[] => {

  const candidates: string[] = [];

  if ( process.resourcesPath ) candidates.push ( path.join ( process.resourcesPath, 'native', 'markdown_native.node' ) );

  candidates.push (
    path.resolve ( __dirname, '..', 'native', 'markdown_native.node' ),
    path.resolve ( process.cwd (), 'native', 'markdown', 'build', 'Release', 'markdown_native.node' )
  );

  return candidates;

};

let binding: MarkdownNativeBinding | undefined;

const load = (): MarkdownNativeBinding => {

  if ( binding ) return binding;

  const candidates = getCandidates ();

  for ( let index = 0, length = candidates.length; index < length; index++ ) {
    const candidate = candidates[index];

    if ( !fs.existsSync ( candidate ) ) continue;

    try {
      // Webpack's module resolver cannot load an absolute `.node` path. Electron
      // exposes the unbundled CommonJS loader on the renderer/worker global.
      // Electron supplies the real loader globally. `module.require` is used
      // only by the unbundled Node unit-test runtime, avoiding webpack's
      // dynamic-dependency analysis.
      const nativeRequire = ( globalThis as any ).require || module.require.bind ( module );

      if ( typeof nativeRequire !== 'function' ) {
        throw new Error ( 'Electron Node integration is unavailable in this renderer context' );
      }

      binding = nativeRequire ( candidate ) as MarkdownNativeBinding;
      return binding;
    } catch ( error ) {
      throw new Error ( `[markdown-native] Unable to load "${candidate}": ${error instanceof Error ? error.message : String ( error )}` );
    }
  }

  throw new Error ( `[markdown-native] Addon not found. Run "npm run native:build". Checked: ${candidates.join ( ', ' )}` );

};

const MarkdownNative = { load };


/* EXPORT */

export default MarkdownNative;
