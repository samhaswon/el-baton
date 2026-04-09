/* IMPORT */

import * as fs from 'fs';
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

type SuggestPathOptions = ResolveRelativeOptions & {
  attachmentsPath?: string;
  attachmentsToken?: string;
  notesToken?: string;
};

type PathSuggestion = {
  path: string;
  isDirectory: boolean;
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

  },

  listPathSuggestions ( rawTarget: string, options: SuggestPathOptions ): PathSuggestion[] {

    const {attachmentsPath, attachmentsToken, cwd, notesPath, notesToken, sourceFilePath} = options,
          target = rawTarget.replace ( /\\/g, '/' );

    if ( target.startsWith ( '#' ) || target.startsWith ( '/' ) || /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test ( target ) ) return [];

    const tokenBases = [
      ( attachmentsPath && attachmentsToken ) ? { token: attachmentsToken, basePath: attachmentsPath, rootPath: attachmentsPath } : undefined,
      ( notesPath && notesToken ) ? { token: notesToken, basePath: notesPath, rootPath: notesPath } : undefined
    ].filter ( Boolean ) as Array<{ token: string, basePath: string, rootPath: string }>;

    if ( target.startsWith ( '@' ) && !target.includes ( '/' ) ) {
      return tokenBases
        .filter ( entry => entry.token.startsWith ( target ) )
        .map ( entry => ({ path: `${entry.token}/`, isDirectory: true }) );
    }

    const attachmentPrefix = attachmentsToken ? `${attachmentsToken}/` : '',
          notePrefix = notesToken ? `${notesToken}/` : '';

    let basePath = sourceFilePath ? path.dirname ( sourceFilePath ) : notesPath,
        rootPath = cwd,
        relativeTarget = target,
        outputPrefix = '';

    if ( attachmentsPath && attachmentPrefix && target.startsWith ( attachmentPrefix ) ) {
      basePath = attachmentsPath;
      rootPath = attachmentsPath;
      relativeTarget = target.slice ( attachmentPrefix.length );
      outputPrefix = attachmentPrefix;
    } else if ( notePrefix && target.startsWith ( notePrefix ) ) {
      basePath = notesPath;
      rootPath = notesPath;
      relativeTarget = target.slice ( notePrefix.length );
      outputPrefix = notePrefix;
    }

    if ( !basePath ) return [];

    const lastSlashIndex = relativeTarget.lastIndexOf ( '/' ),
          directoryPart = lastSlashIndex >= 0 ? relativeTarget.slice ( 0, lastSlashIndex + 1 ) : '',
          entryPrefix = lastSlashIndex >= 0 ? relativeTarget.slice ( lastSlashIndex + 1 ) : relativeTarget,
          lookupDir = path.resolve ( basePath, directoryPart || '.' );

    if ( !MarkdownPath.isPathInside ( rootPath, lookupDir ) ) return [];

    let entries: fs.Dirent[];

    try {
      entries = fs.readdirSync ( lookupDir, { withFileTypes: true } );
    } catch {
      return [];
    }

    const normalizedEntryPrefix = entryPrefix.toLowerCase ();

    return entries
      .filter ( entry => entry.name.toLowerCase ().startsWith ( normalizedEntryPrefix ) )
      .sort (( a, b ) => {
        if ( a.isDirectory () !== b.isDirectory () ) return a.isDirectory () ? -1 : 1;
        return a.name.localeCompare ( b.name, undefined, { sensitivity: 'base', numeric: true } );
      })
      .map ( entry => ({
        path: `${outputPrefix}${directoryPart}${entry.name}${entry.isDirectory () ? '/' : ''}`,
        isDirectory: entry.isDirectory ()
      }));

  }

};

/* EXPORT */

export default MarkdownPath;
