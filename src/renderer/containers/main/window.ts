
/* IMPORT */

import {ipcRenderer as ipc} from 'electron';
import {Container, autosuspend} from 'overstated';
import Settings from '@common/settings';

/* WINDOW */

const remote = require ( '@electron/remote' );

class Window extends Container<WindowState, MainCTX> {

  _batteryMonitoringInitialized: boolean = false;
  _batteryManager?: {
    charging: boolean,
    addEventListener: ( type: string, handler: () => void ) => void,
    removeEventListener: ( type: string, handler: () => void ) => void
  };
  _batteryManagerUpdateHandler?: () => void;

  /* STATE */

  state = {
    focus: false,
    fullscreen: remote.getCurrentWindow ().isFullScreen (),
    sidebar: Settings.get ( 'window.sidebar' ),
    zen: Settings.get ( 'window.zen' ),
    mainPowerMonitorSupported: false,
    mainOnBatteryPower: false,
    browserBatterySupported: false,
    browserOnBatteryPower: false
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

  setPowerStateFromMain = ( payload?: { isSupported?: boolean, isOnBatteryPower?: boolean } ) => {

    const mainPowerMonitorSupported = !!payload?.isSupported,
          mainOnBatteryPower = !!payload?.isOnBatteryPower;

    return this.setState ({
      mainPowerMonitorSupported,
      mainOnBatteryPower
    });

  }

  setPowerStateFromBrowser = ( onBatteryPower: boolean ) => {

    return this.setState ({
      browserBatterySupported: true,
      browserOnBatteryPower: !!onBatteryPower
    });

  }

  initBrowserBatteryMonitoring = () => {

    if ( typeof navigator === 'undefined' ) return;

    const getBattery = ( navigator as any ).getBattery;

    if ( typeof getBattery !== 'function' ) return;

    Promise.resolve ( getBattery.call ( navigator ) ).then ( manager => {

      if ( !manager ) return;

      const update = () => {
        this.setPowerStateFromBrowser ( !manager.charging );
      };

      this._batteryManager = manager;
      this._batteryManagerUpdateHandler = update;
      update ();

      manager.addEventListener?.( 'chargingchange', update );
      manager.addEventListener?.( 'levelchange', update );

    }).catch (() => {
      /* Browser battery API unavailable or blocked */
    });

  }

  initBatteryMonitoring = () => {

    if ( this._batteryMonitoringInitialized ) return;

    this._batteryMonitoringInitialized = true;

    ipc.send ( 'power-monitor-state-request' );
    this.initBrowserBatteryMonitoring ();

  }

  disposeBatteryMonitoring = () => {

    if ( this._batteryManager && this._batteryManagerUpdateHandler ) {
      this._batteryManager.removeEventListener?.( 'chargingchange', this._batteryManagerUpdateHandler );
      this._batteryManager.removeEventListener?.( 'levelchange', this._batteryManagerUpdateHandler );
    }

    delete this._batteryManager;
    delete this._batteryManagerUpdateHandler;
    this._batteryMonitoringInitialized = false;

  }

  hasBatteryPowerDetection = (): boolean => {

    return this.state.mainPowerMonitorSupported || this.state.browserBatterySupported;

  }

  isOnBatteryPower = (): boolean => {

    if ( this.state.mainPowerMonitorSupported ) return this.state.mainOnBatteryPower;

    if ( this.state.browserBatterySupported ) return this.state.browserOnBatteryPower;

    return false;

  }

  isBatteryModeActive = (): boolean => {

    const batteryConfig = this.ctx.appConfig.get ().battery;

    if ( batteryConfig.enabled ) return true;

    if ( !batteryConfig.autoDetect ) return false;

    return this.isOnBatteryPower ();

  }

  getBatteryTargetFps = (): number => {

    const targetFps = this.ctx.appConfig.get ().battery.targetFps;

    if ( targetFps === 5 || targetFps === 10 || targetFps === 15 || targetFps === 20 || targetFps === 30 || targetFps === 60 ) return targetFps;

    return 30;

  }

  getEffectiveFrameRate = (): number => {

    return this.isBatteryModeActive () ? this.getBatteryTargetFps () : 60;

  }

  getBatteryRenderDelayMs = (): number => {

    const batteryConfig = this.ctx.appConfig.get ().battery;

    if ( !this.isBatteryModeActive () || !batteryConfig.optimizeRendering ) return 0;

    return Math.max ( 0, Math.min ( 5000, Number ( batteryConfig.renderDelayMs ) || 0 ) );

  }

  isBatterySpellcheckDisabled = (): boolean => {

    const batteryConfig = this.ctx.appConfig.get ().battery;

    return this.isBatteryModeActive () && batteryConfig.disableSpellcheck;

  }

  isBatteryAutocompleteDisabled = (): boolean => {

    const batteryConfig = this.ctx.appConfig.get ().battery;

    return this.isBatteryModeActive () && batteryConfig.disableAutocomplete;

  }

  isBatteryAnimationsDisabled = (): boolean => {

    const batteryConfig = this.ctx.appConfig.get ().battery;

    return this.isBatteryModeActive () && batteryConfig.disableAnimations;

  }

}

/* EXPORT */

export default Window;
