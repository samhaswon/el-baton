
/* IMPORT */

import * as React from 'react';
import {connect} from 'overstated';
import Main from '@renderer/containers/main';

/* HELPERS */

const renderHighlightedText = ( text: string, query: string ) => {

  const tokens = ( query || '' ).trim ().split ( /\s+/ ).filter ( Boolean );

  if ( !tokens.length ) return text;

  const escaped = tokens.map ( token => token.replace ( /[.*+?^${}()|[\]\\]/g, '\\$&' ) ).join ( '|' ),
        pattern = new RegExp ( `(${escaped})`, 'ig' );

  return text.split ( pattern ).map ( ( part, index ) => index % 2 ? <mark key={index}>{part}</mark> : <React.Fragment key={index}>{part}</React.Fragment> );

};

/* NOTE */

const Note = ({ note, style, title, query, snippets, hasAttachments, isActive, isDeleted, isFavorited, isPinned, isSelected, isMultiEditorEditing, set, toggleNote, toggleNoteRange }) => {

  if ( !note ) return null;

  const onClick = event => Svelto.Keyboard.keystroke.hasCtrlOrCmd ( event ) ? toggleNote ( note ) : ( event.shiftKey ? toggleNoteRange ( note ) : set ( note, true ) );
  const isSearchResult = !!query;

  return (
    <div style={style} className={`note ${!isMultiEditorEditing && isActive ? 'label' : 'button'} ${( isMultiEditorEditing ? isSelected : isActive ) ? 'active' : ''} ${isSearchResult ? 'search-result-item' : ''} list-item`} data-checksum={note.checksum} data-filepath={note.filePath} data-deleted={isDeleted} data-favorited={isFavorited} onClick={onClick}>
      <div className="search-result-body">
        <span className="title small">{renderHighlightedText ( title, query )}</span>
        {!snippets.length ? null : (
          <div className="search-result-snippets">
            {snippets.map ( ( snippet, index ) => (
              <div key={index} className="search-result-snippet xsmall">{renderHighlightedText ( snippet.text, query )}</div>
            ))}
          </div>
        )}
      </div>
      {!hasAttachments ? null : (
        <i className="icon xxsmall">paperclip</i>
      )}
      {!isFavorited ? null : (
        <i className="icon xxsmall">star</i>
      )}
      {!isPinned ? null : (
        <i className="icon xxsmall">pin</i>
      )}
    </div>
  );

};

/* EXPORT */

export default connect ({
  container: Main,
  selector: ({ container, style, item, itemKey }) => {

    const result = item || container.search.getResult ( itemKey ),
          note = result?.note || container.note.get ( itemKey );

    if ( !note ) return {};

    return ({
      note, style,
      title: container.note.getTitle ( note ),
      query: container.search.getQuery (),
      snippets: result?.snippets || [],
      hasAttachments: !!container.note.getAttachments ( note ).length,
      isActive: container.note.get () === note,
      isDeleted: container.note.isDeleted ( note ),
      isFavorited: container.note.isFavorited ( note ),
      isPinned: container.note.isPinned ( note ),
      isSelected: container.multiEditor.isNoteSelected ( note ),
      isMultiEditorEditing: container.multiEditor.isEditing (),
      set: container.note.set,
      toggleNote: container.multiEditor.toggleNote,
      toggleNoteRange: container.multiEditor.toggleNoteRange
    });

  }
})( Note );
