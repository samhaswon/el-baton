
/* IMPORT */

import * as _ from 'lodash';
import * as React from 'react';
import {connect} from 'overstated';
import Main from '@renderer/containers/main';
import Layout from '@renderer/components/main/layout';
import Editor from './editor';
import Preview from './preview';

type ScrollAnchorKind = 'heading' | 'p' | 'li' | 'blockquote' | 'table' | 'pre' | 'pre-end' | 'hr' | 'details' | 'summary' | 'details-end' | 'media' | 'media-end';
type SourceAnchor = { line: number, kind: ScrollAnchorKind, key?: string };
type PreviewAnchor = { top: number, kind: ScrollAnchorKind, key?: string };

/* SPLIT EDITOR */

class SplitEditor extends React.PureComponent<{ isFocus: boolean, isZen: boolean, hasSidebar: boolean, content: string, getMonaco: () => MonacoEditor | undefined, splitViewSyncEnabled: boolean, maxSyncFps: number }, { content?: string }> {

  _previewRef = React.createRef<HTMLDivElement> ();
  _ignoreSourceScrollUntil = 0;
  _ignorePreviewScrollUntil = 0;
  _sourceSyncFrame = 0;
  _previewSyncFrame = 0;
  _anchorsFrame = 0;
  _settledSyncFrame = 0;
  _previewToggleNode: HTMLDivElement | null = null;
  _sourceAnchorCacheContent?: string;
  _sourceAnchorCache: SourceAnchor[] = [];
  _anchorPairs: { source: number, preview: number }[] = [];
  _anchorsCache?: { sourceMaxUnits: number, previewMaxScrollTop: number, anchors: { source: number, preview: number }[] };
  _pendingRenderMeta: { kind?: string, sourceSnapshot?: { sourceUnits: number, sourceMaxUnits: number }, partialWindow?: { startLine: number, endLine: number, totalLines: number } } | undefined;
  _currentPartialWindow?: { startLine: number, endLine: number, totalLines: number };
  _isPreviewRendering = false;
  _isPreviewPartial = false;
  _previewToSourceLockUntil = 0;
  _lastSourceScrollTop = NaN;
  _lastSourceUnits = NaN;
  _lastPreviewScrollTop = NaN;
  _lastSourceSyncAt = 0;
  _lastPreviewSyncAt = 0;

  state = {
    content: undefined as string | undefined
  };

  __change = _.debounce ( content => {

    this.setState ({ content });

  }, 25 )

  componentDidMount () {

    $.$window.on ( 'preview:rendered', this.__previewRendered );
    $.$window.on ( 'preview:render:start', this.__previewRenderStart );
    $.$window.on ( 'preview:render:stop', this.__previewRenderStop );
    $.$window.on ( 'preview:dynamic-content:updated', this.__previewDynamicContentUpdated );
    $.$window.on ( 'monaco:update', this.__scheduleSourceSync );
    $.$document.on ( 'layoutresizable:resize', this.__layoutResized );

    this._previewToggleNode = this._previewRef.current;
    this._previewToggleNode?.addEventListener ( 'toggle', this.__previewToggle, true );

    this.__scheduleAnchorsRebuild ();
    this.__scheduleSourceSync (); // Align from top when entering split mode

  }

  componentWillUnmount () {

    $.$window.off ( 'preview:rendered', this.__previewRendered );
    $.$window.off ( 'preview:render:start', this.__previewRenderStart );
    $.$window.off ( 'preview:render:stop', this.__previewRenderStop );
    $.$window.off ( 'preview:dynamic-content:updated', this.__previewDynamicContentUpdated );
    $.$window.off ( 'monaco:update', this.__scheduleSourceSync );
    $.$document.off ( 'layoutresizable:resize', this.__layoutResized );

    this._previewToggleNode?.removeEventListener ( 'toggle', this.__previewToggle, true );
    this._previewToggleNode = null;

    window.cancelAnimationFrame ( this._sourceSyncFrame );
    window.cancelAnimationFrame ( this._previewSyncFrame );
    window.cancelAnimationFrame ( this._anchorsFrame );
    window.cancelAnimationFrame ( this._settledSyncFrame );

  }

  __getSourceMetrics = () => {

    const monaco = this.props.getMonaco ();

    if ( !monaco ) return;

    const scrollTop = monaco.getScrollTop (),
          scrollHeight = monaco.getScrollHeight (),
          layoutInfo = monaco.getLayoutInfo (),
          model = monaco.getModel (),
          visibleRanges = monaco.getVisibleRanges (),
          firstVisibleLine = visibleRanges && visibleRanges[0] ? visibleRanges[0].startLineNumber : 1,
          lineCount = model ? model.getLineCount () : 1,
          lineTop = monaco.getTopForLineNumber ( firstVisibleLine ),
          nextLineTop = monaco.getTopForLineNumber ( Math.min ( lineCount, firstVisibleLine + 1 ) ),
          lineHeight = Math.max ( 1, nextLineTop - lineTop || 20 ),
          sourceMaxUnits = Math.max ( 1, lineCount - 1 ),
          sourceUnits = _.clamp ( ( firstVisibleLine - 1 ) + ( ( scrollTop - lineTop ) / lineHeight ), 0, sourceMaxUnits ),
          viewportHeight = layoutInfo ? layoutInfo.height : 0,
          maxScrollTop = Math.max ( 0, scrollHeight - viewportHeight );

    return { monaco, scrollTop, maxScrollTop, lineCount, lineHeight, sourceUnits, sourceMaxUnits };

  }

  __getCurrentContent = () => {

    return _.isString ( this.state.content ) ? this.state.content : this.props.content;

  }

  __getSourceAnchors = () => {

    const content = this.__getCurrentContent ();

    if ( this._sourceAnchorCacheContent === content ) return this._sourceAnchorCache;

    const lines = content.split ( '\n' ),
          anchors: SourceAnchor[] = [];

    let inFence = false,
        inParagraph = false,
        inTable = false,
        closedDetailsDepth = 0,
        fenceKind: 'pre' | 'media' | undefined = undefined,
        fenceMediaKey: string | undefined = undefined,
        mediaSequence = 0;

    const detailsStack: boolean[] = [],
          htmlMediaStack: { type: string, key: string }[] = [],
          anchoredLines = new Set<string> ();

    const headingOccurrences: Record<string, number> = {};

    const pushAnchor = ( line: number, kind: ScrollAnchorKind, key?: string ) => {
      const dedupeKey = `${line}:${kind}:${key || ''}`;
      if ( anchoredLines.has ( dedupeKey ) ) return;
      anchoredLines.add ( dedupeKey );
      anchors.push ({ line, kind, key });
    };

    for ( let index = 0, l = lines.length; index < l; index++ ) {

      const line = lines[index],
            trimmed = line.trim (),
            lineNumber = index + 1;

      if ( !trimmed ) {
        inParagraph = false;
        inTable = false;
        continue;
      }

      if ( closedDetailsDepth > 0 && !/<\/?details\b/i.test ( line ) && !/<summary\b/i.test ( line ) ) {
        inParagraph = false;
        inTable = false;
        continue;
      }

      if ( /^\s{0,3}(?:```+|~~~+)/.test ( line ) ) {
        if ( !inFence ) {
          const languageMatch = line.match ( /^\s{0,3}(?:```+|~~~+)\s*([a-z0-9_-]+)/i ),
                language = languageMatch && languageMatch[1] ? languageMatch[1].toLowerCase () : '';

          fenceKind = this.__isDiagramFenceLanguage ( language ) ? 'media' : 'pre';

          if ( fenceKind === 'media' ) {
            fenceMediaKey = `m:${++mediaSequence}`;
            pushAnchor ( lineNumber, 'media', fenceMediaKey );
          } else {
            pushAnchor ( lineNumber, 'pre' );
          }
        } else {
          if ( fenceKind === 'media' ) {
            pushAnchor ( lineNumber, 'media-end', fenceMediaKey );
            fenceMediaKey = undefined;
          } else {
            pushAnchor ( lineNumber, 'pre-end' );
          }
          fenceKind = undefined;
        }

        inFence = !inFence;
        inParagraph = false;
        inTable = false;
        continue;
      }

      if ( inFence ) continue;

      const detailsTags = line.match ( /<\/?details\b[^>]*>/gi ) || [];

      for ( let detailsIndex = 0, detailsLength = detailsTags.length; detailsIndex < detailsLength; detailsIndex++ ) {

        const tag = detailsTags[detailsIndex];

        if ( /^<\s*\/details\b/i.test ( tag ) ) {
          const wasOpen = detailsStack.pop ();
          if ( wasOpen === false ) {
            closedDetailsDepth = Math.max ( 0, closedDetailsDepth - 1 );
          }
          pushAnchor ( lineNumber, 'details-end' );
          continue;
        }

        const isOpen = this.__isDetailsTagOpen ( tag );
        detailsStack.push ( isOpen );
        if ( !isOpen ) {
          closedDetailsDepth++;
        }
        pushAnchor ( lineNumber, 'details' );

      }

      if ( /<summary\b/i.test ( line ) ) {
        pushAnchor ( lineNumber, 'summary' );
      }

      if ( /<\/?details\b/i.test ( line ) || /<summary\b/i.test ( line ) ) {
        inParagraph = false;
        inTable = false;
        continue;
      }

      if ( closedDetailsDepth > 0 ) {
        inParagraph = false;
        inTable = false;
        continue;
      }

      const markdownImageMatch = line.match ( /^\s{0,3}!\[[^\]]*\]\((?:[^()\\]|\\.|(?:\([^)]*\)))*\)/ );

      if ( markdownImageMatch ) {
        const mediaKey = `m:${++mediaSequence}`;
        pushAnchor ( lineNumber, 'media', mediaKey );
        pushAnchor ( Math.min ( lines.length, lineNumber + 0.92 ), 'media-end', mediaKey );
        inParagraph = false;
        inTable = false;
        continue;
      }

      const mediaOpeningTags = line.match ( /<(img|iframe|video|figure)\b[^>]*>/ig ) || [];
      let consumedByMedia = false;

      for ( let mediaIndex = 0, mediaLength = mediaOpeningTags.length; mediaIndex < mediaLength; mediaIndex++ ) {

        const mediaTag = mediaOpeningTags[mediaIndex],
              mediaMatch = mediaTag.match ( /^<\s*(img|iframe|video|figure)\b/i ),
              mediaType = mediaMatch && mediaMatch[1] ? mediaMatch[1].toLowerCase () : '';

        if ( !mediaType ) continue;

        const mediaKey = `m:${++mediaSequence}`;
        pushAnchor ( lineNumber, 'media', mediaKey );
        consumedByMedia = true;

        const isSelfContained = mediaType === 'img' || /\/\s*>$/.test ( mediaTag ) || new RegExp ( `<\\s*\\/\\s*${mediaType}\\s*>`, 'i' ).test ( line );

        if ( isSelfContained ) {
          pushAnchor ( Math.min ( lines.length, lineNumber + 0.92 ), 'media-end', mediaKey );
        } else {
          htmlMediaStack.push ({ type: mediaType, key: mediaKey });
        }

      }

      const mediaClosingTags = line.match ( /<\/(iframe|video|figure)\s*>/ig ) || [];

      for ( let closeIndex = 0, closeLength = mediaClosingTags.length; closeIndex < closeLength; closeIndex++ ) {

        const closingTag = mediaClosingTags[closeIndex],
              closingMatch = closingTag.match ( /^<\s*\/\s*(iframe|video|figure)\s*>/i ),
              closingType = closingMatch && closingMatch[1] ? closingMatch[1].toLowerCase () : '';

        if ( !closingType ) continue;

        let closingKey: string | undefined = undefined;

        for ( let stackIndex = htmlMediaStack.length - 1; stackIndex >= 0; stackIndex-- ) {
          if ( htmlMediaStack[stackIndex].type !== closingType ) continue;
          closingKey = htmlMediaStack[stackIndex].key;
          htmlMediaStack.splice ( stackIndex, 1 );
          break;
        }

        pushAnchor ( lineNumber, 'media-end', closingKey );
        consumedByMedia = true;

      }

      if ( consumedByMedia ) {
        inParagraph = false;
        inTable = false;
        continue;
      }

      const hasOpeningParagraphTag = /<p\b[^>]*>/i.test ( line ),
            hasClosingParagraphTag = /<\/p>/i.test ( line );

      if ( hasOpeningParagraphTag ) {
        pushAnchor ( lineNumber, 'p' );
        inParagraph = !hasClosingParagraphTag;
        inTable = false;
        continue;
      }

      if ( hasClosingParagraphTag ) {
        inParagraph = false;
        inTable = false;
        continue;
      }

      const headingMatch = line.match ( /^\s{0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/ );

      if ( headingMatch ) {
        const normalizedText = headingMatch[2].trim ().toLowerCase (),
              occurrence = ( headingOccurrences[normalizedText] || 0 ) + 1,
              key = `h:${normalizedText}:${occurrence}`;

        headingOccurrences[normalizedText] = occurrence;

        pushAnchor ( lineNumber, 'heading', key );
        inParagraph = false;
        inTable = false;
        continue;
      }

      if ( /^\s{0,3}(?:---+|\*\*\*+|___+)\s*$/.test ( line ) ) {
        pushAnchor ( lineNumber, 'hr' );
        inParagraph = false;
        inTable = false;
        continue;
      }

      if ( /^\s{0,3}\|.+\|\s*$/.test ( line ) ) {
        if ( !inTable ) {
          pushAnchor ( lineNumber, 'table' );
        }
        inParagraph = false;
        inTable = true;
        continue;
      } else {
        inTable = false;
      }

      if ( /^\s{0,3}(?:[-*+]|\d+[.)])\s+/.test ( line ) ) {
        pushAnchor ( lineNumber, 'li' );
        inParagraph = false;
        continue;
      }

      if ( /^\s{0,3}>\s?/.test ( line ) ) {
        pushAnchor ( lineNumber, 'blockquote' );
        inParagraph = false;
        continue;
      }

      if ( !inParagraph ) {
        pushAnchor ( lineNumber, 'p' );
        inParagraph = true;
      }

    }

    this._sourceAnchorCacheContent = content;
    this._sourceAnchorCache = anchors;

    return anchors;

  }

  __isDetailsTagOpen = ( detailsTag: string ) => {

    const match = detailsTag.match ( /^<details\b([^>]*)>/i ),
          attributes = match ? match[1] : '';

    return /(?:^|\s)open(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?(?=\s|$)/i.test ( attributes );

  }

  __isDiagramFenceLanguage = ( language: string ) => {

    return language === 'mermaid' || language === 'plantuml' || language === 'puml' || language === 'uml';

  }

  __isAnchorTypeCompatible = ( sourceKind, previewKind ) => {

    if ( sourceKind === previewKind ) return true;

    if ( sourceKind === 'p' ) {
      return previewKind === 'blockquote' || previewKind === 'li';
    }

    if ( sourceKind === 'blockquote' ) {
      return previewKind === 'p';
    }

    if ( sourceKind === 'media' ) {
      return previewKind === 'media' || previewKind === 'pre';
    }

    if ( sourceKind === 'media-end' ) {
      return previewKind === 'media-end' || previewKind === 'pre-end';
    }

    if ( sourceKind === 'pre' ) {
      return previewKind === 'pre' || previewKind === 'media';
    }

    if ( sourceKind === 'pre-end' ) {
      return previewKind === 'pre-end' || previewKind === 'media-end';
    }

    return false;

  }

  __isPreviewAnchorNodeVisible = ( node: HTMLElement ) => {

    let current = node.parentElement as HTMLElement | null;

    while ( current ) {

      if ( current.tagName.toLowerCase () === 'details' && !current.hasAttribute ( 'open' ) ) {

        if ( node.tagName.toLowerCase () === 'summary' && node.parentElement === current ) {
          current = current.parentElement as HTMLElement | null;
          continue;
        }

        return false;

      }

      current = current.parentElement as HTMLElement | null;

    }

    return true;

  }

  __getPreviewMetrics = () => {

    const node = this._previewRef.current;

    if ( !node ) return;

    const scrollTop = node.scrollTop,
          maxScrollTop = Math.max ( 0, node.scrollHeight - node.clientHeight );

    return { node, scrollTop, maxScrollTop };

  }

  __getPreviewNodeTop = ( node: HTMLElement, root: HTMLElement ) => {

    let top = 0,
        current: HTMLElement | null = node;

    while ( current && current !== root ) {
      top += current.offsetTop;
      current = current.offsetParent as HTMLElement | null;
    }

    if ( current === root ) return Math.max ( 0, top );

    const rootRect = root.getBoundingClientRect (),
          nodeRect = node.getBoundingClientRect ();

    return Math.max ( 0, ( nodeRect.top - rootRect.top ) + root.scrollTop );

  }

  __scheduleAnchorsRebuild = ( renderMeta? ) => {

    if ( renderMeta ) {
      this._pendingRenderMeta = renderMeta;
    }

    if ( this._anchorsFrame ) return;

    this._anchorsFrame = window.requestAnimationFrame ( () => {

      const pendingRenderMeta = this._pendingRenderMeta;
      this._pendingRenderMeta = undefined;

      this._anchorsFrame = 0;

      this.__rebuildAnchors ();

      if ( pendingRenderMeta && pendingRenderMeta.kind === 'partial' && pendingRenderMeta.sourceSnapshot ) {
        this.__syncFromSourceSnapshot ( pendingRenderMeta.sourceSnapshot, pendingRenderMeta.partialWindow );
      } else if ( pendingRenderMeta && pendingRenderMeta.kind === 'full-deferred' ) {
        this.__scheduleSourceSync ();
      } else if ( pendingRenderMeta && pendingRenderMeta.kind === 'full-live' ) {
        this.__scheduleSourceSync ();
      } else {
        this.__scheduleSourceSync ();
      }

    });

  }

  __syncFromSourceSnapshot = ( sourceSnapshot: { sourceUnits: number, sourceMaxUnits: number }, partialWindow?: { startLine: number, endLine: number, totalLines: number } ) => {

    if ( !this.props.splitViewSyncEnabled ) return;

    const source = this.__getSourceMetrics (),
          preview = this.__getPreviewMetrics ();

    if ( !source || !preview ) return;

    const snapshotRatio = sourceSnapshot.sourceMaxUnits > 0 ? ( sourceSnapshot.sourceUnits / sourceSnapshot.sourceMaxUnits ) : 0,
          snapshotUnits = _.clamp ( snapshotRatio * source.sourceMaxUnits, 0, source.sourceMaxUnits ),
          mappedSource = {
            ...source,
            sourceUnits: snapshotUnits,
            sourceMaxUnits: source.sourceMaxUnits
          },
          nextScrollTop = (() => {
            if ( !partialWindow ) {
              const anchors = this.__getAnchors ( mappedSource, preview );
              let preciseTop = this.__mapSourceToPreview ( mappedSource, preview, anchors );
              if ( anchors && anchors.length <= 1200 ) {
                const nearestAnchor = this.__findNearestAnchorBySource ( anchors, snapshotUnits );
                if ( nearestAnchor ) preciseTop = nearestAnchor.preview;
              }
              return preciseTop;
            }

            return this.__mapSourceToPartialPreview ( snapshotUnits, preview.maxScrollTop, partialWindow );
          }) ();

    this._ignorePreviewScrollUntil = Date.now () + 120;
    this._lastSourceScrollTop = source.scrollTop;
    this._lastSourceUnits = snapshotUnits;
    this._lastPreviewScrollTop = nextScrollTop;
    preview.node.scrollTop = nextScrollTop;

  }

  __mapSourceToPartialPreview = ( sourceUnits: number, previewMaxScrollTop: number, partialWindow: { startLine: number, endLine: number, totalLines: number } ) => {

    const startUnits = Math.max ( 0, partialWindow.startLine - 1 ),
          endUnits = Math.max ( startUnits + 1, partialWindow.endLine - 1 ),
          windowSpan = Math.max ( 1, endUnits - startUnits ),
          withinWindow = _.clamp ( ( sourceUnits - startUnits ) / windowSpan, 0, 1 );

    return withinWindow * previewMaxScrollTop;

  }

  __rebuildAnchors = ( sourceArg?, previewArg? ) => {

    const source = sourceArg || this.__getSourceMetrics (),
          preview = previewArg || this.__getPreviewMetrics ();

    if ( !source || !preview ) {
      this._anchorPairs = [];
      return;
    }

    const sourceAnchors = this.__getSourceAnchors (),
          blockNodes = Array.from ( preview.node.querySelectorAll ( 'h1, h2, h3, h4, h5, h6, p, pre, li, blockquote, table, hr, details, summary, .mermaid, .plantuml, iframe, img, video, figure' ) ) as HTMLElement[],
          anchors: { source: number, preview: number }[] = [],
          previewAnchors: PreviewAnchor[] = [],
          previewContentNode = ( preview.node.querySelector ( '.preview-content' ) as HTMLElement | null ) || preview.node;

    const previewHeadingOccurrences: Record<string, number> = {};
    let previewMediaSequence = 0;

    for ( let index = 0, l = blockNodes.length; index < l; index++ ) {

      const node = blockNodes[index],
            tag = node.tagName.toLowerCase (),
            top = this.__getPreviewNodeTop ( node, previewContentNode );

      if ( !this.__isPreviewAnchorNodeVisible ( node ) ) continue;
      if ( ( tag === 'img' || tag === 'iframe' || tag === 'video' || tag === 'figure' ) && node.closest ( '.mermaid, .plantuml' ) ) continue;

      const isDiagramBlock = node.classList.contains ( 'mermaid' ) || node.classList.contains ( 'plantuml' ),
            isMediaBlock = isDiagramBlock || tag === 'img' || tag === 'iframe' || tag === 'video' || tag === 'figure';

      if ( isMediaBlock ) {
        const mediaKey = `m:${++previewMediaSequence}`,
              endTop = top + Math.max ( 0, node.offsetHeight - 1 );

        previewAnchors.push ({ top, kind: 'media', key: mediaKey });
        previewAnchors.push ({ top: endTop, kind: 'media-end', key: mediaKey });

        continue;
      }

      if ( /^h[1-6]$/.test ( tag ) ) {
        const normalizedText = ( node.textContent || '' ).trim ().toLowerCase (),
              occurrence = ( previewHeadingOccurrences[normalizedText] || 0 ) + 1,
              key = `h:${normalizedText}:${occurrence}`;

        previewHeadingOccurrences[normalizedText] = occurrence;
        previewAnchors.push ({ top, kind: 'heading', key });
      } else if ( tag === 'p' ) {
        previewAnchors.push ({ top, kind: 'p' });
      } else if ( tag === 'li' ) {
        previewAnchors.push ({ top, kind: 'li' });
      } else if ( tag === 'blockquote' ) {
        previewAnchors.push ({ top, kind: 'blockquote' });
      } else if ( tag === 'table' ) {
        previewAnchors.push ({ top, kind: 'table' });
      } else if ( tag === 'pre' ) {
        const endTop = top + Math.max ( 0, node.offsetHeight - 1 );
        previewAnchors.push ({ top, kind: 'pre' });
        previewAnchors.push ({ top: endTop, kind: 'pre-end' });
      } else if ( tag === 'hr' ) {
        previewAnchors.push ({ top, kind: 'hr' });
      } else if ( tag === 'details' ) {
        const endTop = top + Math.max ( 0, node.offsetHeight - 1 );
        previewAnchors.push ({ top, kind: 'details' });
        previewAnchors.push ({ top: endTop, kind: 'details-end' });
      } else if ( tag === 'summary' ) {
        previewAnchors.push ({ top, kind: 'summary' });
      } else {
        previewAnchors.push ({ top, kind: 'p' });
      }

    }

    const previewAnchorsByKey = new Map<string, number[]> ();

    for ( let index = 0, l = previewAnchors.length; index < l; index++ ) {
      const anchor = previewAnchors[index];
      if ( !anchor.key ) continue;

      const key = `${anchor.kind}:${anchor.key}`,
            queue = previewAnchorsByKey.get ( key );

      if ( queue ) {
        queue.push ( index );
      } else {
        previewAnchorsByKey.set ( key, [index] );
      }
    }

    const usedSource = new Set<number> (),
          usedPreview = new Set<number> ();

    for ( let index = 0, l = sourceAnchors.length; index < l; index++ ) {
      const sourceAnchor = sourceAnchors[index];
      if ( !sourceAnchor.key ) continue;

      const queue = previewAnchorsByKey.get ( `${sourceAnchor.kind}:${sourceAnchor.key}` );
      if ( !queue || !queue.length ) continue;

      let previewIndex = -1;

      while ( queue.length ) {
        const candidate = queue.shift ();
        if ( !_.isNumber ( candidate ) || usedPreview.has ( candidate ) ) continue;
        previewIndex = candidate;
        break;
      }

      if ( previewIndex < 0 ) continue;

      const previewTop = previewAnchors[previewIndex].top;
      usedPreview.add ( previewIndex );
      usedSource.add ( index );
      anchors.push ({
        source: sourceAnchor.line - 1,
        preview: previewTop
      });
    }

    const sourceFlow = sourceAnchors
      .map ( ( anchor, index ) => ({ anchor, index }) )
      .filter ( item => !usedSource.has ( item.index ) ),
          previewFlow = previewAnchors
            .map ( ( anchor, index ) => ({ anchor, index }) )
            .filter ( item => !usedPreview.has ( item.index ) );

    let sourceIndex = 0,
        previewIndex = 0;

    while ( sourceIndex < sourceFlow.length && previewIndex < previewFlow.length ) {

      const sourceItem = sourceFlow[sourceIndex],
            previewItem = previewFlow[previewIndex];

      if ( this.__isAnchorTypeCompatible ( sourceItem.anchor.kind, previewItem.anchor.kind ) ) {
        anchors.push ({
          source: sourceItem.anchor.line - 1,
          preview: previewItem.anchor.top
        });
        sourceIndex++;
        previewIndex++;
        continue;
      }

      const LOOKAHEAD = 5;
      let previewMatchOffset = -1,
          sourceMatchOffset = -1;

      for ( let offset = 1; offset <= LOOKAHEAD && ( previewIndex + offset ) < previewFlow.length; offset++ ) {
        if ( this.__isAnchorTypeCompatible ( sourceItem.anchor.kind, previewFlow[previewIndex + offset].anchor.kind ) ) {
          previewMatchOffset = offset;
          break;
        }
      }

      for ( let offset = 1; offset <= LOOKAHEAD && ( sourceIndex + offset ) < sourceFlow.length; offset++ ) {
        if ( this.__isAnchorTypeCompatible ( sourceFlow[sourceIndex + offset].anchor.kind, previewItem.anchor.kind ) ) {
          sourceMatchOffset = offset;
          break;
        }
      }

      if ( previewMatchOffset > 0 && ( sourceMatchOffset < 0 || previewMatchOffset <= sourceMatchOffset ) ) {
        previewIndex += previewMatchOffset;
        continue;
      }

      if ( sourceMatchOffset > 0 ) {
        sourceIndex += sourceMatchOffset;
        continue;
      }

      anchors.push ({
        source: sourceItem.anchor.line - 1,
        preview: previewItem.anchor.top
      });
      sourceIndex++;
      previewIndex++;

    }

    anchors.sort ( ( a, b ) => a.source - b.source || a.preview - b.preview );

    const normalized: { source: number, preview: number }[] = [];

    for ( let index = 0, l = anchors.length; index < l; index++ ) {

      const current = anchors[index],
            previous = normalized[normalized.length - 1];

      if ( !previous ) {
        normalized.push ( current );
        continue;
      }

      if ( current.source <= previous.source ) {
        previous.preview = Math.max ( previous.preview, current.preview );
        continue;
      }

      normalized.push ({
        source: current.source,
        preview: Math.max ( previous.preview, current.preview )
      });

    }

    this._anchorPairs = normalized;
    this._anchorsCache = undefined;

  }

  __previewToggle = ( event: Event ) => {

    const target = event.target as HTMLElement | null;

    if ( !target || target.tagName.toLowerCase () !== 'details' ) return;

    this._anchorsCache = undefined;
    this.__scheduleAnchorsRebuild ();
    this.__scheduleSourceSync ();

  }

  __previewDynamicContentUpdated = () => {

    this._anchorsCache = undefined;
    this.__scheduleAnchorsRebuild ();

  }

  __getAnchors = ( source, preview ) => {

    if ( !this._anchorPairs.length ) {
      this.__rebuildAnchors ( source, preview );
    }

    const sourceMaxUnits = source.sourceMaxUnits,
          previewMaxScrollTop = preview.maxScrollTop;

    if (
      this._anchorsCache &&
      this._anchorsCache.sourceMaxUnits === sourceMaxUnits &&
      this._anchorsCache.previewMaxScrollTop === previewMaxScrollTop
    ) {
      return this._anchorsCache.anchors;
    }

    const anchors: { source: number, preview: number }[] = [{
      source: 0,
      preview: 0
    }];

    for ( let index = 0, l = this._anchorPairs.length; index < l; index++ ) {

      const pair = this._anchorPairs[index],
            sourceValue = _.clamp ( pair.source, 0, source.sourceMaxUnits ),
            previewValue = _.clamp ( pair.preview, 0, preview.maxScrollTop ),
            previous = anchors[anchors.length - 1];

      if ( sourceValue <= previous.source ) {
        previous.preview = Math.max ( previous.preview, previewValue );
        continue;
      }

      anchors.push ({
        source: sourceValue,
        preview: Math.max ( previous.preview, previewValue )
      });

    }

    const last = anchors[anchors.length - 1];

    if ( source.sourceMaxUnits <= last.source ) {
      last.preview = Math.max ( last.preview, preview.maxScrollTop );
      return anchors;
    }

    anchors.push ({
      source: source.sourceMaxUnits,
      preview: preview.maxScrollTop
    });

    this._anchorsCache = {
      sourceMaxUnits,
      previewMaxScrollTop,
      anchors
    };

    return anchors;

  }

  __toRatio = ( scrollTop: number, maxScrollTop: number ) => {

    if ( maxScrollTop <= 0 ) return 0;

    return _.clamp ( scrollTop / maxScrollTop, 0, 1 );

  }

  __findCrossedAnchorBySource = ( anchors, previousSourceUnits: number, currentSourceUnits: number ) => {

    if ( !Number.isFinite ( previousSourceUnits ) ) return;
    if ( previousSourceUnits === currentSourceUnits ) return;

    const low = Math.min ( previousSourceUnits, currentSourceUnits ),
          high = Math.max ( previousSourceUnits, currentSourceUnits ),
          dir = currentSourceUnits > previousSourceUnits ? 1 : -1;

    let crossed;

    for ( let index = 0, l = anchors.length; index < l; index++ ) {
      const anchor = anchors[index];
      if ( anchor.source < low || anchor.source > high ) continue;
      crossed = anchor;
      if ( dir < 0 ) return crossed;
    }

    return crossed;

  }

  __findCrossedAnchorByPreview = ( anchors, previousPreviewTop: number, currentPreviewTop: number ) => {

    if ( !Number.isFinite ( previousPreviewTop ) ) return;
    if ( previousPreviewTop === currentPreviewTop ) return;

    const low = Math.min ( previousPreviewTop, currentPreviewTop ),
          high = Math.max ( previousPreviewTop, currentPreviewTop ),
          dir = currentPreviewTop > previousPreviewTop ? 1 : -1;

    let crossed;

    for ( let index = 0, l = anchors.length; index < l; index++ ) {
      const anchor = anchors[index];
      if ( anchor.preview < low || anchor.preview > high ) continue;
      crossed = anchor;
      if ( dir < 0 ) return crossed;
    }

    return crossed;

  }

  __findNearestAnchorBySource = ( anchors, sourceUnits: number, threshold: number = 0.06 ) => {

    let nearest;
    let nearestDistance = Infinity;

    for ( let index = 0, l = anchors.length; index < l; index++ ) {

      const anchor = anchors[index],
            distance = Math.abs ( anchor.source - sourceUnits );

      if ( distance > threshold || distance >= nearestDistance ) continue;

      nearest = anchor;
      nearestDistance = distance;

    }

    return nearest;

  }

  __findNearestAnchorByPreview = ( anchors, previewTop: number, threshold: number = 2.5 ) => {

    let nearest;
    let nearestDistance = Infinity;

    for ( let index = 0, l = anchors.length; index < l; index++ ) {

      const anchor = anchors[index],
            distance = Math.abs ( anchor.preview - previewTop );

      if ( distance > threshold || distance >= nearestDistance ) continue;

      nearest = anchor;
      nearestDistance = distance;

    }

    return nearest;

  }

  __mapSourceToPreview = ( source, preview, anchors ) => {

    if ( anchors.length < 2 ) {
      return this.__toRatio ( source.sourceUnits, source.sourceMaxUnits ) * preview.maxScrollTop;
    }

    for ( let index = 1, l = anchors.length; index < l; index++ ) {

      const left = anchors[index - 1],
            right = anchors[index];

      if ( source.sourceUnits > right.source ) continue;

      const span = right.source - left.source || 1,
            ratio = _.clamp ( ( source.sourceUnits - left.source ) / span, 0, 1 );

      return left.preview + ( ( right.preview - left.preview ) * ratio );

    }

    return preview.maxScrollTop;

  }

  __mapPreviewToSource = ( source, preview, anchors ) => {

    if ( anchors.length < 2 ) {
      return this.__toRatio ( preview.scrollTop, preview.maxScrollTop ) * source.sourceMaxUnits;
    }

    for ( let index = 1, l = anchors.length; index < l; index++ ) {

      const left = anchors[index - 1],
            right = anchors[index];

      if ( preview.scrollTop > right.preview ) continue;

      const span = right.preview - left.preview || 1,
            ratio = _.clamp ( ( preview.scrollTop - left.preview ) / span, 0, 1 );

      return left.source + ( ( right.source - left.source ) * ratio );

    }

    return source.sourceMaxUnits;

  }

  __mapSourceToPreviewLinear = ( source, preview ) => {

    return this.__toRatio ( source.sourceUnits, source.sourceMaxUnits ) * preview.maxScrollTop;

  }

  __mapPreviewToSourceLinear = ( source, preview ) => {

    return this.__toRatio ( preview.scrollTop, preview.maxScrollTop ) * source.sourceMaxUnits;

  }

  __syncFromSource = ( force: boolean = false ) => {

    if ( !this.props.splitViewSyncEnabled ) return;

    const now = Date.now ();
    const nowPerf = performance.now ();
    const minInterval = this.__getSyncMinIntervalMs ();

    if ( !force && minInterval > 0 && ( nowPerf - this._lastSourceSyncAt ) < minInterval ) return;
    this._lastSourceSyncAt = nowPerf;

    if ( !force && now < this._ignoreSourceScrollUntil ) return;

    const source = this.__getSourceMetrics (),
          preview = this.__getPreviewMetrics ();

    if ( !source || !preview ) return;

    const sourceScrollDelta = Number.isFinite ( this._lastSourceScrollTop ) ? Math.abs ( source.scrollTop - this._lastSourceScrollTop ) : Infinity;

    // While typing, keep preview steady unless the editor scrollbar actually moved.
    if ( !force && source.monaco.hasTextFocus () && sourceScrollDelta < 1 ) return;

    const shouldUsePartialWindow = !!( this._isPreviewPartial && this._currentPartialWindow ),
          shouldUseLinear = ( this._isPreviewPartial && !shouldUsePartialWindow ) || this._isPreviewRendering,
          anchors = shouldUseLinear ? undefined : this.__getAnchors ( source, preview );

    let nextScrollTop = shouldUsePartialWindow
      ? this.__mapSourceToPartialPreview ( source.sourceUnits, preview.maxScrollTop, this._currentPartialWindow! )
      : shouldUseLinear
      ? this.__mapSourceToPreviewLinear ( source, preview )
      : this.__mapSourceToPreview ( source, preview, anchors );

    this._lastSourceScrollTop = source.scrollTop;
    this._lastSourceUnits = source.sourceUnits;

    if ( Math.abs ( preview.scrollTop - nextScrollTop ) < 2 ) return;

    this._ignorePreviewScrollUntil = now + 120;
    preview.node.scrollTop = nextScrollTop;

  }

  __syncFromPreview = () => {

    if ( !this.props.splitViewSyncEnabled ) return;

    if ( this._isPreviewRendering ) return;

    const now = Date.now ();
    const nowPerf = performance.now ();
    const minInterval = this.__getSyncMinIntervalMs ();

    if ( minInterval > 0 && ( nowPerf - this._lastPreviewSyncAt ) < minInterval ) return;
    this._lastPreviewSyncAt = nowPerf;

    if ( now < this._ignorePreviewScrollUntil ) return;
    if ( now < this._previewToSourceLockUntil ) return;

    const source = this.__getSourceMetrics (),
          preview = this.__getPreviewMetrics ();

    if ( !source || !preview ) return;

    // While a partial preview render is actively in-flight, source scroll remains authoritative.
    if ( this._isPreviewPartial && this._isPreviewRendering && source.monaco.hasTextFocus () ) return;

    const shouldUseLinear = this._isPreviewPartial || this._isPreviewRendering,
          anchors = shouldUseLinear ? undefined : this.__getAnchors ( source, preview );

    let targetUnits = shouldUseLinear
      ? this.__mapPreviewToSourceLinear ( source, preview )
      : this.__mapPreviewToSource ( source, preview, anchors );

    if ( !shouldUseLinear && anchors && anchors.length <= 1200 ) {
      const nearestAnchor = this.__findNearestAnchorByPreview ( anchors, preview.scrollTop ),
            crossedAnchor = this.__findCrossedAnchorByPreview ( anchors, this._lastPreviewScrollTop, preview.scrollTop );
      if ( nearestAnchor ) {
        targetUnits = nearestAnchor.source;
      } else if ( crossedAnchor && Math.abs ( crossedAnchor.source - targetUnits ) < 2 ) {
        targetUnits = crossedAnchor.source;
      }
    }

    const
          nextLine = _.clamp ( 1 + Math.floor ( targetUnits ), 1, source.lineCount ),
          lineOffsetUnits = targetUnits - ( nextLine - 1 ),
          nextScrollTop = _.clamp ( source.monaco.getTopForLineNumber ( nextLine ) + ( lineOffsetUnits * source.lineHeight ), 0, source.maxScrollTop );

    this._lastPreviewScrollTop = preview.scrollTop;

    if ( Math.abs ( source.scrollTop - nextScrollTop ) < 2 ) return;

    this._ignoreSourceScrollUntil = now + 120;
    source.monaco.setScrollTop ( nextScrollTop );

  }

  __getSyncMinIntervalMs = () => {

    const fps = this.props.maxSyncFps;

    if ( !Number.isFinite ( fps ) || fps >= 60 ) return 0;

    return Math.max ( 0, Math.floor ( 1000 / Math.max ( 1, fps ) ) );

  }

  __scheduleSourceSync = () => {

    if ( !this.props.splitViewSyncEnabled ) return;

    if ( this._sourceSyncFrame ) return;

    this._sourceSyncFrame = window.requestAnimationFrame ( () => {
      this._sourceSyncFrame = 0;
      this.__syncFromSource ();
    });

  }

  __schedulePreviewSync = () => {

    if ( !this.props.splitViewSyncEnabled ) return;

    if ( Date.now () >= this._ignorePreviewScrollUntil ) {
      this._ignoreSourceScrollUntil = Math.max ( this._ignoreSourceScrollUntil, Date.now () + 180 );
    }

    if ( this._previewSyncFrame ) return;

    this._previewSyncFrame = window.requestAnimationFrame ( () => {
      this._previewSyncFrame = 0;
      this.__syncFromPreview ();
    });

  }

  __scheduleSettledSourceSync = () => {

    if ( !this.props.splitViewSyncEnabled ) return;

    if ( this._settledSyncFrame ) return;

    this._settledSyncFrame = window.requestAnimationFrame ( () => {
      this._settledSyncFrame = window.requestAnimationFrame ( () => {
        this._settledSyncFrame = 0;
        this.__scheduleAnchorsRebuild ();
        this.__syncFromSource ( true );
      });
    });

  }

  __previewRendered = ( _event, renderMeta? ) => {

    this._isPreviewRendering = false;
    this._isPreviewPartial = !!( renderMeta && renderMeta.kind === 'partial' );
    this._currentPartialWindow = this._isPreviewPartial ? renderMeta?.partialWindow : undefined;

    if ( renderMeta && renderMeta.kind !== 'full-live' ) {
      this._previewToSourceLockUntil = Date.now () + 220;
      this._ignorePreviewScrollUntil = Math.max ( this._ignorePreviewScrollUntil, Date.now () + 220 );
    }

    this.__scheduleAnchorsRebuild ( renderMeta );

    if ( renderMeta && renderMeta.kind === 'full-deferred' ) {
      this.__scheduleSettledSourceSync ();
    }

  }

  __previewRenderStart = ( _event, renderMeta? ) => {

    if ( renderMeta && renderMeta.kind === 'full-live' ) return;

    this._isPreviewRendering = true;
    this._previewToSourceLockUntil = Date.now () + 800;
    this._ignorePreviewScrollUntil = Date.now () + 400;

  }

  __previewRenderStop = ( _event, renderMeta? ) => {

    if ( renderMeta && renderMeta.kind === 'full-live' ) return;
    if ( !this._isPreviewRendering ) return;

    this._isPreviewRendering = false;

    if ( renderMeta && renderMeta.kind === 'cancelled' ) {
      this._isPreviewPartial = false;
      this._currentPartialWindow = undefined;
      const now = Date.now ();
      this._previewToSourceLockUntil = Math.max ( this._previewToSourceLockUntil, now + 120 );
      this._ignorePreviewScrollUntil = Math.max ( this._ignorePreviewScrollUntil, now + 120 );
    }

    this.__scheduleSourceSync ();

  }

  __layoutResized = () => {

    this.__scheduleAnchorsRebuild ();

  }

  __previewAnchorNavigate = ( nextScrollTop?: number ) => {

    const now = Date.now ();

    this._previewToSourceLockUntil = now + 600;
    this._ignorePreviewScrollUntil = now + 450;

    if ( _.isNumber ( nextScrollTop ) ) {
      this._lastPreviewScrollTop = nextScrollTop;
    }

  }

  render () {

    const {isFocus, isZen, hasSidebar, splitViewSyncEnabled} = this.props,
          content = _.isString ( this.state.content ) ? this.state.content : this.props.content;

    return (
      <Layout className="split-editor" direction="horizontal" resizable={true} isFocus={isFocus} isZen={isZen} hasSidebar={hasSidebar}>
        <Editor onChange={this.__change} onUpdate={this.__change} onScroll={splitViewSyncEnabled ? this.__scheduleSourceSync : undefined} />
        <Preview content={content} onAnchorNavigate={this.__previewAnchorNavigate} onScroll={splitViewSyncEnabled ? this.__schedulePreviewSync : undefined} previewRef={this._previewRef} enableWorker={false} largeRenderMode="after-initial" syncScroll={splitViewSyncEnabled} />
      </Layout>
    );

  }

}

/* EXPORT */

export default connect ({
  container: Main,
  selector: ({ container }) => ({
    content: container.note.getPlainContent (),
    getMonaco: container.editor.getMonaco,
    isFocus: container.window.isFocus (),
    isZen: container.window.isZen (),
    hasSidebar: container.window.hasSidebar (),
    splitViewSyncEnabled: !container.appConfig.get ().preview.disableSplitViewSync,
    maxSyncFps: container.window.getEffectiveFrameRate ()
  })
})( SplitEditor );
