
/* IMPORT */

import * as React from 'react';

/* TYPES */

type TagboxProps = {
  onChange: Function,
  tags: string[],
  className?: string,
  suggestions?: string[]
};

type TagboxState = {
  query: string,
  focused: boolean,
  highlightedIndex: number
};

/* TAGBOXY */

class Tagbox extends React.PureComponent<TagboxProps, TagboxState> {

  $tagbox;
  $partial;
  partialNode?: HTMLInputElement;
  blurTimeout?: ReturnType<typeof setTimeout>;
  tagboxRef = React.createRef<HTMLDivElement> ();

  state = {
    query: '',
    focused: false,
    highlightedIndex: -1
  };

  onPartialInput = () => {

    if ( !this.$partial || !this.$partial.length ) return;

    this.setState ({
      query: String ( this.$partial.val () || '' ),
      highlightedIndex: -1
    });

  }

  onPartialFocus = () => {

    if ( this.blurTimeout ) {
      clearTimeout ( this.blurTimeout );
      this.blurTimeout = undefined;
    }

    this.setState ({
      focused: true,
      highlightedIndex: -1
    });

  }

  onPartialBlur = () => {

    this.blurTimeout = setTimeout ( () => this.setState ({ focused: false, highlightedIndex: -1 }), 0 );

  }

  getVisibleSuggestions = (): string[] => {

    const {tags, suggestions = []} = this.props;
    const query = this.state.query.trim ().toLowerCase ();

    if ( !query ) return [];

    const selectedTags = new Set ( tags.map ( tag => tag.toLowerCase () ) );
    const availableSuggestions = suggestions.filter ( suggestion => !selectedTags.has ( suggestion.toLowerCase () ) );
    const matchingSuggestions = query
      ? availableSuggestions.filter ( suggestion => suggestion.toLowerCase ().includes ( query ) )
      : availableSuggestions;
    const startsWithSuggestions = query
      ? matchingSuggestions.filter ( suggestion => suggestion.toLowerCase ().startsWith ( query ) )
      : matchingSuggestions;
    const includesSuggestions = query
      ? matchingSuggestions.filter ( suggestion => !suggestion.toLowerCase ().startsWith ( query ) )
      : [];

    return [...startsWithSuggestions, ...includesSuggestions].slice ( 0, 10 );

  }

  onPartialKeyDownCapture = ( event: KeyboardEvent ) => {

    const visibleSuggestions = this.getVisibleSuggestions ();

    if ( !visibleSuggestions.length ) return;

    if ( event.key === 'ArrowDown' ) {
      const nextIndex = this.state.highlightedIndex < 0 ? 0 : ( this.state.highlightedIndex + 1 ) % visibleSuggestions.length;
      event.preventDefault ();
      event.stopImmediatePropagation ();
      this.setState ({ highlightedIndex: nextIndex, focused: true });
      return;
    }

    if ( event.key === 'ArrowUp' ) {
      const nextIndex = this.state.highlightedIndex < 0 ? visibleSuggestions.length - 1 : ( this.state.highlightedIndex + visibleSuggestions.length - 1 ) % visibleSuggestions.length;
      event.preventDefault ();
      event.stopImmediatePropagation ();
      this.setState ({ highlightedIndex: nextIndex, focused: true });
      return;
    }

    if ( event.key === 'Tab' || event.key === 'Enter' ) {
      const nextIndex = this.state.highlightedIndex;
      const hasSelection = nextIndex >= 0 && nextIndex < visibleSuggestions.length;

      if ( !hasSelection ) return;

      const suggestion = visibleSuggestions[nextIndex];

      if ( !suggestion ) return;

      event.preventDefault ();
      event.stopImmediatePropagation ();
      this.addSuggestion ( suggestion );
      return;
    }

  }

  onPartialKeyPressCapture = ( event: KeyboardEvent ) => {

    if ( event.key !== 'Tab' && event.key !== 'Enter' ) return;

    const visibleSuggestions = this.getVisibleSuggestions ();
    const hasSelection = this.state.highlightedIndex >= 0 && this.state.highlightedIndex < visibleSuggestions.length;

    if ( !visibleSuggestions.length || !hasSelection ) return;

    event.preventDefault ();
    event.stopPropagation ();
    event.stopImmediatePropagation ();

  }

  componentDidMount () {

    if ( !this.tagboxRef.current ) return;

    this.$tagbox = $(this.tagboxRef.current);
    this.$partial = this.$tagbox.find ( '.tagbox-partial' );

    this.$tagbox.widgetize ();
    this.$partial = this.$tagbox.find ( '.tagbox-partial' );
    this.partialNode = this.$partial[0] as HTMLInputElement | undefined;

    this.$partial.on ( 'input change', this.onPartialInput );
    this.$partial.on ( 'focus', this.onPartialFocus );
    this.$partial.on ( 'blur', this.onPartialBlur );

    if ( this.partialNode ) {
      this.partialNode.addEventListener ( 'keydown', this.onPartialKeyDownCapture, true );
      this.partialNode.addEventListener ( 'keypress', this.onPartialKeyPressCapture, true );
    }

    if ( this.props.onChange ) {

      this.$tagbox.on ( 'tagbox:change', () => this.props.onChange ( this.$tagbox.tagbox ( 'get' ) ) );

    }

  }

  componentDidUpdate () {

    this.$tagbox.tagbox ( 'option', 'tags', this.props.tags );

  }

  componentWillUnmount () {

    if ( this.blurTimeout ) {
      clearTimeout ( this.blurTimeout );
      this.blurTimeout = undefined;
    }

    if ( this.$partial && this.$partial.length ) {
      this.$partial.off ( 'input change', this.onPartialInput );
      this.$partial.off ( 'focus', this.onPartialFocus );
      this.$partial.off ( 'blur', this.onPartialBlur );
    }

    if ( this.partialNode ) {
      this.partialNode.removeEventListener ( 'keydown', this.onPartialKeyDownCapture, true );
      this.partialNode.removeEventListener ( 'keypress', this.onPartialKeyPressCapture, true );
      this.partialNode = undefined;
    }

  }

  addSuggestion = ( suggestion: string ) => {

    if ( !this.$tagbox || !this.$partial ) return;

    this.$tagbox.tagbox ( 'add', suggestion );
    this.$partial.val ( '' ).trigger ( 'change' );
    this.setState ({ query: '', focused: true, highlightedIndex: -1 });
    this.$partial.trigger ( 'focus' );

  }

  render () {

    const {className, tags} = this.props;
    const visibleSuggestions = this.getVisibleSuggestions ();
    const showSuggestions = this.state.focused && !!visibleSuggestions.length;

    return (
      <div ref={this.tagboxRef} className={`tagbox card-footer bordered ${className || ''}`}>
        <input defaultValue={tags} className="hidden" />
        <input autoFocus={true} placeholder="Add tags..." className="tagbox-partial autogrow autofocus compact small" />
        {showSuggestions ? (
          <div className="popover-note-tags-suggestions">
            {visibleSuggestions.map ( ( suggestion, index ) => (
              <div key={suggestion} className={`popover-note-tags-suggestion button list-item small ${index === this.state.highlightedIndex ? 'active' : ''}`} onMouseEnter={() => this.setState ({ highlightedIndex: index })} onMouseDown={event => { event.preventDefault (); this.addSuggestion ( suggestion ); }}>
                <span className="title">{suggestion}</span>
              </div>
            ))}
          </div>
        ) : undefined}
      </div>
    );

  }

}

/* EXPORT */

export default Tagbox;
