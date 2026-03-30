
/* IMPORT */

import {is} from '@common/electron_util_shim';
import * as _ from 'lodash';
import * as React from 'react';
import Settings from '@common/settings';
import {connect} from 'overstated';
import Main from '@renderer/containers/main';
import Tree from '@renderer/components/main/structures/tree';
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
const explorerSectionsSettingsKey = 'window.explorerSectionsCollapsed';

const getExplorerSectionsCollapsed = (): Record<string, boolean> => {

  const persisted = Settings.get ( explorerSectionsSettingsKey );

  if ( !_.isPlainObject ( persisted ) ) return {};

  return Object.keys ( persisted ).reduce ( ( acc, key ) => {
    acc[key] = !!persisted[key];
    return acc;
  }, {} as Record<string, boolean> );

};

const sortNotes = notes => _.sortBy ( notes, note => ( note.metadata.title || '' ).toLowerCase () );

const getExplorerSearchTokens = ( query: string ): string[] => {

  return query.toLowerCase ().trim ().split ( /\s+/ ).filter ( Boolean );

};

const isExplorerNoteMatch = ( title: string, tokens: string[] ): boolean => {

  if ( !tokens.length ) return false;

  const titleLower = title.toLowerCase ();

  return tokens.every ( token => titleLower.includes ( token ) );

};

const makeNoteNode = ( note, parentPath: string, query: string = '', queryTokens: string[] = [] ) => ({
  kind: 'note',
  key: `note:${parentPath}:${note.filePath}`,
  filePath: note.filePath,
  parentPath,
  searchQuery: parentPath === ALL ? query : '',
  isSearchMatch: parentPath === ALL ? isExplorerNoteMatch ( note.metadata.title || '', queryTokens ) : false
});

const makeTagNode = ( tag, query: string = '', queryTokens: string[] = [] ) => {

  const childTags = Tags.sort ( Object.values ( tag.tags ) ).map ( childTag => makeTagNode ( childTag, '' ) ),
        childNoteIds = new Set<string> ();

  childTags.forEach ( childTag => {
    childTag._allNoteIds.forEach ( noteId => childNoteIds.add ( noteId ) );
  });

  const directNotes = sortNotes ( tag.notes.filter ( note => !childNoteIds.has ( getNoteId ( note ) ) ) ),
        noteNodes = directNotes.map ( note => makeNoteNode ( note, tag.path, query, queryTokens ) ),
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

/* CONTENT */

const Content = ({ isLoading, all, favorites, notebooks, tags, untagged, trash }) => {

  const [query, setQuery] = React.useState ( '' );
  const [explorerSectionsCollapsed, setExplorerSectionsCollapsed] = React.useState<Record<string, boolean>> (() => getExplorerSectionsCollapsed () );
  const toggleSection = React.useCallback ( ( id: string ) => {
    setExplorerSectionsCollapsed ( prev => {
      const next = {
        ...prev,
        [id]: !prev[id]
      };

      Settings.set ( explorerSectionsSettingsKey, next );

      return next;
    });
  }, [] );
  const queryTokens = React.useMemo ( () => getExplorerSearchTokens ( query ), [query] ),
        notesCollapsed = query ? false : !!explorerSectionsCollapsed.notes,
        notebooksCollapsed = !!explorerSectionsCollapsed.notebooks,
        tagsCollapsed = !!explorerSectionsCollapsed.tags;

  const {data, firstMatch} = React.useMemo ( () => {

    if ( isLoading ) return {data: [], firstMatch: undefined};

    const allNode = all ? makeTagNode ( all, query, queryTokens ) : undefined,
          favoritesNode = favorites ? makeTagNode ( favorites ) : undefined,
          untaggedNode = untagged ? makeTagNode ( untagged ) : undefined,
          trashNode = trash ? makeTagNode ( trash ) : undefined,
          notesChildren = [allNode, favoritesNode, untaggedNode, trashNode].filter ( Boolean ),
          notebooksChildren = notebooks ? makeTagNode ( notebooks ).children : [],
          tagsChildren = tags ? makeTagNode ( tags ).children : [],
          firstMatch = allNode?.children?.find ( child => child.kind === 'note' && child.isSearchMatch ),
          data = [
            makeSectionNode ( 'notes', 'Notes', notesChildren, notesCollapsed, () => toggleSection ( 'notes' ) ),
            makeSectionNode ( 'notebooks', 'Notebooks', notebooksChildren, notebooksCollapsed, () => toggleSection ( 'notebooks' ) ),
            makeSectionNode ( 'tags', 'Tags', tagsChildren, tagsCollapsed, () => toggleSection ( 'tags' ) )
          ];

    return {data, firstMatch};

  }, [all, favorites, notebooks, tags, untagged, trash, query, queryTokens, notesCollapsed, notebooksCollapsed, tagsCollapsed, toggleSection]);

  React.useEffect ( () => {
    if ( isLoading || !query || !firstMatch ) return;

    const timeout = setTimeout ( () => {
      $('.list-tags').trigger ( 'scroll-to-item', firstMatch.key );
    }, 0 );

    return () => clearTimeout ( timeout );
  }, [isLoading, query, firstMatch]);

  if ( isLoading ) return null;

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
      <Tree className="list-tags layout-content" data={data} getHeight={getHeight} getItemChildren={getItemChildren} getItemKey={getItemKey} filterItem={filterItem}>{Tag}</Tree>
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
