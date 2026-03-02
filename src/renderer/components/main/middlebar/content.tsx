
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

/* CONTENT */

const Content = ({ isLoading, query, results, openResult }) => {

  if ( isLoading ) return null;

  const rootRef = React.useRef<HTMLDivElement> ( null );

  React.useEffect ( () => {
    if ( !query || !results.length || !rootRef.current ) return;

    const firstRow = rootRef.current.querySelector ( '.list-item' ) as HTMLElement | null;

    if ( !firstRow ) return;

    firstRow.scrollIntoView ({
      block: 'nearest'
    });
  }, [query, results]);

  if ( !results.length ) {
    return (
      <div ref={rootRef} className="tree list list-notes layout-content">
        <div className="label list-item empty">
          <span className="title small">No notes found</span>
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="tree list list-notes layout-content search-results-list">
      <div className="multiple vertical joined">
        {results.map ( result => (
          <div key={result.note.filePath} className="search-result-group">
            <div className="search-result-header list-item button" data-filepath={result.note.filePath} onClick={() => openResult ( result.note, result.snippets[0]?.occurrence || 0 )}>
              <i className="icon xsmall collapser">chevron_down</i>
              <span className="title small">{renderHighlightedText ( result.note.metadata.title, query )}</span>
            </div>
            {result.snippets.map ( ( snippet, index ) => (
              <div key={`${result.note.filePath}:${index}`} className="search-result-row list-item button level-1" data-filepath={result.note.filePath} onClick={() => openResult ( result.note, snippet.occurrence )}>
                <span className="title xsmall">{renderHighlightedText ( snippet.text, query )}</span>
              </div>
            ))}
          </div>
        ) )}
      </div>
    </div>
  );

}

/* EXPORT */

export default connect ({
  container: Main,
  selector: ({ container }) => ({
    isLoading: container.loading.get (),
    query: container.search.getQuery (),
    results: container.search.getResults (),
    openResult: container.search.openResult
  })
})( Content );
