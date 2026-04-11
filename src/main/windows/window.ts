
/* IMPORT */

import * as _ from 'lodash';
import * as path from 'path';
import {app, BrowserWindow, BrowserWindowConstructorOptions} from 'electron';
import {is} from '@common/electron_util_shim';
import windowStateKeeper from 'electron-window-state';
import pkg from '@root/package.json';
import Environment from '@common/environment';
import Settings from '@common/settings';

/* WINDOW */

const remoteMain = require ( '@electron/remote/main' );

class Window {

  /* VARIABLES */

  name: string;
  win: BrowserWindow = {} as BrowserWindow; //TSC
  options: BrowserWindowConstructorOptions;
  stateOptions: windowStateKeeper.Options;
  _didFocus: boolean = false;

  /* CONSTRUCTOR */

  constructor ( name: string, options: BrowserWindowConstructorOptions = {}, stateOptions: windowStateKeeper.Options = {} ) {

    this.name = name;
    this.options = options;
    this.stateOptions = stateOptions;

  }

  /* SPECIAL */

  init () {

    this.initWindow ();
    this.initDebug ();
    this.initLocalShortcuts ();
    this.initMenu ();

    this.load ();
    this.events ();

  }

  initWindow () {

    this.win = this.make ();

  }

  initDebug () {

    if ( !Environment.isDevelopment ) return;

    this.win.webContents.openDevTools ({
      mode: 'undocked'
    });

    this.win.webContents.on ( 'devtools-opened', () => {

      if ( !this.win || this.win.isDestroyed () ) return;

      this.win.focus ();

      setImmediate ( () => {
        if ( !this.win || this.win.isDestroyed () ) return;
        this.win.focus ();
      });

    });

  }

  initMenu () {}

  initLocalShortcuts () {}

  events () {

    this.___didFinishLoad ();
    this.___closed ();
    this.___focused ();

  }

  cleanup () {

    const win = this.win;

    if ( !win ) return;

    const webContents = typeof win.isDestroyed === 'function' && !win.isDestroyed () ? win.webContents : undefined;

    if ( webContents && typeof webContents.isDestroyed === 'function' && !webContents.isDestroyed () ) {
      webContents.removeAllListeners ();
    }

    if ( typeof win.isDestroyed === 'function' && !win.isDestroyed () ) {
      win.removeAllListeners ();
    }

  }

  /* READY TO SHOW */

  ___didFinishLoad = () => {

    this.win.webContents.on ( 'did-finish-load', this.__didFinishLoad );

  }

  __didFinishLoad = () => {

    if ( !this.win || this.win.isDestroyed () ) return;

    if ( this._didFocus ) return;

    this.win.show ();
    this.win.focus ();

  }

  /* CLOSED */

  ___closed = () => {

    this.win.on ( 'closed', this.__closed );

  }

  __closed = () => {

    this.cleanup ();

    delete ( this as any ).win;

  }

  /* FOCUSED */

  ___focused = () => {

    this.win.on ( 'focus', this.__focused );

  }

  __focused = () => {

    if ( !this.win || this.win.isDestroyed () ) return;

    this._didFocus = true;

    this.initMenu ();

  }

  /* API */

  normalizeLocaleCode ( locale: string ): string {

    const normalized = locale.trim ().replace ( /_/g, '-' );

    if ( !normalized ) return '';

    const [language, ...rest] = normalized.split ( '-' );

    if ( !language ) return '';

    const languageCode = language.toLowerCase ();
    const regionCode = rest.map ( part => {
      if ( part.length === 2 ) return part.toUpperCase ();
      return part;
    });

    return [languageCode, ...regionCode].join ( '-' );

  }

  getPreferredLocales (): string[] {

    const locales = new Set<string> ();
    const addLocale = ( candidate?: string ) => {

      if ( !candidate ) return;

      const cleaned = candidate.split ( '.' )[0].split ( '@' )[0];
      const normalized = this.normalizeLocaleCode ( cleaned );

      if ( normalized ) locales.add ( normalized );

    };

    const preferred = app.getPreferredSystemLanguages?.() || [];

    preferred.forEach ( addLocale );
    addLocale ( app.getLocale?.() );
    addLocale ( process.env.LC_ALL );
    addLocale ( process.env.LC_MESSAGES );
    addLocale ( process.env.LANG );

    return [...locales];

  }

  resolveSpellcheckerLanguages ( available: string[], preferred: string[] ): string[] {

    if ( !available.length ) {
      const selected = preferred.length ? preferred : ['en-US'];

      return Array.from ( new Set ( selected.map ( locale => this.normalizeLocaleCode ( locale ) ).filter ( _.identity ) ) );
    }

    const availableByLower = new Map ( available.map ( locale => [locale.toLowerCase (), locale] ) );
    const selected = new Set<string> ();

    preferred.forEach ( locale => {

      const exact = availableByLower.get ( locale.toLowerCase () );

      if ( exact ) {
        selected.add ( exact );
        return;
      }

      const base = locale.split ( '-' )[0].toLowerCase ();

      if ( !base ) return;

      const baseMatch = available.find ( entry => entry.toLowerCase () === base || entry.toLowerCase ().startsWith ( `${base}-` ) );

      if ( baseMatch ) selected.add ( baseMatch );

    });

    if ( selected.size ) return [...selected];

    const enUS = availableByLower.get ( 'en-us' );

    if ( enUS ) return [enUS];

    return [available[0]];

  }

  configureSpellcheckerLocalization ( win: BrowserWindow ) {

    if ( !win || win.isDestroyed () ) return;

    const session = win.webContents.session;

    try {
      session.setSpellCheckerEnabled?.( true );
    } catch ( error ) {
      console.warn ( '[spellcheck] Failed to enable spellchecker', error );
    }

    const available = session.availableSpellCheckerLanguages || [];
    const preferred = this.getPreferredLocales ();
    const languages = this.resolveSpellcheckerLanguages ( available, preferred );

    if ( !languages.length ) return;

    const candidateSets = _.uniqBy ([
      [languages[0]],
      ['en-US']
    ].map ( set => _.uniq ( set.map ( locale => this.normalizeLocaleCode ( locale ) ).filter ( _.identity ) ) ).filter ( set => !!set.length ), set => set.join ( '\n' ) );

    for ( let index = 0, length = candidateSets.length; index < length; index++ ) {
      const candidates = candidateSets[index];

      try {
        session.setSpellCheckerLanguages ( candidates );
        const active = session.getSpellCheckerLanguages?.() || [];
        console.info ( '[spellcheck] Applied spellchecker languages', {
          requested: candidates,
          active,
          availableCount: available.length
        } );
        return;
      } catch ( error ) {
        if ( index === candidateSets.length - 1 ) {
          console.warn ( '[spellcheck] Failed to set spellchecker languages', {
            requested: candidates,
            availableCount: available.length,
            error
          } );
        }
      }
    }

  }

  make ( id = this.name, options = this.options, stateOptions = this.stateOptions ) {

    stateOptions = _.merge ({
      file: `${id}.json`,
      defaultWidth: 600,
      defaultHeight: 600
    }, stateOptions );

    const state = windowStateKeeper ( stateOptions ),
          dimensions = _.pick ( state, ['x', 'y', 'width', 'height'] );

    options = _.merge ( dimensions, {
      frame: !is.macos,
      backgroundColor: ( Settings.get ( 'theme' ) === 'light' ) ? '#F7F7F7' : '#0F0F0F', //TODO: This won't scale with custom themes
      icon: path.join ( __static, 'images', `icon.${is.windows ? 'ico' : 'png'}` ),
      show: false,
      title: pkg.productName,
      titleBarStyle: 'hiddenInset',
      webPreferences: {
        devTools: true,
        nodeIntegration: true,
        nodeIntegrationInWorker: true,
        contextIsolation: false,
        webSecurity: false,
        spellcheck: true
      }
    }, options );

    const win = new BrowserWindow ( options );
    const session = win.webContents.session;
    const dictionaryDownloadURL = process.env.EL_BATON_SPELLCHECK_DICTIONARY_URL || 'https://redirector.gvt1.com/edgedl/chrome/dict/';

    try {
      session.setSpellCheckerDictionaryDownloadURL?.( dictionaryDownloadURL );
      console.info ( '[spellcheck] Dictionary download URL configured', { dictionaryDownloadURL } );
    } catch ( error ) {
      console.warn ( '[spellcheck] Failed to configure dictionary download URL', { dictionaryDownloadURL, error } );
    }

    session.on ( 'spellcheck-dictionary-download-begin', ( _event, languageCode ) => {
      console.info ( '[spellcheck] Dictionary download begin', { languageCode } );
    } );
    session.on ( 'spellcheck-dictionary-download-success', ( _event, languageCode ) => {
      console.info ( '[spellcheck] Dictionary download success', { languageCode } );
    } );
    session.on ( 'spellcheck-dictionary-download-failure', ( _event, languageCode ) => {
      console.warn ( '[spellcheck] Dictionary download failure', { languageCode } );
    } );
    session.on ( 'spellcheck-dictionary-initialized', ( _event, languageCode ) => {
      console.info ( '[spellcheck] Dictionary initialized', { languageCode } );
    } );

    this.configureSpellcheckerLocalization ( win );
    win.webContents.once ( 'did-finish-load', () => this.configureSpellcheckerLocalization ( win ) );
    setTimeout ( () => this.configureSpellcheckerLocalization ( win ), 1500 );
    setTimeout ( () => this.configureSpellcheckerLocalization ( win ), 4000 );

    remoteMain.enable ( win.webContents );

    state.manage ( win );

    return win;

  }

  load () {}

}

/* EXPORT */

export default Window;
