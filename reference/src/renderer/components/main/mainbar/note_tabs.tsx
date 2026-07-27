/* IMPORT */

import * as React from 'react';
import {ensureOpenTab, removeOpenTab, reorderOpenTabs} from '@common/editor_tabs';
import Settings from '@common/settings';
import {connect} from 'overstated';
import Main from '@renderer/containers/main';

/* NOTE TABS */

class NoteTabs extends React.Component<{ note: NoteObj | undefined, notesObj: NotesObj, noteSet: Function, noteNew: Function }, { draggedFilePath?: string, dropTargetFilePath?: string, dropTargetPosition?: 'before' | 'after' }> {

  state = {
    draggedFilePath: undefined,
    dropTargetFilePath: undefined,
    dropTargetPosition: undefined
  };

  componentDidMount () {

    this._syncOpenTabs ();

  }

  componentDidUpdate ( prevProps ) {

    if ( prevProps.note !== this.props.note || prevProps.notesObj !== this.props.notesObj ) {
      this._syncOpenTabs ();
    }

  }

  _syncOpenTabs = () => {

    const note = this.props.note,
          notesObj = this.props.notesObj,
          open = ensureOpenTab ( Settings.get ( 'editor.openTabs' ) || [], note?.filePath ).filter ( filePath => !!notesObj[filePath] );

    Settings.set ( 'editor.openTabs', open );

  }

  _getOpenTabs = (): string[] => {

    return ensureOpenTab ( Settings.get ( 'editor.openTabs' ) || [], this.props.note?.filePath )
      .filter ( filePath => !!this.props.notesObj[filePath] );

  }

  _closeTab = ( filePath: string, event: React.MouseEvent ) => {

    event.preventDefault ();
    event.stopPropagation ();

    const activeFilePath = this.props.note && this.props.note.filePath,
          openTabs = this._getOpenTabs (),
          currentIndex = openTabs.indexOf ( filePath );

    if ( currentIndex === -1 ) return;

    const open = removeOpenTab ( openTabs, filePath ),
          nextFilePath = open[currentIndex] || open[currentIndex - 1];

    Settings.set ( 'editor.openTabs', open );
    this.forceUpdate ();

    if ( activeFilePath === filePath ) {
      this.props.noteSet ( nextFilePath ? this.props.notesObj[nextFilePath] : undefined, true );
    }

  }

  _onDragStart = ( filePath: string, event: React.DragEvent ) => {

    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData ( 'text/plain', filePath );

    this.setState ({
      draggedFilePath: filePath,
      dropTargetFilePath: undefined,
      dropTargetPosition: undefined
    });

  }

  _onDragOver = ( filePath: string, event: React.DragEvent ) => {

    const {draggedFilePath} = this.state;

    if ( !draggedFilePath || draggedFilePath === filePath ) return;

    event.preventDefault ();

    const {left, width} = event.currentTarget.getBoundingClientRect (),
          dropTargetPosition = ( event.clientX - left ) > ( width / 2 ) ? 'after' : 'before';

    if ( this.state.dropTargetFilePath === filePath && this.state.dropTargetPosition === dropTargetPosition ) return;

    this.setState ({
      dropTargetFilePath: filePath,
      dropTargetPosition
    });

  }

  _onDrop = ( filePath: string, event: React.DragEvent ) => {

    const {draggedFilePath, dropTargetPosition} = this.state;

    if ( !draggedFilePath || draggedFilePath === filePath ) return this._clearDragState ();

    event.preventDefault ();

    const openTabs = this._getOpenTabs (),
          reordered = reorderOpenTabs ( openTabs, draggedFilePath, filePath, dropTargetPosition || 'before' );

    Settings.set ( 'editor.openTabs', reordered );

    this.setState ({
      draggedFilePath: undefined,
      dropTargetFilePath: undefined,
      dropTargetPosition: undefined
    });

  }

  _clearDragState = () => {

    if ( !this.state.draggedFilePath && !this.state.dropTargetFilePath && !this.state.dropTargetPosition ) return;

    this.setState ({
      draggedFilePath: undefined,
      dropTargetFilePath: undefined,
      dropTargetPosition: undefined
    });

  }

  render () {

    const {note, notesObj, noteSet, noteNew} = this.props,
          activeFilePath = note && note.filePath,
          openTabs = this._getOpenTabs ();

    return (
      <div className="note-tabs layout-header">
        <div className="note-tabs-list">
          {openTabs.map ( filePath => {
            const tabNote = notesObj[filePath];

            if ( !tabNote ) return null;

            const isDropTarget = this.state.draggedFilePath && this.state.dropTargetFilePath === filePath,
                  dropPositionClass = isDropTarget ? `drag-over-${this.state.dropTargetPosition}` : '';

            return (
              <div
                key={filePath}
                draggable={true}
                className={`note-tab button ${activeFilePath === filePath ? 'active' : ''} ${dropPositionClass}`}
                onClick={() => noteSet ( tabNote, true )}
                onDragStart={event => this._onDragStart ( filePath, event )}
                onDragOver={event => this._onDragOver ( filePath, event )}
                onDrop={event => this._onDrop ( filePath, event )}
                onDragEnd={this._clearDragState}
                onDragLeave={event => {
                  if ( event.currentTarget.contains ( event.relatedTarget as Node | null ) ) return;
                  if ( this.state.dropTargetFilePath !== filePath ) return;
                  this.setState ({ dropTargetFilePath: undefined, dropTargetPosition: undefined });
                }}
              >
                <span className="note-tab-title xsmall">{tabNote.metadata.title}</span>
                <div className="note-tab-close" onClick={event => this._closeTab ( filePath, event )}>
                  <i className="icon xxsmall">close</i>
                </div>
              </div>
            );
          })}
          <div className="note-tab add button" onClick={() => noteNew ()}>
            <i className="icon xsmall">plus</i>
          </div>
        </div>
      </div>
    );

  }

}

/* EXPORT */

export default connect ({
  container: Main,
  selector: ({ container }) => ({
    note: container.note.get (),
    noteNew: container.note.new,
    notesObj: container.notes.get (),
    noteSet: container.note.set
  })
})( NoteTabs );
