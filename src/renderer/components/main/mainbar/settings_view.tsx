/* IMPORT */

import * as React from 'react';
import {ipcRenderer as ipc} from 'electron';
import {connect} from 'overstated';
import Main from '@renderer/containers/main';

/* SETTINGS VIEW */

const SettingsView = ({ config, filePath, refreshConfig, setConfigValue }) => {

  const canEdit = !!filePath;
  const [externalServerUrlDraft, setExternalServerUrlDraft] = React.useState ( config.plantuml.externalServerUrl );
  const [testState, setTestState] = React.useState<{ status: 'idle' | 'testing' | 'ok' | 'error', message: string }> ({
    status: 'idle',
    message: ''
  });
  const testRequestIdRef = React.useRef ( 0 );

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
  const toggleDisableAnimations = () => setConfigValue ( 'ui.disableAnimations', !config.ui.disableAnimations );
  const toggleMiddleClickPaste = () => setConfigValue ( 'input.disableMiddleClickPaste', !config.input.disableMiddleClickPaste );
  const toggleDisableScriptSanitization = () => setConfigValue ( 'preview.disableScriptSanitization', !config.preview.disableScriptSanitization );
  const toggleDisableSuggestions = () => setConfigValue ( 'monaco.editorOptions.disableSuggestions', !config.monaco.editorOptions.disableSuggestions );
  const setLargeNoteFullRenderDelay = ( value: string ) => setConfigValue ( 'preview.largeNoteFullRenderDelay', Number ( value ) );
  const setTableFormattingDelay = ( value: string ) => setConfigValue ( 'monaco.tableFormattingDelay', Number ( value ) );
  const setTabSize = ( value: string ) => setConfigValue ( 'monaco.editorOptions.tabSize', Number ( value ) );
  const setPlantUMLRequestTimeout = ( value: string ) => setConfigValue ( 'plantuml.requestTimeoutMs', Number ( value ) );
  const setPlantUMLCacheMaxEntries = ( value: string ) => setConfigValue ( 'plantuml.cacheMaxEntries', Number ( value ) );
  const setPlantUMLCacheMaxBytes = ( value: string ) => setConfigValue ( 'plantuml.cacheMaxBytes', Number ( value ) );
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
            </div>
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
                    <select className="settings-select" disabled={!canEdit} value={String ( config.monaco.tableFormattingDelay )} onChange={event => setTableFormattingDelay ( event.currentTarget.value )}>
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
              <p className="settings-section-name">PlantUML</p>
              <p className="settings-section-copy xxsmall">Configure local and optional external rendering for PlantUML diagrams.</p>
            </div>
            <div className="settings-group">
              <div className="settings-field">
                <div className="settings-meta">
                  <div className="settings-label">External server URL (Optional)</div>
                  <div className="settings-field-copy xsmall">If set, remote rendering can override local output when remote succeeds.</div>
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
            <p className="settings-footnote xsmall">Leave external server URL empty to use local rendering only.</p>
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
    setConfigValue: container.appConfig.setValue
  })
})( SettingsView );
