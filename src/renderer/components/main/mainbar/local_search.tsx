/* IMPORT */

import * as React from 'react';
import {connect} from 'overstated';
import Main from '@renderer/containers/main';

/* LOCAL SEARCH */

const LocalSearch = ({ open, query, setQuery, regex, setRegex, replaceQuery, setReplaceQuery, target, close, previous, next, replace, replaceAll }) => {

  const ref = React.useRef<HTMLInputElement> ( null );

  const onSearchKeyDown = React.useCallback ( event => {
    if ( event.key === 'Enter' ) {
      event.preventDefault ();
      return event.shiftKey ? previous () : next ();
    }

    if ( event.key === 'F3' ) {
      event.preventDefault ();
      return event.shiftKey ? previous () : next ();
    }

    if ( event.key === 'Escape' ) {
      event.preventDefault ();
      close ();
    }
  }, [close, next, previous] );

  const onReplaceKeyDown = React.useCallback ( event => {
    if ( event.key === 'Enter' ) {
      event.preventDefault ();
      return event.shiftKey ? replaceAll () : replace ();
    }

    if ( event.key === 'Escape' ) {
      event.preventDefault ();
      close ();
    }
  }, [close, replace, replaceAll] );

  React.useEffect ( () => {
    if ( !open || !ref.current ) return;
    ref.current.focus ();
    ref.current.select ();
  }, [open]);

  if ( !open ) return null;

  return (
    <div className="local-search">
      <div className="local-search-panel multiple vertical joined no-separators">
        <div className="multiple joined no-separators search local-search-row">
          <input ref={ref} type="search" className="bordered grow small" style={{ marginTop: 0, marginBottom: 0 }} placeholder="Search in note..." value={query} onChange={event => setQuery ( event.target.value )} onKeyDown={onSearchKeyDown} />
          <div className={`label bordered compact xsmall local-search-regex ${regex ? 'active' : ''}`} title="Regex search" role="button" tabIndex={0} onClick={() => setRegex ( !regex )} onKeyDown={event => ( event.key === 'Enter' || event.key === ' ' ) && setRegex ( !regex )}>
            .*
          </div>
          <div className="label bordered compact xsmall local-search-nav-button" title="Previous (Shift+Enter)" role="button" tabIndex={0} onClick={previous} onKeyDown={event => ( event.key === 'Enter' || event.key === ' ' ) && previous ()}>
            &uarr;
          </div>
          <div className="label bordered compact xsmall local-search-nav-button" title="Next (Enter)" role="button" tabIndex={0} onClick={next} onKeyDown={event => ( event.key === 'Enter' || event.key === ' ' ) && next ()}>
            &darr;
          </div>
          <div className="label bordered compact xsmall" title="Close (Esc)" role="button" tabIndex={0} onClick={close} onKeyDown={event => ( event.key === 'Enter' || event.key === ' ' ) && close ()}>
            <i className="icon">close_circle</i>
          </div>
        </div>
        {target === 'editor' && (
          <div className="multiple joined no-separators search local-search-row">
            <input type="search" className="bordered grow small" style={{ marginTop: 0, marginBottom: 0 }} placeholder="Replace..." value={replaceQuery} onChange={event => setReplaceQuery ( event.target.value )} onKeyDown={onReplaceKeyDown} />
            <div className="label bordered compact xsmall local-search-replace-action" title="Replace (Enter)" role="button" tabIndex={0} onClick={replace} onKeyDown={event => ( event.key === 'Enter' || event.key === ' ' ) && replace ()}>
              Replace
            </div>
            <div className="label bordered compact xsmall local-search-replace-action" title="Replace all (Shift+Enter)" role="button" tabIndex={0} onClick={replaceAll} onKeyDown={event => ( event.key === 'Enter' || event.key === ' ' ) && replaceAll ()}>
              All
            </div>
          </div>
        )}
      </div>
    </div>
  );

};

/* EXPORT */

export default connect ({
  container: Main,
  selector: ({ container }) => ({
    open: container.search.isLocalOpen (),
    query: container.search.getLocalQuery (),
    regex: container.search.getLocalRegex (),
    replaceQuery: container.search.getLocalReplaceQuery (),
    target: container.search.getLocalTarget (),
    setQuery: container.search.setLocalQuery,
    setRegex: container.search.setLocalRegex,
    setReplaceQuery: container.search.setLocalReplaceQuery,
    close: () => container.search.setLocalOpen ( false ),
    previous: container.search.localPrevious,
    next: container.search.localNext,
    replace: container.search.localReplace,
    replaceAll: container.search.localReplaceAll
  })
})( LocalSearch );
