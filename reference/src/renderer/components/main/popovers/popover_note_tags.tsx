
/* IMPORT */

import * as _ from 'lodash';
import * as React from 'react';
import {connect} from 'overstated';
import Main from '@renderer/containers/main';
import FixedList from '@renderer/components/main/structures/fixed_list';
import Tags from '@renderer/utils/tags';
import Popover from './popover';
import Tag from './tag';
import Tagbox from './tagbox';

/* POPOVER NOTE TAGS */

const PopoverNoteTags = ({ tags, suggestions, isEditing, toggleEditing, replaceTags }) => (
  <Popover open={isEditing} onBeforeClose={() => _.defer ( () => toggleEditing ( false ) )} anchor=".popover-note-tags-trigger" className="popover-note-tags">
    <FixedList className="popover-note-tags-list card-block" data={tags} fallbackEmptyMessage="No tags">{Tag}</FixedList>
    <Tagbox className="card-footer" tags={_.clone ( tags )} suggestions={suggestions} onChange={tags => replaceTags ( undefined, Tags.sort ( tags ) )} />
  </Popover>
);

/* EXPORT */

export default connect ({
  container: Main,
  selector: ({ container }) => ({
    tags: container.note.getTags (),
    suggestions: (() => {
      const noteTagsSet = new Set ( container.note.getTags () );
      const allTagsSet = new Set<string> ();

      Object.values ( container.notes.get () ).forEach ( note => {
        container.note.getTags ( note ).forEach ( tag => {
          if ( !noteTagsSet.has ( tag ) ) allTagsSet.add ( tag );
        });
      });

      return Tags.sort ( Array.from ( allTagsSet ) ) as string[];
    }) (),
    isEditing: container.tags.isEditing (),
    toggleEditing: container.tags.toggleEditing,
    replaceTags: container.note.replaceTags
  })
})( PopoverNoteTags );
