
/* IMPORT */

import * as React from 'react';
import {connect} from 'overstated';
import Config from '@common/config';
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

class Main extends React.Component<{ loading: boolean, refresh: Function, listen: Function, isFocus: boolean, isFullscreen: boolean, isZen: boolean, hasSidebar: boolean, animationsDisabled: boolean }, { panel: string | null, panelResetCounter: number, isClosingPanel: boolean, isOpeningPanel: boolean }> {

  panelOpenTimeout?: ReturnType<typeof setTimeout>;
  panelCloseTimeout?: ReturnType<typeof setTimeout>;

  state = {
    panel: 'info' as string | null,
    panelResetCounter: 0,
    isClosingPanel: false,
    isOpeningPanel: false
  };

  /* SPECIAL */

  async componentDidMount () {

    if ( this.props.loading ) {

      await this.props.refresh ();

    }

    await this.props.listen ();

  }

  componentWillUnmount () {

    if ( this.panelOpenTimeout ) {
      clearTimeout ( this.panelOpenTimeout );
      this.panelOpenTimeout = undefined;
    }

    if ( this.panelCloseTimeout ) {
      clearTimeout ( this.panelCloseTimeout );
      this.panelCloseTimeout = undefined;
    }

  }

  componentDidUpdate () {

    if ( !this.props.animationsDisabled ) return;

    if ( this.state.isOpeningPanel ) {
      if ( this.panelOpenTimeout ) {
        clearTimeout ( this.panelOpenTimeout );
        this.panelOpenTimeout = undefined;
      }
      this.setState ({ isOpeningPanel: false });
      return;
    }

    if ( !this.state.isClosingPanel ) return;

    if ( this.panelCloseTimeout ) {
      clearTimeout ( this.panelCloseTimeout );
      this.panelCloseTimeout = undefined;
    }

    this.setState ({ panel: null, isClosingPanel: false, isOpeningPanel: false });

  }

  closePanel = () => {

    if ( !this.state.panel || this.state.isClosingPanel ) return;

    if ( this.panelOpenTimeout ) {
      clearTimeout ( this.panelOpenTimeout );
      this.panelOpenTimeout = undefined;
    }

    if ( this.props.animationsDisabled ) {
      if ( this.panelCloseTimeout ) {
        clearTimeout ( this.panelCloseTimeout );
        this.panelCloseTimeout = undefined;
      }
      this.setState ({ panel: null, isClosingPanel: false, isOpeningPanel: false });
      return;
    }

    this.setState ({ isClosingPanel: true, isOpeningPanel: false });

    this.panelCloseTimeout = globalThis.setTimeout ( () => {
      this.panelCloseTimeout = undefined;
      this.setState ({ panel: null, isClosingPanel: false, isOpeningPanel: false });
    }, 140 );

  };

  setPanel = ( nextPanel: string ) => {

    if ( this.state.panel === nextPanel ) {
      this.closePanel ();
      return;
    }

    if ( this.panelCloseTimeout ) {
      clearTimeout ( this.panelCloseTimeout );
      this.panelCloseTimeout = undefined;
    }

    if ( this.panelOpenTimeout ) {
      clearTimeout ( this.panelOpenTimeout );
      this.panelOpenTimeout = undefined;
    }

    if ( this.props.animationsDisabled ) {
      this.setState ( prev => ({
        panel: nextPanel,
        panelResetCounter: prev.panelResetCounter,
        isClosingPanel: false,
        isOpeningPanel: false
      }));
      return;
    }

    this.setState ( prev => ({
      panel: nextPanel,
      panelResetCounter: prev.panelResetCounter,
      isClosingPanel: false,
      isOpeningPanel: true
    }));

    this.panelOpenTimeout = globalThis.setTimeout ( () => {
      this.panelOpenTimeout = undefined;
      this.setState ({ isOpeningPanel: false });
    }, 140 );

  };

  /* RENDER */

  render () {

    const {isFocus, isFullscreen, isZen, hasSidebar, animationsDisabled} = this.props;
    const {panel, panelResetCounter, isClosingPanel, isOpeningPanel} = this.state;
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
          {isFocus || isZen || !hasSidebar ? null : <Activitybar panel={panel} setPanel={this.setPanel} />}
          <Sidepanel panel={isSettingsView ? null : panel} isClosing={isClosingPanel} isOpening={isOpeningPanel} animationsDisabled={animationsDisabled} />
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
    animationsDisabled: container.appConfig.get ().ui.disableAnimations || ( container.note.getPlainContent ().length >= Config.preview.largeDocumentThreshold ),
    listen: container.listen,
    refresh: container.refresh,
    loading: container.loading.get (),
    isFocus: container.window.isFocus (),
    isFullscreen: container.window.isFullscreen (),
    isZen: container.window.isZen (),
    hasSidebar: container.window.hasSidebar ()
  })
})( Main );
