/* IMPORT */

import * as React from 'react';
import Settings from '@common/settings';
import {connect} from 'overstated';
import Main from '@renderer/containers/main';

/* NOTE TABS */

class NoteTabs extends React.Component<{ note: NoteObj | undefined, notesObj: NotesObj, noteSet: Function, noteNew: Function }, { open: string[] }> {

  state = {
    open: ( Settings.get ( 'editor.openTabs' ) || [] ) as string[]
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
          notesObj = this.props.notesObj;

    this.setState ( prev => {
      let open = prev.open.filter ( filePath => !!notesObj[filePath] );

      if ( note && !open.includes ( note.filePath ) ) {
        open = open.concat ([note.filePath]);
      }

      Settings.set ( 'editor.openTabs', open );

      return {open};
    });

  }

  _closeTab = ( filePath: string, event: React.MouseEvent ) => {

    event.preventDefault ();
    event.stopPropagation ();

    const activeFilePath = this.props.note && this.props.note.filePath,
          currentIndex = this.state.open.indexOf ( filePath );

    if ( currentIndex === -1 ) return;

    const open = this.state.open.filter ( openFilePath => openFilePath !== filePath ),
          nextFilePath = open[currentIndex] || open[currentIndex - 1];

    Settings.set ( 'editor.openTabs', open );
    this.setState ({ open });

    if ( activeFilePath === filePath ) {
      this.props.noteSet ( nextFilePath ? this.props.notesObj[nextFilePath] : undefined, true );
    }

  }

  render () {

    const {note, notesObj, noteSet, noteNew} = this.props,
          activeFilePath = note && note.filePath;

    return (
      <div className="note-tabs layout-header">
        <div className="note-tabs-list">
          {this.state.open.map ( filePath => {
            const tabNote = notesObj[filePath];

            if ( !tabNote ) return null;

            return (
              <div key={filePath} className={`note-tab button ${activeFilePath === filePath ? 'active' : ''}`} onClick={() => noteSet ( tabNote, true )}>
                <span className="note-tab-title xsmall">{tabNote.metadata.title}</span>
                <div className="note-tab-close" onClick={event => this._closeTab ( filePath, event )}>
                  <i className="icon xxsmall">close</i>
                </div>
              </div>
            );
          })}
        </div>
        <div className="note-tab add button" onClick={() => noteNew ()}>
          <i className="icon xsmall">plus</i>
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
