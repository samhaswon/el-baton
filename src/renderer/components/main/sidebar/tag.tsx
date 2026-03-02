
/* IMPORT */

import * as React from 'react';
import {connect} from 'overstated';
import Main from '@renderer/containers/main';

/* HELPERS */

const renderHighlightedText = ( text: string, query: string ) => {

  const tokens = ( query || '' ).trim ().split ( /\s+/ ).filter ( Boolean );

  if ( !tokens.length ) return text;

  const escaped = tokens.map ( token => token.replace ( /[.*+?^${}()|[\]\\]/g, '\\$&' ) ).join ( '|' );
  const pattern = new RegExp ( `(${escaped})`, 'ig' );
  const parts = text.split ( pattern );

  return parts.map ( ( part, index ) => index % 2 ? <mark key={index}>{part}</mark> : <React.Fragment key={index}>{part}</React.Fragment> );

};

/* TAG */

const Tag = ({ style, itemType, sectionName, sectionCollapsed, toggleSection, tag, note, level, hasChildren, isActive, isSelected, isMultiEditorEditing, isFavorited, isPinned, hasAttachments, searchQuery, isSearchMatch, set, toggleNote, toggleNoteRange, toggleCollapse }) => {

  if ( itemType === 'section' ) {

    const onToggle = event => {
      event.stopPropagation ();
      if ( toggleSection ) toggleSection ();
    };

    return (
      <div style={style} className={`explorer-section button list-item ${sectionCollapsed ? 'collapsed' : ''}`} onClick={onToggle}>
        <i className={`icon xsmall collapser ${sectionCollapsed ? 'rotate--90' : ''}`}>chevron_down</i>
        <span className="title small">{sectionName}</span>
      </div>
    );
  }

  if ( itemType === 'note' ) {

    if ( !note ) return null;

    const onClick = event => Svelto.Keyboard.keystroke.hasCtrlOrCmd ( event ) ? toggleNote ( note ) : ( event.shiftKey ? toggleNoteRange ( note ) : set ( note, true ) );

    return (
      <div style={style} className={`explorer-note note ${!isMultiEditorEditing && isActive ? 'label' : 'button'} ${( isMultiEditorEditing ? isSelected : isActive ) ? 'active' : ''} ${isSearchMatch ? 'search-match' : ''} level-${level} list-item`} data-checksum={note.checksum} data-filepath={note.filePath} onClick={onClick}>
        <span className="title small">{isSearchMatch ? renderHighlightedText ( note.metadata.title, searchQuery ) : note.metadata.title}</span>
        {!hasAttachments ? null : <i className="icon xxsmall">paperclip</i>}
        {!isFavorited ? null : <i className="icon xxsmall">star</i>}
        {!isPinned ? null : <i className="icon xxsmall">pin</i>}
      </div>
    );

  }

  if ( !tag ) return null;

  const {name, path, collapsed} = tag,
        onClick = () => {
          if ( hasChildren ) {
            toggleCollapse ( path );
            return;
          }
          if ( isActive ) return;
          set ( path );
        },
        onCollapserClick = ( e: React.MouseEvent ) => {
          e.stopPropagation ();
          if ( !hasChildren ) return;
          toggleCollapse ( path );
        };

  return (
    <div style={style} className={`tag ${isActive ? 'active' : ''} level-${level} button list-item`} data-tag={path} data-has-children={hasChildren} data-collapsed={collapsed} onClick={onClick}>
      {hasChildren || collapsed ? <i className={`icon xsmall collapser ${collapsed ? 'rotate--90' : ''}`} onClick={onCollapserClick}>chevron_down</i> : <i className="icon xsmall">invisible</i>}
      <span className="title small">{name}</span>
    </div>
  );

};

/* EXPORT */

export default connect ({
  container: Main,
  selector: ({ container, style, item, itemKey, level }) => {

    if ( item.kind === 'section' ) {
      return {
        itemType: 'section',
        sectionCollapsed: !!item.collapsed,
        sectionName: item.name,
        toggleSection: item.onToggle,
        style
      };
    }

    if ( item.kind === 'note' ) {
      const note = container.note.get ( item.filePath );

      return ({
        itemType: 'note',
        note,
        style,
        level,
        searchQuery: item.searchQuery || '',
        isSearchMatch: !!item.isSearchMatch,
        isActive: container.note.get () === note,
        isFavorited: container.note.isFavorited ( note ),
        hasAttachments: !!container.note.getAttachments ( note ).length,
        isPinned: container.note.isPinned ( note ),
        isSelected: container.multiEditor.isNoteSelected ( note ),
        isMultiEditorEditing: container.multiEditor.isEditing (),
        set: container.note.set,
        toggleNote: container.multiEditor.toggleNote,
        toggleNoteRange: container.multiEditor.toggleNoteRange
      });
    }

    const tag = item.kind === 'tag' ? item : container.tag.get ( itemKey );

    if ( !tag ) return {};

    const hasTagChildren = !!item.hasChildren || !!item.children?.length || !!Object.keys ( tag.tags || {} ).length || !!tag.notes.length;

    return ({
      itemType: 'tag',
      tag, style, level,
      hasChildren: hasTagChildren,
      isActive: container.tag.get ()?.path === tag.path,
      set: container.tag.set,
      toggleCollapse: container.tag.toggleCollapse
    });

  }
})( Tag );
