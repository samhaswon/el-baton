
/* IMPORT */

import * as _ from 'lodash';
import {MenuItemConstructorOptions} from 'electron';
import Dialog from 'electron-dialog';
import {is} from '@common/electron_util_shim';
import {connect} from 'overstated';
import * as path from 'path';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
import {Component} from 'react-component-renderless';
import Main from '@renderer/containers/main';
import Tags, {TagSpecials} from '@renderer/utils/tags';

/* CONTEXT MENU */

const remote = require ( '@electron/remote' );

type Selector = string | (( x: number, y: number ) => boolean | Element | undefined);

interface ContextMenuConfig {
  selector: Selector,
  items: MenuItemConstructorOptions[],
  itemsUpdater: ( items: MenuItemConstructorOptions[] ) => void
}

class ContextMenu extends Component<{ container: IMain }, {}> {

  /* VARIABLES */

  ele; attachment; note; tag; // Globals pointing to the current element/attachment/note/tag object
  menus: ContextMenuConfig[] = [];
  _editorSpellMarker?: monaco.editor.IMarker;
  _editorSpellWord?: string;
  _editorSpellSuggestions: string[] = [];

  /* SPECIAL */

  componentDidMount () {

    this.initInputMenu ();
    this.initAttachmentMenu ();
    this.initNoteMenu ();
    this.initNoteTagMenu ();
    this.initTagMenu ();
    this.initTrashMenu ();
    this.initEditorMenu ();
    this.initFallbackMenu ();

    window.addEventListener ( 'contextmenu', this._onContextMenu );

  }

  componentWillUnmount () {

    window.removeEventListener ( 'contextmenu', this._onContextMenu );

  }

  /* HELPERS */

  _getItem = ( x, y, selector: string ): Element | undefined => {

    const eles = document.elementsFromPoint ( x, y );

    return eles.find ( ele => $(ele).is ( selector ) );

  }

  _makeMenu = ( selector: Selector = '*', items: MenuItemConstructorOptions[] = [], itemsUpdater = _.noop ) => {

    this.menus.push ({ selector, items, itemsUpdater });

  }

  _onContextMenu = ( event: MouseEvent ) => {

    const x = event.clientX,
          y = event.clientY;

    for ( let menuData of this.menus ) {

      let ele: boolean | Element | undefined;

      if ( _.isString ( menuData.selector ) ) {
        ele = this._getItem ( x, y, menuData.selector );
      } else {
        ele = menuData.selector ( x, y );
      }

      if ( !ele ) continue;

      this.ele = ( ele === true ) ? event.target as Element : ele;

      menuData.itemsUpdater ( menuData.items );

      if ( menuData.items.length ) {
        const menu = remote.Menu.buildFromTemplate ( menuData.items );
        menu.popup ({ window: remote.getCurrentWindow () });
      }

      event.preventDefault ();

      break;

    }

  }

  /* INIT */

  initAttachmentMenu = () => {

    this._makeMenu ( '.attachment', [
      {
        label: 'Open',
        click: () => this.props.container.attachment.openInApp ( this.attachment )
      },
      {
        label: `Reveal in ${is.macos ? 'Finder' : 'Folder'}`,
        click: () => this.props.container.attachment.reveal ( this.attachment )
      },
      {
        type: 'separator'
      },
      {
        label: 'Copy',
        click: () => this.props.container.clipboard.set ( this.attachment.fileName )
      },
      {
        type: 'separator'
      },
      {
        label: 'Rename',
        click: () => Dialog.alert ( 'Simply rename the actual attachment file while El Baton is open' )
      },
      {
        label: 'Delete',
        click: () => this.props.container.note.removeAttachment ( undefined, this.attachment )
      }
    ], this.updateAttachmentMenu );

  }

  initEditorMenu = () => {

    this._makeMenu ( '.monaco-editor', [
      {
        label: 'Cut',
        click: this.props.container.editor.cut
      },
      {
        label: 'Copy',
        click: this.props.container.editor.copy
      },
      {
        label: 'Paste',
        click: this.props.container.editor.paste
      }
    ], this.updateEditorMenu );

  }

  initInputMenu = () => {

    this._makeMenu ( ( x, y ) => this._getItem ( x, y, 'input, textarea' ), [
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { type: 'separator' },
      { role: 'selectAll' }
    ]);

  }

  initNoteMenu = () => {

    this._makeMenu ( '.note', [
      {
        label: 'Open in Default App',
        click: () => this.props.container.note.openInApp ( this.note )
      },
      {
        label: `Reveal in ${is.macos ? 'Finder' : 'Folder'}`,
        click: () => this.props.container.note.reveal ( this.note )
      },
      {
        type: 'separator'
      },
      {
        label: 'New from Template',
        click: () => this.props.container.note.duplicate ( this.note, true )
      },
      {
        label: 'Duplicate',
        click: () => this.props.container.note.duplicate ( this.note )
      },
      {
        type: 'separator'
      },
      {
        label: 'Copy',
        click: () => {
          const title = this.note ? this.props.container.note.getTitle ( this.note ) : path.parse ( $(this.ele).data ( 'filepath' ) ).name; // Maybe we are linking to a non-existent note
          this.props.container.clipboard.set ( title );
        }
      },
      {
        type: 'separator'
      },
      {
        label: 'Favorite',
        click: () => this.props.container.note.toggleFavorite ( this.note, true )
      },
      {
        label: 'Unfavorite',
        click: () => this.props.container.note.toggleFavorite ( this.note, false )
      },
      {
        type: 'separator'
      },
      {
        label: 'Move to Trash',
        click: () => this.props.container.note.toggleDeleted ( this.note, true )
      },
      {
        label: 'Restore',
        click: () => this.props.container.note.toggleDeleted ( this.note, false )
      },
      {
        label: 'Permanently Delete',
        click: () => this.props.container.note.delete ( this.note )
      }
    ], this.updateNoteMenu );

  }

  initNoteTagMenu = () => {

    this._makeMenu ( '.popover-note-tags-list .tag', [
      {
        label: 'Copy',
        click: () => this.props.container.clipboard.set ( this.tag )
      },
      {
        type: 'separator'
      },
      {
        label: 'Remove',
        click: () => this.props.container.note.removeTag ( undefined, this.tag )
      }
    ], this.updateNoteTagMenu );

  }

  initTagMenu = () => {

    this._makeMenu ( '.sidebar .tag, .preview .tag', [
      {
        label: 'Collapse',
        click: () => this.props.container.tag.toggleCollapse ( this.tag, true )
      },
      {
        label: 'Expand',
        click: () => this.props.container.tag.toggleCollapse ( this.tag, false )
      },
      {
        type: 'separator'
      },
      {
        label: 'Copy',
        click: () => this.props.container.clipboard.set ( this.tag )
      }
    ], this.updateTagMenu );

  }

  initTrashMenu = () => {

    this._makeMenu ( '.tag[data-tag="__TRASH__"]', [
      {
        label: 'Empty Trash',
        click: this.props.container.trash.empty
      }
    ], this.updateTrashMenu );

  }

  initFallbackMenu = () => {

    this._makeMenu ( ( x, y ) => !this._getItem ( x, y, '.attachment, .monaco-editor, .note, .popover-note-tags-list .tag, .sidebar .tag, .preview .tag, .tag[data-tag="__TRASH__"]' ) );

  }

  /* UPDATE */

  updateAttachmentMenu = ( items: MenuItemConstructorOptions[] ) => {

    const fileName = $(this.ele).data ( 'filename' );

    this.attachment = this.props.container.attachment.get ( fileName );

  }

  updateEditorMenu = ( items: MenuItemConstructorOptions[] ) => {

    const canCopy = !!this.props.container.editor._getSelectedText (),
          canPaste = !!this.props.container.clipboard.get (),
          context = this.getEditorSpellcheckContext ();

    items.length = 3;
    items[0].enabled = canCopy;
    items[1].enabled = canCopy;
    items[2].enabled = canPaste;

    if ( !context ) return;

    this._editorSpellMarker = context.marker;
    this._editorSpellWord = context.word;
    this._editorSpellSuggestions = context.suggestions;

    const canPersistDictionary = !!this.props.container.appConfig.getFilePath (),
          addDictionaryLabel = canPersistDictionary ? `Add "${context.word}" to Dictionary` : `Add "${context.word}" to Dictionary (Session)`;

    items.push ({ type: 'separator' });

    if ( context.suggestions.length ) {
      context.suggestions.forEach ( suggestion => {
        items.push ({
          label: `Replace with "${suggestion}"`,
          click: () => this.replaceEditorMarkerWord ( suggestion )
        });
      });
    } else {
      items.push ({
        label: 'No suggestions available',
        enabled: false
      });
    }

    items.push ({
      label: addDictionaryLabel,
      click: () => this.addWordToSessionDictionary ()
    });

  }

  updateNoteMenu = ( items: MenuItemConstructorOptions[] ) => {

    const filePath = $(this.ele).data ( 'filepath' );

    this.note = this.props.container.note.get ( filePath );

    const isFavorited = this.props.container.note.isFavorited ( this.note ),
          isDeleted = this.props.container.note.isDeleted ( this.note ),
          isTemplate = !!this.props.container.note.getTags ( this.note, TagSpecials.TEMPLATES ).length;

    items[3].visible = !!isTemplate;
    items[8].visible = !isFavorited;
    items[9].visible = !!isFavorited;
    items[11].visible = !isDeleted;
    items[12].visible = !!isDeleted;

  }

  updateNoteTagMenu = ( items: MenuItemConstructorOptions[] ) => {

    this.tag = $(this.ele).data ( 'tag' );

  }

  updateTagMenu = ( items: MenuItemConstructorOptions[] ) => {

    this.tag = $(this.ele).data ( 'tag' );

    const hasChildren = this.props.container.tag.hasChildren ( this.tag ),
          isCollapsed = hasChildren && this.props.container.tag.isCollapsed ( this.tag ),
          isCopyable = !Tags.isPrivate ( this.tag );

    items[0].visible = hasChildren && !isCollapsed;
    items[1].visible = hasChildren && isCollapsed;
    items[2].visible = hasChildren && isCopyable;
    items[3].visible = isCopyable;

  }

  updateTrashMenu = ( items: MenuItemConstructorOptions[] ) => {

    items[0].enabled = !this.props.container.trash.isEmpty ();

  }

  getEditorSpellcheckContext = (): { marker: monaco.editor.IMarker, word: string, suggestions: string[] } | undefined => {

    const editor = this.props.container.editor.getMonaco ();

    if ( !editor ) return;

    const model = editor.getModel (),
          position = ( editor as any ).spellcheckContextMenuPosition || editor.getPosition ();

    if ( !model || !position ) return;

    const markers = monaco.editor.getModelMarkers ({ owner: 'spellcheck', resource: model.uri }),
          marker = markers.find ( marker => (
            marker.startLineNumber <= position.lineNumber &&
            marker.endLineNumber >= position.lineNumber &&
            ( marker.startLineNumber !== position.lineNumber || marker.startColumn <= position.column ) &&
            ( marker.endLineNumber !== position.lineNumber || marker.endColumn >= position.column )
          ));

    if ( !marker ) return;

    const wordMatch = marker.message.match ( /Possible misspelling:\s*\"([^\"]+)\"/i ),
          word = wordMatch ? wordMatch[1] : model.getValueInRange ( new monaco.Range ( marker.startLineNumber, marker.startColumn, marker.endLineNumber, marker.endColumn ) );

    if ( !word ) return;

    const getSuggestions = editor.spellcheckGetSuggestions,
          suggestions = ( typeof getSuggestions === 'function' ) ? ( getSuggestions ( word ) || [] ) : [];

    return { marker, word, suggestions };

  }

  replaceEditorMarkerWord = ( replacement: string ) => {

    const marker = this._editorSpellMarker,
          editor = this.props.container.editor.getMonaco ();

    if ( !marker || !editor ) return;

    const range = new monaco.Range ( marker.startLineNumber, marker.startColumn, marker.endLineNumber, marker.endColumn );

    editor.executeEdits ( 'spellcheck', [{ range, text: replacement, forceMoveMarkers: true }] );
    editor.focus ();
    editor.spellcheckRescan?.();

  }

  addWordToSessionDictionary = () => {

    const editor = this.props.container.editor.getMonaco (),
          word = this._editorSpellWord;

    if ( !editor || !word ) return;

    editor.spellcheckAddToDictionary?.( word );
    editor.spellcheckRescan?.();

  }

}

/* EXPORT */

export default connect ({
  container: Main,
  shouldComponentUpdate: false
})( ContextMenu );
