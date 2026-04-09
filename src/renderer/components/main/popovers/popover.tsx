
/* IMPORT */

import * as React from 'react';

/* POPOVER */

type PopoverProps = {
  open: boolean;
  anchor: string;
  className?: string;
  onBeforeOpen?: Function;
  onOpen?: Function;
  onBeforeClose?: Function;
  onClose?: Function;
  children?: React.ReactNode;
};

class Popover extends React.Component<PopoverProps, {}> {

  $popover;
  popoverRef = React.createRef<HTMLDivElement> ();

  componentDidMount () {

    if ( !this.popoverRef.current ) return;

    this.$popover = $(this.popoverRef.current);
    this.$popover.widgetize ();

    if ( this.props.onBeforeOpen ) this.$popover.on ( 'popover:beforeopen', this.props.onBeforeOpen );
    if ( this.props.onOpen ) this.$popover.on ( 'popover:open', this.props.onOpen );
    if ( this.props.onBeforeClose ) this.$popover.on ( 'popover:beforeclose', this.props.onBeforeClose );
    if ( this.props.onClose ) this.$popover.on ( 'popover:close', this.props.onClose );

    this.update ();

  }

  componentDidUpdate ( prevProps: PopoverProps ) {

    if ( prevProps.open === this.props.open && prevProps.anchor === this.props.anchor ) return;

    this.update ();

  }

  update () {

    if ( !this.$popover ) return;

    this.$popover.popover ( 'toggle', this.props.open, $(this.props.anchor)[0] ).trigger ( 'change' );

  }

  render () {

    const {children, className} = this.props;

    return (
      <div ref={this.popoverRef} className={`popover card bordered ${className || ''}`}>
        {children}
      </div>
    );

  }

}

/* EXPORT */

export default Popover;
