
/* IMPORT */

import * as _ from 'lodash';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
import Edits from './monaco_edits';

/* TODO */

const Todo = {

  symbols: { //TODO: These should be customizable
    bullet: '-',
    done: 'x'
  },

  regexes: {
    line: /^(\s*)([*+-]?\s*)(.*)$/,
    todo: /^(\s*)([*+-]\s+\[[ xX]\]\s*)(.*)$/,
    todoBox: /^(\s*)([*+-]\s+\[ \]\s*)(.*)$/,
    todoDone: /^(\s*)([*+-]\s+\[[xX]\]\s*)(.*)$/
  },

  /**
   * Applies the first matching line rewrite rule to each selected line.
   */
  toggleRules ( editor: MonacoEditor, ...rules: [RegExp, string][] ): boolean {

    const model = editor.getModel ();

    if ( !model ) return false;

    const selections = editor.getSelections ();

    if ( !selections || !selections.length ) return false;

    const linesNr = _.uniq ( selections.map ( selection => selection.startLineNumber ) ),
          lines = linesNr.map ( lineNr => model.getLineContent ( lineNr ) );

    if ( !lines.length ) return false;

    const edits: monaco.editor.IIdentifiedSingleEditOperation[] = [];

    lines.forEach ( ( line, index ) => {

      rules.find ( ([ regex, replacement ]) => {

        if ( !regex.test ( line ) ) return false;

        const lineNext = line.replace ( regex, replacement );

        edits.push ( ..._.flattenDeep ( Edits.makeReplace ( line, lineNext, linesNr[index] ) ) );

        return true;

      });

    });

    if ( !edits.length ) return false;

    return Edits.apply ( editor, edits );

  },

  /**
   * Toggles selected lines between plain text and incomplete task items.
   */
  toggleTodo ( editor: MonacoEditor ): boolean {

    const {bullet} = Todo.symbols,
          {line, todoBox, todoDone} = Todo.regexes;

    return Todo.toggleRules (
      editor,
      [todoBox, '$1$3'],
      [todoDone, `$1${bullet} [ ] $3`],
      [line, `$1${bullet} [ ] $3`]
    );

  },

  /**
   * Toggles selected lines between plain text, incomplete task items, and done
   * task items.
   */
  toggleTodoDone ( editor: MonacoEditor ): boolean {

    const {bullet, done} = Todo.symbols,
          {line, todoBox, todoDone} = Todo.regexes;

    return Todo.toggleRules (
      editor,
      [todoDone, `$1${bullet} [ ] $3`],
      [todoBox, `$1${bullet} [${done}] $3`],
      [line, `$1${bullet} [${done}] $3`]
    );

  }

};

/* EXPORT */

export default Todo;
