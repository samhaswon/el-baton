declare module 'electron-store' {
  interface ElectronStore<T extends Record<string, any> = Record<string, any>> {
    get: ( key: string, defaultValue?: any ) => any;
    set: ( key: string, value?: any ) => void;
    set: ( object: Partial<T> ) => void;
  }
}
