
/* IMPORT */

import * as _ from 'lodash';
import * as React from 'react';

/* TOOLBAR BUTTON */

type ToolbarButtonProps = {
  icon?: string;
  title: string;
  onClick?: (...args: any[]) => void;
  isActive?: boolean;
  color?: string;
  className?: string;
  children?: React.ReactNode;
};

const ToolbarButton = ({ icon, title, onClick = _.noop, isActive = false, color = '', className = '', children }: ToolbarButtonProps ) => (
  <div className={`${isActive ? 'active text-accent' : ''} button bordered xsmall ${color} ${className}`} title={title} onClick={onClick}>
    {children || <i className="icon">{icon}</i>}
  </div>
);

/* EXPORT */

export default ToolbarButton;
