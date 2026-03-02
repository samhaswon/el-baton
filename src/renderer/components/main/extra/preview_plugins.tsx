
/* IMPORT */

import * as _ from 'lodash';
import {ipcRenderer as ipc} from 'electron';
import Dialog from 'electron-dialog';
import {connect} from 'overstated';
import * as path from 'path';
import {Component} from 'react-component-renderless';
import Config from '@common/config';
import MarkdownRenderHelpers from '@common/markdown_render_helpers';
import Main from '@renderer/containers/main';
import MermaidCache from '@renderer/utils/mermaid_cache';

/* PREVIEW PLUGINS */

class PreviewPlugins extends Component<{ container: IMain }, {}> {

  _mermaid;
  _mermaidInitPromise;
  _mermaidRendering = false;
  _mermaidTheme;
  _lastPreviewRenderWasPartial = false;
  _forceFreshMermaidRender = false;

  /* SPECIAL */

  componentDidMount () {

    $.$document.on ( 'click', '.preview a.note', this.__noteClick );
    $.$document.on ( 'click', '.preview a.tag', this.__tagClick );
    $.$document.on ( 'click', '.preview input[type="checkbox"]', this.__checkboxClick );
    $.$document.on ( 'click', '.preview .copy', this.__copyClick );
    $.$document.on ( 'click', '.preview .mermaid-open-external', this.__mermaidOpenExternalClick );
    $.$window.on ( 'preview:render:start', this.__previewRenderStart );
    $.$window.on ( 'preview:rendered', this.__renderMermaids );
    this.__renderMermaids ();

  }

  componentDidUpdate () {

    this.__renderMermaids ();

  }

  componentWillUnmount () {

    $.$document.off ( 'click', this.__noteClick );
    $.$document.off ( 'click', this.__tagClick );
    $.$document.off ( 'click', this.__checkboxClick );
    $.$document.off ( 'click', this.__copyClick );
    $.$document.off ( 'click', this.__mermaidOpenExternalClick );
    $.$window.off ( 'preview:render:start', this.__previewRenderStart );
    $.$window.off ( 'preview:rendered', this.__renderMermaids );
    MermaidCache.clear ();

  }

  /* HANDLERS */

  __getMermaidTheme = () => {

    return this.props.container.theme.get () === 'dark' ? 'dark' : 'default';

  }

  __getMermaidCacheKey = ( source: string ) => {

    return `${this.__getMermaidTheme ()}\u0000${source}`;

  }

  __previewRenderStart = ( _event, renderMeta? ) => {

    if ( this._lastPreviewRenderWasPartial && renderMeta && renderMeta.kind !== 'partial' ) {
      this._forceFreshMermaidRender = true;
      MermaidCache.clear ();
    }

  }

  __ensureMermaid = async () => {

    const theme = this.__getMermaidTheme ();

    if ( this._mermaid && this._mermaidTheme === theme ) return this._mermaid;

    if ( !this._mermaidInitPromise ) {

      this._mermaidInitPromise = import ( '@root/node_modules/mermaid/dist/mermaid.esm.mjs' ).then ( ( module ) => {
        const mermaid = ( module as any ).default || module;
        if ( mermaid.initialize ) {
          mermaid.initialize ( _.merge ({}, Config.mermaid, {
            startOnLoad: false,
            theme,
            themeVariables: {
              background: 'transparent'
            }
          }) );
        }
        this._mermaid = mermaid;
        this._mermaidTheme = theme;
        return mermaid;
      }).catch ( error => {
        this._mermaidInitPromise = undefined;
        console.error ( `[mermaid] ${error.message}` );
        return undefined;
      });

    } else if ( this._mermaid && this._mermaidTheme !== theme && this._mermaid.initialize ) {

      this._mermaid.initialize ( _.merge ({}, Config.mermaid, {
        startOnLoad: false,
        theme,
        themeVariables: {
          background: 'transparent'
        }
      }) );
      this._mermaidTheme = theme;

    }

    return this._mermaidInitPromise;

  }

  __renderMermaids = async ( _event?, renderMeta? ) => {

    if ( this._mermaidRendering ) return;
    this._mermaidRendering = true;
    this._lastPreviewRenderWasPartial = !!( renderMeta && renderMeta.kind === 'partial' );

    const currentTheme = this.__getMermaidTheme ();

    const mermaid = await this.__ensureMermaid ();

    if ( !mermaid ) {
      const nodes = Array.from ( document.querySelectorAll ( '.preview .mermaid' ) );

      for ( const node of nodes ) {
        $(node).html ( MarkdownRenderHelpers.renderMermaidError ( 'Failed to load Mermaid renderer' ) );
      }

      this._mermaidRendering = false;
      return;
    }

    const nodes = Array.from ( document.querySelectorAll ( '.preview .mermaid' ) );

    for ( const node of nodes ) {

      const $node = $(node),
            sourceNode = $node.find ( '.mermaid-source' )[0],
            currentSource = $node.data ( 'mermaidSource' ),
            currentNodeTheme = $node.data ( 'mermaidTheme' );

      if ( !sourceNode && currentNodeTheme === currentTheme && currentSource ) continue;
      if ( !sourceNode ) continue;

      const encoded = sourceNode.textContent || '';

      let source = '';

      try {
        source = decodeURIComponent ( encoded );
      } catch ( error ) {
        const message = error instanceof Error ? error.message : String ( error );
        console.error ( `[mermaid] ${message}` );
        $node.html ( MarkdownRenderHelpers.renderMermaidError ( message ) );
        continue;
      }

      if ( !source.trim () ) continue;
      if ( currentSource === source && currentNodeTheme === currentTheme ) continue;

      const existingSvgNode = $node.children ( 'svg' )[0];

      if ( existingSvgNode && currentNodeTheme === currentTheme ) {
        MermaidCache.set ( this.__getMermaidCacheKey ( source ), existingSvgNode.outerHTML );
        $node.data ( 'mermaidSource', source );
        $node.data ( 'mermaidTheme', currentTheme );
        continue;
      }

      const cacheKey = this.__getMermaidCacheKey ( source ),
            cachedSvg = this._forceFreshMermaidRender ? undefined : MermaidCache.get ( cacheKey );

      if ( cachedSvg ) {
        const $external = $node.children ( '.mermaid-open-external' ).detach ();
        $node.empty ();
        if ( $external.length ) $node.append ( $external );
        $node.append ( cachedSvg );
        $node.data ( 'mermaidSource', source );
        $node.data ( 'mermaidTheme', currentTheme );
        continue;
      }

      const id = _.uniqueId ( 'mermaid-' );

      try {
        const result = await mermaid.render ( id, source ),
              svg = _.isString ( result ) ? result : result.svg,
              $external = $node.children ( '.mermaid-open-external' ).detach ();

        MermaidCache.set ( cacheKey, svg );

        $node.empty ();
        if ( $external.length ) $node.append ( $external );
        $node.append ( svg );
        $node.data ( 'mermaidSource', source );
        $node.data ( 'mermaidTheme', currentTheme );
      } catch ( error ) {
        const message = error instanceof Error ? error.message : String ( error );
        console.error ( `[mermaid] ${message}` );
        $node.html ( MarkdownRenderHelpers.renderMermaidError ( message ) );
      }

    }

    this._forceFreshMermaidRender = false;
    this._mermaidRendering = false;

  }

  __noteClick = ( event ) => {

    const filePath = $(event.currentTarget).data ( 'filepath' ),
          note = this.props.container.note.get ( filePath );

    if ( note ) {

      this.props.container.note.set ( note, true );

    } else {

      const shouldCreate = Dialog.confirm ( 'Note not found, do you want to create it?' );

      if ( !shouldCreate ) return false;

      const {name} = path.parse ( filePath );

      this.props.container.note.new ( name );

    }

    return false;

  }

  __tagClick = ( event ) => {

    const tag = $(event.currentTarget).data ( 'tag' );

    this.props.container.tag.set ( tag );

    return false;

  }

  __checkboxClick = ( event ) => {

    const $input = $(event.currentTarget),
          checked = $input.prop ( 'checked' ),
          nth = $input.data ( 'nth' );

    if ( !_.isNumber ( nth ) ) return;

    this.props.container.note.toggleCheckboxNth ( undefined, nth, checked );

  }

  __copyClick = ( event ) => {

    const $btn = $(event.currentTarget),
          $code = $btn.next ( 'pre' ).find ( 'code' );

    if ( !$code.length ) return;

    this.props.container.clipboard.set ( $code.text () );

  }

  __mermaidOpenExternalClick = ( event ) => {

    const $btn = $(event.currentTarget),
          $svg = $btn.next ( 'svg' );

    if ( !$svg.length ) return;

    const svgNode = $svg.clone ().removeAttr ( 'style' )[0];

    if ( !svgNode ) return;

    const html = svgNode.outerHTML, // Removing the style attribute, ensuring the svg is displayed at full-width
          base64 = Buffer.from ( html ).toString ( 'base64' ),
          data = `data:image/svg+xml;base64,${base64}`;

    ipc.send ( 'mermaid-open', data ); //TODO: We should open this in the default browser instead, but it turns out that we can't open "data:*"" urls from here, perhaps we could set-up a special-purpose website to workaround this, something like https://notable.md/dataurl#data:image...

  }

}

/* EXPORT */

export default connect ({
  container: Main,
  shouldComponentUpdate: false
})( PreviewPlugins );
