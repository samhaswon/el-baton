/* IMPORT */

import * as path from 'path';

/* TYPES */

type ResolveRelativeOptions = {
  cwd: string;
  notesPath: string;
  sourceFilePath?: string;
};

type ResolveToTokenOptions = {
  attachmentsPath: string;
  attachmentsToken: string;
  notesPath: string;
  notesToken: string;
};

/* MARKDOWN PATH */

const MarkdownPath = {

  isPathInside ( parentPath: string, childPath: string ): boolean {

    const relative = path.relative ( parentPath, childPath );

    return ( !!relative && !relative.startsWith ( '..' ) && !path.isAbsolute ( relative ) ) || childPath === parentPath;

  },

  toTokenRelativePath ( parentPath: string, childPath: string ): string {

    return path.relative ( parentPath, childPath ).replace ( /\\/g, '/' );

  },

  resolveMarkdownRelativePath ( rawTarget: string, options: ResolveRelativeOptions ): string | undefined {

    const {cwd, notesPath, sourceFilePath} = options,
          target = rawTarget.trim ();

    if ( !target || target.startsWith ( '#' ) || target.startsWith ( '@' ) || /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test ( target ) ) return;

    const sourceBasePath = sourceFilePath ? path.dirname ( sourceFilePath ) : notesPath,
          resolvedPath = path.resolve ( sourceBasePath, target );

    if ( !MarkdownPath.isPathInside ( cwd, resolvedPath ) ) return;

    return resolvedPath;

  },

  resolveTokenPath ( basePath: string, tokenPath: string ): string | undefined {

    const resolvedPath = path.resolve ( basePath, tokenPath );

    if ( !MarkdownPath.isPathInside ( basePath, resolvedPath ) ) return;

    return resolvedPath;

  },

  resolvePathToToken ( filePath: string, options: ResolveToTokenOptions ): string | undefined {

    const {attachmentsPath, attachmentsToken, notesPath, notesToken} = options;

    if ( MarkdownPath.isPathInside ( attachmentsPath, filePath ) ) {
      return `${attachmentsToken}/${MarkdownPath.toTokenRelativePath ( attachmentsPath, filePath )}`;
    }

    if ( MarkdownPath.isPathInside ( notesPath, filePath ) ) {
      return `${notesToken}/${MarkdownPath.toTokenRelativePath ( notesPath, filePath )}`;
    }

    return;

  }

};

/* EXPORT */

export default MarkdownPath;
