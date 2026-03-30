
/* IMPORT */

import * as _ from 'lodash';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
import {Command, EditorCommand} from 'monaco-editor/esm/vs/editor/browser/editorExtensions.js';
import {EditorContextKeys} from 'monaco-editor/esm/vs/editor/common/editorContextKeys.js';
import * as LanguageMarkdown from 'monaco-editor/esm/vs/basic-languages/markdown/markdown.js';
import * as path from 'path';
import Config from '@common/config';
import CodeFenceSuggestions from '@common/code_fence_suggestions';
import Emoji from '@common/emoji';
import Settings from '@common/settings';
import MonacoLanguages from './monaco_languages';
import ThemeLight from './monaco_light';
import ThemeDark from './monaco_dark';
import Todo from './monaco_todo';

/* MONACO */

const Monaco = {

  editorOptions: {
    accessibilitySupport: 'off',
    colorDecorators: false,
    contextmenu: false,
    copyWithSyntaxHighlighting: false,
    disableLayerHinting: true,
    dragAndDrop: true,
    folding: false,
    fixedOverflowWidgets: true,
    fontSize: 16 * .875,
    hideCursorInOverviewRuler: true,
    highlightActiveIndentGuide: false,
    hover: {
      enabled: false
    },
    iconsInSuggestions: false,
    lightbulb: {
      enabled: 'off'
    },
    lineDecorationsWidth: 3,
    lineHeight: 16 * .875 * 1.5,
    lineNumbers: 'on',
    minimap: {
      enabled: Settings.get ( 'monaco.editorOptions.minimap.enabled' )
    },
    model: null,
    occurrencesHighlight: 'off',
    overviewRulerBorder: false,
    overviewRulerLanes: 0,
    renderIndentGuides: false,
    roundedSelection: false,
    overtypeCursorStyle: 'line',
    scrollbar: {
      useShadows: false,
      horizontalScrollbarSize: 12,
      verticalScrollbarSize: 12
    },
    scrollBeyondLastColumn: 0,
    scrollBeyondLastLine: true,
    snippetSuggestions: 'none',
    wordWrap: Settings.get ( 'monaco.editorOptions.wordWrap' ),
    wordWrapColumn: 1000000,
    wordWrapMinified: false,
    wrappingIndent: 'same'
  } as monaco.editor.IEditorOptions,

  modelOptions: {
    insertSpaces: true,
    trimAutoWhitespace: true
  } as monaco.editor.ITextModelUpdateOptions,

  keybindings: {

    'cursorTop': {
      options: {
        kbOpts: {
          kbExpr: EditorContextKeys.editorTextFocus,
          primary: monaco.KeyMod.CtrlCmd | monaco.KeyCode.Home,
          mac: { primary: monaco.KeyMod.CtrlCmd | monaco.KeyCode.UpArrow },
          weight: 0
        }
      },
      handler ( accessor, editor: MonacoEditor ) {
        const position0 = {
          lineNumber: 0,
          column: 0
        };
        editor.restoreViewState ({
          contributionsState: {},
          cursorState: [{
            inSelectionMode: false,
            selectionStart: position0,
            position: position0
          }],
          viewState: {
            scrollLeft: 0,
            firstPosition: position0,
            firstPositionDeltaTop: Infinity // Ensuring we are scrolling to the very top, important in zen mode
          }
        });
      }
    },

    'editor.toggleMinimap': {
      options: {
        kbOpts: {
          kbExpr: EditorContextKeys.editorTextFocus,
          primary: monaco.KeyMod.Alt | monaco.KeyCode.KeyM,
          weight: 100
        }
      },
      handler ( accessor, editor: MonacoEditor ) {

        if ( !Monaco.editorOptions.minimap ) Monaco.editorOptions.minimap = {};

        Monaco.editorOptions.minimap.enabled = !Monaco.editorOptions.minimap.enabled;

        Settings.set ( 'monaco.editorOptions.minimap.enabled', Monaco.editorOptions.minimap.enabled );

        editor.updateOptions ( Monaco.getEditorOptions ( editor ) );

      }
    },

    'editor.toggleWordWrap': {
      options: {
        precondition: EditorContextKeys.writable,
        kbOpts: {
          kbExpr: EditorContextKeys.editorTextFocus,
          primary: monaco.KeyMod.Alt | monaco.KeyCode.KeyZ,
          weight: 100
        }
      },
      handler ( accessor, editor: MonacoEditor ) {

        Monaco.editorOptions.wordWrap = Monaco.editorOptions.wordWrap === 'bounded' ? 'off' : 'bounded';

        Settings.set ( 'monaco.editorOptions.wordWrap', Monaco.editorOptions.wordWrap );

        editor.updateOptions ( Monaco.getEditorOptions ( editor ) );

      }
    },

    'editor.toggleTodo': {
      options: {
        precondition: EditorContextKeys.writable,
        kbOpts: {
          kbExpr: EditorContextKeys.editorTextFocus,
          primary: monaco.KeyMod.Alt | monaco.KeyCode.Enter,
          weight: 100
        }
      },
      handler ( accessor, editor: MonacoEditor ) {
        Todo.toggleTodo ( editor );
      }
    },

    'editor.toggleTodoDone': {
      options: {
        precondition: EditorContextKeys.writable,
        kbOpts: {
          kbExpr: EditorContextKeys.editorTextFocus,
          primary: monaco.KeyMod.Alt | monaco.KeyCode.KeyD,
          weight: 100
        }
      },
      handler ( accessor, editor: MonacoEditor ) {
        Todo.toggleTodoDone ( editor );
      }
    }

  } as { [command: string]: { options: any, handler: Function } | undefined },

  keybindingsPatched: {

    'actions.find': false,
    'actions.findWithSelection': false,
    'cancelSelection': false,
    'closeFindWidget': false,
    'cursorColumnSelectDown': false,
    'cursorColumnSelectLeft': false,
    'cursorColumnSelectPageDown': false,
    'cursorColumnSelectPageUp': false,
    'cursorColumnSelectRight': false,
    'cursorColumnSelectUp': false,
    'editor.action.changeAll': false,
    'editor.action.copyLinesDownAction': false,
    'editor.action.copyLinesUpAction': false,
    'editor.action.deleteLines': false,
    'editor.action.diffReview.next': false,
    'editor.action.diffReview.prev': false,
    'editor.action.indentLines': false,
    'editor.action.insertCursorAtEndOfEachLineSelected': false,
    'editor.action.joinLines': false,
    'editor.action.moveSelectionToNextFindMatch': false,
    'editor.action.nextMatchFindAction': false,
    'editor.action.nextSelectionMatchFindAction': false,
    'editor.action.outdentLines': false,
    'editor.action.previousMatchFindAction': false,
    'editor.action.previousSelectionMatchFindAction': false,
    'editor.action.replaceAll': false,
    'editor.action.replaceOne': false,
    'editor.action.selectAllMatches': false,
    'editor.action.startFindReplaceAction': false,
    'editor.action.trimTrailingWhitespace': false,
    'expandLineSelection': false,
    'lineBreakInsert': false,
    'removeSecondaryCursors': false,
    'scrollLineDown': false,
    'scrollLineUp': false,
    'scrollPageDown': false,
    'scrollPageUp': false,
    'toggleFindCaseSensitive': false,
    'toggleFindInSelection': false,
    'toggleFindRegex': false,
    'toggleFindWholeWord': false,
    'toggleOvertypeInsertMode': false,

    'editor.action.moveLinesDownAction': cmd => {
      cmd._kbOpts.primary = cmd._kbOpts.linux.primary = monaco.KeyMod.WinCtrl | monaco.KeyMod.Alt | monaco.KeyCode.DownArrow;
      cmd._kbOpts.mac = {};
      cmd._kbOpts.mac.primary = monaco.KeyMod.CtrlCmd | monaco.KeyMod.WinCtrl | monaco.KeyCode.DownArrow;
    },

    'editor.action.moveLinesUpAction': cmd => {
      cmd._kbOpts.primary = cmd._kbOpts.linux.primary = monaco.KeyMod.WinCtrl | monaco.KeyMod.Alt | monaco.KeyCode.UpArrow;
      cmd._kbOpts.mac = {};
      cmd._kbOpts.mac.primary = monaco.KeyMod.CtrlCmd | monaco.KeyMod.WinCtrl | monaco.KeyCode.UpArrow;
    }

  } as { [command: string]: Function | false | undefined },

  themes: {

    light: ThemeLight,
    dark: ThemeDark

  } as { [name: string]: monaco.editor.IStandaloneThemeData },

  init: _.once ( () => {

    Monaco.initEnvironment ();
    Monaco.initThemes ();
    Monaco.initTokenizers ();
    Monaco.initCompletions ();

  }),

  getConfiguredLineNumbersMode (): import ( '@common/global_config' ).MonacoLineNumbersMode {

    const configured = Config.monaco.editorOptions.lineNumbers || Settings.get ( 'monaco.editorOptions.lineNumbers' ),
          normalized = String ( configured || 'on' ).toLowerCase ();

    if ( normalized === 'off' || normalized === 'relative' || normalized === 'on' ) return normalized;

    return 'on';

  },

  getLineNumbersOption ( editor?: MonacoEditor ): monaco.editor.IEditorOptions['lineNumbers'] {

    const mode = Monaco.getConfiguredLineNumbersMode ();

    if ( mode === 'off' ) return 'off';

    if ( mode === 'relative' ) return 'relative';

    return 'on';

  },

  getEditorOptions ( editor?: MonacoEditor ): monaco.editor.IEditorOptions {

    const disableSuggestions = Config.monaco.editorOptions.disableSuggestions;

    return _.merge ( {}, Monaco.editorOptions, {
      lineNumbers: Monaco.getLineNumbersOption ( editor ),
      quickSuggestions: disableSuggestions ? false : {
        other: true,
        comments: true,
        strings: true
      },
      quickSuggestionsDelay: 10,
      suggestOnTriggerCharacters: !disableSuggestions,
      wordBasedSuggestions: disableSuggestions ? 'off' : 'currentDocument'
    });

  },

  getModelOptions (): monaco.editor.ITextModelUpdateOptions {

    const tabSize = Config.monaco.editorOptions.tabSize;

    return _.merge ( {}, Monaco.modelOptions, {
      tabSize,
      indentSize: tabSize
    });

  },

  initEnvironment () {

    self['MonacoEnvironment'] = {
      getWorkerUrl () {
        if ( globalThis.location?.protocol.startsWith ( 'http' ) ) {
          return new URL ( 'javascript/monaco.worker.js', globalThis.location.href ).toString ();
        }

        return `file://${path.join ( __static, 'javascript', 'monaco.worker.js' )}`;
      }
    };

  },

  initKeybindings () {

    Object.keys ( Monaco.keybindings ).forEach ( id => {

      const keybinding = Monaco.keybindings[id];

      if ( !keybinding ) return;

      const {options, handler} = keybinding;

      options.id = id;
      options.label = options.label || options.id;

      class CustomCommand extends EditorCommand {

        constructor () {
          super ( options );
        }

        runEditorCommand ( accessor, editor: MonacoEditor ) {
          return handler ( accessor, editor );
        }

      }

      new CustomCommand ()['register']();

    });

  },

  initThemes () {

    Object.keys ( Monaco.themes ).forEach ( name => {

      monaco.editor.defineTheme ( name, Monaco.themes[name] );

    });

  },

  initTokenizers () {

    const tokenizer = LanguageMarkdown.language.tokenizer as any;

    const headingRuleIndex = tokenizer.root.findIndex ( rule => {
      if ( !Array.isArray ( rule ) || !( rule[0] instanceof RegExp ) ) return false;
      return rule[0].source === '^(\\s{0,3})(#+)((?:[^\\\\#]|@escapes)+)((?:#+)?)';
    });
    const headingRule = [/^(\s{0,3})(#+)((?:[^\\#]|@escapes)+)((?:#+)?)/, ['white', 'keyword.title', 'title', 'keyword.title']];

    if ( headingRuleIndex >= 0 ) {
      tokenizer.root[headingRuleIndex] = headingRule;
    } else {
      tokenizer.root.unshift ( headingRule );
    }

    // Custom KaTeX/LaTeX fenced blocks in markdown source.
    tokenizer.root.unshift (
      [/^\s*~~~\s*(?:katex|latex|tex)\s*$/i, { token: 'keyword.math.fence', next: '@mathblock' }],
      [/^\s*```\s*(?:katex|latex|tex)\s*$/i, { token: 'keyword.math.fence', next: '@mathblock' }]
    );

    tokenizer.root.unshift (
      [/^\s*~~~\s*(?:plantuml|puml|uml)\s*$/i, { token: 'keyword.graph.fence', next: '@plantumlblock' }],
      [/^\s*```\s*(?:plantuml|puml|uml)\s*$/i, { token: 'keyword.graph.fence', next: '@plantumlblock' }]
    );

    // Display math blocks delimited by $$ ... $$.
    tokenizer.root.unshift (
      [/^\s*\$\$\s*$/, { token: 'keyword.math.fence', next: '@mathdollarblock' }]
    );

    // Quote blocks should be visually distinct in markdown source.
    tokenizer.root.unshift (
      [/^(\s{0,3}> ?)(.*)$/, ['comment.quote', 'string.quote']]
    );

    // Heading lines containing inline math should still highlight the math span.
    tokenizer.root.unshift (
      [/^(\s{0,3}#{1,6}\s(?:[^$\\]|\\.)*?)(\$\$(?:\\.|[^\$\\])+\$\$|\$(?!\$)(?:\\.|[^\$\\])+\$)(.*)$/, ['keyword.title', 'string.math.inline', 'keyword.title']]
    );

    // Inline math highlighting in markdown source.
    tokenizer.linecontent.unshift (
      [/<!--(?:[^-]|-(?!-))*-->/, 'comment'],
      [/<\/?(?:[A-Za-z][\w:-]*)(?:\s+[^<>]*?)?\/?>/, 'tag'],
      [/\\\$/, 'string'],
      [/\$\$(?!\s*$)/, { token: 'keyword.math.delimiter', next: '@mathinlineblock' }],
      [/\$(?!\$)/, { token: 'keyword.math.delimiter', next: '@mathinline' }]
    );

    tokenizer.mathinline = [
      [/%.*$/, 'comment.math'],
      [/\\[a-zA-Z@]+/, 'keyword.math'],
      [/\\./, 'string.escape.math'],
      [/[{}[\]()]/, 'delimiter.math'],
      [/-?\d+(?:\.\d+)?/, 'number.math'],
      [/[&^_=+\-*/<>|]/, 'operator.math'],
      [/\$(?!\$)/, { token: 'keyword.math.delimiter', next: '@pop' }],
      [/$/, '', '@pop'],
      [/[^\\$%{}[\]()&^_=+\-*/<>|0-9]+/, 'string.math'],
      [/./, 'string.math']
    ];

    tokenizer.mathinlineblock = [
      [/%.*$/, 'comment.math'],
      [/\\[a-zA-Z@]+/, 'keyword.math'],
      [/\\./, 'string.escape.math'],
      [/[{}[\]()]/, 'delimiter.math'],
      [/-?\d+(?:\.\d+)?/, 'number.math'],
      [/[&^_=+\-*/<>|]/, 'operator.math'],
      [/\$\$/, { token: 'keyword.math.delimiter', next: '@pop' }],
      [/$/, '', '@pop'],
      [/[^\\$%{}[\]()&^_=+\-*/<>|0-9]+/, 'string.math'],
      [/./, 'string.math']
    ];

    tokenizer.mathblock = [
      [/^\s*~~~\s*$/, { token: 'keyword.math.fence', next: '@pop' }],
      [/^\s*```\s*$/, { token: 'keyword.math.fence', next: '@pop' }],
      [/%.*$/, 'comment.math'],
      [/\\[a-zA-Z@]+/, 'keyword.math'],
      [/\\./, 'string.escape.math'],
      [/[{}[\]()]/, 'delimiter.math'],
      [/-?\d+(?:\.\d+)?/, 'number.math'],
      [/[&^_=+\-*/<>|]/, 'operator.math'],
      [/[^\\%{}[\]()&^_=+\-*/<>|0-9]+/, 'string.math'],
      [/./, 'string.math']
    ];

    tokenizer.mathdollarblock = [
      [/^\s*\$\$\s*$/, { token: 'keyword.math.fence', next: '@pop' }],
      [/%.*$/, 'comment.math'],
      [/\\[a-zA-Z@]+/, 'keyword.math'],
      [/\\./, 'string.escape.math'],
      [/[{}[\]()]/, 'delimiter.math'],
      [/-?\d+(?:\.\d+)?/, 'number.math'],
      [/[&^_=+\-*/<>|]/, 'operator.math'],
      [/[^\\%{}[\]()&^_=+\-*/<>|0-9]+/, 'string.math'],
      [/./, 'string.math']
    ];

    tokenizer.plantumlblock = [
      [/^\s*~~~\s*$/, { token: 'keyword.graph.fence', next: '@pop' }],
      [/^\s*```\s*$/, { token: 'keyword.graph.fence', next: '@pop' }],
      [/^\s*[@](?:start(?:\w+)?\b.*)$/i, 'keyword.graph.directive'],
      [/^\s*[@](?:end(?:\w+)?\b.*)$/i, 'keyword.graph.directive'],
      [/^\s*!include(?:url)?\b.*$/i, 'keyword.graph.directive'],
      [/^\s*(?:skinparam|title|caption|legend|left to right direction|top to bottom direction)\b.*$/i, 'keyword.graph.directive'],
      [/^\s*(?:actor|boundary|control|entity|database|collections|participant|queue|rectangle|package|node|component|interface|class|enum|abstract|annotation)\b.*$/i, 'keyword.graph.entity'],
      [/^\s*'.*$/, 'comment'],
      [/\"(?:[^\"\\]|\\.)*\"/, 'string'],
      [/[<>|:.*+#\\-]+/, 'operator'],
      [/[^\"'<>|:.*+#\\-]+/, 'string'],
      [/./, 'string']
    ];

  },

  initCompletions () {

    monaco.languages.registerCompletionItemProvider ( 'markdown', {
      triggerCharacters: [':', '`', '~' ],
      provideCompletionItems ( model, position, context ) {

        const line = model.getLineContent ( position.lineNumber ),
              beforeCursor = line.slice ( 0, position.column - 1 ),
              triggerCharacter = context?.triggerCharacter;

        if ( Config.monaco.editorOptions.disableSuggestions ) {
          return { suggestions: [] };
        }

        const emojiMatch = beforeCursor.match ( /(?:^|[\s([{<]):([a-z0-9_+\-]*)$/i );

        if ( triggerCharacter === ':' || emojiMatch ) {
          if ( !emojiMatch ) return;

          const query = emojiMatch[1],
                startColumn = position.column - query.length - 1,
                range = new monaco.Range ( position.lineNumber, startColumn + 1, position.lineNumber, position.column ),
                suggestions = Emoji.getSuggestions ( query, 30 ).map ( entry => ({
                  label: entry.emoji ? `${entry.emoji} :${entry.shortcode}:` : `:${entry.shortcode}:`,
                  kind: monaco.languages.CompletionItemKind.Text,
                  insertText: `${entry.shortcode}:`,
                  range,
                  sortText: entry.shortcode,
                  filterText: entry.shortcode,
                  documentation: entry.emoji ? `Insert ${entry.emoji} as :${entry.shortcode}:` : `Insert :${entry.shortcode}:`
                }));

          if ( !suggestions.length ) return;

          return { suggestions };
        }

        const codeFenceContext = CodeFenceSuggestions.getContext ( beforeCursor );

        if ( codeFenceContext ) {
          const linesBefore = _.range ( 1, position.lineNumber ).map ( lineNumber => model.getLineContent ( lineNumber ) ),
                isOpeningCodeFenceContext = CodeFenceSuggestions.isOpeningContext ( codeFenceContext, linesBefore );

          if ( !isOpeningCodeFenceContext ) return;

          const monacoLanguageIds = monaco.languages.getLanguages ().map ( language => language.id );
          const candidates = [...CodeFenceSuggestions.baseLanguages, ...MonacoLanguages.ids, ...monacoLanguageIds];
          const suggestions = CodeFenceSuggestions.getSuggestions ( codeFenceContext.query, candidates, 30 ).map ( ( language, index ) => ({
            label: language,
            kind: monaco.languages.CompletionItemKind.Module,
            insertText: language,
            range: new monaco.Range ( position.lineNumber, codeFenceContext.queryStart + 1, position.lineNumber, position.column ),
            sortText: index.toString ().padStart ( 4, '0' ),
            filterText: language,
            documentation: `Insert fenced code language \`${language}\``
          }));

          if ( !suggestions.length ) return;

          return { suggestions };
        }

        return;

      }
    });

  },

  patchKeybindings () {

    const _register = Command.prototype.register;

    Command.prototype.register = function () {
      const patcher = Monaco.keybindingsPatched[this.id];
      if ( patcher === false || ( patcher && patcher ( this ) === false ) ) return; // Disabled
      return _register.apply ( this, arguments );
    };

  }

};

Monaco.patchKeybindings ();
Monaco.initKeybindings ();

/* EXPORT */

export default Monaco;
