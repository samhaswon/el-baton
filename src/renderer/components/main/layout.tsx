
/* IMPORT */

import * as React from 'react';

/* LAYOUT */

type LayoutProps = {
  resizable: boolean;
  direction: string;
  optimizeUpdates?: boolean;
  resizeToken?: string | number;
  className?: string;
  isFocus?: boolean;
  isZen?: boolean;
  hasSidebar?: boolean;
  resetCounter?: number;
  children?: React.ReactNode;
};

class Layout extends React.Component<LayoutProps, {}> {

  $layout;
  dimensions?: number[];
  _prevResetCounter?: number;
  _lastChildrenCount?: number;
  _isResizableInitialized = false;
  layoutRef = React.createRef<HTMLDivElement> ();

  __getChildrenCount = () => {

    if ( !this.layoutRef.current ) return 0;

    return this.layoutRef.current.querySelectorAll ( ':scope > .layout, :scope > .layout-content' ).length;

  }

  update = () => {

    if ( !this.$layout ) return;

    const {resizable, optimizeUpdates} = this.props;

    if ( !resizable ) {
      if ( this._isResizableInitialized ) {
        this.$layout.layoutResizable ( 'destroy' );
        this._isResizableInitialized = false;
      }
      this._lastChildrenCount = undefined;
      return;
    }

    const childrenCount = this.__getChildrenCount ();

    if ( !childrenCount ) return;

    const childrenCountChanged = childrenCount !== this._lastChildrenCount;

    if ( childrenCount === 1 ) { // Save splitter state when collapsing to a single pane
      if ( this._isResizableInitialized ) {
        this.dimensions = this.$layout.layoutResizable ( 'getDimensions' );
        this.$layout.layoutResizable ( 'destroy' );
        this._isResizableInitialized = false;
      }
      this._lastChildrenCount = childrenCount;
      return;
    }

    if ( !this._isResizableInitialized || childrenCountChanged ) {
      if ( this._isResizableInitialized ) {
        this.$layout.layoutResizable ( 'destroy' );
      }

      this.$layout.layoutResizable ();
      this._isResizableInitialized = true;

      if ( this.dimensions ) { // Restore splitter state when panes come back
        this.$layout.layoutResizable ( 'setDimensions', this.dimensions );
      }
    } else if ( !optimizeUpdates ) {
      this.__resizeLayout ();
    }

    this._lastChildrenCount = childrenCount;

  }

  __resize = ( event: Event ) => {

    if ( event.target === this.$layout[0] ) return;
    if ( !this._isResizableInitialized ) return;

    this.$layout.layoutResizable ( 'instance' ).__resize ();

  }

  __resizeLayout = () => {

    if ( !this.$layout || !this._isResizableInitialized ) return;

    this.$layout.layoutResizable ( 'instance' ).__resize ();
    this.$layout.trigger ( 'layoutresizable:resize' );

  }

  componentDidMount () {

    if ( !this.layoutRef.current ) return;

    this.$layout = $(this.layoutRef.current);

    $('.layout.resizable').not ( this.$layout ).on ( 'layoutresizable:resize', this.__resize );

    this.update ();

  }

  componentDidUpdate ( prevProps: LayoutProps ) {

    if ( this.props.resetCounter !== undefined && this.props.resetCounter !== this._prevResetCounter && this.$layout ) {
      this.dimensions = undefined;
      if ( this._isResizableInitialized ) {
        this.$layout.layoutResizable ( 'destroy' );
        this._isResizableInitialized = false;
      }
      this._lastChildrenCount = undefined;
      this._prevResetCounter = this.props.resetCounter;
    }

    this.update ();

    const requiresResize =
      prevProps.className !== this.props.className ||
      prevProps.direction !== this.props.direction ||
      prevProps.resizeToken !== this.props.resizeToken ||
      prevProps.isFocus !== this.props.isFocus ||
      prevProps.isZen !== this.props.isZen ||
      prevProps.hasSidebar !== this.props.hasSidebar;

    if ( requiresResize ) {
      this.__resizeLayout ();
    }

  }

  componentWillUnmount () {

    if ( !this.$layout ) return;

    if ( this._isResizableInitialized ) {
      this.$layout.layoutResizable ( 'destroy' );
      this._isResizableInitialized = false;
    }

    $('.layout.resizable').not ( this.$layout ).off ( 'layoutresizable:resize', this.__resize );

  }

  render () {

    const {className, direction, resizable, children} = this.props;

    return <div ref={this.layoutRef} className={`layout ${direction} ${resizable ? 'resizable' : ''} ${className || ''}`}>{children}</div>;

  }

}

/* DEFAULT */

export default Layout;
