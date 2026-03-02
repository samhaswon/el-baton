
/* IMPORT */

import * as _ from 'lodash';
import * as isShallowEqual from 'is-shallow-equal';
import {Container, autosuspend} from 'overstated';
import Config from '@common/config';

/* SEARCH */

type SearchMode = 'smart' | 'title' | 'content' | 'regex';
type SearchResultSnippet = {
  text: string,
  matchIndex: number,
  matchLength: number,
  occurrence: number
};
type SearchResult = {
  note: NoteObj,
  snippets: SearchResultSnippet[]
};

class Search extends Container<SearchState, MainCTX> {

  /* VARIABLES */

  _prev: { [id: string]: { query?: string, notes?: NoteObj[], state?: { notes: NotesState, sorting: SortingState, tags: TagsState, tag: TagState } } } = {}; // So that multiple subsearches are isolated from each other (middlebar, quick open...)
  _localEditorDecorationIds: string[] = [];
  _localEditorActiveDecorationIds: string[] = [];
  _localEditorMatchIndex: number = -1;
  _localPreviewMatchIndex: number = -1;
  _globalJumpDecorationIds: string[] = [];
  _globalJumpTimeout?: number;
  _globalPreviewJumpNode?: HTMLElement;
  _globalPreviewJumpTimeout?: number;
  _pendingGlobalJump?: {
    filePath: string,
    query: string,
    occurrence: number,
    targets: {
      editor: boolean,
      preview: boolean
    }
  };

  /* STATE */

  state = {
    query: '',
    mode: 'smart' as SearchMode,
    notes: [] as NoteObj[],
    results: [] as SearchResult[],
    localQuery: '',
    localOpen: false,
    localTarget: 'preview' as 'editor' | 'preview'
  };

  /* CONSTRUCTOR */

  constructor () {

    super ();

    autosuspend ( this );

    $.$window.on ( 'preview:rendered', this.__previewRendered );
    window.addEventListener ( 'keydown', this.__keydown, true );

  }

  /* HELPERS */

  __keydown = ( event: KeyboardEvent ) => {

    if ( event.defaultPrevented || event.shiftKey || event.altKey ) return;
    if ( !event.ctrlKey && !event.metaKey ) return;
    if ( event.key.toLowerCase () !== 'f' ) return;

    event.preventDefault ();
    event.stopPropagation ();

    this.focus ();

  }

  __previewRendered = () => {

    this._applyPendingGlobalJump ();

    if ( !this.state.localOpen || this.state.localTarget !== 'preview' ) return;

    this._applyLocalPreviewHighlights ( !this.state.localQuery ? false : this._localPreviewMatchIndex < 0 );

  }

  _isAttachmentMatch = ( attachment: AttachmentObj, query: string ): boolean => {

    return Svelto.Fuzzy.match ( attachment.fileName, query, false ) ;

  }

  _filterAttachmentsByQuery = ( attachments: AttachmentObj[], query: string ): AttachmentObj[] => {

    return attachments.filter ( attachment => this._isAttachmentMatch ( attachment, query ) );

  }

  _getTokens = ( query: string ): string[] => {

    return _.escapeRegExp ( query ).split ( Config.search.tokenizer ).filter ( Boolean );

  }

  _getTokenRegexes = ( query: string ): RegExp[] => {

    return this._getTokens ( query ).map ( token => new RegExp ( token, 'i' ) );

  }

  _getRegex = ( query: string ): RegExp | undefined => {

    if ( !query ) return;

    try {
      return new RegExp ( query, 'i' );
    } catch ( error ) {
      return;
    }

  }

  _isNoteMatch = ( note: NoteObj, mode: SearchMode, query: string, tokensRe: RegExp[], queryRe?: RegExp ): boolean => {

    const content = this.ctx.note.getContent ( note ),
          title = this.ctx.note.getTitle ( note ),
          isTitleMatch = !!query && Svelto.Fuzzy.match ( title, query, false ),
          isContentMatch = !!tokensRe.length && tokensRe.every ( tokenRe => tokenRe.test ( content ) ),
          isRegexMatch = !!queryRe && queryRe.test ( content );

    if ( !query ) return true;

    if ( mode === 'title' ) return isTitleMatch;
    if ( mode === 'content' ) return isContentMatch;
    if ( mode === 'regex' ) return isRegexMatch;

    return isContentMatch || isTitleMatch;

  }

  _filterNotesByQuery = ( notes: NoteObj[], mode: SearchMode, query: string ): NoteObj[] => {

    if ( !query ) return notes;

    const queryRe = mode === 'regex' ? this._getRegex ( query ) : undefined;

    if ( mode === 'regex' && !queryRe ) return [];

    const tokensRe = ( mode === 'content' || mode === 'smart' ) ? this._getTokenRegexes ( query ) : [];

    return notes.filter ( note => this._isNoteMatch ( note, mode, query, tokensRe, queryRe ) );

  }

  _makeSnippet = ( content: string, matchIndex: number, matchLength: number ): string => {

    const context = 44,
          start = Math.max ( 0, matchIndex - context ),
          end = Math.min ( content.length, matchIndex + matchLength + context ),
          prefix = start > 0 ? '…' : '',
          suffix = end < content.length ? '…' : '';

    return `${prefix}${content.slice ( start, end ).replace ( /\s+/g, ' ' ).trim ()}${suffix}`;

  }

  _getFallbackSnippet = ( content: string ): string[] => {

    const normalized = content.replace ( /\s+/g, ' ' ).trim ();

    if ( !normalized ) return [];

    return [normalized.length > 96 ? `${normalized.slice ( 0, 96 ).trim ()}…` : normalized];

  }

  _getPrimaryQueryTerm = ( query: string ): string => {

    return this._getTokens ( query )[0] || query.trim ();

  }

  _getOccurrenceAt = ( content: string, query: string, matchIndex: number ): number => {

    const needle = ( query || '' ).toLowerCase (),
          haystack = ( content || '' ).toLowerCase ();

    if ( !needle ) return 0;

    let occurrence = 0,
        nextIndex = haystack.indexOf ( needle );

    while ( nextIndex >= 0 && nextIndex < matchIndex ) {
      occurrence += 1;
      nextIndex = haystack.indexOf ( needle, nextIndex + needle.length );
    }

    return occurrence;

  }

  _getSnippets = ( content: string, query: string ): SearchResultSnippet[] => {

    const term = this._getPrimaryQueryTerm ( query );

    if ( !term ) return [];

    const pattern = new RegExp ( _.escapeRegExp ( term ), 'ig' ),
          snippets: SearchResultSnippet[] = [],
          seen = new Set<string> ();

    let match;

    while ( ( match = pattern.exec ( content ) ) ) {
      if ( _.isUndefined ( match.index ) ) continue;

      const text = this._makeSnippet ( content, match.index, match[0].length );

      if ( !text || seen.has ( text ) ) continue;

      seen.add ( text );
      snippets.push ({
        text,
        matchIndex: match.index,
        matchLength: match[0].length,
        occurrence: this._getOccurrenceAt ( content, term, match.index )
      });

      if ( snippets.length >= 3 ) break;
    }

    return snippets;

  }

  _clearGlobalEditorJumpHighlight = () => {

    if ( this._globalJumpTimeout ) {
      window.clearTimeout ( this._globalJumpTimeout );
      this._globalJumpTimeout = undefined;
    }

    const editor = this.ctx.editor.getMonaco () as any;

    if ( editor && this._globalJumpDecorationIds.length ) {
      this._globalJumpDecorationIds = editor.deltaDecorations ( this._globalJumpDecorationIds, [] );
    }

    this._globalJumpDecorationIds = [];
  }

  _clearGlobalPreviewJumpHighlight = () => {

    if ( this._globalPreviewJumpTimeout ) {
      window.clearTimeout ( this._globalPreviewJumpTimeout );
      this._globalPreviewJumpTimeout = undefined;
    }

    const marker = this._globalPreviewJumpNode;

    if ( marker?.isConnected ) {
      const parent = marker.parentNode;

      while ( marker.firstChild ) {
        parent?.insertBefore ( marker.firstChild, marker );
      }

      parent?.removeChild ( marker );
      parent?.normalize ();
    }

    this._globalPreviewJumpNode = undefined;

  }

  _clearGlobalJumpHighlights = () => {

    this._clearGlobalEditorJumpHighlight ();
    this._clearGlobalPreviewJumpHighlight ();

  }

  _applyPendingGlobalJump = () => {

    const pending = this._pendingGlobalJump,
          note = this.ctx.note.get ();

    if ( !pending || !note || note.filePath !== pending.filePath || !pending.query ) return;

    if ( pending.targets.editor ) {
      const editor = this.ctx.editor.getMonaco () as any,
            model = editor?.getModel?.();

      if ( editor && model ) {
        const matches = model.findMatches ( pending.query, true, false, false, null, false ),
              match = matches[Math.min ( pending.occurrence, Math.max ( 0, matches.length - 1 ) )];

        if ( match ) {
          this._clearGlobalEditorJumpHighlight ();
          this._globalJumpDecorationIds = editor.deltaDecorations ( this._globalJumpDecorationIds, [{
            range: match.range,
            options: {
              inlineClassName: 'global-search-jump-match'
            }
          }] );
          editor.setSelection?.( match.range );
          editor.revealRangeInCenter?.( match.range );
          this._globalJumpTimeout = window.setTimeout ( this._clearGlobalEditorJumpHighlight, 1000 );
        }

        pending.targets.editor = false;
      }
    }

    if ( pending.targets.preview ) {
      const previewContent = this._getPreviewContentNode ();

      if ( previewContent ) {
        const pattern = new RegExp ( _.escapeRegExp ( pending.query ), 'ig' ),
              walker = document.createTreeWalker ( previewContent, NodeFilter.SHOW_TEXT, {
                acceptNode: ( node: Node ) => {
                  const parentElement = node.parentElement;

                  if ( !parentElement ) return NodeFilter.FILTER_REJECT;
                  if ( !node.nodeValue || !node.nodeValue.trim () ) return NodeFilter.FILTER_REJECT;
                  if ( parentElement.closest ( 'script, style, pre, code, svg, .katex, .mermaid, .local-search-preview-match, .global-search-jump-match' ) ) return NodeFilter.FILTER_REJECT;

                  return NodeFilter.FILTER_ACCEPT;
                }
              } as any ),
              hits: { node: Text, index: number, length: number }[] = [];

        let currentNode;

        while ( ( currentNode = walker.nextNode () ) ) {
          const textNode = currentNode as Text,
                text = textNode.nodeValue || '';

          pattern.lastIndex = 0;

          let match;

          while ( ( match = pattern.exec ( text ) ) ) {
            hits.push ({
              node: textNode,
              index: match.index,
              length: match[0].length
            });
          }
        }

        const hit = hits[Math.min ( pending.occurrence, Math.max ( 0, hits.length - 1 ) )];

        if ( hit ) {
          this._clearGlobalPreviewJumpHighlight ();

          const range = document.createRange ();
          range.setStart ( hit.node, hit.index );
          range.setEnd ( hit.node, hit.index + hit.length );

          const marker = document.createElement ( 'span' );
          marker.className = 'global-search-jump-match';
          range.surroundContents ( marker );
          this._globalPreviewJumpNode = marker;

          marker.scrollIntoView ({
            block: 'center',
            inline: 'nearest'
          });

          this._globalPreviewJumpTimeout = window.setTimeout ( this._clearGlobalPreviewJumpHighlight, 1000 );
        }

        pending.targets.preview = false;
      }
    }

    if ( !pending.targets.editor && !pending.targets.preview ) {
      this._pendingGlobalJump = undefined;
    }

  }

  _searchGlobal = ( notes: NoteObj[], query: string ): SearchResult[] => {

    if ( !query ) return [];

    const tokensRe = this._getTokenRegexes ( query );

    if ( !tokensRe.length ) return [];

    const results = notes.reduce ( ( acc: SearchResult[], note ) => {
      const title = this.ctx.note.getTitle ( note ),
            content = this.ctx.note.getContent ( note ),
            isTitleMatch = tokensRe.every ( tokenRe => tokenRe.test ( title ) ),
            isContentMatch = tokensRe.every ( tokenRe => tokenRe.test ( content ) );

      if ( !isTitleMatch && !isContentMatch ) return acc;

      const snippets = isContentMatch ? this._getSnippets ( content, query ) : this._getFallbackSnippet ( content ).map ( text => ({
        text,
        matchIndex: 0,
        matchLength: 0,
        occurrence: 0
      }) );

      acc.push ({
        note,
        snippets
      });

      return acc;
    }, [] );

    const resultsByPath = _.keyBy ( results, result => result.note.filePath );

    return this.ctx.sorting.sort ( results.map ( result => result.note ) ).map ( note => resultsByPath[note.filePath] ).filter ( Boolean );

  }

  _searchBy = ( notes: NoteObj[], mode: SearchMode, query: string, _prevId: string = 'search' ): NoteObj[] => {

    /* OPTIMIZED SEARCH */ // Filtering/Ordering only the previously filtered notes

    if ( !this._prev[_prevId] ) this._prev[_prevId] = {};

    const prev = this._prev[_prevId],
          prevQuery = prev.query,
          prevNotes = prev.notes,
          prevState = prev.state;

    prev.query = query;
    const state = prev.state = _.pick ( this.ctx.state, ['notes', 'sorting', 'tags', 'tag'] );

    if ( prevNotes && prevState ) {

      if ( query === prevQuery && prevState.notes === state.notes && prevState.tags === state.tags && prevState.tag === state.tag ) { // Simple reordering

        return prev.notes = this.ctx.sorting.sort ( prevNotes );

      } else if ( prevQuery && query.startsWith ( prevQuery ) && isShallowEqual ( prevState, state ) ) { // Sub-search

        return prev.notes = this._filterNotesByQuery ( prevNotes, mode, query );

      }

    }

    /* UNOPTIMIZED SEARCH */

    const notesByQuery = !query ? notes : this._filterNotesByQuery ( notes, mode, query ),
          notesSorted = this.ctx.sorting.sort ( notesByQuery ),
          notesUnique = _.uniq ( notesSorted ); // If a note is in 2 sub-tags and we select a parent tag of both we will get duplicates

    return prev.notes = notesUnique;

  }

  _getLocalSearchRegex = (): RegExp | undefined => {

    const query = ( this.state.localQuery || '' ).trim ();

    if ( !query ) return;

    return new RegExp ( _.escapeRegExp ( query ), 'ig' );

  }

  _clearLocalEditorHighlights = () => {

    const editor = this.ctx.editor.getMonaco () as any;

    if ( !editor ) return;

    if ( this._localEditorDecorationIds.length ) {
      this._localEditorDecorationIds = editor.deltaDecorations ( this._localEditorDecorationIds, [] );
    }

    if ( this._localEditorActiveDecorationIds.length ) {
      this._localEditorActiveDecorationIds = editor.deltaDecorations ( this._localEditorActiveDecorationIds, [] );
    }
  }

  _getEditorMatches = () => {

    const editor = this.ctx.editor.getMonaco () as any,
          model = editor?.getModel?.();

    if ( !editor || !model || !this.state.localQuery ) return [];

    return model.findMatches ( this.state.localQuery, true, false, false, null, false );

  }

  _applyLocalEditorHighlights = ( matches = this._getEditorMatches (), activeIndex: number = this._localEditorMatchIndex ) => {

    const editor = this.ctx.editor.getMonaco () as any;

    if ( !editor ) return;

    this._localEditorDecorationIds = editor.deltaDecorations ( this._localEditorDecorationIds, matches.map ( match => ({
      range: match.range,
      options: {
        inlineClassName: 'local-search-editor-match'
      }
    }) ) );

    const activeMatch = ( activeIndex >= 0 && activeIndex < matches.length ) ? matches[activeIndex] : undefined;

    this._localEditorActiveDecorationIds = editor.deltaDecorations ( this._localEditorActiveDecorationIds, activeMatch ? [{
      range: activeMatch.range,
      options: {
        inlineClassName: 'local-search-editor-match active'
      }
    }] : [] );

  }

  _getPreviewContentNode = (): HTMLElement | undefined => {

    const $preview = $('.mainbar .preview .preview-content');

    if ( !$preview.length ) return;

    return $preview[0] as HTMLElement;

  }

  _clearLocalPreviewHighlights = () => {

    const previewContent = this._getPreviewContentNode ();

    if ( !previewContent ) return;

    const originalHtml = previewContent.dataset.localSearchOriginalHtml;

    if ( _.isUndefined ( originalHtml ) ) return;

    previewContent.innerHTML = originalHtml;
    delete previewContent.dataset.localSearchOriginalHtml;
    this._localPreviewMatchIndex = -1;

  }

  _setActivePreviewMatch = ( index: number, scroll: boolean = true ) => {

    const previewContent = this._getPreviewContentNode ();

    if ( !previewContent ) return;

    const matches = Array.from ( previewContent.querySelectorAll ( '.local-search-preview-match' ) ) as HTMLElement[];

    if ( !matches.length ) {
      this._localPreviewMatchIndex = -1;
      return;
    }

    const safeIndex = ( index + matches.length ) % matches.length;

    matches.forEach ( ( match, matchIndex ) => {
      match.classList.toggle ( 'active', matchIndex === safeIndex );
    });

    this._localPreviewMatchIndex = safeIndex;

    if ( scroll ) {
      matches[safeIndex].scrollIntoView ({
        block: 'center',
        inline: 'nearest'
      });
    }

  }

  _applyLocalPreviewHighlights = ( reset: boolean = false ) => {

    const previewContent = this._getPreviewContentNode (),
          pattern = this._getLocalSearchRegex ();

    if ( !previewContent ) return;

    const existingOriginalHtml = previewContent.dataset.localSearchOriginalHtml;

    if ( !_.isUndefined ( existingOriginalHtml ) ) {
      previewContent.innerHTML = existingOriginalHtml;
    } else {
      previewContent.dataset.localSearchOriginalHtml = previewContent.innerHTML;
    }

    if ( !pattern ) {
      delete previewContent.dataset.localSearchOriginalHtml;
      this._localPreviewMatchIndex = -1;
      return;
    }

    const walker = document.createTreeWalker ( previewContent, NodeFilter.SHOW_TEXT, {
      acceptNode: ( node: Node ) => {
        const parentElement = node.parentElement;

        if ( !parentElement ) return NodeFilter.FILTER_REJECT;
        if ( !node.nodeValue || !node.nodeValue.trim () ) return NodeFilter.FILTER_REJECT;
        if ( parentElement.closest ( 'script, style, pre, code, svg, .katex, .mermaid, .local-search-preview-match' ) ) return NodeFilter.FILTER_REJECT;

        return NodeFilter.FILTER_ACCEPT;
      }
    } as any );

    const textNodes: Text[] = [];

    while ( walker.nextNode () ) {
      textNodes.push ( walker.currentNode as Text );
    }

    textNodes.forEach ( textNode => {
      const text = textNode.nodeValue || '';

      pattern.lastIndex = 0;

      if ( !pattern.test ( text ) ) return;

      pattern.lastIndex = 0;

      const fragment = document.createDocumentFragment ();
      let lastIndex = 0;
      let match;

      while ( ( match = pattern.exec ( text ) ) ) {
        const matchText = match[0],
              matchIndex = match.index;

        if ( matchIndex > lastIndex ) {
          fragment.appendChild ( document.createTextNode ( text.slice ( lastIndex, matchIndex ) ) );
        }

        const span = document.createElement ( 'span' );
        span.className = 'local-search-preview-match';
        span.textContent = matchText;
        fragment.appendChild ( span );

        lastIndex = matchIndex + matchText.length;
      }

      if ( lastIndex < text.length ) {
        fragment.appendChild ( document.createTextNode ( text.slice ( lastIndex ) ) );
      }

      textNode.parentNode?.replaceChild ( fragment, textNode );
    });

    const matches = previewContent.querySelectorAll ( '.local-search-preview-match' );

    if ( !matches.length ) {
      this._localPreviewMatchIndex = -1;
      return;
    }

    const nextIndex = reset || this._localPreviewMatchIndex < 0 ? 0 : this._localPreviewMatchIndex;

    this._setActivePreviewMatch ( nextIndex, true );

  }

  /* API */

  getQuery = (): string => {

    return this.state.query;

  }

  setQuery = async ( query: string ) => {

    await this.setState ({ query });

    return this.update ();

  }

  getMode = (): SearchMode => {

    return this.state.mode;

  }

  setMode = async ( mode: SearchMode ) => {

    await this.setState ({ mode });

    return this.update ();

  }

  focus = () => {

    if ( this.ctx.note.get () ) {
      const monaco = this.ctx.editor.getMonaco () as any,
          selection = monaco?.getSelection?.(),
          model = monaco?.getModel?.(),
          localTarget = ( monaco && ( !this.ctx.editor.isSplit () || this.ctx.editor.hasFocus () ) ) ? 'editor' : 'preview';

      let localQuery = this.state.localQuery;

      if ( !localQuery && selection && model && !selection.isEmpty?.() ) {
        localQuery = model.getValueInRange ( selection );
      }

      this.setState ({
        localOpen: true,
        localQuery,
        localTarget
      }).then ( () => {
        if ( localQuery ) {
          this.localNext ( true );
        } else {
          this._clearLocalEditorHighlights ();
          this._clearLocalPreviewHighlights ();
        }
      });
      return;
    }

    const $input = $('.sidepanel-pane.search .search input[type="search"]');

    if ( !$input.length ) return;

    const input = $input[0];

    if ( !input ) return;

    input.focus ();

  }

  hasFocus = (): boolean => {

    return document.activeElement === $('.sidebar .search input[type="search"], .middlebar .search input[type="search"]')[0];

  }

  clear = () => {

    return this.setQuery ( '' );

  }

  getLocalQuery = (): string => {

    return this.state.localQuery;

  }

  setLocalQuery = async ( localQuery: string ) => {

    await this.setState ({ localQuery });

    this._localEditorMatchIndex = -1;
    this._localPreviewMatchIndex = -1;

    if ( !localQuery ) {
      this._clearLocalEditorHighlights ();
      this._clearLocalPreviewHighlights ();
      return;
    }

    if ( this.state.localTarget === 'editor' ) {
      this._findInEditor ( false, true );
      return;
    }

    this._applyLocalPreviewHighlights ( true );

  }

  isLocalOpen = (): boolean => {

    return this.state.localOpen;

  }

  setLocalOpen = async ( localOpen: boolean ) => {

    await this.setState ({
      localOpen,
      localQuery: localOpen ? this.state.localQuery : '',
      localTarget: localOpen ? this.state.localTarget : 'preview'
    });

    if ( localOpen ) return;

    this._clearLocalEditorHighlights ();
    this._clearLocalPreviewHighlights ();
  }

  localPrevious = () => {

    if ( !this.state.localQuery ) return;

    const shouldUseEditorSearch = this.state.localTarget === 'editor';

    if ( shouldUseEditorSearch ) {
      return this._findInEditor ( true );
    }

    const previewContent = this._getPreviewContentNode (),
          matches = previewContent ? previewContent.querySelectorAll ( '.local-search-preview-match' ) : [];

    if ( matches.length ) {
      const index = this._localPreviewMatchIndex <= 0 ? matches.length - 1 : this._localPreviewMatchIndex - 1;
      this._setActivePreviewMatch ( index, true );
      return;
    }

    this._applyLocalPreviewHighlights ( true );

  }

  localNext = ( reset: boolean = false ) => {

    if ( !this.state.localQuery ) return;

    const shouldUseEditorSearch = this.state.localTarget === 'editor';

    if ( shouldUseEditorSearch ) {
      return this._findInEditor ( false, reset );
    }

    const previewContent = this._getPreviewContentNode (),
          matches = previewContent ? previewContent.querySelectorAll ( '.local-search-preview-match' ) : [];

    if ( matches.length ) {
      const index = reset || this._localPreviewMatchIndex < 0 ? 0 : this._localPreviewMatchIndex + 1;
      this._setActivePreviewMatch ( index, true );
      return;
    }

    this._applyLocalPreviewHighlights ( true );

  }

  _findInEditor = ( backwards: boolean = false, reset: boolean = false ) => {

    const editor = this.ctx.editor.getMonaco () as any,
          model = editor?.getModel?.();

    if ( !editor || !model || !this.state.localQuery ) return;

    const matches = this._getEditorMatches ();

    if ( !matches.length ) {
      this._clearLocalEditorHighlights ();
      this._localEditorMatchIndex = -1;
      return;
    }

    let nextIndex;

    if ( reset || this._localEditorMatchIndex < 0 ) {
      nextIndex = backwards ? matches.length - 1 : 0;
    } else if ( backwards ) {
      nextIndex = ( this._localEditorMatchIndex - 1 + matches.length ) % matches.length;
    } else {
      nextIndex = ( this._localEditorMatchIndex + 1 ) % matches.length;
    }

    const match = matches[nextIndex];

    if ( !match ) return;

    this._localEditorMatchIndex = nextIndex;
    this._applyLocalEditorHighlights ( matches, nextIndex );
    editor.setSelection?.( match.range );
    editor.revealRangeInCenter?.( match.range );

  }

  getNoteIndex = ( note: NoteObj ): number => {

    return this.state.notes.indexOf ( note );

  }

  getNotes = (): NoteObj[] => {

    return this.state.notes;

  }

  getResults = (): SearchResult[] => {

    return this.state.results;

  }

  getResult = ( note: NoteObj | string ): SearchResult | undefined => {

    const filePath = _.isString ( note ) ? note : note.filePath;

    return this.state.results.find ( result => result.note.filePath === filePath );

  }

  setNotes = ( notes: NoteObj[] ) => {

    return this.setState ({ notes });

  }

  openResult = async ( note: NoteObj, occurrence: number = 0 ) => {

    const query = this._getPrimaryQueryTerm ( this.state.query );

    this._pendingGlobalJump = {
      filePath: note.filePath,
      query,
      occurrence,
      targets: {
        editor: this.ctx.editor.isEditing (),
        preview: !this.ctx.editor.isEditing () || this.ctx.editor.isSplit ()
      }
    };

    await this.ctx.note.set ( note, true );

    window.requestAnimationFrame ( this._applyPendingGlobalJump );

  }

  update = async ( prevNoteIndex?: number ) => {

    const query = this.state.query,
          notes = this._searchBy ( this.ctx.tag.getNotes (), 'title', '', 'visible-notes' ),
          results = this._searchGlobal ( Object.values ( this.ctx.notes.get () ), query );

    if ( isShallowEqual ( this.state.notes, notes ) && isShallowEqual ( this.state.results, results ) ) return; // Skipping unnecessary work

    await this.setState ({ notes, results });

    await this.ctx.note.update ( prevNoteIndex );

    await this.ctx.multiEditor.update ();

  }

  navigate = ( modifier: number, wrap: boolean = true ) => {

    const {notes} = this.state,
          note = this.ctx.note.get (),
          index = ( note ? notes.indexOf ( note ) : -1 ) + modifier,
          indexNext = wrap ? ( notes.length + index ) % notes.length : index,
          noteNext = notes[indexNext];

    if ( noteNext ) return this.ctx.note.set ( noteNext, true );

  }

  previous = () => {

    return this.navigate ( -1 );

  }

  next = () => {

    return this.navigate ( 1 );

  }

}

/* EXPORT */

export type {SearchMode, SearchResult};
export default Search;
