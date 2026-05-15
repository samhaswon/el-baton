/* CACHE */

const MAX_ENTRIES = 80;
const cache = new Map<string, string> ();

const MermaidCache = {

  /**
   * Reads a cached Mermaid SVG and refreshes its LRU position.
   */
  get ( source: string ) {

    const cached = cache.get ( source );

    if ( !cached ) return;

    // LRU bump
    cache.delete ( source );
    cache.set ( source, cached );

    return cached;

  },

  /**
   * Stores a Mermaid SVG and evicts the oldest entry when the cache is full.
   */
  set ( source: string, svg: string ) {

    cache.set ( source, svg );

    if ( cache.size <= MAX_ENTRIES ) return;

    const oldestKey = cache.keys ().next ().value;

    if ( oldestKey ) cache.delete ( oldestKey );

  },

  /**
   * Removes all cached Mermaid SVGs.
   */
  clear () {

    cache.clear ();

  }

};

/* EXPORT */

export default MermaidCache;
