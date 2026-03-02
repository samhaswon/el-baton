declare global {
  interface NodeModule {
    hot?: {
      accept: (path?: string, callback?: () => void) => void;
    };
  }
}

export {};
