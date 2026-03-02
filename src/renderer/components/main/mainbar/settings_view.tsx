/* IMPORT */

import * as React from 'react';
import {connect} from 'overstated';
import Main from '@renderer/containers/main';

/* SETTINGS VIEW */

const SettingsView = ({ config, filePath, refreshConfig, setConfigValue }) => {

  const canEdit = !!filePath;
  const toggleAutoupdate = () => setConfigValue ( 'autoupdate', !config.autoupdate );
  const toggleMiddleClickPaste = () => setConfigValue ( 'input.disableMiddleClickPaste', !config.input.disableMiddleClickPaste );
  const setLargeNoteFullRenderDelay = ( value: string ) => setConfigValue ( 'preview.largeNoteFullRenderDelay', Number ( value ) );

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
    setConfigValue: container.appConfig.setValue
  })
})( SettingsView );
