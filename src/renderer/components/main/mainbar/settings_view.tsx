/* IMPORT */

import * as React from 'react';
import {ipcRenderer as ipc} from 'electron';
import {connect} from 'overstated';
import Main from '@renderer/containers/main';

/* SETTINGS VIEW */

const SettingsView = ({ config, filePath, refreshConfig, setConfig, setConfigValue, rescanSpellcheck, isBatteryModeActive, isOnBatteryPower, hasBatteryPowerDetection }) => {

  const canEdit = !!filePath;
  const [spellcheckWordsOpen, setSpellcheckWordsOpen] = React.useState ( false );
  const [spellcheckWordDraft, setSpellcheckWordDraft] = React.useState ( '' );
  const [externalServerUrlDraft, setExternalServerUrlDraft] = React.useState ( config.plantuml.externalServerUrl );
  const [testState, setTestState] = React.useState<{ status: 'idle' | 'testing' | 'ok' | 'error', message: string }> ({
    status: 'idle',
    message: ''
  });
  const testRequestIdRef = React.useRef ( 0 );
  const spellcheckWords = config.spellcheck.addedWords || [];

  const normalizeSpellcheckWord = ( word: string ): string => {

    const normalized = ( word || '' ).trim ().toLowerCase ();

    if ( !/^[a-z][a-z'’-]*$/.test ( normalized ) ) return '';

    return normalized;

  };

  React.useEffect ( () => {
    setExternalServerUrlDraft ( config.plantuml.externalServerUrl );
  }, [config.plantuml.externalServerUrl] );

  React.useEffect ( () => {
    const onTestResult = ( _event, response: { id: number, ok: boolean, error?: string, result?: { status?: 'ok' | 'error', error?: string } } ) => {

      if ( response.id !== testRequestIdRef.current ) return;

      if ( !response.ok ) {
        setTestState ({
          status: 'error',
          message: response.error || 'Server test failed.'
        });
        return;
      }

      if ( response.result?.status === 'ok' ) {
        setTestState ({
          status: 'ok',
          message: 'External server test passed.'
        });
      } else {
        setTestState ({
          status: 'error',
          message: response.result?.error || 'External server test failed.'
        });
      }

    };

    ipc.on ( 'plantuml-test-server-result', onTestResult );

    return () => {
      ipc.removeListener ( 'plantuml-test-server-result', onTestResult );
    };
  }, [] );

  const toggleAutoupdate = () => setConfigValue ( 'autoupdate', !config.autoupdate );
  const toggleHighPerformanceMode = () => setConfigValue ( 'performance.highPerformanceMode', !config.performance.highPerformanceMode );
  const toggleBatteryMode = () => {
    if ( isBatteryModeActive ) {
      return setConfig ({
        ...config,
        battery: {
          ...config.battery,
          enabled: false,
          autoDetect: isOnBatteryPower ? false : config.battery.autoDetect
        }
      });
    }

    return setConfig ({
      ...config,
      battery: {
        ...config.battery,
        enabled: true
      }
    });
  };
  const toggleBatteryAutoDetect = () => setConfigValue ( 'battery.autoDetect', !config.battery.autoDetect );
  const toggleBatteryOptimizeRendering = () => setConfigValue ( 'battery.optimizeRendering', !config.battery.optimizeRendering );
  const toggleBatteryDisableSpellcheck = () => setConfigValue ( 'battery.disableSpellcheck', !config.battery.disableSpellcheck );
  const toggleBatteryDisableAutocomplete = () => setConfigValue ( 'battery.disableAutocomplete', !config.battery.disableAutocomplete );
  const toggleBatteryDisableAnimations = () => setConfigValue ( 'battery.disableAnimations', !config.battery.disableAnimations );
  const toggleDisableAnimations = () => setConfigValue ( 'ui.disableAnimations', !config.ui.disableAnimations );
  const toggleMiddleClickPaste = () => setConfigValue ( 'input.disableMiddleClickPaste', !config.input.disableMiddleClickPaste );
  const toggleDisableScriptSanitization = () => setConfigValue ( 'preview.disableScriptSanitization', !config.preview.disableScriptSanitization );
  const toggleDisableSplitViewSync = () => setConfigValue ( 'preview.disableSplitViewSync', !config.preview.disableSplitViewSync );
  const toggleDisableAutomaticRenaming = () => setConfigValue ( 'notes.disableAutomaticRenaming', !config.notes.disableAutomaticRenaming );
  const toggleDisableAutomaticTableFormatting = () => setConfigValue ( 'monaco.disableAutomaticTableFormatting', !config.monaco.disableAutomaticTableFormatting );
  const toggleDisableSpellcheck = () => Promise.resolve ( setConfigValue ( 'spellcheck.disable', !config.spellcheck.disable ) ).then (() => {
    rescanSpellcheck ();
  });
  const toggleDisableSuggestions = () => setConfigValue ( 'monaco.editorOptions.disableSuggestions', !config.monaco.editorOptions.disableSuggestions );
  const setLargeNoteFullRenderDelay = ( value: string ) => setConfigValue ( 'preview.largeNoteFullRenderDelay', Number ( value ) );
  const setBatteryTargetFps = ( value: string ) => setConfigValue ( 'battery.targetFps', Number ( value ) );
  const setBatteryRenderDelayMs = ( value: string ) => setConfigValue ( 'battery.renderDelayMs', Number ( value ) );
  const setTableFormattingDelay = ( value: string ) => setConfigValue ( 'monaco.tableFormattingDelay', Number ( value ) );
  const setTabSize = ( value: string ) => setConfigValue ( 'monaco.editorOptions.tabSize', Number ( value ) );
  const setPlantUMLRequestTimeout = ( value: string ) => setConfigValue ( 'plantuml.requestTimeoutMs', Number ( value ) );
  const setPlantUMLCacheMaxEntries = ( value: string ) => setConfigValue ( 'plantuml.cacheMaxEntries', Number ( value ) );
  const setPlantUMLCacheMaxBytes = ( value: string ) => setConfigValue ( 'plantuml.cacheMaxBytes', Number ( value ) );
  const saveSpellcheckWords = ( nextWords: string[] ) => {
    Promise.resolve ( setConfigValue ( 'spellcheck.addedWords', nextWords ) ).then (() => {
      rescanSpellcheck ();
    });
  };
  const addSpellcheckWord = () => {
    if ( !canEdit ) return;

    const normalized = normalizeSpellcheckWord ( spellcheckWordDraft );

    if ( !normalized ) return;
    if ( spellcheckWords.includes ( normalized ) ) {
      setSpellcheckWordDraft ( '' );
      return;
    }

    saveSpellcheckWords ([...spellcheckWords, normalized].sort (( a, b ) => a.localeCompare ( b ) ));
    setSpellcheckWordDraft ( '' );
    setSpellcheckWordsOpen ( true );
  };
  const removeSpellcheckWord = ( word: string ) => {
    if ( !canEdit ) return;

    const nextWords = spellcheckWords.filter ( entry => entry !== word );

    saveSpellcheckWords ( nextWords );
  };
  const testPlantUMLExternalServer = () => {
    const url = externalServerUrlDraft.trim (),
          id = ++testRequestIdRef.current;

    if ( !url ) {
      setTestState ({
        status: 'error',
        message: 'Enter an external server URL first.'
      });
      return;
    }

    setTestState ({
      status: 'testing',
      message: 'Testing external server...'
    });

    ipc.send ( 'plantuml-test-server', {
      id,
      url,
      options: {
        requestTimeoutMs: config.plantuml.requestTimeoutMs
      }
    } );
  };
  const commitPlantUMLExternalServerUrl = () => {
    const value = externalServerUrlDraft.trim ();
    if ( value === config.plantuml.externalServerUrl ) return;
    setConfigValue ( 'plantuml.externalServerUrl', value );
    setTestState ({
      status: 'idle',
      message: ''
    });
  };

  return (
    <div className="settings-view layout column">
      <div className="layout-header toolbar">
        <span className="small">Settings</span>
      </div>
      <div className="settings-view-body">
        <div className="settings-sheet">
          <section className="settings-hero">
            <div className="settings-hero-head">
              <p className="settings-hero-title">Global Configuration</p>
              <p className="settings-hero-copy xsmall">These settings are saved in your data directory and apply across the app.</p>
            </div>
            <div className="settings-hero-footer">
              <div className="settings-path-block">
                <div className="settings-path-label xxsmall">Config File</div>
                <p className="settings-path xxsmall">
                  {filePath ? filePath : 'Select a data directory to create a config file.'}
                </p>
              </div>
              <button type="button" className="button settings-action" onClick={() => refreshConfig ()}>Reload From Disk</button>
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-section-header">
              <p className="settings-section-name">General</p>
              <p className="settings-section-copy xxsmall">App-wide behavior.</p>
            </div>
            <div className="settings-group">
              <div className="settings-field">
                <div className="settings-meta">
                  <div className="settings-label">Automatic update checks</div>
                  <div className="settings-field-copy xsmall">Checks for updates in the background during startup.</div>
                </div>
                <div className="settings-control">
                  <button type="button" className={`settings-switch ${config.autoupdate ? 'active' : ''}`} aria-pressed={config.autoupdate} aria-label="Toggle automatic update checks" disabled={!canEdit} onClick={toggleAutoupdate}>
                    <span className="settings-switch-ui">
                      <span className="settings-switch-thumb"></span>
                    </span>
                  </button>
                </div>
              </div>
              <div className="settings-field">
                <div className="settings-meta">
                  <div className="settings-label">Disable animations</div>
                  <div className="settings-field-copy xsmall">Turns off UI motion and transitions. Large notes also force animations off automatically.</div>
                </div>
                <div className="settings-control">
                  <button type="button" className={`settings-switch ${config.ui.disableAnimations ? 'active' : ''}`} aria-pressed={config.ui.disableAnimations} aria-label="Toggle UI animations" disabled={!canEdit} onClick={toggleDisableAnimations}>
                    <span className="settings-switch-ui">
                      <span className="settings-switch-thumb"></span>
                    </span>
                  </button>
                </div>
              </div>
              <div className="settings-field">
                <div className="settings-meta">
                  <div className="settings-label">Use GPU</div>
                  <div className="settings-field-copy xsmall">Enables GPU rasterization-focused Chromium flags. Requires restart to take effect.</div>
                </div>
                <div className="settings-control">
                  <button type="button" className={`settings-switch ${config.performance.highPerformanceMode ? 'active' : ''}`} aria-pressed={config.performance.highPerformanceMode} aria-label="Toggle use GPU" disabled={!canEdit} onClick={toggleHighPerformanceMode}>
                    <span className="settings-switch-ui">
                      <span className="settings-switch-thumb"></span>
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-section-header">
              <p className="settings-section-name">On-Battery Mode</p>
              <p className="settings-section-copy xxsmall">Reduce editor and preview work while running on battery power.</p>
            </div>
            <div className="settings-group">
              <div className="settings-field">
                <div className="settings-meta">
                  <div className="settings-label">Manual on-battery mode</div>
                  <div className="settings-field-copy xsmall">Forces on-battery optimizations even when external power is connected.</div>
                </div>
                <div className="settings-control">
                  <button type="button" className={`settings-switch ${config.battery.enabled ? 'active' : ''}`} aria-pressed={config.battery.enabled} aria-label="Toggle manual on-battery mode" disabled={!canEdit} onClick={toggleBatteryMode}>
                    <span className="settings-switch-ui">
                      <span className="settings-switch-thumb"></span>
                    </span>
                  </button>
                </div>
              </div>
              <div className="settings-field">
                <div className="settings-meta">
                  <div className="settings-label">Auto-detect battery power</div>
                  <div className="settings-field-copy xsmall">Automatically applies on-battery mode when the system reports battery power.</div>
                </div>
                <div className="settings-control">
                  <button type="button" className={`settings-switch ${config.battery.autoDetect ? 'active' : ''}`} aria-pressed={config.battery.autoDetect} aria-label="Toggle battery auto-detection" disabled={!canEdit} onClick={toggleBatteryAutoDetect}>
                    <span className="settings-switch-ui">
                      <span className="settings-switch-thumb"></span>
                    </span>
                  </button>
                </div>
              </div>
              <div className="settings-field">
                <div className="settings-meta">
                  <div className="settings-label">On-battery split sync framerate cap</div>
                  <div className="settings-field-copy xsmall">Caps split-view synchronization rate to reduce update pressure while on battery.</div>
                </div>
                <div className="settings-control">
                  <div className="settings-select-wrap">
                    <select className="settings-select" disabled={!canEdit} value={String ( config.battery.targetFps )} onChange={event => setBatteryTargetFps ( event.currentTarget.value )}>
                      <option value="5">5 FPS</option>
                      <option value="10">10 FPS</option>
                      <option value="15">15 FPS</option>
                      <option value="20">20 FPS</option>
                      <option value="30">30 FPS</option>
                      <option value="60">60 FPS</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="settings-field">
                <div className="settings-meta">
                  <div className="settings-label">Optimize preview rendering</div>
                  <div className="settings-field-copy xsmall">Adds extra preview delay while typing on battery to reduce render churn.</div>
                </div>
                <div className="settings-control">
                  <button type="button" className={`settings-switch ${config.battery.optimizeRendering ? 'active' : ''}`} aria-pressed={config.battery.optimizeRendering} aria-label="Toggle on-battery preview rendering optimization" disabled={!canEdit} onClick={toggleBatteryOptimizeRendering}>
                    <span className="settings-switch-ui">
                      <span className="settings-switch-thumb"></span>
                    </span>
                  </button>
                </div>
              </div>
              <div className="settings-field">
                <div className="settings-meta">
                  <div className="settings-label">On-battery render delay</div>
                  <div className="settings-field-copy xsmall">Extra delay before preview updates while typing with on-battery mode active.</div>
                </div>
                <div className="settings-control">
                  <div className="settings-select-wrap">
                    <select className="settings-select" disabled={!canEdit || !config.battery.optimizeRendering} value={String ( config.battery.renderDelayMs )} onChange={event => setBatteryRenderDelayMs ( event.currentTarget.value )}>
                      <option value="0">Off</option>
                      <option value="200">200 ms</option>
                      <option value="300">300 ms</option>
                      <option value="400">400 ms</option>
                      <option value="500">500 ms</option>
                      <option value="750">750 ms</option>
                      <option value="1000">1 second</option>
                      <option value="1500">1.5 seconds</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="settings-field">
                <div className="settings-meta">
                  <div className="settings-label">Disable spellcheck on battery</div>
                  <div className="settings-field-copy xsmall">Default off. When enabled, spellcheck runs only on AC unless globally disabled.</div>
                </div>
                <div className="settings-control">
                  <button type="button" className={`settings-switch ${config.battery.disableSpellcheck ? 'active' : ''}`} aria-pressed={config.battery.disableSpellcheck} aria-label="Toggle spellcheck on battery" disabled={!canEdit} onClick={toggleBatteryDisableSpellcheck}>
                    <span className="settings-switch-ui">
                      <span className="settings-switch-thumb"></span>
                    </span>
                  </button>
                </div>
              </div>
              <div className="settings-field">
                <div className="settings-meta">
                  <div className="settings-label">Disable autocomplete on battery</div>
                  <div className="settings-field-copy xsmall">Default off. When enabled, suggestions run only on AC unless globally disabled.</div>
                </div>
                <div className="settings-control">
                  <button type="button" className={`settings-switch ${config.battery.disableAutocomplete ? 'active' : ''}`} aria-pressed={config.battery.disableAutocomplete} aria-label="Toggle autocomplete on battery" disabled={!canEdit} onClick={toggleBatteryDisableAutocomplete}>
                    <span className="settings-switch-ui">
                      <span className="settings-switch-thumb"></span>
                    </span>
                  </button>
                </div>
              </div>
              <div className="settings-field">
                <div className="settings-meta">
                  <div className="settings-label">Disable animations on battery</div>
                  <div className="settings-field-copy xsmall">Default on. Animations remain disabled if the global setting also disables them.</div>
                </div>
                <div className="settings-control">
                  <button type="button" className={`settings-switch ${config.battery.disableAnimations ? 'active' : ''}`} aria-pressed={config.battery.disableAnimations} aria-label="Toggle animations on battery" disabled={!canEdit} onClick={toggleBatteryDisableAnimations}>
                    <span className="settings-switch-ui">
                      <span className="settings-switch-thumb"></span>
                    </span>
                  </button>
                </div>
              </div>
            </div>
            <p className="settings-footnote xsmall">
              Power source: {hasBatteryPowerDetection ? ( isOnBatteryPower ? 'Battery' : 'AC' ) : 'Unavailable'}.
              On-battery mode: {isBatteryModeActive ? 'Active' : 'Inactive'}.
            </p>
          </section>

          <section className="settings-section">
            <div className="settings-section-header">
              <p className="settings-section-name">Editor</p>
              <p className="settings-section-copy xxsmall">Controls the editing surface and source view.</p>
            </div>
            <div className="settings-group">
              <div className="settings-field">
                <div className="settings-meta">
                  <div className="settings-label">Line numbers</div>
                  <div className="settings-field-copy xsmall">Choose between absolute, relative, or hidden gutter numbers.</div>
                </div>
                <div className="settings-control">
                  <div className="settings-select-wrap">
                    <select className="settings-select" disabled={!canEdit} value={config.monaco.editorOptions.lineNumbers} onChange={event => setConfigValue ( 'monaco.editorOptions.lineNumbers', event.currentTarget.value )}>
                      <option value="on">Absolute</option>
                      <option value="relative">Relative (Vim-style)</option>
                      <option value="off">Hidden</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="settings-field">
                <div className="settings-meta">
                  <div className="settings-label">Tab size</div>
                  <div className="settings-field-copy xsmall">Controls how many spaces a tab character uses in the editor model.</div>
                </div>
                <div className="settings-control">
                  <div className="settings-select-wrap">
                    <select className="settings-select" disabled={!canEdit} value={String ( config.monaco.editorOptions.tabSize )} onChange={event => setTabSize ( event.currentTarget.value )}>
                      <option value="1">1 space</option>
                      <option value="2">2 spaces</option>
                      <option value="3">3 spaces</option>
                      <option value="4">4 spaces</option>
                      <option value="8">8 spaces</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="settings-field">
                <div className="settings-meta">
                  <div className="settings-label">Disable autocomplete suggestions</div>
                  <div className="settings-field-copy xsmall">Turns off Monaco suggestion popups, including trigger-character suggestions like emoji shortcodes.</div>
                </div>
                <div className="settings-control">
                  <button type="button" className={`settings-switch ${config.monaco.editorOptions.disableSuggestions ? 'active' : ''}`} aria-pressed={config.monaco.editorOptions.disableSuggestions} aria-label="Toggle autocomplete suggestions" disabled={!canEdit} onClick={toggleDisableSuggestions}>
                    <span className="settings-switch-ui">
                      <span className="settings-switch-thumb"></span>
                    </span>
                  </button>
                </div>
              </div>
              <div className="settings-field">
                <div className="settings-meta">
                  <div className="settings-label">Disable split-view scroll sync</div>
                  <div className="settings-field-copy xsmall">Lets source and preview scroll independently in split view.</div>
                </div>
                <div className="settings-control">
                  <button type="button" className={`settings-switch ${config.preview.disableSplitViewSync ? 'active' : ''}`} aria-pressed={config.preview.disableSplitViewSync} aria-label="Toggle split-view scroll sync" disabled={!canEdit} onClick={toggleDisableSplitViewSync}>
                    <span className="settings-switch-ui">
                      <span className="settings-switch-thumb"></span>
                    </span>
                  </button>
                </div>
              </div>
              <div className="settings-field">
                <div className="settings-meta">
                  <div className="settings-label">Disable automatic table formatting</div>
                  <div className="settings-field-copy xsmall">Prevents source tables from being auto-aligned while typing.</div>
                </div>
                <div className="settings-control">
                  <button type="button" className={`settings-switch ${config.monaco.disableAutomaticTableFormatting ? 'active' : ''}`} aria-pressed={config.monaco.disableAutomaticTableFormatting} aria-label="Toggle automatic table formatting" disabled={!canEdit} onClick={toggleDisableAutomaticTableFormatting}>
                    <span className="settings-switch-ui">
                      <span className="settings-switch-thumb"></span>
                    </span>
                  </button>
                </div>
              </div>
              <div className="settings-field">
                <div className="settings-meta">
                  <div className="settings-label">Large note full preview delay</div>
                  <div className="settings-field-copy xsmall">How long the preview waits before expanding from the small live preview to the full render while editing large notes.</div>
                </div>
                <div className="settings-control">
                  <div className="settings-select-wrap">
                    <select className="settings-select" disabled={!canEdit} value={String ( config.preview.largeNoteFullRenderDelay )} onChange={event => setLargeNoteFullRenderDelay ( event.currentTarget.value )}>
                      <option value="250">250 ms</option>
                      <option value="500">500 ms</option>
                      <option value="750">750 ms</option>
                      <option value="1000">1 second</option>
                      <option value="1500">1.5 seconds</option>
                      <option value="2000">2 seconds</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="settings-field">
                <div className="settings-meta">
                  <div className="settings-label">Automatic table format delay</div>
                  <div className="settings-field-copy xsmall">How long the editor waits after typing before normalizing markdown table spacing.</div>
                </div>
                <div className="settings-control">
                  <div className="settings-select-wrap">
                    <select className="settings-select" disabled={!canEdit || config.monaco.disableAutomaticTableFormatting} value={String ( config.monaco.tableFormattingDelay )} onChange={event => setTableFormattingDelay ( event.currentTarget.value )}>
                      <option value="250">250 ms</option>
                      <option value="500">500 ms</option>
                      <option value="750">750 ms</option>
                      <option value="1000">1 second</option>
                      <option value="1500">1.5 seconds</option>
                      <option value="2000">2 seconds</option>
                      <option value="3000">3 seconds</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="settings-field">
                <div className="settings-meta">
                  <div className="settings-label text-warning">Disable script sanitization (Unsafe)</div>
                  <div className="settings-field-copy xsmall text-warning">Danger: the preview will allow and execute arbitrary JavaScript from note HTML, including inline scripts, event handlers, and unsafe URLs.</div>
                </div>
                <div className="settings-control">
                  <button type="button" className={`settings-switch ${config.preview.disableScriptSanitization ? 'active' : ''}`} aria-pressed={config.preview.disableScriptSanitization} aria-label="Toggle script sanitization" disabled={!canEdit} onClick={toggleDisableScriptSanitization}>
                    <span className="settings-switch-ui">
                      <span className="settings-switch-thumb"></span>
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-section-header">
              <p className="settings-section-name">Spellcheck Dictionary</p>
              <p className="settings-section-copy xxsmall">Persist custom words and manage your user dictionary.</p>
            </div>
            <div className="settings-group">
              <div className="settings-field">
                <div className="settings-meta">
                  <div className="settings-label">Disable spellcheck</div>
                  <div className="settings-field-copy xsmall">Turns off misspelling markers and spellcheck suggestions in the editor.</div>
                </div>
                <div className="settings-control">
                  <button type="button" className={`settings-switch ${config.spellcheck.disable ? 'active' : ''}`} aria-pressed={config.spellcheck.disable} aria-label="Toggle spellcheck" disabled={!canEdit} onClick={toggleDisableSpellcheck}>
                    <span className="settings-switch-ui">
                      <span className="settings-switch-thumb"></span>
                    </span>
                  </button>
                </div>
              </div>
              <div className="settings-field settings-field-column">
                <div className="settings-meta">
                  <div className="settings-label">Added words</div>
                  <div className="settings-field-copy xsmall">Expand to add or remove words that should never be flagged as misspellings.</div>
                </div>
                <div className="settings-control settings-control-start">
                  <button type="button" className="button settings-action settings-action-inline" aria-expanded={spellcheckWordsOpen} disabled={!canEdit} onClick={() => setSpellcheckWordsOpen ( !spellcheckWordsOpen )}>
                    {spellcheckWordsOpen ? 'Hide Dictionary' : `Show Dictionary (${spellcheckWords.length})`}
                  </button>
                </div>
                {spellcheckWordsOpen && (
                  <div className="settings-spellcheck-manager">
                    <div className="settings-spellcheck-add">
                      <input
                        type="text"
                        className="settings-input settings-input-spellcheck"
                        disabled={!canEdit}
                        value={spellcheckWordDraft}
                        placeholder="Add a word (letters, apostrophes, dashes)"
                        onChange={event => setSpellcheckWordDraft ( event.currentTarget.value )}
                        onKeyDown={event => {
                          if ( event.key !== 'Enter' ) return;
                          event.preventDefault ();
                          addSpellcheckWord ();
                        }}
                      />
                      <button type="button" className="button settings-action settings-action-inline" disabled={!canEdit || !normalizeSpellcheckWord ( spellcheckWordDraft )} onClick={addSpellcheckWord}>
                        Add Word
                      </button>
                    </div>
                    <div className="settings-spellcheck-list-wrap">
                      {spellcheckWords.length ? (
                        <ul className="settings-spellcheck-list">
                          {spellcheckWords.map ( word => (
                            <li key={word} className="settings-spellcheck-item">
                              <span className="settings-spellcheck-word">{word}</span>
                              <button type="button" className="button settings-action settings-action-inline settings-spellcheck-remove" disabled={!canEdit} onClick={() => removeSpellcheckWord ( word )}>
                                Remove
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="settings-field-copy xsmall settings-spellcheck-empty">No custom words saved yet.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <p className="settings-footnote xsmall">Words are stored in global config and loaded automatically for future sessions.</p>
          </section>

          <section className="settings-section">
            <div className="settings-section-header">
              <p className="settings-section-name">Notes</p>
              <p className="settings-section-copy xxsmall">Filename behavior for note edits.</p>
            </div>
            <div className="settings-group">
              <div className="settings-field">
                <div className="settings-meta">
                  <div className="settings-label">Disable automatic renaming</div>
                  <div className="settings-field-copy xsmall">Keeps the existing filename when the first heading/title line changes.</div>
                </div>
                <div className="settings-control">
                  <button type="button" className={`settings-switch ${config.notes.disableAutomaticRenaming ? 'active' : ''}`} aria-pressed={config.notes.disableAutomaticRenaming} aria-label="Toggle automatic note renaming" disabled={!canEdit} onClick={toggleDisableAutomaticRenaming}>
                    <span className="settings-switch-ui">
                      <span className="settings-switch-thumb"></span>
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-section-header">
              <p className="settings-section-name">PlantUML</p>
              <p className="settings-section-copy xxsmall">Configure local and optional external rendering for PlantUML diagrams.</p>
            </div>
            <div className="settings-group">
              <div className="settings-field">
                <div className="settings-meta">
                  <div className="settings-label">External server URL (Optional)</div>
                  <div className="settings-field-copy xsmall">If set, remote rendering can override local output when remote succeeds.</div>
                  <div className="settings-field-copy xsmall">Leave external server URL empty to use local rendering only.</div>
                </div>
                <div className="settings-control">
                  <input
                    type="text"
                    className="settings-input"
                    disabled={!canEdit}
                    value={externalServerUrlDraft}
                    placeholder="https://plantuml.example.com/plantuml"
                    onChange={event => setExternalServerUrlDraft ( event.currentTarget.value )}
                    onInput={() => {
                      if ( testState.status === 'idle' && !testState.message ) return;
                      setTestState ({ status: 'idle', message: '' });
                    }}
                    onBlur={commitPlantUMLExternalServerUrl}
                    onKeyDown={event => {
                      if ( event.key !== 'Enter' ) return;
                      commitPlantUMLExternalServerUrl ();
                      event.currentTarget.blur ();
                    }}
                  />
                </div>
              </div>
              <div className="settings-field">
                <div className="settings-meta">
                  <div className="settings-label">Test external server</div>
                  <div className="settings-field-copy xsmall">Renders a sample diagram remotely to verify server URL and feature compatibility.</div>
                  {testState.message ? (
                    <div className={`settings-field-copy xsmall ${testState.status === 'error' ? 'text-warning' : ''}`}>
                      {testState.message}
                    </div>
                  ) : null}
                </div>
                <div className="settings-control">
                  <button type="button" className="button settings-action" disabled={!canEdit || testState.status === 'testing'} onClick={testPlantUMLExternalServer}>
                    {testState.status === 'testing' ? 'Testing...' : 'Test Server'}
                  </button>
                </div>
              </div>
              <div className="settings-field">
                <div className="settings-meta">
                  <div className="settings-label">Render request timeout</div>
                  <div className="settings-field-copy xsmall">Maximum wait time for each local or remote PlantUML render request.</div>
                </div>
                <div className="settings-control">
                  <div className="settings-select-wrap">
                    <select className="settings-select" disabled={!canEdit} value={String ( config.plantuml.requestTimeoutMs )} onChange={event => setPlantUMLRequestTimeout ( event.currentTarget.value )}>
                      <option value="3000">3 seconds</option>
                      <option value="5000">5 seconds</option>
                      <option value="8000">8 seconds</option>
                      <option value="12000">12 seconds</option>
                      <option value="20000">20 seconds</option>
                      <option value="30000">30 seconds</option>
                      <option value="60000">60 seconds</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="settings-field">
                <div className="settings-meta">
                  <div className="settings-label">Cache max diagrams</div>
                  <div className="settings-field-copy xsmall">Maximum number of cached PlantUML render entries in the SQLite cache.</div>
                </div>
                <div className="settings-control">
                  <div className="settings-select-wrap">
                    <select className="settings-select" disabled={!canEdit} value={String ( config.plantuml.cacheMaxEntries )} onChange={event => setPlantUMLCacheMaxEntries ( event.currentTarget.value )}>
                      <option value="100">100</option>
                      <option value="200">200</option>
                      <option value="400">400</option>
                      <option value="800">800</option>
                      <option value="1200">1200</option>
                      <option value="2000">2000</option>
                      <option value="5000">5000</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="settings-field">
                <div className="settings-meta">
                  <div className="settings-label">Cache max size</div>
                  <div className="settings-field-copy xsmall">Upper byte limit for PlantUML cache storage before LRU pruning.</div>
                </div>
                <div className="settings-control">
                  <div className="settings-select-wrap">
                    <select className="settings-select" disabled={!canEdit} value={String ( config.plantuml.cacheMaxBytes )} onChange={event => setPlantUMLCacheMaxBytes ( event.currentTarget.value )}>
                      <option value={String ( 8 * 1024 * 1024 )}>8 MB</option>
                      <option value={String ( 16 * 1024 * 1024 )}>16 MB</option>
                      <option value={String ( 32 * 1024 * 1024 )}>32 MB</option>
                      <option value={String ( 64 * 1024 * 1024 )}>64 MB</option>
                      <option value={String ( 128 * 1024 * 1024 )}>128 MB</option>
                      <option value={String ( 256 * 1024 * 1024 )}>256 MB</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-section-header">
              <p className="settings-section-name">Input</p>
              <p className="settings-section-copy xxsmall">Mouse and text-entry behavior.</p>
            </div>
            <div className="settings-group">
              <div className="settings-field">
                <div className="settings-meta">
                  <div className="settings-label">Disable middle-click paste on Linux</div>
                  <div className="settings-field-copy xsmall">Prevents X11 middle-click paste in editable inputs and the editor.</div>
                </div>
                <div className="settings-control">
                  <button type="button" className={`settings-switch ${config.input.disableMiddleClickPaste ? 'active' : ''}`} aria-pressed={config.input.disableMiddleClickPaste} aria-label="Toggle middle-click paste on Linux" disabled={!canEdit} onClick={toggleMiddleClickPaste}>
                    <span className="settings-switch-ui">
                      <span className="settings-switch-thumb"></span>
                    </span>
                  </button>
                </div>
              </div>
            </div>
            <p className="settings-footnote xsmall">This is mainly relevant on Linux/X11 systems.</p>
          </section>
        </div>
      </div>
    </div>
  );

};

/* EXPORT */

export default connect ({
  container: Main,
  selector: ({ container }) => ({
    config: container.appConfig.get (),
    filePath: container.appConfig.getFilePath (),
    refreshConfig: container.appConfig.refresh,
    setConfig: container.appConfig.set,
    setConfigValue: container.appConfig.setValue,
    isBatteryModeActive: container.window.isBatteryModeActive (),
    isOnBatteryPower: container.window.isOnBatteryPower (),
    hasBatteryPowerDetection: container.window.hasBatteryPowerDetection (),
    rescanSpellcheck: () => {
      const editor = container.editor.getMonaco () as any;
      editor?.spellcheckRescan?.();
    }
  })
})( SettingsView );
