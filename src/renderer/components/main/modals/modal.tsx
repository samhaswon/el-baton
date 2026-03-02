
/* IMPORT */

import * as React from 'react';

/* MODAL */

type ModalProps = {
  open: boolean;
  onBeforeOpen?: Function;
  onOpen?: Function;
  onBeforeClose?: Function;
  onClose?: Function;
  className?: string;
  children?: React.ReactNode;
};

class Modal extends React.Component<ModalProps, {}> {

  $modal;
  modalRef = React.createRef<HTMLDivElement> ();

  componentDidMount () {

    if ( !this.modalRef.current ) return;

    this.$modal = $(this.modalRef.current);

    this.$modal.widgetize ();

    if ( this.props.onBeforeOpen ) this.$modal.on ( 'modal:beforeopen', this.props.onBeforeOpen );
    if ( this.props.onOpen ) this.$modal.on ( 'modal:open', this.props.onOpen );
    if ( this.props.onBeforeClose ) this.$modal.on ( 'modal:beforeclose', this.props.onBeforeClose );
    if ( this.props.onClose ) this.$modal.on ( 'modal:close', this.props.onClose );

    this.update ();

  }

  componentDidUpdate () {

    this.update ();

  }

  update () {

    if ( !this.$modal ) return;

    this.$modal.modal ( 'toggle', this.props.open ).trigger ( 'change' );

  }

  render () {

    const {className, children} = this.props;

    return (
      <div ref={this.modalRef} className={`modal card bordered ${className || ''}`}>
        {children}
      </div>
    );

  }

}

/* EXPORT */

export default Modal;
