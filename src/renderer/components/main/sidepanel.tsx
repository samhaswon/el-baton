/* IMPORT */

import * as React from 'react';
import {ipcRenderer as ipc, shell} from 'electron';
import {connect} from 'overstated';
import Main from '@renderer/containers/main';
import InfoPane from '@renderer/components/main/mainbar/info_pane';
import MiddlebarContent from '@renderer/components/main/middlebar/content';
import Search from '@renderer/components/main/middlebar/toolbar_search';
import SidebarContent from '@renderer/components/main/sidebar/content';
import {TagSpecials} from '@renderer/utils/tags';
import pkg from '@root/package.json';

const {TEMPLATES} = TagSpecials;

/* SIDEPANEL */

type MenuItemProps = {
  label: string;
  shortcut?: string;
  enabled?: boolean;
  onClick: () => void | Promise<void>;
};

type MenuSectionProps = {
  title: string;
  children?: React.ReactNode;
};

type FilePanelProps = {
  paneStateClassName?: string;
  hasNote: boolean;
  isEditing: boolean;
  isSplit: boolean;
  isTagsEditing: boolean;
  isAttachmentsEditing: boolean;
  isFavorited: boolean;
  isPinned: boolean;
  isDeleted: boolean;
  isMultiEditing: boolean;
  isTemplate: boolean;
  isFocusMode: boolean;
  isZen: boolean;
  hasSidebar: boolean;
  theme: string;
  quickPanelToggle: ( force?: boolean ) => any;
  importSelect: () => any;
  exportHTML: () => any;
  exportMarkdown: () => any;
  exportPDF: () => any;
  noteNew: () => any;
  noteDuplicate: () => any;
  duplicateTemplate: () => any;
  openInApp: () => any;
  revealNote: () => any;
  toggleEditing: () => any;
  toggleTagsEditing: () => any;
  toggleAttachmentsEditing: () => any;
  toggleFavorite: () => any;
  togglePin: () => any;
  moveToTrash: () => any;
  restoreFromTrash: () => any;
  deletePermanently: () => any;
  trashEmpty: () => any;
  selectAllNotes: () => any;
  selectInvertNotes: () => any;
  clearSelectedNotes: () => any;
  windowFocusToggle: () => any;
  windowSidebarToggle: () => any;
  toggleSplit: () => any;
  windowZenToggle: () => any;
  searchFocus: () => any;
  searchPrevious: () => any;
  searchNext: () => any;
  tagPrevious: () => any;
  tagNext: () => any;
  setTheme: ( theme: string ) => any;
  openCheatsheet: () => any;
};

type TodoPanelProps = {
  paneStateClassName?: string;
  title: string;
};

type SidepanelProps = {
  panel?: string;
  setPanel: ( panel: string ) => void;
  isClosing: boolean;
  isOpening: boolean;
  animationsDisabled: boolean;
  isFocus: boolean;
  isZen: boolean;
  hasSidebar: boolean;
} & Omit<FilePanelProps, 'hasSidebar' | 'isZen'>;

const MenuItem = ({ label, shortcut, enabled = true, onClick }: MenuItemProps ) => (
  <button className={`menu-item button ${enabled ? '' : 'disabled'}`} onClick={enabled ? onClick : undefined}>
    <span className="label xsmall">{label}</span>
    {shortcut ? <span className="shortcut xxsmall">{shortcut}</span> : null}
  </button>
);

const MenuSection = ({ title, children }: MenuSectionProps ) => (
  <div className="menu-section">
    <div className="menu-section-title xxsmall">{title}</div>
    <div className="menu-section-items">{children}</div>
  </div>
);

const FilePanel = ({
  paneStateClassName,
  hasNote,
  isEditing,
  isSplit,
  isTagsEditing,
  isAttachmentsEditing,
  isFavorited,
  isPinned,
  isDeleted,
  isMultiEditing,
  isTemplate,
  isFocusMode,
  isZen,
  hasSidebar,
  theme,
  quickPanelToggle,
  importSelect,
  exportHTML,
  exportMarkdown,
  exportPDF,
  noteNew,
  noteDuplicate,
  duplicateTemplate,
  openInApp,
  revealNote,
  toggleEditing,
  toggleTagsEditing,
  toggleAttachmentsEditing,
  toggleFavorite,
  togglePin,
  moveToTrash,
  restoreFromTrash,
  deletePermanently,
  trashEmpty,
  selectAllNotes,
  selectInvertNotes,
  clearSelectedNotes,
  windowFocusToggle,
  windowSidebarToggle,
  toggleSplit,
  windowZenToggle,
  searchFocus,
  searchPrevious,
  searchNext,
  tagPrevious,
  tagNext,
  setTheme,
  openCheatsheet
}: FilePanelProps ) => (
  <div className={`sidepanel-pane layout column ${paneStateClassName || ''}`}>
    <div className="layout-header toolbar">
      <span className="small">File</span>
    </div>
    <div className="layout-content info-pane file-flyout file-flyout-menu">
      <MenuSection title="File">
        <MenuItem label="Import..." onClick={() => importSelect ()} />
        <MenuItem label="Export HTML" enabled={hasNote || isMultiEditing} onClick={() => exportHTML ()} />
        <MenuItem label="Export Markdown" enabled={hasNote || isMultiEditing} onClick={() => exportMarkdown ()} />
        <MenuItem label="Export PDF" enabled={hasNote || isMultiEditing} onClick={() => exportPDF ()} />
        <MenuItem label="Open..." shortcut="Ctrl+O" onClick={() => quickPanelToggle ( true )} />
        <MenuItem label="Open in Default App" enabled={hasNote && !isMultiEditing} onClick={() => openInApp ()} />
        <MenuItem label="Reveal in Folder" enabled={hasNote && !isMultiEditing} onClick={() => revealNote ()} />
        <MenuItem label="New" shortcut="Ctrl+N" enabled={!isMultiEditing} onClick={() => noteNew ()} />
        <MenuItem label="New from Template" enabled={hasNote && isTemplate && !isMultiEditing} onClick={() => duplicateTemplate ()} />
        <MenuItem label="Duplicate" enabled={hasNote && !isMultiEditing} onClick={() => noteDuplicate ()} />
        <MenuItem label={isEditing ? 'Stop Editing' : 'Edit'} enabled={hasNote && !isSplit && !isMultiEditing} onClick={() => toggleEditing ()} />
        <MenuItem label={isTagsEditing ? 'Stop Editing Tags' : 'Edit Tags'} enabled={hasNote && !isMultiEditing} onClick={() => toggleTagsEditing ()} />
        <MenuItem label={isAttachmentsEditing ? 'Stop Editing Attachments' : 'Edit Attachments'} enabled={hasNote && !isMultiEditing} onClick={() => toggleAttachmentsEditing ()} />
        <MenuItem label={isFavorited ? 'Unfavorite' : 'Favorite'} enabled={hasNote && !isMultiEditing} onClick={() => toggleFavorite ()} />
        <MenuItem label={isPinned ? 'Unpin' : 'Pin'} enabled={hasNote && !isMultiEditing} onClick={() => togglePin ()} />
        <MenuItem label="Move to Trash" enabled={hasNote && !isDeleted && !isMultiEditing} onClick={() => moveToTrash ()} />
        <MenuItem label="Restore" enabled={hasNote && isDeleted && !isMultiEditing} onClick={() => restoreFromTrash ()} />
        <MenuItem label="Permanently Delete" enabled={hasNote && !isMultiEditing} onClick={() => deletePermanently ()} />
      </MenuSection>
      <MenuSection title="Edit">
        <MenuItem label="Select Notes - All" onClick={() => selectAllNotes ()} />
        <MenuItem label="Select Notes - Invert" onClick={() => selectInvertNotes ()} />
        <MenuItem label="Select Notes - Clear" onClick={() => clearSelectedNotes ()} />
        <MenuItem label="Empty Trash" onClick={() => trashEmpty ()} />
      </MenuSection>
      <MenuSection title="View">
        <MenuItem label={`Theme: ${theme === 'dark' ? 'Dark' : 'Light'}`} onClick={() => setTheme ( theme === 'dark' ? 'light' : 'dark' )} />
        <MenuItem label={`Focus Mode: ${isFocusMode ? 'On' : 'Off'}`} onClick={() => windowFocusToggle ()} />
        <MenuItem label={`Sidebar: ${hasSidebar ? 'Visible' : 'Hidden'}`} onClick={() => windowSidebarToggle ()} />
        <MenuItem label={`${isSplit ? 'Exit' : 'Enter'} Split View`} enabled={hasNote} onClick={() => toggleSplit ()} />
        <MenuItem label={`Zen Mode: ${isZen ? 'On' : 'Off'}`} onClick={() => windowZenToggle ()} />
      </MenuSection>
      <MenuSection title="Window">
        <MenuItem label="Search" shortcut="Ctrl+F" onClick={() => searchFocus ()} />
        <MenuItem label="Previous Tag" onClick={() => tagPrevious ()} />
        <MenuItem label="Next Tag" onClick={() => tagNext ()} />
        <MenuItem label="Previous Note" onClick={() => searchPrevious ()} />
        <MenuItem label="Next Note" onClick={() => searchNext ()} />
      </MenuSection>
      <MenuSection title="Help">
        <MenuItem label="Learn More" onClick={() => shell.openExternal ( pkg.homepage )} />
        <MenuItem label="Support" onClick={() => shell.openExternal ( pkg.bugs.url )} />
        <MenuItem label="Cheatsheets" onClick={() => openCheatsheet ()} />
        <MenuItem label="Check for Updates..." onClick={() => ipc.send ( 'updater-check' )} />
      </MenuSection>
    </div>
  </div>
);

type ExplorerPanelProps = {
  paneStateClassName?: string;
};

const ExplorerPanel = ({ paneStateClassName }: ExplorerPanelProps ) => (
  <div className={`sidepanel-pane explorer layout column ${paneStateClassName || ''}`}>
    <div className="layout-header toolbar">
      <span className="small">Explorer</span>
    </div>
    <SidebarContent />
  </div>
);

type SearchPanelProps = {
  paneStateClassName?: string;
};

const SearchPanel = ({ paneStateClassName }: SearchPanelProps ) => (
  <div className={`sidepanel-pane search layout column ${paneStateClassName || ''}`}>
    <div className="layout-header toolbar">
      <Search />
    </div>
    <MiddlebarContent />
  </div>
);

const TodoPanel = ({ title, paneStateClassName }: TodoPanelProps ) => (
  <div className={`sidepanel-pane layout column ${paneStateClassName || ''}`}>
    <div className="layout-header toolbar">
      <span className="small">{title}</span>
    </div>
    <div className="layout-content info-pane">
      <div className="value small">TODO</div>
    </div>
  </div>
);

const Sidepanel = ({ panel, setPanel, isClosing, isOpening, animationsDisabled, isFocus, isZen, hasSidebar, ...actions }: SidepanelProps ) => {

  if ( isFocus || isZen || !hasSidebar ) return null;

  const isExplorerPanel = panel === 'explorer',
        explorerStateClassName = isExplorerPanel ? 'is-active' : 'is-inactive',
        shouldRenderStage = !!panel || isClosing;

  let activePanel: React.ReactNode = null;

  if ( panel === 'file' ) activePanel = <FilePanel {...actions} paneStateClassName="is-active" hasSidebar={hasSidebar} isZen={isZen} openCheatsheet={() => setPanel ( 'help' )} />;
  if ( panel === 'search' ) activePanel = <SearchPanel paneStateClassName="is-active" />;
  if ( panel === 'graph' ) activePanel = <TodoPanel paneStateClassName="is-active" title="Graph" />;
  if ( panel === 'info' ) activePanel = <InfoPane className="sidepanel-pane-info sidepanel-pane is-active" />;
  if ( panel === 'help' ) activePanel = <TodoPanel paneStateClassName="is-active" title="Help" />;
  if ( panel === 'settings' ) activePanel = <TodoPanel paneStateClassName="is-active" title="Settings" />;

  return (
    <div className={`sidepanel layout column ${panel ? '' : 'closed'} ${isClosing ? 'closing' : ''} ${isOpening ? 'opening' : ''} ${animationsDisabled ? 'animations-disabled' : ''}`}>
      {!shouldRenderStage ? null : (
        <div className="sidepanel-stage">
          <ExplorerPanel paneStateClassName={explorerStateClassName} />
          {isExplorerPanel ? null : activePanel}
        </div>
      )}
    </div>
  );

};

/* EXPORT */

export default connect ({
  container: Main,
  selector: ({ container, panel, isClosing, isOpening, animationsDisabled }) => ({
    animationsDisabled,
    isOpening,
    hasNote: !!container.note.get (),
    isAttachmentsEditing: container.attachments.isEditing (),
    isDeleted: container.note.isDeleted (),
    isEditing: container.editor.isEditing (),
    isFavorited: container.note.isFavorited (),
    isFocusMode: container.window.isFocus (),
    isFullscreen: container.window.isFullscreen (),
    isMultiEditing: container.multiEditor.isEditing (),
    isTemplate: !!container.note.getTags ( undefined, TEMPLATES ).length,
    panel,
    isClosing,
    hasSidebar: container.window.hasSidebar (),
    isFocus: container.window.isFocus (),
    isPinned: container.note.isPinned (),
    isSplit: container.editor.isSplit (),
    isTagsEditing: container.tags.isEditing (),
    theme: container.theme.get (),
    isZen: container.window.isZen (),
    clearSelectedNotes: container.multiEditor.selectClear,
    deletePermanently: container.note.delete,
    duplicateTemplate: () => container.note.duplicate ( undefined, true ),
    exportHTML: container.export.exportHTML,
    exportMarkdown: container.export.exportMarkdown,
    exportPDF: container.export.exportPDF,
    importSelect: container.import.select,
    moveToTrash: () => container.note.toggleDeleted ( undefined, true ),
    noteNew: container.note.new,
    noteDuplicate: container.note.duplicate,
    openInApp: container.note.openInApp,
    quickPanelToggle: container.quickPanel.toggleOpen,
    restoreFromTrash: () => container.note.toggleDeleted ( undefined, false ),
    revealNote: container.note.reveal,
    searchFocus: container.search.focus,
    searchNext: container.search.next,
    searchPrevious: container.search.previous,
    selectAllNotes: container.multiEditor.selectAll,
    selectInvertNotes: container.multiEditor.selectInvert,
    setTheme: container.theme.set,
    tagNext: container.tag.next,
    tagPrevious: container.tag.previous,
    trashEmpty: container.trash.empty,
    toggleAttachmentsEditing: container.attachments.toggleEditing,
    toggleEditing: container.editor.toggleEditing,
    toggleFavorite: container.note.toggleFavorite,
    togglePin: container.note.togglePin,
    toggleSplit: container.editor.toggleSplit,
    toggleTagsEditing: container.tags.toggleEditing,
    windowFocusToggle: container.window.toggleFocus,
    windowSidebarToggle: container.window.toggleSidebar,
    windowZenToggle: container.window.toggleZen
  })
})( Sidepanel );
