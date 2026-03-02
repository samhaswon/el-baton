
/* IMPORT */

import * as React from 'react';
import {connect} from 'overstated';
import Main from '@renderer/containers/main';
import PopoverNoteAttachments from '@renderer/components/main/popovers/popover_note_attachments';
import PopoverTagsAttachments from '@renderer/components/main/popovers/popover_note_tags';
import Editor from './editor';
import MultiEditor from './multi_editor';
import NoteTabs from './note_tabs';
import Preview from './preview';
import SettingsView from './settings_view';
import SplitEditor from './split_editor';
import LocalSearch from './local_search';
import Toolbar from './toolbar';

/* CONTENT */

const Content = ({ hasNote, isLoading, isEditing, isMultiEditing, isSplit, panel }) => {

  if ( panel === 'settings' ) return <SettingsView />;

  if ( isLoading || !hasNote ) return <Toolbar />;

  return (
    <>
      <PopoverNoteAttachments />
      <PopoverTagsAttachments />
      <Toolbar />
      <NoteTabs />
      <LocalSearch />
      <div className="mainbar-body layout horizontal">
        <div className="mainbar-pane-main layout column">
          {isMultiEditing ? <MultiEditor /> : ( isSplit ? <SplitEditor /> : ( isEditing ? <Editor /> : <Preview /> ) )}
        </div>
      </div>
    </>
  );

};

/* EXPORT */

export default connect ({
  container: Main,
  selector: ({ container, panel }) => ({
    panel,
    hasNote: !!container.note.get (),
    isLoading: container.loading.get (),
    isEditing: container.editor.isEditing (),
    isMultiEditing: container.multiEditor.isEditing (),
    isSplit: container.editor.isSplit ()
  })
})( Content );
