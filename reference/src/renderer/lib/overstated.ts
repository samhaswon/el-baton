/* IMPORT */

import * as React from 'react';

/* TYPES */

type SuspensionOptions = {
  propagateDown?: boolean,
  propagateUp?: boolean
};

type AutosuspendOptions = SuspensionOptions & {
  children?: boolean,
  methods?: RegExp,
  methodsExclude?: RegExp,
  methodsInclude?: RegExp
};

type StoreToken = any;

type StoreRegistry = {
  resolve: ( token: StoreToken ) => any
};

type ConnectOptions = {
  container?: StoreToken,
  containers?: StoreToken[],
  selector?: Function,
  shouldComponentUpdate?: boolean | Function
};

/* HELPERS */

const DEFAULT_AUTOSUSPEND_METHODS_RE = /^(?!_|(?:(?:get|has|is)(?![a-z0-9])))/;
const STORES_CONTEXT = React.createContext<StoreRegistry | null> ( null );
const AUTOSUSPENDED = new WeakSet<object> ();
const globalWindow = globalThis as typeof globalThis & { OVERSTATED?: { states: Record<string, unknown>, stores: Record<string, unknown>, log: () => void } };

const isObject = ( value: unknown ): value is Record<string, unknown> => {

  return !!value && typeof value === 'object';

};

const shallowEqual = ( a: unknown, b: unknown ): boolean => {

  if ( Object.is ( a, b ) ) return true;
  if ( !isObject ( a ) || !isObject ( b ) ) return false;

  const aKeys = Object.keys ( a ),
        bKeys = Object.keys ( b );

  if ( aKeys.length !== bKeys.length ) return false;

  for ( let i = 0, l = aKeys.length; i < l; i++ ) {

    const key = aKeys[i];

    if ( !Object.prototype.hasOwnProperty.call ( b, key ) || !Object.is ( a[key], b[key] ) ) return false;

  }

  return true;

};

const toStoreName = ( store: Container ): string => {

  const constructor = store.constructor as typeof Function & { displayName?: string };

  return constructor.displayName || constructor.name || 'AnonymousContainer';

};

const getStoreTokens = ( options: ConnectOptions ): StoreToken[] => {

  if ( options.containers?.length ) return options.containers;
  if ( options.container ) return [options.container];

  throw new Error ( 'connect requires a `container` or `containers` option' );

};

const getContainerChildren = ( store: Container ): Container[] => {

  return Object.values ( store ).filter ( value => value instanceof Container );

};

const getSubscribedStores = ( stores: Container[] ): Container[] => {

  const visited = new Set<Container> (),
        queue = [...stores];

  while ( queue.length ) {

    const store = queue.shift ();

    if ( !store || visited.has ( store ) ) continue;

    visited.add ( store );
    queue.push ( ...getContainerChildren ( store ) );

  }

  return Array.from ( visited );

};

const ensureDebugWindow = (): void => {

  if ( globalWindow.OVERSTATED ) return;

  globalWindow.OVERSTATED = {
    stores: {},
    states: {},
    log: () => {
      if ( !globalWindow.OVERSTATED ) return;
      console.log ( 'OVERSTATED.stores', globalWindow.OVERSTATED.stores );
      console.log ( 'OVERSTATED.states', globalWindow.OVERSTATED.states );
    }
  };

};

/* DEBUG */

export const debug = {
  isEnabled: false,
  logStateChanges: true,
  register ( store: Container ) {

    if ( !debug.isEnabled ) return;

    ensureDebugWindow ();

    const name = toStoreName ( store );

    globalWindow.OVERSTATED!.stores[name] = store;
    globalWindow.OVERSTATED!.states[name] = store.state;

  },
  notify ( store: Container, prevState: unknown ) {

    if ( !debug.isEnabled ) return;

    ensureDebugWindow ();

    const name = toStoreName ( store );

    globalWindow.OVERSTATED!.stores[name] = store;
    globalWindow.OVERSTATED!.states[name] = store.state;

    if ( !debug.logStateChanges ) return;

    console.log ( `[overstated] ${name} state changed`, { prevState, state: store.state } );

  }
};

export const HMR = {
  isEnabled: false
};

/* CONTAINER */

export class Container<State extends object = any, CTX = any> {

  /* VARIABLES */

  static displayName?: string;

  state!: State;
  ctx!: CTX;

  private _listeners = new Set<Function> ();
  private _middlewareHandlers: Function[] = [];
  private _middlewareSuspended = 0;
  private _middlewareSuspendedPrevState?: State;
  private _pendingUpdate = false;

  _updateSuspended = 0;

  /* CONSTRUCTOR */

  constructor () {

    const registerMiddlewares = ( this as any ).middlewares;

    if ( typeof registerMiddlewares === 'function' ) {
      registerMiddlewares.call ( this );
    }

    debug.register ( this );

  }

  /* HELPERS */

  private _runMiddlewares ( prevState: State ): void {

    if ( this._middlewareSuspended ) {
      this._middlewareSuspendedPrevState = this._middlewareSuspendedPrevState || prevState;
      return;
    }

    this._middlewareHandlers.slice ().forEach ( middleware => {
      middleware.call ( this, prevState );
    });

  }

  private _notify (): void {

    if ( this._updateSuspended ) {
      this._pendingUpdate = true;
      return;
    }

    this._listeners.forEach ( listener => {
      listener ();
    });

  }

  private _toggleSuspension ( kind: 'update' | 'middleware', direction: 'down' | 'up', method: 'suspend' | 'unsuspend' ): void {

    if ( direction === 'up' && this.ctx instanceof Container ) {
      const parentMethod = method === 'suspend' ? 'suspend' : 'unsuspend';
      const parentOptions = direction === 'up' ? { propagateUp: true, propagateDown: false } : undefined;
      ( this.ctx as unknown as Container )[parentMethod]( parentOptions );
      return;
    }

    if ( direction === 'down' ) {
      getContainerChildren ( this ).forEach ( child => {
        if ( kind === 'update' ) {
          child[method] ({ propagateDown: true, propagateUp: false });
        } else {
          child[method === 'suspend' ? 'suspendMiddlewares' : 'unsuspendMiddlewares'] ({ propagateDown: true, propagateUp: false });
        }
      });
    }

  }

  /* API */

  subscribe ( listener: Function ): Function {

    this._listeners.add ( listener );

    return () => {
      this._listeners.delete ( listener );
    };

  }

  setState ( updater: Partial<State> | (( prevState: State ) => Partial<State> | State | null | undefined) ): Promise<void> {

    const prevState = this.state,
          patch = typeof updater === 'function' ? updater ( prevState ) : updater;

    if ( patch === null || patch === undefined ) return Promise.resolve ();

    this.state = Object.assign ( {}, prevState, patch );

    this._runMiddlewares ( prevState );
    this._notify ();

    debug.notify ( this, prevState );

    return Promise.resolve ();

  }

  isSuspended (): boolean {

    return !!this._updateSuspended;

  }

  suspend ( options: SuspensionOptions = {} ): void {

    this._updateSuspended += 1;

    if ( options.propagateUp ) {
      this._toggleSuspension ( 'update', 'up', 'suspend' );
    }

    if ( options.propagateDown ) {
      this._toggleSuspension ( 'update', 'down', 'suspend' );
    }

  }

  unsuspend ( options: SuspensionOptions = {}, callback?: Function ): Promise<void> {

    if ( this._updateSuspended ) {
      this._updateSuspended -= 1;
    }

    if ( options.propagateUp ) {
      this._toggleSuspension ( 'update', 'up', 'unsuspend' );
    }

    if ( options.propagateDown ) {
      this._toggleSuspension ( 'update', 'down', 'unsuspend' );
    }

    if ( !this._updateSuspended && this._pendingUpdate ) {
      this._pendingUpdate = false;
      this._listeners.forEach ( listener => {
        listener ();
      });
    }

    if ( callback ) callback ();

    return Promise.resolve ();

  }

  suspendMiddlewares ( options: SuspensionOptions = {} ): void {

    this._middlewareSuspended += 1;

    if ( options.propagateUp && this.ctx instanceof Container ) {
      ( this.ctx as unknown as Container ).suspendMiddlewares ({ propagateUp: true, propagateDown: false });
    }

    if ( options.propagateDown ) {
      getContainerChildren ( this ).forEach ( child => {
        child.suspendMiddlewares ({ propagateDown: true, propagateUp: false });
      });
    }

  }

  unsuspendMiddlewares ( options: SuspensionOptions = {}, callback?: Function ): Promise<void> {

    if ( this._middlewareSuspended ) {
      this._middlewareSuspended -= 1;
    }

    if ( options.propagateUp && this.ctx instanceof Container ) {
      ( this.ctx as unknown as Container ).unsuspendMiddlewares ({ propagateUp: true, propagateDown: false });
    }

    if ( options.propagateDown ) {
      getContainerChildren ( this ).forEach ( child => {
        child.unsuspendMiddlewares ({ propagateDown: true, propagateUp: false });
      });
    }

    if ( !this._middlewareSuspended && this._middlewareSuspendedPrevState ) {
      const prevState = this._middlewareSuspendedPrevState;

      this._middlewareSuspendedPrevState = undefined;

      this._middlewareHandlers.slice ().forEach ( middleware => {
        middleware.call ( this, prevState );
      });
    }

    if ( callback ) callback ();

    return Promise.resolve ();

  }

  addMiddleware ( middleware: Function ): void {

    if ( this._middlewareHandlers.includes ( middleware ) ) return;

    this._middlewareHandlers.push ( middleware );

  }

  registerMiddleware ( middleware: Function ): void {

    this.addMiddleware ( middleware );

  }

  removeMiddleware ( middleware: Function ): void {

    this._middlewareHandlers = this._middlewareHandlers.filter ( handler => handler !== middleware );

  }

  unregisterMiddleware ( middleware: Function ): void {

    this.removeMiddleware ( middleware );

  }

}

/* AUTOSUSPEND */

export const autosuspend = ( store: Container, options: AutosuspendOptions = {} ): Container => {

  if ( AUTOSUSPENDED.has ( store ) ) return store;

  AUTOSUSPENDED.add ( store );

  const instanceOptions = isObject (( store as any ).autosuspend ) ? ( store as any ).autosuspend : {};
  const finalOptions: AutosuspendOptions = {
    children: true,
    methods: DEFAULT_AUTOSUSPEND_METHODS_RE,
    ...instanceOptions,
    ...options
  };

  const wrap = ( key: string ): void => {

    const original = ( store as any )[key];

    if ( typeof original !== 'function' || key === 'constructor' ) return;

    const included = finalOptions.methodsInclude?.test ( key ) || finalOptions.methods?.test ( key ),
          excluded = finalOptions.methodsExclude?.test ( key );

    if ( !included || excluded ) return;

    ( store as any )[key] = async ( ...args: unknown[] ) => {

      const shouldPropagateUp = finalOptions.propagateUp ?? ( store.ctx instanceof Container );
      const suspensionOptions = {
        propagateDown: !!finalOptions.propagateDown,
        propagateUp: shouldPropagateUp
      };

      store.suspend ( suspensionOptions );

      try {
        return await original.apply ( store, args );
      } finally {
        await store.unsuspend ( suspensionOptions );
      }

    };

  };

  Object.keys ( store ).forEach ( wrap );

  let prototype = Object.getPrototypeOf ( store );

  while ( prototype && prototype !== Container.prototype && prototype !== Object.prototype ) {

    Object.getOwnPropertyNames ( prototype ).forEach ( wrap );

    prototype = Object.getPrototypeOf ( prototype );

  }

  if ( finalOptions.children ) {
    getContainerChildren ( store ).forEach ( child => autosuspend ( child ) );
  }

  return store;

};

/* PROVIDER */

const getInjectedStore = ( token: StoreToken, inject: Container[] ): any => {

  if ( token instanceof Container ) return token;

  return inject.find ( candidate => candidate instanceof token );

};

export const Provider = ({ children, inject = [] }: { children?: React.ReactNode, inject?: Container[] }) => {

  const storesRef = React.useRef ( new Map<StoreToken, Container> () );

  const registry = React.useMemo<StoreRegistry> (() => ({
    resolve: ( token: StoreToken ): any => {

      const stores = storesRef.current;

      if ( stores.has ( token ) ) return stores.get ( token );

      const injected = getInjectedStore ( token, inject );

      if ( injected ) {
        stores.set ( token, injected );
        return injected;
      }

      if ( token instanceof Container ) {
        stores.set ( token, token );
        return token;
      }

      const store = new token ();

      stores.set ( token, store );

      return store;

    }
  }), [inject] );

  return React.createElement ( STORES_CONTEXT.Provider, { value: registry }, children );

};

/* CONNECT */

export const connect = ( options: ConnectOptions ) => {

  const tokens = getStoreTokens ( options );

  return function ( WrappedComponent: React.ComponentType<any> ) {

    return class ConnectedComponent extends React.Component<any, { selected: Record<string, unknown> }> {

      static contextType = STORES_CONTEXT;
      static displayName = `connect(${WrappedComponent.displayName || WrappedComponent.name || 'Component'})`;

      declare context: StoreRegistry | null;

      private stores: Container[];
      private subscribedStores: Container[] = [];
      private unsubscribeFns: Function[] = [];

      constructor ( props: any, context: StoreRegistry | null ) {

        super ( props, context );

        this.stores = this.resolveStores ( context );
        this.state = {
          selected: this.select ( props, this.stores )
        };

      }

      shouldComponentUpdate ( nextProps: Readonly<any>, nextState: Readonly<{ selected: Record<string, unknown> }> ): boolean {

        if ( options.shouldComponentUpdate === false ) return false;
        if ( typeof options.shouldComponentUpdate === 'function' ) {
          return !!options.shouldComponentUpdate ( this.props, nextProps, this.state.selected, nextState.selected );
        }

        return !shallowEqual ( this.props, nextProps ) || !shallowEqual ( this.state.selected, nextState.selected );

      }

      componentDidMount (): void {

        if ( options.shouldComponentUpdate === false ) return;

        this.subscribe ();
        this.syncSelected ();

      }

      componentDidUpdate ( prevProps: Readonly<any> ): void {

        const stores = this.resolveStores ( this.context );
        const storesChanged = stores.length !== this.stores.length || stores.some (( store, index ) => store !== this.stores[index] );

        if ( storesChanged ) {
          this.unsubscribe ();
          this.stores = stores;
          if ( options.shouldComponentUpdate !== false ) this.subscribe ();
        }

        if ( options.shouldComponentUpdate === false ) return;

        if ( prevProps !== this.props || storesChanged ) {
          this.syncSelected ();
        }

      }

      componentWillUnmount (): void {

        this.unsubscribe ();

      }

      resolveStores ( registry: StoreRegistry | null ): Container[] {

        if ( !registry ) throw new Error ( 'Provider is missing for connected containers' );

        return tokens.map ( token => registry.resolve ( token ) );

      }

      select ( props: any, stores: Container[] ): Record<string, unknown> {

        const base = {
          ...props,
          container: stores[0],
          containers: stores
        };

        if ( !options.selector ) return base;

        return options.selector ( base ) || {};

      }

      syncSelected (): void {

        const selected = this.select ( this.props, this.stores );

        if ( shallowEqual ( this.state.selected, selected ) ) return;

        this.setState ({ selected });

      }

      subscribe (): void {

        this.subscribedStores = getSubscribedStores ( this.stores );
        this.unsubscribeFns = this.subscribedStores.map ( store => store.subscribe ( this.handleStoreChange ) );

      }

      unsubscribe (): void {

        this.unsubscribeFns.forEach ( unsubscribe => unsubscribe () );
        this.unsubscribeFns = [];
        this.subscribedStores = [];

      }

      handleStoreChange = (): void => {

        this.syncSelected ();

      };

      render (): React.ReactNode {

        return React.createElement ( WrappedComponent, { ...this.props, ...this.state.selected } );

      }

    };

  };

};
