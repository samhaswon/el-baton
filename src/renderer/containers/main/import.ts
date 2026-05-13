
/* IMPORT */

import Dialog from 'electron-dialog';
import {Container, autosuspend} from 'overstated';
import {createHash} from 'crypto';
import * as path from 'path';
import Config from '@common/config';
import File from '@renderer/utils/file';
import EnexImport, {DumperNote} from '@renderer/utils/enex_import';
import Metadata from '@renderer/utils/metadata';
import Path from '@renderer/utils/path';

/* TYPES */

type DumperModule = {
  default: {
    dump: ( options: {
      source: string | string[],
      dump: ( note: DumperNote ) => Promise<void> | void
    } ) => Promise<void>
  }
};

/* IMPORT LAZY */

const remote = require ( '@electron/remote' );

let dumperPromise: Promise<DumperModule> | undefined;

const getDumper = (): Promise<DumperModule> => {

  dumperPromise ||= import ( '@notable/dumper' ) as Promise<DumperModule>;

  return dumperPromise;

};

/* IMPORT */

class Import extends Container<ImportState, MainCTX> {

  /* CONSTRUCTOR */

  constructor () {

    super ();

    autosuspend ( this );

  }

  /* HELPERS */

  _getImportTag ( str: string ): string {

    const importId = createHash ( 'sha1' ).update ( str ).digest ( 'hex' ).slice ( 0, 4 ),
          importTag = `Import-${importId}`;

    return importTag;

  }

  _importEnex = async ( filePath: string ) => {

    const importTag = this._getImportTag ( filePath ),
          notesPath = Config.notes.path,
          attachmentsPath = Config.attachments.path,
          {default: Dumper} = await getDumper ();

    if ( !notesPath || !attachmentsPath ) return;

    await Dumper.dump ({
      source: filePath,
      dump: async note => {
        await EnexImport.dumpNote ( note, importTag, {
          notesPath,
          attachmentsPath
        } );
      }
    });

    const tag = await this.ctx.tag.get ( importTag );

    if ( tag ) this.ctx.tag.set ( importTag );

  }

  _importMarkdown = async ( filePath: string, importTag: string ) => {

    const notesPath = Config.notes.path;

    if ( !notesPath ) return;

    const content = await File.read ( filePath );

    if ( !content ) return;

    const metadata = Metadata.get ( content );

    if ( !metadata['tags'] ) metadata['tags'] = [];

    metadata['tags'].push ( importTag );

    const contentNext = Metadata.set ( content, metadata ),
          baseName = path.basename ( filePath ),
          {filePath: filePathNext} = await Path.getAllowedPath ( notesPath, baseName );

    File.write ( filePathNext, contentNext );

  }

  /* API */

  import = async ( filePaths: string[] ) => {

    const importTag = this._getImportTag ( filePaths.join ( '' ) );

    for ( const filePath of filePaths ) {

      const ext = path.extname ( filePath );

      switch ( ext ) {

        case '.enex':
          await this._importEnex ( filePath );
          break;

        case '.md':
        case '.mkd':
        case '.mdwn':
        case '.mdown':
        case '.markdown':
        case '.markdn':
        case '.mdtxt':
        case '.mdtext':
        case '.txt':
          await this._importMarkdown ( filePath, importTag );
          break;

        default:
          Dialog.alert ( 'Unsupported file type' );

      }

    }

  }

  select = async () => {

    const filePaths = await this.dialog ();

    return this.import ( filePaths );

  }

  dialog = async (): Promise<string[]> => {

    const {canceled, filePaths} = await remote.dialog.showOpenDialog ({
      title: 'Import Notes',
      buttonLabel: 'Import',
      filters: [
        { name: 'All Supported Formats', extensions: ['enex', 'md', 'mkd', 'mdwn', 'mdown', 'markdown', 'markdn', 'mdtxt', 'mdtext', 'txt'] },
        { name: 'Evernote', extensions: ['enex'] },
        { name: 'Markdown', extensions: ['md', 'mkd', 'mdwn', 'mdown', 'markdown', 'markdn', 'mdtxt', 'mdtext', 'txt'] }
      ],
      properties: ['openFile', 'multiSelections']
    });

    return canceled ? [] : filePaths;

  }

}

/* EXPORT */

export default Import;
