declare module 'electron-util' {
  export const darkMode: { isEnabled: boolean };
  export const is: Record<string, boolean>;
  export const openNewGitHubIssue: (...args: any[]) => string;
  export const enforceMacOSAppLocation: (...args: any[]) => void;
}
