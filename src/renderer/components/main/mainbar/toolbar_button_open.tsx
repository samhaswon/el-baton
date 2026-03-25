
/* IMPORT */

import * as React from 'react';
import {connect} from 'overstated';
import Main from '@renderer/containers/main';
import ToolbarButton from './toolbar_button';

/* TOOLBAR BUTTON OPEN */

const OpenButton = ({ openInApp }) => {
  const [isRendering, setIsRendering] = React.useState<boolean> ( false );

  React.useEffect ( () => {
    const onRenderStart = () => setIsRendering ( true ),
          onRenderStop = () => setIsRendering ( false );

    $.$window.on ( 'preview:render:start', onRenderStart );
    $.$window.on ( 'preview:render:stop', onRenderStop );

    return () => {
      $.$window.off ( 'preview:render:start', onRenderStart );
      $.$window.off ( 'preview:render:stop', onRenderStop );
    };
  }, [] );

  return (
    <>
      <ToolbarButton icon="open_in_new" title="Open in Default App" onClick={() => openInApp ()} />
      <ToolbarButton
        title={isRendering ? 'Rendering preview...' : 'Preview up to date'}
        className={`toolbar-render-status ${isRendering ? 'is-rendering' : 'is-ready'}`}
      >
        <span className="toolbar-render-status-symbol">{isRendering ? '⟳' : '✓'}</span>
      </ToolbarButton>
    </>
  );
};

/* EXPORT */

export default connect ({
  container: Main,
  selector: ({ container }) => ({
    openInApp: container.note.openInApp
  })
})( OpenButton );
