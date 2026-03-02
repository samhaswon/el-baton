
/* IMPORT */

import * as _ from 'lodash';
import * as React from 'react';
import {connect} from 'overstated';
import Markdown from '@renderer/utils/markdown';
import Main from '@renderer/containers/main';
import Config from '@common/config';

/* PREVIEW */

const MEDIUM_PREVIEW_RENDER_THRESHOLD = 18000;
const TYPING_DEBOUNCE_MIN = 90;
const TYPING_DEBOUNCE_MAX = 420;
const DEFAULT_LARGE_NOTE_FULL_RENDER_DELAY = 500;
const PARTIAL_PADDING_LINES = 20;
const PARTIAL_FALLBACK_WINDOW_LINES = 220;
const WORKER_RENDER_TIMEOUT = 12000;

const isFenceDelimiterLine = ( line: string ) => /^\s{0,3}(?:```+|~~~+)/.test ( line );
const isDollarMathDelimiterLine = ( line: string ) => line.trim () === '$$';
const isBracketMathStartLine = ( line: string ) => line.trim () === '\\[';
const isBracketMathEndLine = ( line: string ) => line.trim () === '\\]';

const Preview = ({ content, onScroll, onAnchorNavigate, previewRef, isEditorFocused, getMonaco, sourceFilePath, enableWorker = true, largeRenderMode = 'always', syncScroll = false }) => {
  const effectiveContent = content,
        isLargeDocument = content.length >= Config.preview.largeDocumentThreshold,
        largeNoteFullRenderDelay = _.clamp ( Number ( Config.preview.largeNoteFullRenderDelay ) || DEFAULT_LARGE_NOTE_FULL_RENDER_DELAY, 0, 5000 ),
        [html, setHtml] = React.useState<string> ( '' ),
        [isRendering, setIsRendering] = React.useState<boolean> ( true ),
        localPreviewRef = React.useRef<HTMLDivElement> ( null ),
        renderJobRef = React.useRef<number> ( 0 ),
        workerRef = React.useRef<Worker | undefined> ( undefined ),
        workerMsgIdRef = React.useRef<number> ( 0 ),
        activeWorkerMsgIdRef = React.useRef<number | undefined> ( undefined ),
        workerPendingRef = React.useRef<Map<number, { resolve: ( html: string ) => void, reject: ( error: any ) => void, timeoutId?: number }>> ( new Map () ),
        workerInitStartedRef = React.useRef<boolean> ( false ),
        workerUnavailableRef = React.useRef<boolean> ( false ),
        hasCompletedInitialRenderRef = React.useRef<boolean> ( false ),
        currentDocumentKeyRef = React.useRef<string | undefined> ( sourceFilePath ),
        timeoutRef = React.useRef<number | undefined> ( undefined ),
        idleRef = React.useRef<number | undefined> ( undefined ),
        renderMetaRef = React.useRef<any> ({ kind: 'initial' });

  const isInitialDocumentRender = ( currentDocumentKeyRef.current !== sourceFilePath ) || !hasCompletedInitialRenderRef.current,
        shouldDeferRender = isLargeDocument && (
          largeRenderMode === 'always' ||
          ( largeRenderMode === 'after-initial' && !isInitialDocumentRender )
        );

  const resolvedPreviewRef = previewRef || localPreviewRef;

  const runtimeConfig = React.useMemo ( () => ({
    cwd: Config.cwd,
    notesPath: Config.notes.path,
    attachmentsPath: Config.attachments.path,
    notesToken: Config.notes.token,
    attachmentsToken: Config.attachments.token,
    tagsToken: Config.tags.token,
    notesExt: Config.notes.ext,
    notesReSource: Config.notes.re.source,
    notesReFlags: Config.notes.re.flags,
    katex: Config.katex
  }), [sourceFilePath] );

  React.useEffect ( () => {
    Markdown.setRuntimeConfig ( runtimeConfig );
  }, [runtimeConfig] );

  const rejectPendingWorker = React.useCallback ( ( error: any ) => {
    for ( const [id, pending] of workerPendingRef.current.entries () ) {
      if ( pending.timeoutId ) window.clearTimeout ( pending.timeoutId );
      pending.reject ( error );
      workerPendingRef.current.delete ( id );
    }
    activeWorkerMsgIdRef.current = undefined;
  }, [] );

  const initWorker = React.useCallback ( () => {
    if ( !enableWorker ) return;
    if ( workerInitStartedRef.current || workerUnavailableRef.current || workerRef.current ) return;

    workerInitStartedRef.current = true;

    try {
      const worker = new Worker ( new URL ( '../../../workers/markdown_worker.ts', import.meta.url ) );

      worker.onmessage = event => {
        const message = event.data || {},
              id = message.id,
              pending = workerPendingRef.current.get ( id );

        if ( !pending ) return;

        if ( pending.timeoutId ) window.clearTimeout ( pending.timeoutId );
        workerPendingRef.current.delete ( id );
        if ( activeWorkerMsgIdRef.current === id ) activeWorkerMsgIdRef.current = undefined;

        if ( message.type === 'rendered' ) {
          pending.resolve ( message.html );
        } else if ( message.type === 'cancelled' ) {
          pending.reject ( new Error ( 'Markdown render aborted' ) );
        } else {
          pending.reject ( new Error ( message.error || 'Markdown worker render failed' ) );
        }
      };

      worker.onerror = error => {
        console.error ( '[preview] markdown worker crashed', error );
        workerUnavailableRef.current = true;
        workerInitStartedRef.current = false;
        rejectPendingWorker ( new Error ( 'Markdown worker crashed' ) );
        worker.terminate ();
        if ( workerRef.current === worker ) workerRef.current = undefined;
      };

      worker.onmessageerror = error => {
        console.error ( '[preview] markdown worker message error', error );
        workerUnavailableRef.current = true;
        workerInitStartedRef.current = false;
        rejectPendingWorker ( new Error ( 'Markdown worker message error' ) );
        worker.terminate ();
        if ( workerRef.current === worker ) workerRef.current = undefined;
      };

      workerRef.current = worker;
    } catch ( error ) {
      workerUnavailableRef.current = true;
      workerInitStartedRef.current = false;
      console.error ( '[preview] Failed to initialize markdown worker, falling back to main thread render', error );
    }
  }, [content.length, enableWorker, isEditorFocused, rejectPendingWorker, sourceFilePath] );

  React.useEffect ( () => {
    return () => {
      const activeId = activeWorkerMsgIdRef.current;
      if ( activeId && workerRef.current ) {
        workerRef.current.postMessage ({ type: 'cancel', id: activeId });
      }
      rejectPendingWorker ( new Error ( 'Markdown worker terminated' ) );
      workerRef.current?.terminate ();
      workerRef.current = undefined;
      workerInitStartedRef.current = false;
    };
  }, [rejectPendingWorker] );

  const cancelWorkerRender = React.useCallback ( () => {
    const activeId = activeWorkerMsgIdRef.current;
    if ( !activeId || !workerRef.current ) return;
    workerRef.current.postMessage ({ type: 'cancel', id: activeId });
    activeWorkerMsgIdRef.current = undefined;
  }, [] );

  const renderInWorker = React.useCallback ( ( input: string ): Promise<string> => {
    const worker = workerRef.current;

    if ( !worker ) {
      return Promise.resolve ( Markdown.render ( input, Infinity, sourceFilePath ) );
    }

    const id = ++workerMsgIdRef.current;

    activeWorkerMsgIdRef.current = id;

    return new Promise<string> ( ( resolve, reject ) => {
      const timeoutId = window.setTimeout ( () => {
        const pending = workerPendingRef.current.get ( id );
        if ( !pending ) return;
        workerPendingRef.current.delete ( id );
        if ( activeWorkerMsgIdRef.current === id ) activeWorkerMsgIdRef.current = undefined;
        pending.reject ( new Error ( 'Markdown worker render timed out' ) );
      }, WORKER_RENDER_TIMEOUT );

      workerPendingRef.current.set ( id, { resolve, reject, timeoutId } );
      worker.postMessage ({ type: 'render', id, content: input, limit: Infinity, sourceFilePath, runtimeConfig });
    });
  }, [sourceFilePath, runtimeConfig] );

  React.useEffect ( () => {
    setHtml ( '' );
    setIsRendering ( true );
    renderMetaRef.current = { kind: 'initial-loading' };
    currentDocumentKeyRef.current = sourceFilePath;
    hasCompletedInitialRenderRef.current = false;
  }, [sourceFilePath] );

  const clearScheduled = React.useCallback ( () => {
    if ( timeoutRef.current ) {
      window.clearTimeout ( timeoutRef.current );
      timeoutRef.current = undefined;
    }
    if ( idleRef.current ) {
      const cancelIdle = ( window as any ).cancelIdleCallback;
      if ( cancelIdle ) cancelIdle ( idleRef.current );
      idleRef.current = undefined;
    }
  }, [] );

  const scheduleIdle = React.useCallback ( ( callback: Function ) => {
    const requestIdle = ( window as any ).requestIdleCallback;
    if ( requestIdle ) {
      idleRef.current = requestIdle ( callback, { timeout: 600 } );
    } else {
      timeoutRef.current = window.setTimeout ( callback as TimerHandler, 0 );
    }
  }, [] );

  const buildPartialPreview = React.useCallback ( () => {
    const lines = content.split ( /\r?\n/g ),
          totalLines = lines.length,
          monaco = getMonaco ? getMonaco () : undefined;

    let startLine = 1,
        endLine = Math.min ( totalLines, PARTIAL_FALLBACK_WINDOW_LINES );

    if ( monaco ) {
      const visible = monaco.getVisibleRanges ();
      if ( visible && visible[0] ) {
        startLine = Math.max ( 1, visible[0].startLineNumber - PARTIAL_PADDING_LINES );
        endLine = Math.min ( totalLines, visible[0].endLineNumber + PARTIAL_PADDING_LINES );
      }
    }

    const protectedRanges: { start: number, end: number }[] = [];
    let fenceStart: number | undefined,
        dollarMathStart: number | undefined,
        bracketMathStart: number | undefined;

    for ( let index = 0; index < totalLines; index++ ) {
      const lineNumber = index + 1,
            line = lines[index];

      if ( fenceStart ) {
        if ( isFenceDelimiterLine ( line ) ) {
          protectedRanges.push ({ start: fenceStart, end: lineNumber });
          fenceStart = undefined;
        }
        continue;
      }

      if ( bracketMathStart ) {
        if ( isBracketMathEndLine ( line ) ) {
          protectedRanges.push ({ start: bracketMathStart, end: lineNumber });
          bracketMathStart = undefined;
        }
        continue;
      }

      if ( dollarMathStart ) {
        if ( isDollarMathDelimiterLine ( line ) ) {
          protectedRanges.push ({ start: dollarMathStart, end: lineNumber });
          dollarMathStart = undefined;
        }
        continue;
      }

      if ( isFenceDelimiterLine ( line ) ) {
        fenceStart = lineNumber;
        continue;
      }

      if ( isBracketMathStartLine ( line ) ) {
        bracketMathStart = lineNumber;
        continue;
      }

      if ( isDollarMathDelimiterLine ( line ) ) {
        dollarMathStart = lineNumber;
      }
    }

    if ( fenceStart ) protectedRanges.push ({ start: fenceStart, end: totalLines });
    if ( bracketMathStart ) protectedRanges.push ({ start: bracketMathStart, end: totalLines });
    if ( dollarMathStart ) protectedRanges.push ({ start: dollarMathStart, end: totalLines });

    let changed = true;

    while ( changed ) {
      changed = false;

      for ( let index = 0, l = protectedRanges.length; index < l; index++ ) {
        const range = protectedRanges[index];

        if ( startLine > range.start && startLine <= range.end ) {
          startLine = range.start;
          changed = true;
        }

        if ( endLine >= range.start && endLine < range.end ) {
          endLine = range.end;
          changed = true;
        }

        if ( startLine < range.start && endLine >= range.start && endLine < range.end ) {
          endLine = range.end;
          changed = true;
        }
      }
    }

    startLine = _.clamp ( startLine, 1, totalLines );
    endLine = _.clamp ( endLine, startLine, totalLines );

    const partialContent = lines.slice ( startLine - 1, endLine ).join ( '\n' );

    return {
      content: partialContent,
      startLine,
      endLine,
      totalLines
    };
  }, [content, getMonaco] );

  const getSourceSnapshot = React.useCallback ( () => {
    const monaco = getMonaco ? getMonaco () : undefined;

    if ( !monaco ) return;

    const scrollTop = monaco.getScrollTop (),
          model = monaco.getModel (),
          visibleRanges = monaco.getVisibleRanges (),
          firstVisibleLine = visibleRanges && visibleRanges[0] ? visibleRanges[0].startLineNumber : 1,
          lineCount = model ? model.getLineCount () : 1,
          lineTop = monaco.getTopForLineNumber ( firstVisibleLine ),
          nextLineTop = monaco.getTopForLineNumber ( Math.min ( lineCount, firstVisibleLine + 1 ) ),
          lineHeight = Math.max ( 1, nextLineTop - lineTop || 20 ),
          sourceMaxUnits = Math.max ( 1, lineCount - 1 ),
          sourceUnits = _.clamp ( ( firstVisibleLine - 1 ) + ( ( scrollTop - lineTop ) / lineHeight ), 0, sourceMaxUnits );

    return { sourceUnits, sourceMaxUnits };
  }, [getMonaco] );

  const getDebounceDelay = React.useCallback ( () => {
    if ( !isEditorFocused ) return 0;
    const base = content.length >= MEDIUM_PREVIEW_RENDER_THRESHOLD ? 180 : 80,
          variable = Math.min ( 180, Math.floor ( content.length / 800 ) );
    return Math.max ( TYPING_DEBOUNCE_MIN, Math.min ( TYPING_DEBOUNCE_MAX, base + variable ) );
  }, [content.length, isEditorFocused] );

  React.useEffect ( () => {
    cancelWorkerRender ();

    if ( enableWorker && hasCompletedInitialRenderRef.current && isEditorFocused ) {
      initWorker ();
    }

    const renderJobId = ++renderJobRef.current,
          render = async () => {
            const sourceSnapshot = getSourceSnapshot (),
                  renderMeta = { kind: shouldDeferRender ? 'full-deferred' : 'full-live', sourceSnapshot };
            if ( renderJobId !== renderJobRef.current ) return;
            renderMetaRef.current = renderMeta;
            $.$window.trigger ( 'preview:render:start', [renderMeta] );
            let nextHtml: string;
            try {
              nextHtml = await renderInWorker ( content );
            } catch ( error ) {
              if ( renderJobId !== renderJobRef.current || Markdown.isRenderAbortError ( error ) ) return;
              console.error ( '[preview] Worker render failed', error );
              setIsRendering ( false );
              return;
            }
            if ( renderJobId !== renderJobRef.current ) return;
            setHtml ( nextHtml );
            setIsRendering ( false );
          },
          scheduleRender = () => {
            if ( renderJobId !== renderJobRef.current ) return;
            setIsRendering ( true );
            if ( shouldDeferRender ) {
              scheduleIdle ( () => void render () );
            } else {
              void render ();
            }
          },
          debounceDelay = getDebounceDelay ();

    clearScheduled ();

    if ( shouldDeferRender ) {
      const partial = buildPartialPreview ();
      if ( renderJobId !== renderJobRef.current ) return;
      renderMetaRef.current = {
        kind: 'partial',
        sourceSnapshot: getSourceSnapshot (),
        partialWindow: {
          startLine: partial.startLine,
          endLine: partial.endLine,
          totalLines: partial.totalLines
        }
      };
      $.$window.trigger ( 'preview:render:start', [renderMetaRef.current] );
      renderInWorker ( partial.content ).then ( partialHtml => {
        if ( renderJobId !== renderJobRef.current ) return;
        setHtml ( partialHtml );
        setIsRendering ( false );

        timeoutRef.current = window.setTimeout ( scheduleRender, largeNoteFullRenderDelay );
      }).catch ( error => {
        if ( renderJobId !== renderJobRef.current || Markdown.isRenderAbortError ( error ) ) return;
        console.error ( '[preview] Partial worker render failed', error );
        setIsRendering ( false );
      });
    } else if ( debounceDelay > 0 ) {
      setIsRendering ( true );
      timeoutRef.current = window.setTimeout ( scheduleRender, debounceDelay );
    } else {
      void render ();
    }

    return () => {
      renderJobRef.current++;
      cancelWorkerRender ();
      clearScheduled ();
    };

  }, [content, effectiveContent, shouldDeferRender, getDebounceDelay, clearScheduled, scheduleIdle, isEditorFocused, buildPartialPreview, getSourceSnapshot, renderInWorker, cancelWorkerRender, enableWorker, largeNoteFullRenderDelay, largeRenderMode, initWorker] );

  React.useEffect ( () => () => clearScheduled (), [clearScheduled] );

  React.useEffect ( () => {
    if ( isRendering ) return;
    if ( !hasCompletedInitialRenderRef.current ) hasCompletedInitialRenderRef.current = true;
    $.$window.trigger ( 'preview:rendered', [renderMetaRef.current] );
  }, [html, isRendering] );

  const onClick = React.useCallback ( ( event: React.MouseEvent<HTMLDivElement> ) => {
    const container = resolvedPreviewRef.current,
          target = event.target as Element | null,
          anchor = target?.closest ( 'a[href^="#"]' ) as HTMLAnchorElement | null;

    if ( !container || !anchor ) return;

    const href = anchor.getAttribute ( 'href' ) || '',
          hash = href.slice ( 1 );

    if ( !hash ) return;

    const destination = container.querySelector ( `#${CSS.escape ( decodeURIComponent ( hash ) )}` ) as HTMLElement | null;

    if ( !destination ) return;

    event.preventDefault ();

    const containerRect = container.getBoundingClientRect (),
          destinationRect = destination.getBoundingClientRect (),
          nextScrollTop = Math.max ( 0, ( destinationRect.top - containerRect.top ) + container.scrollTop );

    if ( onAnchorNavigate ) onAnchorNavigate ( nextScrollTop, hash );

    container.scrollTop = nextScrollTop;
  }, [onAnchorNavigate, resolvedPreviewRef] );

  const showLoading = isRendering && !html;
  const previewClassName = `layout-content preview${isLargeDocument ? ' preview-large-document' : ''}${syncScroll ? ' preview-sync-scroll' : ''}`;

  return (
    <div ref={resolvedPreviewRef} className={previewClassName} onClick={onClick} onScroll={onScroll}>
      {showLoading ? <div className="preview-loading-state">Loading preview...</div> : <div className="preview-content" dangerouslySetInnerHTML={{ __html: html }}></div>}
    </div>
  );
};

/* EXPORT */

export default connect ({
  container: Main,
  selector: ({ container, content, onScroll, onAnchorNavigate, previewRef, enableWorker, largeRenderMode, syncScroll }) => ({
    content: content || container.note.getPlainContent (),
    onScroll,
    onAnchorNavigate,
    previewRef,
    enableWorker,
    largeRenderMode,
    syncScroll,
    isEditorFocused: container.editor.hasFocus (),
    getMonaco: container.editor.getMonaco,
    sourceFilePath: container.note.get ()?.filePath
  })
})( Preview );
