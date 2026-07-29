
/* IMPORT */

import * as React from 'react';
import {is} from '@common/electron_util_shim';

/* HEADER */

const Header = () => {

  if ( !is.macos ) return null;

  return (
    <div className="layout-header titlebar">
      <span className="title">Select Data Directory</span>
    </div>
  );

};

/* EXPORT */

export default Header;
