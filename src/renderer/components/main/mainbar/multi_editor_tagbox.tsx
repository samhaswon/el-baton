
/* IMPORT */

import * as React from 'react';
import Button from './multi_editor_button';

/* MULTI EDITOR TAGBOX */

class Tagbox extends React.PureComponent<{ onClick: Function, icon: string, title: string, placeholder: string }, {}> {

  $wrapper; $tagbox;
  wrapperRef = React.createRef<HTMLDivElement> ();

  componentDidMount () {

    if ( !this.wrapperRef.current ) return;

    this.$wrapper = $(this.wrapperRef.current);
    this.$tagbox = this.$wrapper.find ( '.tagbox' );

    this.$tagbox.widgetize ();

  }

  onClick = () => {

    const tags = this.$tagbox.tagbox ( 'get' );

    this.props.onClick ( tags );

  }

  render () {

    const {icon, title, placeholder} = this.props;

    return (
      <div ref={this.wrapperRef} className="multiple joined fluid">
        <div className="tagbox bordered fluid" data-options='{"addOnBlur": true}'>
          <input name="name" defaultValue="" className="hidden" />
          <div className="tagbox-tags">
            <input placeholder={placeholder} className="tagbox-partial autogrow compact small" />
          </div>
        </div>
        <Button icon={icon} title={title} onClick={this.onClick} />
      </div>
    );

  }

}

/* EXPORT */

export default Tagbox;
