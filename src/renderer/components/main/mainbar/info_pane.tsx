/* IMPORT */

import * as React from 'react';
import {connect} from 'overstated';
import Main from '@renderer/containers/main';

/* HELPERS */

const getTOCIndent = ( relativeLevel: number ) => {

  return 10 + ( Math.max ( 1, relativeLevel ) - 1 ) * 14;

};

const SECTION_CONTENT_INDENT = getTOCIndent ( 2 );

const getHeadings = ( content: string ) => {

  const lines = content.split ( /\r?\n/g ),
        headings: { text: string, level: number, relativeLevel?: number, key: string, index: number }[] = [];

  let inFence = false;

  for ( let i = 0, l = lines.length; i < l; i++ ) {

    const line = lines[i],
          trimmed = line.trim ();

    if ( /^(```|~~~)/.test ( trimmed ) ) {
      inFence = !inFence;
      continue;
    }

    if ( inFence ) continue;

    const atxMatch = line.match ( /^\s{0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/ );

    if ( atxMatch ) {
      headings.push ({
        index: headings.length,
        key: `${i}:${atxMatch[2]}`,
        level: atxMatch[1].length,
        text: atxMatch[2].trim ()
      });
      continue;
    }

    const nextLine = lines[i + 1];

    if ( !nextLine ) continue;

    const setextMatch = nextLine.match ( /^\s{0,3}(=+|-+)\s*$/ );

    if ( !setextMatch || !trimmed ) continue;

    headings.push ({
      index: headings.length,
      key: `${i}:${trimmed}`,
      level: setextMatch[1].startsWith ( '=' ) ? 1 : 2,
      text: trimmed
    });

    i++;

  }

  const minimumLevel = headings.reduce ( ( min, heading ) => Math.min ( min, heading.level ), Infinity );

  return headings.map ( heading => ({
    ...heading,
    relativeLevel: Math.max ( 1, heading.level - minimumLevel + 1 )
  }));

};

/* TOC PANE */

const InfoPane = ({ className = 'mainbar-pane-info', hasNote, isMultiEditing, content, title, filePath, tags, attachments, created, modified, checksum, toggleTagsEditing, toggleAttachmentsEditing }) => {

  const headings = React.useMemo ( () => getHeadings ( content ), [content] );
  const words = React.useMemo ( () => ( content.match ( /\S+/g ) || [] ).length, [content] );
  const characters = content.length;
  const isSidepanel = className === 'sidepanel-pane-info';
  const contentClassName = isSidepanel ? 'info-pane toc-pane sidepanel-pane-info-content' : 'layout-content info-pane toc-pane';

  const scrollToHeading = ( index: number ) => {

    const $headings = $('.preview h1, .preview h2, .preview h3, .preview h4, .preview h5, .preview h6');

    if ( !$headings.length ) return;

    const node = $headings.get ( index );

    if ( !node || !( node instanceof HTMLElement ) ) return;

    node.scrollIntoView ({
      behavior: 'smooth',
      block: 'start'
    });

  };

  return (
    <div className={`${className} layout column`}>
      <div className="layout-header toolbar">
        <span className="small">Table of Contents</span>
      </div>
      <div className={contentClassName}>
        <div className="toc-pane-headings">
          {isMultiEditing || !hasNote ? <div className="info-empty small">No headings</div> : (
            headings.length ? headings.map ( heading => (
              <div
                key={heading.key}
                className="toc-item small"
                style={{
                  paddingLeft: getTOCIndent ( heading.relativeLevel || 1 )
                }}
                onClick={() => scrollToHeading ( heading.index )}
              >
                {heading.text}
              </div>
            )) : <div className="info-empty small">No headings</div>
          )}
        </div>

        {isMultiEditing || !hasNote ? null : (
          <div className="toc-pane-meta">
            <div className="info-divider"></div>

            <div className="info-section info-section-primary">
              <div className="info-heading">Title</div>
              <div className="info-body" style={{ paddingLeft: SECTION_CONTENT_INDENT }}>
                <div className="value small">{title}</div>
              </div>
            </div>

            <div className="info-section">
              <div className="info-heading">Path</div>
              <div className="info-body" style={{ paddingLeft: SECTION_CONTENT_INDENT }}>
                <div className="value small mono">{filePath}</div>
              </div>
            </div>

            <div className="info-section">
              <div className="info-heading">Words</div>
              <div className="info-body" style={{ paddingLeft: SECTION_CONTENT_INDENT }}>
                <div className="value small">{words}</div>
              </div>
            </div>

            <div className="info-section">
              <div className="info-heading">Characters</div>
              <div className="info-body" style={{ paddingLeft: SECTION_CONTENT_INDENT }}>
                <div className="value small">{characters}</div>
              </div>
            </div>

            <div className="info-section">
              <div className="info-heading">Hash</div>
              <div className="info-body" style={{ paddingLeft: SECTION_CONTENT_INDENT }}>
                <div className="value small mono">{checksum}</div>
              </div>
            </div>

            <div className="info-section">
              <div className="info-heading">Created</div>
              <div className="info-body" style={{ paddingLeft: SECTION_CONTENT_INDENT }}>
                <div className="value small">{created.toLocaleString ()}</div>
              </div>
            </div>

            <div className="info-section">
              <div className="info-heading">Modified</div>
              <div className="info-body" style={{ paddingLeft: SECTION_CONTENT_INDENT }}>
                <div className="value small">{modified.toLocaleString ()}</div>
              </div>
            </div>

            <div className="info-section">
              <div className="info-heading">Tags</div>
              <div className="info-body" style={{ paddingLeft: SECTION_CONTENT_INDENT }}>
                {tags.length ? (
                  <div className="value small">
                    {tags.map ( ( tag, index ) => (
                      <React.Fragment key={tag}>
                        {index ? <br /> : null}
                        {tag}
                      </React.Fragment>
                    ))}
                  </div>
                ) : (
                  <div className="info-empty small">No tags</div>
                )}
                <div className="action small" onClick={() => toggleTagsEditing ( true )}>Add tag...</div>
              </div>
            </div>

            <div className="info-section">
              <div className="info-heading">Attachments</div>
              <div className="info-body" style={{ paddingLeft: SECTION_CONTENT_INDENT }}>
                {attachments.length ? (
                  <div className="info-list">
                    {attachments.map ( attachment => <span key={attachment} className="chip small">{attachment}</span> )}
                  </div>
                ) : (
                  <div className="info-empty small">No attachments</div>
                )}
                <div className="action small" onClick={() => toggleAttachmentsEditing ( true )}>Add attachment...</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

};

/* EXPORT */

export default connect ({
  container: Main,
  selector: ({ container }) => {
    const note = container.note.get (),
          hasNote = !!note;

    return {
      attachments: hasNote ? container.note.getAttachments ( note ) : [],
      checksum: hasNote ? container.note.getChecksum ( note ) : NaN,
      created: hasNote ? container.note.getCreated ( note ) : new Date (),
      filePath: hasNote ? note.filePath : '',
      hasNote,
      isMultiEditing: container.multiEditor.isEditing (),
      modified: hasNote ? container.note.getModified ( note ) : new Date (),
      content: hasNote ? container.note.getPlainContent ( note ) : '',
      tags: hasNote ? container.note.getTags ( note ) : [],
      title: hasNote ? container.note.getTitle ( note ) : '',
      toggleAttachmentsEditing: container.attachments.toggleEditing,
      toggleTagsEditing: container.tags.toggleEditing
    };
  }
})( InfoPane );
