
/* IMPORT */

import {ipcRenderer as ipc, webFrame} from 'electron';
import {is} from '@common/electron_util_shim';
import {connect} from 'overstated';
import {Component} from 'react-component-renderless';
import Main from '@renderer/containers/main';

/* GLOBAL PLUGINS */

class GlobalPlugins extends Component<{ container: IMain, config: import ( '@common/global_config' ).GlobalConfigShape, frameRateCap: number }, {}> {

  /* VARIABLES */

  _updaterTimeout?: NodeJS.Timeout;
  _updaterInterval?: NodeJS.Timeout;
  _blockPrimarySelectionPasteUntil = 0;
  _lastAppliedFrameRate?: number;

  /* SPECIAL */

  componentDidMount () {

    $.$document.on ( 'click', '.quick-panel .list-item', this.__quickPanelClick );
    this._syncAutoupdate ();
    this._syncMiddleClickPaste ();
    this._syncFrameRate ();

  }

  componentDidUpdate ( prevProps ) {

    if ( prevProps.config === this.props.config && prevProps.frameRateCap === this.props.frameRateCap ) return;

    this._syncAutoupdate ();
    this._syncMiddleClickPaste ();
    this._syncFrameRate ();

  }

  componentWillUnmount () {

    if ( this._updaterTimeout ) clearTimeout ( this._updaterTimeout );
    if ( this._updaterInterval ) clearInterval ( this._updaterInterval );

    $.$document.off ( 'click', this.__quickPanelClick );
    this._unbindMiddleClickPaste ();
    this._syncFrameRate ( 60 );

  }

  /* HANDLERS */

  _syncAutoupdate = () => {

    if ( this._updaterTimeout ) clearTimeout ( this._updaterTimeout );
    if ( this._updaterInterval ) clearInterval ( this._updaterInterval );

    delete this._updaterTimeout;
    delete this._updaterInterval;

    if ( !this.props.config.autoupdate ) return;

    this._updaterTimeout = setTimeout ( this.__updaterCheck, 1000 );
    this._updaterInterval = setInterval ( this.__updaterCheck, 86400000 );

  }

  _unbindMiddleClickPaste = () => {

    document.removeEventListener ( 'pointerdown', this.__middleClickPasteAttemptCapture, true );
    document.removeEventListener ( 'mousedown', this.__middleClickPasteAttemptCapture, true );
    document.removeEventListener ( 'mouseup', this.__middleClickPasteAttemptCapture, true );
    document.removeEventListener ( 'auxclick', this.__middleClickPasteAttemptCapture, true );
    document.removeEventListener ( 'paste', this.__middleClickPasteAttemptCapture, true );
    document.removeEventListener ( 'beforeinput', this.__middleClickPasteAttemptCapture as EventListener, true );

  }

  _syncMiddleClickPaste = () => {

    this._unbindMiddleClickPaste ();

    if ( !is.linux || !this.props.config.input.disableMiddleClickPaste ) return;

    document.addEventListener ( 'pointerdown', this.__middleClickPasteAttemptCapture, true );
    document.addEventListener ( 'mousedown', this.__middleClickPasteAttemptCapture, true );
    document.addEventListener ( 'mouseup', this.__middleClickPasteAttemptCapture, true );
    document.addEventListener ( 'auxclick', this.__middleClickPasteAttemptCapture, true );
    document.addEventListener ( 'paste', this.__middleClickPasteAttemptCapture, true );
    document.addEventListener ( 'beforeinput', this.__middleClickPasteAttemptCapture as EventListener, true );

  }

  _syncFrameRate = ( override?: number ) => {

    const frameAPI = webFrame as any;

    if ( typeof frameAPI?.setFrameRate !== 'function' ) return;

    const nextFrameRate = Math.max ( 1, Math.min ( 60, Math.round ( override || this.props.frameRateCap || 60 ) ) );

    if ( this._lastAppliedFrameRate === nextFrameRate ) return;

    this._lastAppliedFrameRate = nextFrameRate;
    frameAPI.setFrameRate ( nextFrameRate );

  }

  __updaterCheck = () => {

    ipc.send ( 'updater-check' );

  }

  __quickPanelClick = ( event ) => {

    const nth = $(event.currentTarget).data ( 'nth' );

    this.props.container.quickPanel.openNth ( nth );

  }

  __isEditableTarget = ( target: EventTarget | null ) => {

    if ( !( target instanceof Element ) ) return false;

    const $target = $( target );

    return $.isEditable ( target ) || !!$target.closest ( 'input, textarea, [contenteditable=""], [contenteditable="true"], .monaco-editor' ).length;

  }

  __blockPrimarySelectionPaste = ( event: Event ) => {

    event.preventDefault ();
    event.stopPropagation ();
    if ( 'stopImmediatePropagation' in event && typeof event.stopImmediatePropagation === 'function' ) {
      event.stopImmediatePropagation ();
    }

    return false;

  }

  __middleClickPasteAttemptCapture = ( event: Event ) => {

    const mouseEvent = event as MouseEvent,
          inputEvent = event as InputEvent,
          button = typeof mouseEvent.button === 'number' ? mouseEvent.button : ( typeof mouseEvent.which === 'number' ? mouseEvent.which - 1 : undefined ),
          isEditable = this.__isEditableTarget ( event.target );

    if ( !isEditable ) return;

    if ( event.type === 'beforeinput' ) {
      const inputType = String ( inputEvent.inputType || '' );

      if ( Date.now () <= this._blockPrimarySelectionPasteUntil && inputType.startsWith ( 'insertFromPaste' ) ) {
        return this.__blockPrimarySelectionPaste ( event );
      }

      return;
    }

    if ( event.type === 'paste' ) {
      if ( Date.now () <= this._blockPrimarySelectionPasteUntil ) {
        return this.__blockPrimarySelectionPaste ( event );
      }

      return;
    }

    if ( button !== 1 ) return;

    this._blockPrimarySelectionPasteUntil = Date.now () + 250;

    return this.__blockPrimarySelectionPaste ( event );

  }

}

/* EXPORT */

export default connect ({
  container: Main,
  selector: ({ container }) => ({
    config: container.appConfig.get (),
    frameRateCap: container.window.getEffectiveFrameRate ()
  })
})( GlobalPlugins );
