/* IMPORT */

import {shell} from 'electron';

/* IS */

const platform = process.platform;

export const is = {
  macos: platform === 'darwin',
  windows: platform === 'win32',
  linux: platform === 'linux'
};

/* DARK MODE */

export const darkMode = {
  get isEnabled (): boolean {
    try {
      const electron = require ( 'electron' );
      return !!electron.nativeTheme?.shouldUseDarkColors;
    } catch ( error ) {
      return false;
    }
  }
};

/* HELPERS */

export const enforceMacOSAppLocation = (): void => {};

export const openNewGitHubIssue = ( options: { user?: string, repo?: string, repoUrl?: string, body?: string, title?: string } ): void => {

  const {body = '', title = ''} = options;

  let {user, repo} = options;

  if ( !user || !repo ) {
    const match = ( options.repoUrl || '' ).match ( /github\.com\/([^/]+)\/([^/#?]+)/i );
    if ( match ) {
      user = user || match[1];
      repo = repo || match[2];
    }
  }

  if ( !user || !repo ) return;

  const query: string[] = [];

  if ( title ) query.push ( `title=${encodeURIComponent ( title )}` );
  if ( body ) query.push ( `body=${encodeURIComponent ( body )}` );

  const suffix = query.length ? `?${query.join ( '&' )}` : '';
  const url = `https://github.com/${user}/${repo}/issues/new${suffix}`;

  shell.openExternal ( url );

};
