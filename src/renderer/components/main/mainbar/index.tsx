
/* IMPORT */

import * as React from 'react';
import Content from './content';
import './mainbar.css';

/* MAINBAR */

const Mainbar = ({ panel }) => (
  <div className="mainbar layout column">
    <Content panel={panel} />
  </div>
);

/* EXPORT */

export default Mainbar;
