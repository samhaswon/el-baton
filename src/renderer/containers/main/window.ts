
/* IMPORT */

import {Container, autosuspend} from 'overstated';
import Settings from '@common/settings';

/* WINDOW */

const remote = require ( '@electron/remote' );

class Window extends Container<WindowState, MainCTX> {

  /* STATE */

  state = {
    focus: false,
    fullscreen: remote.getCurrentWindow ().isFullScreen (),
    sidebar: Settings.get ( 'window.sidebar' ),
    zen: Settings.get ( 'window.zen' )
  };

  /* CONSTRUCTOR */

  constructor () {

    super ();

    autosuspend ( this );

  }

  /* API */

  isFullscreen = (): boolean => {

    return this.state.fullscreen;

  }

  toggleFullscreen = ( fullscreen: boolean = !this.state.fullscreen ) => {

    return this.setState ({ fullscreen });

  }

  isFocus = (): boolean => {

    return this.state.focus;

  }

  toggleFocus = ( focus: boolean = !this.state.focus ) => {

    return this.setState ({ focus });

  }

  isZen = (): boolean => {

    return this.state.zen;

  }

  toggleZen = ( zen: boolean = !this.state.zen ) => {

    Settings.set ( 'window.zen', zen );

    return this.setState ({ zen });

  }

  hasSidebar = (): boolean => {

    return this.state.sidebar;

  }

  toggleSidebar = ( sidebar: boolean = !this.state.sidebar ) => {

    Settings.set ( 'window.sidebar', sidebar );

    return this.setState ({ sidebar });

  }

}

/* EXPORT */

export default Window;
