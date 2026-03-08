/* IMPORT */

import {PlantUMLRenderResult} from '@common/plantuml';

/* CACHE */

const MAX_ENTRIES = 120;
const cache = new Map<string, PlantUMLRenderResult> ();

const PlantUMLCache = {

  get ( key: string ) {

    const cached = cache.get ( key );

    if ( !cached ) return;

    cache.delete ( key );
    cache.set ( key, cached );

    return cached;

  },

  set ( key: string, value: PlantUMLRenderResult ) {

    cache.set ( key, value );

    if ( cache.size <= MAX_ENTRIES ) return;

    const oldestKey = cache.keys ().next ().value;

    if ( oldestKey ) cache.delete ( oldestKey );

  },

  clear () {

    cache.clear ();

  }

};

/* EXPORT */

export default PlantUMLCache;
