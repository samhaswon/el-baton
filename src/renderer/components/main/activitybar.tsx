/* IMPORT */

import * as React from 'react';

/* ACTIVITYBAR */

const tabsTop = [
  { id: 'explorer', icon: 'notebook', title: 'Explorer' },
  { id: 'search', icon: 'magnify', title: 'Global Search' },
  { id: 'graph', icon: 'tag_multiple', title: 'Graph' },
  { id: 'info', icon: 'note', title: 'Info' }
];

const tabsBottom = [
  { id: 'help', icon: 'note', title: 'Cheatsheets' },
  { id: 'settings', icon: 'tag', title: 'Settings' }
];

const Activitybar = ({ panel, setPanel }) => (
  <div className="activitybar layout column">
    <div className="activitybar-top">
      {tabsTop.map ( tab => (
        <div key={tab.id} className={`activitybar-item button ${panel === tab.id ? 'active' : ''}`} title={tab.title} onClick={() => setPanel ( tab.id )}>
          <i className="icon small">{tab.icon}</i>
        </div>
      ))}
    </div>
    <div className="spacer"></div>
    <div className="activitybar-bottom">
      {tabsBottom.map ( tab => (
        <div key={tab.id} className={`activitybar-item button ${panel === tab.id ? 'active' : ''}`} title={tab.title} onClick={() => setPanel ( tab.id )}>
          <i className="icon small">{tab.icon}</i>
        </div>
      ))}
    </div>
  </div>
);

/* EXPORT */

export default Activitybar;
