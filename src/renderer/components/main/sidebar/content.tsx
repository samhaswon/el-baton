
/* IMPORT */

import {is} from '@common/electron_util_shim';
import * as _ from 'lodash';
import * as React from 'react';
import {connect} from 'overstated';
import Main from '@renderer/containers/main';
import FixedTree from '@renderer/components/main/structures/fixed_tree';
import Tags, {TagSpecials} from '@renderer/utils/tags';
import Tag from './tag';

const {ALL, FAVORITES, NOTEBOOKS, TAGS, UNTAGGED, TRASH} = TagSpecials;

/* HELPERS */

const getHeight = () => is.macos ? window.innerHeight - 76 : window.innerHeight - 38, //UGLY: But it gets the job done, quickly
      getItemChildren = ( item ) => {
        if ( item.kind === 'section' ) return item.collapsed ? [] : item.children || [];
        if ( item.kind === 'note' || item.collapsed ) return [];
        return item.children || [];
      },
      getItemKey = item => item.key || item.path || item.filePath,
      filterItem = item => {
        if ( item.kind === 'section' || item.kind === 'note' ) return true;
        if ( [ALL, FAVORITES, UNTAGGED, TRASH].includes ( item.path ) ) return true;
        return !!item.notes.length || !!item.children.length;
      };

const getNoteId = note => `${note.filePath}:${note.checksum}`;

const sortNotes = notes => _.sortBy ( notes, note => ( note.metadata.title || '' ).toLowerCase () );

const getExplorerSearchTokens = ( query: string ): string[] => {

  return query.toLowerCase ().trim ().split ( /\s+/ ).filter ( Boolean );

};

const isExplorerNoteMatch = ( title: string, query: string ): boolean => {

  const tokens = getExplorerSearchTokens ( query );

  if ( !tokens.length ) return false;

  const titleLower = title.toLowerCase ();

  return tokens.every ( token => titleLower.includes ( token ) );

};

const makeNoteNode = ( note, parentPath: string, query: string = '' ) => ({
  kind: 'note',
  key: `note:${parentPath}:${note.filePath}`,
  filePath: note.filePath,
  parentPath,
  searchQuery: parentPath === ALL ? query : '',
  isSearchMatch: parentPath === ALL ? isExplorerNoteMatch ( note.metadata.title || '', query ) : false
});

const makeTagNode = ( tag, query: string = '' ) => {

  const childTags = Tags.sort ( Object.values ( tag.tags ) ).map ( childTag => makeTagNode ( childTag, '' ) ),
        childNoteIds = new Set<string> ();

  childTags.forEach ( childTag => {
    childTag._allNoteIds.forEach ( noteId => childNoteIds.add ( noteId ) );
  });

  const directNotes = sortNotes ( tag.notes.filter ( note => !childNoteIds.has ( getNoteId ( note ) ) ) ),
        noteNodes = directNotes.map ( note => makeNoteNode ( note, tag.path, query ) ),
        allNoteIds = new Set<string> ( tag.notes.map ( getNoteId ) );

  childNoteIds.forEach ( noteId => allNoteIds.add ( noteId ) );

  return {
    ...tag,
    kind: 'tag',
    key: `tag:${tag.path}`,
    collapsed: ( query && tag.path === ALL ) ? false : tag.collapsed,
    hasChildren: !!childTags.length || !!noteNodes.length,
    children: [ ...childTags, ...noteNodes ],
    _allNoteIds: Array.from ( allNoteIds )
  };

};

const makeSectionNode = ( id: string, name: string, allChildren, collapsed: boolean, onToggle ) => ({
  kind: 'section',
  id,
  key: `section:${id}:${collapsed ? '1' : '0'}`,
  collapsed,
  name,
  onToggle,
  children: collapsed ? [] : allChildren
});

const explorerSectionsCollapsed: Record<string, boolean> = {};

/* CONTENT */

const Content = ({ isLoading, all, favorites, notebooks, tags, untagged, trash }) => {

  if ( isLoading ) return null;

  const [query, setQuery] = React.useState ( '' );
  const [, forceUpdate] = React.useReducer ( ( counter: number ) => counter + 1, 0 );
  const toggleSection = React.useCallback ( ( id: string ) => {
    explorerSectionsCollapsed[id] = !explorerSectionsCollapsed[id];
    forceUpdate ();
  }, [] );

  const allNode = all ? makeTagNode ( all, query ) : undefined,
        favoritesNode = favorites ? makeTagNode ( favorites ) : undefined,
        untaggedNode = untagged ? makeTagNode ( untagged ) : undefined,
        trashNode = trash ? makeTagNode ( trash ) : undefined,
        notesChildren = [allNode, favoritesNode, untaggedNode, trashNode].filter ( Boolean ),
        notebooksChildren = notebooks ? makeTagNode ( notebooks ).children : [],
        tagsChildren = tags ? makeTagNode ( tags ).children : [],
        firstMatch = allNode?.children?.find ( child => child.kind === 'note' && child.isSearchMatch );

  let data = [
    makeSectionNode ( 'notes', 'Notes', notesChildren, query ? false : !!explorerSectionsCollapsed.notes, () => toggleSection ( 'notes' ) ),
    makeSectionNode ( 'notebooks', 'Notebooks', notebooksChildren, !!explorerSectionsCollapsed.notebooks, () => toggleSection ( 'notebooks' ) ),
    makeSectionNode ( 'tags', 'Tags', tagsChildren, !!explorerSectionsCollapsed.tags, () => toggleSection ( 'tags' ) )
  ];

  React.useEffect ( () => {
    if ( !query || !firstMatch ) return;

    const timeout = setTimeout ( () => {
      $('.list-tags').trigger ( 'scroll-to-item', firstMatch.key );
    }, 0 );

    return () => clearTimeout ( timeout );
  }, [query, firstMatch]);

  return (
    <>
      <div className="layout-header toolbar sidebar-search">
        <div className="multiple joined no-separators grow search">
          <input type="search" className="bordered grow small" placeholder="Filter titles..." value={query} onChange={event => setQuery ( event.target.value )} />
          <div className="label bordered compact xsmall" title={query ? 'Clear' : 'Search'}>
            {query ? (
              <i className="icon" onClick={() => setQuery ( '' )}>close_circle</i>
            ) : (
              <i className="icon">magnify</i>
            )}
          </div>
        </div>
      </div>
      <FixedTree className="list-tags layout-content" data={data} getHeight={getHeight} getItemChildren={getItemChildren} getItemKey={getItemKey} filterItem={filterItem}>{Tag}</FixedTree>
    </>
  );

};

/* EXPORT */

export default connect ({
  container: Main,
  selector: ({ container }) => ({
    isLoading: container.loading.get (),
    all: container.tag.get ( ALL ),
    favorites: container.tag.get ( FAVORITES ),
    notebooks: container.tag.get ( NOTEBOOKS ),
    tags: container.tag.get ( TAGS ),
    untagged: container.tag.get ( UNTAGGED ),
    trash: container.tag.get ( TRASH )
  })
})( Content );
