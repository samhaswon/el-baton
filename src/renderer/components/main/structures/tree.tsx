
/* IMPORT */

import * as _ from 'lodash';
import * as isShallowEqual from 'is-shallow-equal';
import * as React from 'react';
import {createElement} from 'react';
import {List} from 'react-window';
import type {ListImperativeAPI, RowComponentProps} from 'react-window';

/* TREE */

class Tree extends React.Component<{ children, data: any[], className?: string, FallbackEmptyComponent?, fallbackEmptyMessage?: string, getHeight?: Function, getItemChildren?: Function, getItemKey?: Function, filterItem?: Function, isFlat?: boolean, isFixed?: boolean, isKeyed?: boolean }, { height: number, items: any[], levels: number[], isLeafs: boolean[] }> {

  /* VARIABLES */

  listRef = React.createRef<ListImperativeAPI> ();
  fixedOuterRef = React.createRef<HTMLDivElement> ();

  /* STATE */

  state = {
    height: 0,
    items: [] as any[],
    levels: [] as number[],
    isLeafs: [] as boolean[]
  };

  /* LIFECYCLE */

  componentDidMount () {

    $.$window.on ( 'resize:height', this.updateHeight );
    $.$window.on ( 'scroll-to-item', this.scrollToItem );

    this.update ();

  }

  componentWillUnmount () {

    $.$window.off ( 'resize:height', this.updateHeight );
    $.$window.off ( 'scroll-to-item', this.scrollToItem );

  }

  componentDidUpdate ( propsPrev ) {

    if ( propsPrev.data !== this.props.data ) {
      this.update ( this.props );
    }

  }

  shouldComponentUpdate ( propsNext, stateNext ) {

    if ( propsNext.data !== this.props.data ) return true;

    return this.state.height !== stateNext.height || !isShallowEqual ( this.state.items, stateNext.items );

  }

  /* API */

  scrollToItem = ( event: Event, index: number ) => {

    const listElement = this.listRef.current?.element || null,
          hasVirtualList = !!this.listRef.current && !!listElement;
    const hasFixedList = !!this.fixedOuterRef.current;

    if ( !hasVirtualList && !hasFixedList ) return;

    if ( hasVirtualList && listElement && !listElement.contains ( event.target as Node ) ) return; //TSC
    if ( !hasVirtualList && hasFixedList && this.fixedOuterRef.current && !this.fixedOuterRef.current.contains ( event.target as Node ) ) return; //TSC

    if ( !_.isNumber ( index ) ) {

      index = this.getItemIndex ( index );

      if ( !_.isNumber ( index ) || index < 0 ) return;

    }

    if ( hasVirtualList && this.listRef.current ) {

      this.listRef.current.scrollToRow ({ index, align: 'auto' });

      if ( index === 0 ) { //FIXME: https://github.com/bvaughn/react-window/issues/136
        setTimeout ( () => {
          if ( !listElement ) return;
          listElement.scrollTop = 0
        });
      }

      return;

    }

    if ( !this.fixedOuterRef.current ) return;

    if ( index === 0 ) {
      this.fixedOuterRef.current.scrollTop = 0;
      return;
    }

    const row = this.fixedOuterRef.current.querySelector ( `.multiple.vertical.joined > *:nth-child(${index + 1})` ) as HTMLElement | null;

    if ( !row ) return;

    row.scrollIntoView ({ block: 'nearest' });

  }

  getHeight = ( items: any[] ) => {

    return this.props.getHeight ? this.props.getHeight ( items ) : 0;

  }

  updateHeight = () => {

    const height = this.getHeight ( this.state.items );

    if ( height === this.state.height ) return;

    this.setState ({ height });

  }

  getItem = ( index: number ) => {

    return this.state.items[index];

  }

  getItemIndex = ( item ) => {

    const index = this.state.items.indexOf ( item );

    if ( index >= 0 ) return index;

    if ( this.props.getItemKey ) {

      const getItemKey = this.props.getItemKey,
            itemKey = _.isObject ( item ) ? getItemKey ( item ) : item;

      if ( !_.isUndefined ( itemKey ) ) {
        return this.state.items.findIndex ( entry => getItemKey ( entry ) === itemKey );
      }

    }

    if ( _.isString ( item ) ) {
      return this.state.items.findIndex ( entry => entry && ( entry.key === item || entry.path === item || entry.filePath === item ) );
    }

    return -1;

  }

  getItemLevel = ( index: number ) => {

    if ( this.props.isFlat ) return 0;

    return this.state.levels[index];

  }

  getItemIsLeaf = ( index: number ) => {

    if ( this.props.isFlat ) return true;

    return this.state.isLeafs[index];

  }

  getItemKey = ( index: number ) => {

    const isNumber = _.isNumber ( index );

    if ( this.props.getItemKey ) {

      return isNumber ? this.props.getItemKey ( this.getItem ( index ) ) || index : this.props.getItemKey ( index ) || this.getItemIndex ( index );

    } else {

      return isNumber ? index : this.getItemIndex ( index );

    }

  };

  getItemChildren = this.props.getItemChildren || function ( item ) {

    return item.children;

  };

  filterItem = this.props.filterItem || _.constant ( true )

  getItems = ( data: any[], level: number = 0 ) => {

    if ( this.props.isFlat ) return { items: data.filter ( this.filterItem as any ), levels: [], isLeafs: [] }; //TSC

    const items: any[] = [],
          levels: number[] = [],
          isLeafs: boolean[] = [];

    data.forEach ( item => {

      if ( !this.filterItem ( item ) ) return;

      const children = this.getItemChildren ( item );

      items.push ( item );
      levels.push ( level );
      isLeafs.push ( !children || !children.length );

      if ( !children ) return;

      children.forEach ( item => {

        const {items: childrenItems, levels: childrenLevels, isLeafs: childrenIsLeafs} = this.getItems ( [item], level + 1 );

        items.push ( ...childrenItems );
        levels.push ( ...childrenLevels );
        isLeafs.push ( ...childrenIsLeafs );

      })

    });

    return {items, levels, isLeafs};

  }

  areItemsKeysEqual ( x, y ) {

    if ( x.length !== y.length ) return false;

    return x.every ( ( item, index ) => this.getItemKey ( item ) === this.getItemKey ( y[index] ) );

  }

  updateItems = ( props, callback? ) => {

    const {items, levels, isLeafs} = this.getItems ( props.data );

    if ( this.props.isKeyed && this.areItemsKeysEqual ( items, this.state.items ) && ( this.props.isFlat || ( _.isEqual ( levels, this.state.levels ) && _.isEqual ( isLeafs, this.state.isLeafs ) ) ) ) return; // Skipping unnecessary update, the keys didn't change

    this.setState ( {items, levels, isLeafs}, callback );

  }

  update = ( props = this.props ) => {

    this.updateItems ( props, this.updateHeight );

  }

  /* RENDER */

  renderRow = ({index, style}: RowComponentProps<object>) => {

    const {children} = this.props;
    const item = this.getItem ( index );
    const itemKey = this.getItemKey ( item );
    const level = this.getItemLevel ( index );
    const isLeaf = this.getItemIsLeaf ( index );

    return createElement ( children, { index, style, item, itemKey, level, isLeaf });

  }

  render () {

    const {children, className, isFixed, FallbackEmptyComponent, fallbackEmptyMessage} = this.props;

    const {height, items} = this.state;

    if ( !items.length ) {

      if ( !FallbackEmptyComponent && !fallbackEmptyMessage ) return null;

      return (
        <div className={`tree list ${className || ''}`}>
          {FallbackEmptyComponent ? <FallbackEmptyComponent /> : (
            <div className="label list-item empty">
              <span className="title small">{fallbackEmptyMessage}</span>
            </div>
          )}
        </div>
      );

    } else if ( isFixed ) {

      return (
        <div ref={this.fixedOuterRef} className={`tree list ${className || ''}`}>
          <div className="multiple vertical joined">
            {items.map ( ( item, index ) => {
              const itemKey = this.getItemKey ( item );
              const level = this.getItemLevel ( index );
              const isLeaf = this.getItemIsLeaf ( index );
              return createElement ( children, { key: itemKey || index, item, itemKey, level, isLeaf });
            })}
          </div>
        </div>
      );

    } else {

      return (
        <List
          listRef={this.listRef}
          className={`tree list ${className || ''}`}
          style={{ height }}
          rowHeight={32}
          rowCount={items.length}
          rowProps={{}}
          rowComponent={this.renderRow}
        />
      );

    }

  }

}

/* EXPORT */

export default Tree;
