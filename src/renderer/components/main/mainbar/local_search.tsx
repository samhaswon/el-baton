/* IMPORT */

import * as React from 'react';
import {connect} from 'overstated';
import Main from '@renderer/containers/main';

/* LOCAL SEARCH */

const LocalSearch = ({ open, query, setQuery, close, previous, next }) => {

  const ref = React.useRef<HTMLInputElement> ( null );

  const onKeyDown = React.useCallback ( event => {
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

  React.useEffect ( () => {
    if ( !open || !ref.current ) return;
    ref.current.focus ();
    ref.current.select ();
  }, [open]);

  if ( !open ) return null;

  return (
    <div className="local-search">
      <div className="multiple joined no-separators search">
        <input ref={ref} type="search" className="bordered grow small" placeholder="Search in note..." value={query} onChange={event => setQuery ( event.target.value )} onKeyDown={onKeyDown} />
        <div className="label bordered compact xsmall" title="Previous (Shift+Enter)" role="button" tabIndex={0} onClick={previous} onKeyDown={event => ( event.key === 'Enter' || event.key === ' ' ) && previous ()}>
          <i className="icon">chevron_up</i>
        </div>
        <div className="label bordered compact xsmall" title="Next (Enter)" role="button" tabIndex={0} onClick={next} onKeyDown={event => ( event.key === 'Enter' || event.key === ' ' ) && next ()}>
          <i className="icon">chevron_down</i>
        </div>
        <div className="label bordered compact xsmall" title="Close (Esc)" role="button" tabIndex={0} onClick={close} onKeyDown={event => ( event.key === 'Enter' || event.key === ' ' ) && close ()}>
          <i className="icon">close_circle</i>
        </div>
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
    setQuery: container.search.setLocalQuery,
    close: () => container.search.setLocalOpen ( false ),
    previous: container.search.localPrevious,
    next: container.search.localNext
  })
})( LocalSearch );
