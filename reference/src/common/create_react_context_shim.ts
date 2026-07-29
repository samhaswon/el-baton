/* IMPORT */

import * as React from 'react';

/* CREATE REACT CONTEXT */

const createReactContext = <T>( defaultValue: T, _calculateChangedBits?: unknown ) => React.createContext ( defaultValue );

/* EXPORT */

export default createReactContext;
