
/* IMPORT */

import {is} from '@common/electron_util_shim';
import * as React from 'react';
import {connect} from 'overstated';
import Main from '@renderer/containers/main';
import NewButton from './toolbar_button_new';

/* TOOLBAR */

const Toolbar = ({ isFullscreen, hasSidebar }) => (
  <div className="layout-header toolbar">
    <div className="multiple grow">
      {isFullscreen || hasSidebar || !is.macos ? null : (
        <div className="toolbar-semaphore-spacer"></div>
      )}
      <div className="spacer"></div>
      <NewButton />
    </div>
  </div>
);

/* EXPORT */

export default connect ({
  container: Main,
  selector: ({ container }) => ({
    isFullscreen: container.window.isFullscreen (),
    hasSidebar: container.window.hasSidebar ()
  })
})( Toolbar );
