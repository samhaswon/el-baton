/* IMPORT */

import * as React from 'react';
import CheatsheetContent from './cheatsheet_content';
import Preview from './preview';

/* CHEATSHEET VIEW */

const CheatsheetView = () => (
  <div className="cheatsheet-view layout column">
    <div className="layout-header toolbar">
      <span className="small">Cheatsheet</span>
    </div>
    <Preview content={CheatsheetContent} enableWorker={false} />
  </div>
);

/* EXPORT */

export default CheatsheetView;
