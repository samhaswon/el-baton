
/* IMPORT */

import * as React from 'react';
import Utils from '@renderer/utils/utils';

/* LAYOUT */

type LayoutProps = {
  resizable: boolean;
  direction: string;
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
  layoutRef = React.createRef<HTMLDivElement> ();

  update = async () => {

    if ( !this.$layout ) return;

    const {resizable} = this.props;

    if ( !resizable ) return;

    const $children = await Utils.qsaWait ( `:scope > .layout, :scope > .layout-content`, this.$layout );

    if ( !$children || !$children.length ) return;

    if ( $children.length === 1 ) { // Saving state

      this.dimensions = this.$layout.layoutResizable ( 'getDimensions' );

      this.$layout.layoutResizable ( 'destroy' );

    } else { // Resetting

      this.$layout.layoutResizable ( 'destroy' ).layoutResizable ();

      if ( this.dimensions ) { // Restoring state

        this.$layout.layoutResizable ( 'setDimensions', this.dimensions );

      }

    }

  }

  __resize = ( event: Event ) => {

    if ( event.target === this.$layout[0] ) return;

    this.$layout.layoutResizable ( 'instance' ).__resize ();

  }

  componentDidMount () {

    if ( !this.layoutRef.current ) return;

    this.$layout = $(this.layoutRef.current);

    $('.layout.resizable').not ( this.$layout ).on ( 'layoutresizable:resize', this.__resize );

    this.update ();

  }

  componentDidUpdate () {

    if ( this.props.resetCounter !== undefined && this.props.resetCounter !== this._prevResetCounter && this.$layout ) {
      this.dimensions = undefined;
      this.$layout.layoutResizable ( 'destroy' ).layoutResizable ();
      this._prevResetCounter = this.props.resetCounter;
    }

    this.update ();

  }

  componentWillUnmount () {

    if ( !this.$layout ) return;

    this.$layout.layoutResizable ( 'destroy' );

    $('.layout.resizable').not ( this.$layout ).off ( 'layoutresizable:resize', this.__resize );

  }

  render () {

    const {className, direction, resizable, children} = this.props;

    return <div ref={this.layoutRef} className={`layout ${direction} ${resizable ? 'resizable' : ''} ${className || ''}`}>{children}</div>;

  }

}

/* DEFAULT */

export default Layout;
