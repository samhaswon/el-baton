
/* IMPORT */

import * as diff from 'diff';
import * as _ from 'lodash';
import * as React from 'react';
import Emoji from '@common/emoji';
import {is} from '@common/electron_util_shim';
import KatexRanges from '@common/katex_ranges';
import MarkdownTable from '@common/markdown_table';
import {connect} from 'overstated';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
import Main from '@renderer/containers/main';
import UMonaco from '@renderer/utils/monaco';
import MonacoLanguages from '@renderer/utils/monaco_languages';
import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController.js';
import 'monaco-editor/esm/vs/editor/contrib/dnd/browser/dnd.js';
import 'monaco-editor/esm/vs/editor/contrib/linesOperations/browser/linesOperations.js';
import 'monaco-editor/esm/vs/editor/contrib/multicursor/browser/multicursor.js';
import 'monaco-editor/esm/vs/editor/contrib/suggest/browser/suggestController.js';
import 'monaco-editor/esm/vs/editor/contrib/wordOperations/browser/wordOperations.js';

/* HELPERS */

const remote = require ( '@electron/remote' );

type SpellcheckerModule = {
  isMisspelled: ( word: string ) => boolean,
  getCorrectionsForMisspelling: ( word: string ) => string[]
};

const SPELLCHECK_WORD_RE = /[A-Za-z][A-Za-z'’-]*/g;
const SPELLCHECK_MAX_SUGGESTIONS = 3;

let spellcheckWorkerGloballyUnavailable = false;

const shouldSpellcheckWord = ( word: string ): boolean => {

  if ( word.length <= 2 ) return false;
  if ( /^\d+$/.test ( word ) ) return false;
  if ( /^[A-Z]{2,}$/.test ( word ) ) return false;

  return true;

};

const normalizeSpellcheckWord = ( word: string ): string => {

  return ( word || '' ).trim ().toLowerCase ();

};

/* MONACO */

class Monaco extends React.Component<{ filePath: string, language: string, theme: string, value: string, editorOptions?: monaco.editor.IEditorOptions, modelOptions?: monaco.editor.ITextModelUpdateOptions, className?: string, editorWillMount?: Function, editorDidMount?: Function, editorWillUnmount?: Function, editorDidUnmount?: Function, editorWillChange?: Function, onBlur?: Function, onFocus?: Function, onChange?: Function, onUpdate?: Function, onScroll?: Function, container: IMain }, {}> {

  static SPELLCHECK_MAX_CONTENT_LENGTH = 40000;
  static SPELLCHECK_VISIBLE_LINE_BUFFER = 50;
  static TABLE_FORMAT_DELAY = 2000;

  /* VARIABLES */

  ref = React.createRef<HTMLDivElement> ();
  editor?: MonacoEditor;
  _currentValue: string = '';
  _currentChangeDate: Date | undefined = undefined;
  _preventOnChangeEvent: boolean = false;
  _onChangeDebounced?: Function;
  _tableFormatTouchedLines = new Set<number> ();
  _tableFormatTimeout?: number;
  _zoneTopId?: string;
  _spellcheckWorker?: Worker;
  _spellcheckWorkerInitAttempted: boolean = false;
  _spellcheckWorkerUnavailable: boolean = false;
  _rendererSpellchecker?: SpellcheckerModule;
  _rendererSpellcheckerLoadAttempted: boolean = false;
  _spellcheckPersistentDictionary = new Set<string> ();
  _spellcheckSessionDictionary = new Set<string> ();
  _spellcheckPersistentDictionaryFingerprint: string = '';
  _spellcheckMsgId: number = 0;
  _spellcheckActiveId?: number;
  _spellcheckPending = new Map<number, { resolve: ( value: any ) => void, reject: ( error: any ) => void }> ();
  _spellcheckDebounced = _.debounce ( () => this.spellcheckCurrentModel (), 180 );
  _spellcheckScrollDebounced = _.debounce ( () => this.spellcheckCurrentModel ( true ), 320 );
  _spellcheckCoverage?: { versionId: number, startLineNumber: number, endLineNumber: number };
  _spellcheckEnabledRuntime = true;
  _isApplyingEmojiEasterEgg: boolean = false;
  _languageLoadSeq: number = 0;

  /* LIFECYCLE */

  componentDidMount () {

    UMonaco.init ();

    if ( this.props.onChange ) {

      this._onChangeDebounced = _.debounce ( this.props.onChange as any, 25 ); //TSC

    }

    this._currentChangeDate = undefined;

    $.$window.on ( 'monaco:update', this.editorUpdateDebounced );

    this._currentValue = this.props.value;

    this.initMonaco ();

  }

  componentDidUpdate ( prevProps ) {

    this.editorUpdate ();

    if ( this.props.value !== this._currentValue ) this.updateValue ( this.props.value );

    if ( prevProps.language !== this.props.language ) this.updateLanguage ( this.props.language );

    if ( prevProps.theme !== this.props.theme ) this.updateTheme ( this.props.theme );

    if ( this.props.editorOptions && !_.isEqual ( prevProps.editorOptions, this.props.editorOptions ) ) this.updateEditorOptions ( this.props.editorOptions );

    if ( this.props.modelOptions && !_.isEqual ( prevProps.modelOptions, this.props.modelOptions ) ) this.updateModelOptions ( this.props.modelOptions );

  }

  componentWillUnmount () {

    $.$window.off ( 'monaco:update', this.editorUpdateDebounced );

    this.clearTableFormatTimeout ();
    this.cleanupSpellcheck ();
    this.destroyMonaco ();

  }

  shouldComponentUpdate ( nextProps ) { //TODO: Most of these update* functions should run in `componentDidMount`, but ensuring that the "value" doesn't get reset unnecessarily

    if ( nextProps.filePath !== this.props.filePath ) this.editorWillChange ();

    if ( nextProps.language !== this.props.language ) this.updateLanguage ( nextProps.language );

    if ( nextProps.theme !== this.props.theme ) this.updateTheme ( nextProps.theme );

    if ( nextProps.editorOptions && !_.isEqual ( this.props.editorOptions, nextProps.editorOptions ) ) this.updateEditorOptions ( nextProps.editorOptions );

    if ( nextProps.modelOptions && !_.isEqual ( this.props.modelOptions, nextProps.modelOptions ) ) this.updateModelOptions ( nextProps.modelOptions );

    return nextProps.value !== this.props.value && nextProps.value !== this._currentValue; //FIXME: This check might not be perfect

  }

  /* EDITOR LIFECYCLE */

  editorWillMount () {

    const {editorWillMount} = this.props;

    if ( !editorWillMount ) return;

    return editorWillMount ( monaco );

  }

  editorDidMount ( editor: MonacoEditor ) {

    const {editorDidMount, editorDidUnmount, onBlur, onFocus, onScroll} = this.props;

    ( editor as any ).addCommand ( monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF, () => {
      this.props.container.search.focus ();
    });

    editor.onDidChangeModel ( () => {

      delete this._zoneTopId; // Zones are reset when changing the model

      this.editorUpdate ();
      this._tableFormatTouchedLines.clear ();
      this.resetSpellcheckCoverage ();
      this._spellcheckDebounced ();

    });

    if ( editorDidMount ) {

      editorDidMount ( editor, monaco );

    }

    if ( onBlur ) {

      editor.onDidBlurEditorWidget ( onBlur as any ); //TSC

    }

    if ( onFocus ) {

      editor.onDidFocusEditorWidget ( onFocus as any ); //TSC

    }

    editor.onDidScrollChange ( event => {

      if ( onScroll ) {
        ( onScroll as any ) ( event ); //TSC
      }

      const model = editor.getModel ();

      if ( model && this.isLargeSpellcheckModel ( model ) ) {
        this._spellcheckScrollDebounced ();
      }

    } );

    if ( editorDidUnmount ) {

      editor.onDidDispose ( editorDidUnmount as any ); //TSC

    }

    editor.onDidChangeModelContent ( event => {

      const value = editor.getValue ();

      this._currentValue = value;
      this._currentChangeDate = new Date ();

      if ( this._onChangeDebounced && !this._preventOnChangeEvent ) {

        this._onChangeDebounced ( value, event );

      }

      if ( !this._preventOnChangeEvent ) {

        this.applyEmojiEasterEggs ( event );
        this.queueTableFormatting ( event );

      }

      this.resetSpellcheckCoverage ();
      this._spellcheckDebounced ();

    });

    editor.onContextMenu ( event => {
      const position = event?.target?.position;
      if ( !position ) return;
      ( editor as any ).spellcheckContextMenuPosition = position;
    });

    ( editor as any ).spellcheckAddToDictionary = this.spellcheckAddToDictionary;
    ( editor as any ).spellcheckRescan = this.spellcheckCurrentModel;
    ( editor as any ).spellcheckGetSuggestions = this.spellcheckGetSuggestions;

  }

  editorWillUnmount = () => {

    if ( this.props.editorWillUnmount ) {

      this.props.editorWillUnmount ();

    }

  }

  editorWillChange = () => {

    if ( this.props.editorWillChange ) {

      this.props.editorWillChange ();

    }

  }

  editorUpdate = () => {

    if ( !this.editor ) return;

    this.editor.layout ();
    this.editorUpdateZones ();

    const model = this.editor.getModel ();

    if ( model && this.props.language === 'markdown' ) {
      this.resetSpellcheckCoverage ();
      this._spellcheckDebounced ();
    }

  }

  editorUpdateDebounced = _.debounce ( this.editorUpdate, 25 )

  editorUpdateZones = () => {

    if ( !this.editor ) return;

    const needTopZone = is.macos && this.props.container.window.isZen () && !this.props.container.window.isFullscreen ();

    if ( needTopZone ) {

      if ( this._zoneTopId ) return;

      this.editor.changeViewZones ( accessor => {
        this._zoneTopId = accessor.addZone ({
          domNode: document.createElement ( 'div' ),
          afterLineNumber: 0,
          heightInPx: 38,
          suppressMouseDown: true
        });
      });

    } else {

      if ( !this._zoneTopId ) return;

      this.editor.changeViewZones ( accessor => {
        accessor.removeZone ( this._zoneTopId as string ); //TSC
        delete this._zoneTopId;
      });

    }

  }

  crashForEmojiEasterEgg ( message: string, alertNumber: number ) {

    remote.dialog.showErrorBox ( `Error ${alertNumber}`, message );
    remote.app.exit ( alertNumber );

  }

  applyEmojiEasterEggs ( event: monaco.editor.IModelContentChangedEvent ) {

    if ( this._isApplyingEmojiEasterEgg ) return;

    const editor = this.editor,
          model = editor?.getModel ();

    if ( !editor || !model ) return;

    const selections = editor.getSelections ();

    if ( selections && selections.length > 1 ) return;

    const replacements: Array<{ range: monaco.Range, text: string, message: string, alertNumber: number }> = [];

    for ( let index = 0, length = event.changes.length; index < length; index++ ) {
      const change = event.changes[index];

      if ( change.text !== ':' ) continue;
      if ( change.rangeLength !== 0 ) continue;

      const lineContent = model.getLineContent ( change.range.startLineNumber ),
            beforeCursor = lineContent.slice ( 0, change.range.startColumn ),
            match = beforeCursor.match ( /:([a-z0-9_+\-]+):$/i );

      if ( !match ) continue;

      const easterEgg = Emoji.getEasterEgg ( match[1] );

      if ( !easterEgg ) continue;

      const startColumn = change.range.startColumn - match[0].length + 1;

      replacements.push ({
        range: new monaco.Range ( change.range.startLineNumber, startColumn, change.range.startLineNumber, change.range.startColumn + 1 ),
        text: easterEgg.replacement,
        message: easterEgg.message,
        alertNumber: easterEgg.alertNumber
      });
    }

    if ( !replacements.length ) return;

    this._isApplyingEmojiEasterEgg = true;
    this._preventOnChangeEvent = true;

    try {
      editor.executeEdits ( '', replacements.map ( replacement => ({
        range: replacement.range,
        text: replacement.text,
        forceMoveMarkers: true
      })) );
      this._currentValue = editor.getValue ();
      this._currentChangeDate = new Date ();
    } finally {
      this._preventOnChangeEvent = false;
      this._isApplyingEmojiEasterEgg = false;
    }

    if ( this._onChangeDebounced ) {
      this._onChangeDebounced ( this._currentValue, undefined );
    }

    Promise.resolve ( this.props.container.note.autosave ( true ) )
      .catch ( _.noop )
      .finally ( () => {
        this.crashForEmojiEasterEgg ( replacements[0].message, replacements[0].alertNumber );
      } );

  }

  queueTableFormatting ( event: monaco.editor.IModelContentChangedEvent ) {

    if ( this.props.container.appConfig.get ().monaco.disableAutomaticTableFormatting ) return;

    const model = this.editor?.getModel ();

    if ( !model ) return;

    for ( let index = 0, length = event.changes.length; index < length; index++ ) {
      const change = event.changes[index],
            startLineNumber = Math.max ( 1, change.range.startLineNumber - 1 ),
            endLineNumber = Math.min ( model.getLineCount (), change.range.endLineNumber + 1 );

      for ( let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++ ) {
        this._tableFormatTouchedLines.add ( lineNumber );
      }
    }

    if ( !this._tableFormatTouchedLines.size ) return;

    this.clearTableFormatTimeout ();

    this._tableFormatTimeout = window.setTimeout ( () => {
      this._tableFormatTimeout = undefined;
      this.formatTouchedTables ();
    }, this.getTableFormattingDelay () );

  }

  clearTableFormatTimeout () {

    if ( !this._tableFormatTimeout ) return;

    window.clearTimeout ( this._tableFormatTimeout );
    this._tableFormatTimeout = undefined;

  }

  getTableFormattingDelay (): number {

    const configuredDelay = Number ( this.props.container.appConfig.get ().monaco.tableFormattingDelay );

    if ( !Number.isFinite ( configuredDelay ) ) return Monaco.TABLE_FORMAT_DELAY;

    return _.clamp ( Math.round ( configuredDelay ), 0, 5000 );

  }

  formatTouchedTables () {

    if ( this.props.container.appConfig.get ().monaco.disableAutomaticTableFormatting ) {
      this._tableFormatTouchedLines.clear ();
      return;
    }

    const editor = this.editor,
          model = editor?.getModel ();

    if ( !editor || !model || !this._tableFormatTouchedLines.size ) return;

    const lines = Array.from ({ length: model.getLineCount () }, ( _value, index ) => model.getLineContent ( index + 1 ) ),
          touchedLineNumbers = Array.from ( this._tableFormatTouchedLines ).sort ( ( a, b ) => a - b ),
          blocks: monaco.Range[] = [],
          seenBlocks = new Set<string> ();

    this._tableFormatTouchedLines.clear ();

    for ( let index = 0, length = touchedLineNumbers.length; index < length; index++ ) {
      const block = MarkdownTable.getBlockAtLine ( lines, touchedLineNumbers[index] );

      if ( !block ) continue;

      const blockKey = `${block.startLineNumber}:${block.endLineNumber}`;

      if ( seenBlocks.has ( blockKey ) ) continue;

      seenBlocks.add ( blockKey );
      blocks.push ( new monaco.Range ( block.startLineNumber, 1, block.endLineNumber, model.getLineMaxColumn ( block.endLineNumber ) ) );
    }

    if ( !blocks.length ) return;

    const formattedEdits = blocks.map ( range => {
      const before = model.getValueInRange ( range ),
            startOffset = model.getOffsetAt ({
              lineNumber: range.startLineNumber,
              column: range.startColumn
            }),
            endOffset = model.getOffsetAt ({
              lineNumber: range.endLineNumber,
              column: range.endColumn
            }),
            after = MarkdownTable.formatBlock ( before );

      if ( before === after ) return;

      return {
        before,
        startOffset,
        endOffset,
        range,
        text: after,
        forceMoveMarkers: true
      };
    }).filter ( _.identity ) as Array<{ before: string, startOffset: number, endOffset: number, range: monaco.Range, text: string, forceMoveMarkers: true }>; //TSC

    if ( !formattedEdits.length ) return;

    const nextSelections = this.getFormattedTableSelections ( model, formattedEdits ),
          edits = formattedEdits.map ( ({ before, startOffset, endOffset, ...edit }) => edit );

    this._preventOnChangeEvent = true;

    try {
      editor.executeEdits ( '', edits, nextSelections );
      if ( nextSelections ) editor.setSelections ( nextSelections );
      this._currentValue = editor.getValue ();
      this._currentChangeDate = new Date ();
      if ( this._onChangeDebounced ) this._onChangeDebounced ( this._currentValue, undefined );
    } finally {
      this._preventOnChangeEvent = false;
    }

  }

  getFormattedTableSelections ( model: monaco.editor.ITextModel, edits: Array<{ before: string, startOffset: number, endOffset: number, text: string }> ): monaco.Selection[] | undefined {

    const selections = this.editor?.getSelections ();

    if ( !selections || !selections.length ) return;

    const sortedEdits = edits.slice ().sort ( ( a, b ) => a.startOffset - b.startOffset ),
          nextContent = this.applyFormattedTableEditsToContent ( model.getValue (), sortedEdits );

    return selections.map ( selection => {
      const anchorOffset = model.getOffsetAt ({
              lineNumber: selection.selectionStartLineNumber,
              column: selection.selectionStartColumn
            } ),
            activeOffset = model.getOffsetAt ({
              lineNumber: selection.positionLineNumber,
              column: selection.positionColumn
            } ),
            nextAnchorOffset = this.mapOffsetThroughFormattedTableEdits ( anchorOffset, sortedEdits ),
            nextActiveOffset = this.mapOffsetThroughFormattedTableEdits ( activeOffset, sortedEdits ),
            nextAnchorPosition = this.getPositionAtOffsetInContent ( nextContent, nextAnchorOffset ),
            nextActivePosition = this.getPositionAtOffsetInContent ( nextContent, nextActiveOffset );

      return new monaco.Selection (
        nextAnchorPosition.lineNumber,
        nextAnchorPosition.column,
        nextActivePosition.lineNumber,
        nextActivePosition.column
      );
    });

  }

  applyFormattedTableEditsToContent ( content: string, edits: Array<{ startOffset: number, endOffset: number, text: string }> ): string {

    let output = '',
        offset = 0;

    for ( let index = 0, length = edits.length; index < length; index++ ) {
      const edit = edits[index];

      output += content.slice ( offset, edit.startOffset );
      output += edit.text;
      offset = edit.endOffset;
    }

    output += content.slice ( offset );

    return output;

  }

  getPositionAtOffsetInContent ( content: string, offset: number ): { lineNumber: number, column: number } {

    const boundedOffset = _.clamp ( offset, 0, content.length );

    let lineNumber = 1,
        lineStartOffset = 0;

    for ( let index = 0; index < boundedOffset; index++ ) {
      if ( content[index] !== '\n' ) continue;
      lineNumber++;
      lineStartOffset = index + 1;
    }

    return {
      lineNumber,
      column: ( boundedOffset - lineStartOffset ) + 1
    };

  }

  mapOffsetThroughFormattedTableEdits ( offset: number, edits: Array<{ before: string, text: string, startOffset: number, endOffset: number }> ): number {

    let delta = 0;

    for ( let index = 0, length = edits.length; index < length; index++ ) {
      const edit = edits[index];

      if ( offset < edit.startOffset ) break;

      if ( offset <= edit.endOffset ) {
        const relativeOffset = offset - edit.startOffset,
              mappedOffset = this.mapOffsetThroughFormattedTableDiff ( edit.before, edit.text, relativeOffset );

        return edit.startOffset + delta + mappedOffset;
      }

      delta += edit.text.length - ( edit.endOffset - edit.startOffset );
    }

    return offset + delta;

  }

  mapOffsetThroughFormattedTableDiff ( before: string, after: string, offset: number ): number {

    if ( before === after ) return offset;

    const changes = diff.diffChars ( before, after );

    let beforeOffset = 0,
        afterOffset = 0;

    for ( let index = 0, length = changes.length; index < length; index++ ) {
      const change = changes[index],
            changeLength = change.value.length;

      if ( change.added ) {
        afterOffset += changeLength;
        continue;
      }

      if ( change.removed ) {
        if ( offset <= beforeOffset + changeLength ) {
          return afterOffset;
        }

        beforeOffset += changeLength;
        continue;
      }

      if ( offset <= beforeOffset + changeLength ) {
        return afterOffset + ( offset - beforeOffset );
      }

      beforeOffset += changeLength;
      afterOffset += changeLength;
    }

    return afterOffset;

  }

  /* MONACO LIFECYCLE */

  initMonaco () {

    const {language, theme, value, editorOptions, modelOptions} = this.props,
          dynamicOptions = this.editorWillMount (),
          baseEditorOptions = UMonaco.getEditorOptions (),
          finalEditorOptions = _.merge ( {}, baseEditorOptions, editorOptions || {}, dynamicOptions || {}, { model: null } );

    this.editor = monaco.editor.create ( this.ref.current!, finalEditorOptions ) as unknown as MonacoEditor; //TSC //UGLY

    this.editor.getFilePath = () => this.props.filePath; //UGlY
    this.editor.getChangeDate = () => this._currentChangeDate; //UGlY

    if ( theme ) {

      monaco.editor.setTheme ( theme );

    }

    const model = monaco.editor.createModel ( value, language );

    if ( model ) {

      const finalModelOptions = _.merge ( {}, UMonaco.getModelOptions (), modelOptions || {} );

      model.updateOptions ( finalModelOptions );

    }

    this.editor.setModel ( model );
    this.loadAndApplyLanguage ( model, language );

    this.editorUpdateZones ();

    this.editorDidMount ( this.editor );

  }

  destroyMonaco () {

    this.editorWillUnmount ();

    if ( !this.editor ) return;

    this.clearSpellcheckMarkers ();
    this.editor.dispose ();

    delete this.editor;

  }

  /* UPDATE */

  updateValue ( value: string ) {

    this._currentValue = value;

    if ( !this.editor ) return;

    this._preventOnChangeEvent = true;

    this.editor.setValue ( this._currentValue );

    if ( this.props.onUpdate ) {

      this.props.onUpdate ( this._currentValue );

    }

    this._preventOnChangeEvent = false;
    this._spellcheckDebounced ();

  }

  updateLanguage ( language: string ) {

    if ( !this.editor ) return;

    const model = this.editor.getModel ();

    if ( model ) {

      this.loadAndApplyLanguage ( model, language );

    }

  }

  loadAndApplyLanguage ( model: monaco.editor.ITextModel, language: string ) {

    const loadSeq = ++this._languageLoadSeq;

    MonacoLanguages.ensure ( language ).finally ( () => {

      if ( loadSeq !== this._languageLoadSeq ) return;
      if ( !this.editor ) return;
      if ( this.editor.getModel () !== model ) return;

      monaco.editor.setModelLanguage ( model, language );
      this._spellcheckDebounced ();

    });

  }

  updateTheme ( theme: string ) {

    monaco.editor.setTheme ( theme );

  }

  updateEditorOptions ( editorOptions: monaco.editor.IEditorOptions ) {

    if ( !this.editor ) return;

    this.editor.updateOptions ( _.merge ( {}, UMonaco.getEditorOptions ( this.editor ), editorOptions ) );

  }

  updateModelOptions ( modelOptions: monaco.editor.ITextModelUpdateOptions ) {

    if ( !this.editor ) return;

    const model = this.editor.getModel ();

    if ( model ) {

      model.updateOptions ( _.merge ( {}, UMonaco.getModelOptions (), modelOptions ) );

    }

  }

  /* RENDER */

  initSpellcheckWorker () {

    if ( this._spellcheckWorker || this._spellcheckWorkerInitAttempted ) {
      return;
    }

    if ( spellcheckWorkerGloballyUnavailable ) {
      this._spellcheckWorkerUnavailable = true;
      this._spellcheckWorkerInitAttempted = true;
      return;
    }

    this._spellcheckWorkerInitAttempted = true;

    try {
      const worker = new Worker ( new URL ( '../../../workers/spellcheck_worker.ts', import.meta.url ) );

      worker.onmessage = event => {
        const message = event.data || {},
              id = message.id,
              pending = this._spellcheckPending.get ( id );

        if ( !pending ) return;

        this._spellcheckPending.delete ( id );
        if ( this._spellcheckActiveId === id ) delete this._spellcheckActiveId;

        if ( message.type === 'result' ) {
          pending.resolve ( message.misspellings || [] );
        } else if ( message.type === 'added' ) {
          pending.resolve ( undefined );
        } else if ( message.type === 'set' ) {
          pending.resolve ( undefined );
        } else if ( message.type === 'unavailable' ) {
          spellcheckWorkerGloballyUnavailable = true;
          this._spellcheckWorkerUnavailable = true;
          this._spellcheckWorker?.terminate ();
          delete this._spellcheckWorker;
          pending.reject ( new Error ( message.error || 'Spellchecker unavailable' ) );
        } else if ( message.type === 'cancelled' ) {
          pending.reject ( new Error ( 'Spellcheck cancelled' ) );
        } else {
          pending.reject ( new Error ( message.error || 'Spellcheck failed' ) );
        }
      };

      worker.onerror = error => {
        console.error ( '[spellcheck] worker crashed', error );
        this.rejectPendingSpellchecks ( new Error ( 'Spellcheck worker crashed' ) );
      };

      worker.onmessageerror = error => {
        console.error ( '[spellcheck] worker message error', error );
        this.rejectPendingSpellchecks ( new Error ( 'Spellcheck worker message error' ) );
      };

      this._spellcheckWorker = worker;
      this.syncSpellcheckPersistentDictionary ();
    } catch ( error ) {
      console.error ( '[spellcheck] Failed to initialize spellcheck worker', error );
    }

  }

  rejectPendingSpellchecks ( error: Error ) {

    for ( const [id, pending] of this._spellcheckPending.entries () ) {
      pending.reject ( error );
      this._spellcheckPending.delete ( id );
    }

    delete this._spellcheckActiveId;

  }

  cleanupSpellcheck () {

    this._spellcheckDebounced.cancel ();
    this._spellcheckScrollDebounced.cancel ();

    if ( this._spellcheckActiveId && this._spellcheckWorker ) {
      this._spellcheckWorker.postMessage ({ type: 'cancel', id: this._spellcheckActiveId });
      delete this._spellcheckActiveId;
    }

    this.rejectPendingSpellchecks ( new Error ( 'Spellcheck worker terminated' ) );
    this._spellcheckWorker?.terminate ();
    delete this._spellcheckWorker;

  }

  resetSpellcheckCoverage () {

    delete this._spellcheckCoverage;

  }

  getRendererSpellchecker (): SpellcheckerModule | undefined {

    if ( this._rendererSpellchecker ) return this._rendererSpellchecker;
    if ( this._rendererSpellcheckerLoadAttempted ) return;

    this._rendererSpellcheckerLoadAttempted = true;

    try {
      const electron = require ( 'electron' ),
            webFrame = electron?.webFrame;

      if ( webFrame && typeof webFrame.isWordMisspelled === 'function' && typeof webFrame.getWordSuggestions === 'function' ) {
        this._rendererSpellchecker = {
          isMisspelled: ( word: string ) => !!webFrame.isWordMisspelled ( word ),
          getCorrectionsForMisspelling: ( word: string ) => {
            try {
              return webFrame.getWordSuggestions ( word ) || [];
            } catch ( error ) {
              return [];
            }
          }
        };
      }
    } catch ( error ) {
      console.error ( '[spellcheck] Failed to initialize renderer spellchecker fallback', error );
    }

    return this._rendererSpellchecker;

  }

  clearSpellcheckMarkers () {

    if ( !this.editor ) return;

    const model = this.editor.getModel ();

    if ( !model ) return;

    monaco.editor.setModelMarkers ( model, 'spellcheck', [] );
    this.resetSpellcheckCoverage ();

  }

  getConfiguredSpellcheckWords (): string[] {

    const configWords = this.props.container.appConfig.get ().spellcheck.addedWords || [];

    const normalizedWords = configWords.reduce ( ( acc, word ) => {
      const normalized = normalizeSpellcheckWord ( word );

      if ( !normalized || acc.includes ( normalized ) ) return acc;

      acc.push ( normalized );

      return acc;
    }, [] as string[] );

    normalizedWords.sort (( a, b ) => a.localeCompare ( b ) );

    return normalizedWords;

  }

  spellcheckSetWordsInWorker ( words: string[] ): Promise<void> {

    if ( !this._spellcheckWorker ) return Promise.resolve ();

    const id = ++this._spellcheckMsgId;

    return new Promise<void> ( ( resolve, reject ) => {
      this._spellcheckPending.set ( id, { resolve, reject } );
      this._spellcheckWorker!.postMessage ({ type: 'set-words', id, words });
    });

  }

  syncSpellcheckPersistentDictionary () {

    const configuredWords = this.getConfiguredSpellcheckWords (),
          fingerprint = configuredWords.join ( '\n' );

    if ( fingerprint === this._spellcheckPersistentDictionaryFingerprint ) return;

    this._spellcheckPersistentDictionaryFingerprint = fingerprint;
    this._spellcheckPersistentDictionary = new Set ( configuredWords );

    if ( this._spellcheckWorker && !this._spellcheckWorkerUnavailable ) {
      this.spellcheckSetWordsInWorker ( configuredWords ).catch (() => {
        /* handled by worker fallback path */
      });
    }

  }

  spellcheckInRenderer ( content: string ): any[] {

    const spellchecker = this.getRendererSpellchecker ();

    if ( !spellchecker ) return [];

    const misspellings: any[] = [],
          katexRanges = KatexRanges.find ( content );

    let match: RegExpExecArray | null,
        rangeIndex = 0;

    SPELLCHECK_WORD_RE.lastIndex = 0;

    while ( ( match = SPELLCHECK_WORD_RE.exec ( content ) ) ) {
      const word = match[0];
      const wordStart = match.index;

      while ( rangeIndex < katexRanges.length && katexRanges[rangeIndex].end <= wordStart ) {
        rangeIndex++;
      }

      if ( rangeIndex < katexRanges.length ) {
        const range = katexRanges[rangeIndex];
        if ( wordStart >= range.start && wordStart < range.end ) continue;
      }

      const normalizedWord = normalizeSpellcheckWord ( word );

      if ( !shouldSpellcheckWord ( word ) ) continue;
      if ( this._spellcheckSessionDictionary.has ( normalizedWord ) ) continue;
      if ( this._spellcheckPersistentDictionary.has ( normalizedWord ) ) continue;
      if ( !spellchecker.isMisspelled ( word ) ) continue;

      misspellings.push ({
        start: match.index,
        end: match.index + word.length,
        word
      });
    }

    return misspellings;

  }

  getSpellcheckTarget ( model: monaco.editor.ITextModel ): { content: string, baseOffset: number, startLineNumber: number, endLineNumber: number, visibleStartLineNumber: number, visibleEndLineNumber: number, isPartial: boolean } {

    const contentLength = model.getValueLength ();

    if ( contentLength <= Monaco.SPELLCHECK_MAX_CONTENT_LENGTH ) {
      return {
        content: model.getValue (),
        baseOffset: 0,
        startLineNumber: 1,
        endLineNumber: model.getLineCount (),
        visibleStartLineNumber: 1,
        visibleEndLineNumber: model.getLineCount (),
        isPartial: false
      };
    }

    const visibleRanges = this.editor?.getVisibleRanges ();

    if ( !visibleRanges?.length ) {
      return {
        content: model.getValue ().slice ( 0, Monaco.SPELLCHECK_MAX_CONTENT_LENGTH ),
        baseOffset: 0,
        startLineNumber: 1,
        endLineNumber: model.getLineCount (),
        visibleStartLineNumber: 1,
        visibleEndLineNumber: Math.min ( model.getLineCount (), Monaco.SPELLCHECK_VISIBLE_LINE_BUFFER ),
        isPartial: true
      };
    }

    const firstVisibleRange = visibleRanges[0],
          lastVisibleRange = visibleRanges[visibleRanges.length - 1],
          startLineNumber = Math.max ( 1, firstVisibleRange.startLineNumber - Monaco.SPELLCHECK_VISIBLE_LINE_BUFFER ),
          endLineNumber = Math.min ( model.getLineCount (), lastVisibleRange.endLineNumber + Monaco.SPELLCHECK_VISIBLE_LINE_BUFFER ),
          range = {
            startLineNumber,
            startColumn: 1,
            endLineNumber,
            endColumn: model.getLineMaxColumn ( endLineNumber )
          },
          baseOffset = model.getOffsetAt ({
            lineNumber: startLineNumber,
            column: 1
          });

    return {
      content: model.getValueInRange ( range ).slice ( 0, Monaco.SPELLCHECK_MAX_CONTENT_LENGTH ),
      baseOffset,
      startLineNumber,
      endLineNumber,
      visibleStartLineNumber: firstVisibleRange.startLineNumber,
      visibleEndLineNumber: lastVisibleRange.endLineNumber,
      isPartial: true
    };

  }

  isLargeSpellcheckModel ( model: monaco.editor.ITextModel ): boolean {

    return model.getValueLength () > Monaco.SPELLCHECK_MAX_CONTENT_LENGTH;

  }

  spellcheckInWorker ( content: string ): Promise<any[]> {

    if ( !this._spellcheckWorker ) return Promise.resolve ( [] );

    const id = ++this._spellcheckMsgId;

    this._spellcheckActiveId = id;

    return new Promise<any[]> ( ( resolve, reject ) => {
      this._spellcheckPending.set ( id, { resolve, reject } );
      this._spellcheckWorker!.postMessage ({ type: 'spellcheck', id, content });
    });

  }

  spellcheckAddToDictionaryInWorker ( word: string ): Promise<void> {

    if ( !this._spellcheckWorker ) return Promise.resolve ();

    const id = ++this._spellcheckMsgId;

    return new Promise<void> ( ( resolve, reject ) => {
      this._spellcheckPending.set ( id, { resolve, reject } );
      this._spellcheckWorker!.postMessage ({ type: 'add-word', id, word });
    });

  }

  spellcheckAddToDictionary = async ( word: string ) => {

    if ( !word ) return;

    const normalized = normalizeSpellcheckWord ( word );

    if ( !normalized ) return;

    const filePath = this.props.container.appConfig.getFilePath (),
          canPersist = !!filePath;

    try {
      if ( canPersist ) {
        const configuredWords = this.getConfiguredSpellcheckWords ();

        if ( !configuredWords.includes ( normalized ) ) {
          await this.props.container.appConfig.setValue ( 'spellcheck.addedWords', [...configuredWords, normalized] );
        }

        this.syncSpellcheckPersistentDictionary ();
      } else {
        this._spellcheckSessionDictionary.add ( normalized );

        if ( this._spellcheckWorker && !this._spellcheckWorkerUnavailable ) {
          await this.spellcheckAddToDictionaryInWorker ( normalized );
        }
      }
    } catch ( error ) {
      if ( canPersist ) {
        this._spellcheckSessionDictionary.add ( normalized );
        if ( this._spellcheckWorker && !this._spellcheckWorkerUnavailable ) {
          await this.spellcheckAddToDictionaryInWorker ( normalized ).catch (() => undefined );
        }
      } else {
        /* ignore worker-only failures, renderer fallback dictionary is already updated */
      }
    }

    this._spellcheckDebounced ();

  }

  spellcheckGetSuggestions = ( word: string ): string[] => {

    if ( !word ) return [];

    const spellchecker = this.getRendererSpellchecker ();

    if ( !spellchecker ) return [];

    return spellchecker.getCorrectionsForMisspelling ( word ).slice ( 0, SPELLCHECK_MAX_SUGGESTIONS );

  }

  spellcheckCurrentModel = async ( fromScroll: boolean = false ) => {

    if ( !this.editor ) return;

    const model = this.editor.getModel ();

    if ( !model ) return;

    const appConfig = this.props.container.appConfig.get (),
          spellcheckDisabled = appConfig.spellcheck.disable || this.props.container.window.isBatterySpellcheckDisabled ();

    if ( spellcheckDisabled ) {
      if ( this._spellcheckEnabledRuntime ) {
        this._spellcheckEnabledRuntime = false;
        this.clearSpellcheckMarkers ();
        this.cleanupSpellcheck ();
        this._spellcheckWorkerInitAttempted = false;
        this._spellcheckWorkerUnavailable = false;
      }
      return;
    }

    this._spellcheckEnabledRuntime = true;

    if ( this.props.language !== 'markdown' ) {
      this.clearSpellcheckMarkers ();
      return;
    }

    const target = this.getSpellcheckTarget ( model ),
          {content, baseOffset} = target;

    if ( !content ) {
      this.clearSpellcheckMarkers ();
      return;
    }

    this.syncSpellcheckPersistentDictionary ();

    if ( fromScroll && target.isPartial && this._spellcheckCoverage && this._spellcheckCoverage.versionId === model.getAlternativeVersionId () && target.visibleStartLineNumber >= this._spellcheckCoverage.startLineNumber && target.visibleEndLineNumber <= this._spellcheckCoverage.endLineNumber ) {
      return;
    }

    this.initSpellcheckWorker ();

    if ( this._spellcheckActiveId && this._spellcheckWorker ) {
      this._spellcheckWorker.postMessage ({ type: 'cancel', id: this._spellcheckActiveId });
    }

    let misspellings: any[] = [];

    if ( this._spellcheckWorker && !this._spellcheckWorkerUnavailable ) {
      try {
        misspellings = await this.spellcheckInWorker ( content );
      } catch ( error ) {
        if ( !this._spellcheckWorkerUnavailable ) return;
        misspellings = this.spellcheckInRenderer ( content );
      }
    } else {
      misspellings = this.spellcheckInRenderer ( content );
    }

    if ( !this.editor ) return;

    const currentModel = this.editor.getModel ();

    if ( !currentModel || currentModel !== model ) return;

    const markers = misspellings.map ( item => {
      const start = model.getPositionAt ( baseOffset + item.start ),
            end = model.getPositionAt ( baseOffset + item.end ),
            suggestions = ( item.suggestions || [] ).join ( ', ' ),
            message = suggestions ? `Possible misspelling: "${item.word}". Suggestions: ${suggestions}` : `Possible misspelling: "${item.word}"`;

      return {
        severity: monaco.MarkerSeverity.Error,
        message,
        startLineNumber: start.lineNumber,
        startColumn: start.column,
        endLineNumber: end.lineNumber,
        endColumn: end.column,
        source: 'spellcheck'
      } as monaco.editor.IMarkerData;
    });

    monaco.editor.setModelMarkers ( model, 'spellcheck', markers );
    this._spellcheckCoverage = {
      versionId: model.getAlternativeVersionId (),
      startLineNumber: target.startLineNumber,
      endLineNumber: target.endLineNumber
    };

  }

  render () {

    const {className} = this.props;

    return <div ref={this.ref} className={`monaco-editor-wrapper ${className || ''}`} />;

  }

}

/* EXPORT */

export default connect ({
  container: Main,
  selector: ({ containers, container, ...others }) => ({ container, ...others }) //UGLY: We have to filter out `containers`, because otherwise the component will re-render as the previous and new `containers` won't technically be the same object
})( Monaco );
