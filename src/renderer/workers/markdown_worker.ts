/* IMPORT */

import Markdown from '@renderer/utils/markdown';

/* TYPES */

type RenderMessage = {
  type: 'render';
  id: number;
  content: string;
  limit?: number;
  sourceFilePath?: string;
  runtimeConfig?: any;
};

type CancelMessage = {
  type: 'cancel';
  id: number;
};

type WorkerMessage = RenderMessage | CancelMessage;

declare const self: {
  onmessage: ( event: MessageEvent<WorkerMessage> ) => void | Promise<void>;
  postMessage: ( message: any ) => void;
};

/* STATE */

const cancelled = new Set<number> ();

/* WORKER */

self.onmessage = async ( event: MessageEvent<WorkerMessage> ) => {

  const message = event.data;

  if ( !message ) return;

  if ( message.type === 'cancel' ) {
    cancelled.add ( message.id );
    return;
  }

  const {id, content, limit = Infinity, sourceFilePath, runtimeConfig} = message;

  cancelled.delete ( id );

  try {
    Markdown.setRuntimeConfig ( runtimeConfig || {} );
    const html = await Markdown.renderAsync ( content, limit, sourceFilePath, () => cancelled.has ( id ) );

    if ( cancelled.has ( id ) ) {
      self.postMessage ({ type: 'cancelled', id });
      return;
    }

    self.postMessage ({ type: 'rendered', id, html });
  } catch ( error ) {
    if ( cancelled.has ( id ) || Markdown.isRenderAbortError ( error ) ) {
      self.postMessage ({ type: 'cancelled', id });
      return;
    }

    self.postMessage ({ type: 'error', id, error: error instanceof Error ? error.message : String ( error ) });
  } finally {
    cancelled.delete ( id );
  }

};

export {};
