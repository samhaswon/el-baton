
/* IMPORT */

import * as React from 'react';
import {connect} from 'overstated';
import Main from '@renderer/containers/main';
import Content from './content';
import Toolbar from './toolbar';
import './sidebar.css';

/* SIDEBAR */

const Sidebar = ({ isFocus, isZen, hasSidebar }) => {

  if ( isFocus || isZen || !hasSidebar ) return null;

  return (
    <div className="sidebar layout column">
      <Toolbar />
      <Content />
    </div>
  );

};

/* EXPORT */

export default connect ({
  container: Main,
  selector: ({ container }) => ({
    isFocus: container.window.isFocus (),
    isZen: container.window.isZen (),
    hasSidebar: container.window.hasSidebar ()
  })
})( Sidebar );
