/* IMPORT */

import * as fs from 'fs';
import * as path from 'path';
import Metadata from './metadata';
import Path from './path';

/* TYPES */

type DumperAttachment = {
  metadata: {
    name: string
  },
  content: Uint8Array
};

type DumperNote = {
  metadata: {
    title: string,
    tags: string[],
    attachments: DumperAttachment[],
    created: Date,
    modified: Date
  },
  content: Uint8Array
};

type EnexImportPaths = {
  notesPath: string,
  attachmentsPath: string
};

type EnexImportDependencies = {
  getAllowedPath: typeof Path.getAllowedPath,
  writeAttachment: ( filePath: string, content: Uint8Array ) => Promise<void>,
  writeNote: ( filePath: string, content: string ) => Promise<void>
};

/* HELPERS */

const defaultDependencies: EnexImportDependencies = {
  getAllowedPath: Path.getAllowedPath,
  writeAttachment: async ( filePath, content ) => fs.promises.writeFile ( filePath, Buffer.from ( content ) ),
  writeNote: async ( filePath, content ) => {
    try {
      await fs.promises.writeFile ( filePath, content );
    } catch ( error ) {
      const e = error as NodeJS.ErrnoException;

      if ( e.code !== 'ENOENT' ) throw e;

      await fs.promises.mkdir ( path.dirname ( filePath ), { recursive: true } );
      await fs.promises.writeFile ( filePath, content );
    }
  }
};

const EnexImport = {

  /**
   * Writes one parsed ENEX note and its attachments into the configured notes
   * and attachments folders.
   */
  async dumpNote ( note: DumperNote, importTag: string, paths: EnexImportPaths, dependencies: EnexImportDependencies = defaultDependencies ): Promise<string> {

    const attachmentFileNames = await Promise.all ( note.metadata.attachments.map ( async attachment => {
      const {filePath, fileName} = await dependencies.getAllowedPath ( paths.attachmentsPath, attachment.metadata.name );

      await dependencies.writeAttachment ( filePath, attachment.content );

      return fileName;
    }) ),
          metadata = {
            title: note.metadata.title,
            tags: [...note.metadata.tags, importTag],
            attachments: attachmentFileNames,
            created: note.metadata.created.toISOString (),
            modified: note.metadata.modified.toISOString ()
          },
          content = Buffer.from ( note.content ).toString ( 'utf8' ),
          contentNext = Metadata.set ( content, metadata ),
          {filePath, fileName} = await dependencies.getAllowedPath ( paths.notesPath, `${note.metadata.title}.md` );

    await dependencies.writeNote ( filePath, contentNext );

    return fileName;

  }

};

/* EXPORT */

export type {DumperAttachment, DumperNote, EnexImportDependencies, EnexImportPaths};
export default EnexImport;
