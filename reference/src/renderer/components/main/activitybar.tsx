/* IMPORT */

import * as React from 'react';
import styles from './activitybar.module.css';

/* ACTIVITYBAR */

const tabsTop = [
  { id: 'explorer', icon: 'notebook', title: 'Explorer' },
  { id: 'search', icon: 'magnify', title: 'Global Search' },
  { id: 'graph', icon: 'tag_multiple', title: 'Graph' },
  { id: 'info', icon: 'info', title: 'Info' }
];

const tabsBottom = [
  { id: 'help', icon: 'note', title: 'Cheatsheets' },
  { id: 'settings', icon: '⚙', title: 'Settings' }
];

const cx = ( ...values: Array<string | false | null | undefined> ) => values.filter ( Boolean ).join ( ' ' );

const Activitybar = ({ panel, setPanel }) => (
  <div className={cx ( 'activitybar', styles.activitybar, 'layout column' )}>
    <div className={cx ( 'activitybar-top', styles.activitybarTop )}>
      {tabsTop.map ( tab => (
        <div key={tab.id} className={cx ( 'activitybar-item', 'button', panel === tab.id && 'active', styles.activitybarItem, panel === tab.id && styles.active )} title={tab.title} onClick={() => setPanel ( tab.id )}>
          <i className="icon small">{tab.icon}</i>
        </div>
      ))}
    </div>
    <div className="spacer"></div>
    <div className={cx ( 'activitybar-bottom', styles.activitybarBottom )}>
      {tabsBottom.map ( tab => (
        <div key={tab.id} className={cx ( 'activitybar-item', 'button', panel === tab.id && 'active', styles.activitybarItem, panel === tab.id && styles.active )} title={tab.title} onClick={() => setPanel ( tab.id )}>
          {tab.id === 'settings' ? <span className={cx ( 'activitybar-gear', styles.activitybarGear, 'small' )}>{tab.icon}</span> : <i className="icon small">{tab.icon}</i>}
        </div>
      ))}
    </div>
  </div>
);

/* EXPORT */

export default Activitybar;
