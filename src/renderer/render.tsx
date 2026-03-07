
/* IMPORT */

import * as React from 'react';
import {createRoot, Root} from 'react-dom/client';
import {Router} from 'react-router-static';
import {Provider} from 'overstated';
import '@static/css/notable.min.css';
import '@static/javascript/notable.min.js';
import Routes from './routes';
import ErrorBoundary from './components/error_boundary';

/* RENDER */

const ROOT_KEY = '__el_baton_react_root__';

async function render () {

  const rootElement = document.getElementsByClassName ( 'app' )[0] as HTMLElement | undefined;

  if ( !rootElement ) return;

  const globalWindow = window as unknown as Window & Record<string, Root | undefined>;
  const root = globalWindow[ROOT_KEY] || ( globalWindow[ROOT_KEY] = createRoot ( rootElement ) );

  root.render (
    <>
      <Provider>
        <ErrorBoundary>
          <Router routes={Routes} />
        </ErrorBoundary>
      </Provider>
    </>,
  );

}

/* EXPORT */

export default render;
