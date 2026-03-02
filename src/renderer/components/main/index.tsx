
/* IMPORT */

import * as React from 'react';
import {connect} from 'overstated';
import MainContainer from '@renderer/containers/main';
import Activitybar from './activitybar';
import Layout from './layout';
import Mainbar from './mainbar';
import Sidepanel from './sidepanel';
import ContextMenu from './extra/context_menu';
import EditorPlugins from './extra/editor_plugins';
import GlobalPlugins from './extra/global_plugins';
import IPC from './extra/ipc';
import PreviewPlugins from './extra/preview_plugins';
import Shortcuts from './extra/shortcuts';
import QuickPanel from './modals/quick_panel';

/* MAIN */

class Main extends React.Component<{ loading: boolean, refresh: Function, listen: Function, isFocus: boolean, isFullscreen: boolean, isZen: boolean, hasSidebar: boolean }, { panel: string | null, panelResetCounter: number }> {

  state = {
    panel: 'info' as string | null,
    panelResetCounter: 0
  };

  /* SPECIAL */

  async componentDidMount () {

    if ( this.props.loading ) {

      await this.props.refresh ();

    }

    await this.props.listen ();

  }

  /* RENDER */

  render () {

    const {isFocus, isFullscreen, isZen, hasSidebar} = this.props;
    const {panel, panelResetCounter} = this.state;
    const isSettingsView = panel === 'settings';

    return (
      <>
        <ContextMenu />
        <EditorPlugins />
        <GlobalPlugins />
        <IPC />
        <PreviewPlugins />
        <Shortcuts />
        <QuickPanel />
        <Layout className={`main app-wrapper ${isFullscreen ? 'fullscreen' : ''} ${hasSidebar ? 'focus' : ''} ${isZen ? 'zen' : ''}`} direction="horizontal" resizable={true} isFocus={isFocus} isZen={isZen} hasSidebar={hasSidebar} resetCounter={panelResetCounter}>
          {isFocus || isZen || !hasSidebar ? null : <Activitybar panel={panel} setPanel={(nextPanel: string) => this.setState ( prev => {
            if ( prev.panel === nextPanel ) return { panel: null, panelResetCounter: prev.panelResetCounter };
            if ( !prev.panel ) return { panel: nextPanel, panelResetCounter: prev.panelResetCounter + 1 };
            return { panel: nextPanel, panelResetCounter: prev.panelResetCounter };
          })} />}
          <Sidepanel panel={isSettingsView ? null : panel} />
          <Mainbar panel={panel} />
        </Layout>
      </>
    );

  }

}

/* EXPORT */

export default connect ({
  container: MainContainer,
  selector: ({ container }) => ({
    listen: container.listen,
    refresh: container.refresh,
    loading: container.loading.get (),
    isFocus: container.window.isFocus (),
    isFullscreen: container.window.isFullscreen (),
    isZen: container.window.isZen (),
    hasSidebar: container.window.hasSidebar ()
  })
})( Main );
