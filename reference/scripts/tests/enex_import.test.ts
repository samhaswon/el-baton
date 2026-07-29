/* IMPORT */

import {test} from 'node:test';
import * as assert from 'node:assert/strict';
import Metadata from '../../src/renderer/utils/metadata';
import EnexImport, {DumperNote, EnexImportDependencies} from '../../src/renderer/utils/enex_import';

/* TESTS */

test ( 'enex import: writes attachments and note front matter preserving old app behavior', async () => {

  const attachmentWrites: Array<{ filePath: string, content: Uint8Array }> = [],
        noteWrites: Array<{ filePath: string, content: string }> = [],
        getAllowedPathCalls: Array<{ folderPath: string, baseName: string }> = [],
        dependencies: EnexImportDependencies = {
          getAllowedPath: async ( folderPath, baseName ) => {
            getAllowedPathCalls.push ({ folderPath, baseName });
            return {
              folderPath,
              filePath: `${folderPath}/${baseName}`,
              fileName: baseName
            };
          },
          writeAttachment: async ( filePath, content ) => {
            attachmentWrites.push ({ filePath, content });
          },
          writeNote: async ( filePath, content ) => {
            noteWrites.push ({ filePath, content });
          }
        },
        note: DumperNote = {
          metadata: {
            title: 'Imported Note',
            tags: ['Evernote', 'Work'],
            attachments: [{
              metadata: {
                name: 'diagram.png'
              },
              content: new Uint8Array ([1, 2, 3])
            }],
            created: new Date ( '2026-01-02T03:04:05.000Z' ),
            modified: new Date ( '2026-02-03T04:05:06.000Z' )
          },
          content: Buffer.from ( '# Hello\n\nImported content\n', 'utf8' )
        };

  const fileName = await EnexImport.dumpNote ( note, 'Import-abcd', {
    notesPath: '/notes',
    attachmentsPath: '/attachments'
  }, dependencies );

  assert.equal ( fileName, 'Imported Note.md' );
  assert.deepEqual ( getAllowedPathCalls, [
    { folderPath: '/attachments', baseName: 'diagram.png' },
    { folderPath: '/notes', baseName: 'Imported Note.md' }
  ] );
  assert.deepEqual ( attachmentWrites.map ( write => ({ filePath: write.filePath, content: Array.from ( write.content ) }) ), [
    { filePath: '/attachments/diagram.png', content: [1, 2, 3] }
  ] );
  assert.equal ( noteWrites.length, 1 );
  assert.equal ( noteWrites[0].filePath, '/notes/Imported Note.md' );

  const metadata = Metadata.get ( noteWrites[0].content ) as Record<string, unknown>;

  assert.deepEqual ( metadata['tags'], ['Evernote', 'Work', 'Import-abcd'] );
  assert.deepEqual ( metadata['attachments'], ['diagram.png'] );
  assert.equal ( metadata['created'], '2026-01-02T03:04:05.000Z' );
  assert.equal ( metadata['modified'], '2026-02-03T04:05:06.000Z' );
  assert.equal ( Metadata.remove ( noteWrites[0].content ).trim (), '# Hello\n\nImported content' );

} );

test ( 'enex import: uses resolved attachment file names in note metadata', async () => {

  const attachmentWrites: string[] = [],
        noteWrites: string[] = [],
        fileNames = ['image.png', 'image (2).png', 'Collision Test.md'];

  let nth = 0;

  const dependencies: EnexImportDependencies = {
    getAllowedPath: async ( folderPath, baseName ) => ({
      folderPath,
      filePath: `${folderPath}/${fileNames[nth]}`,
      fileName: fileNames[nth++]
    }),
    writeAttachment: async ( filePath ) => {
      attachmentWrites.push ( filePath );
    },
    writeNote: async ( filePath, content ) => {
      noteWrites.push ( content );
      assert.equal ( filePath, '/notes/Collision Test.md' );
    }
  };

  const note: DumperNote = {
    metadata: {
      title: 'Collision Test',
      tags: [],
      attachments: [
        {
          metadata: { name: 'image.png' },
          content: new Uint8Array ([4])
        },
        {
          metadata: { name: 'image.png' },
          content: new Uint8Array ([5])
        }
      ],
      created: new Date ( '2026-03-04T00:00:00.000Z' ),
      modified: new Date ( '2026-03-05T00:00:00.000Z' )
    },
    content: Buffer.from ( 'Body', 'utf8' )
  };

  await EnexImport.dumpNote ( note, 'Import-ffff', {
    notesPath: '/notes',
    attachmentsPath: '/attachments'
  }, dependencies );

  assert.deepEqual ( attachmentWrites, [
    '/attachments/image.png',
    '/attachments/image (2).png'
  ] );
  assert.equal ( noteWrites.length, 1 );

  const metadata = Metadata.get ( noteWrites[0] ) as Record<string, unknown>;

  assert.deepEqual ( metadata['attachments'], ['image.png', 'image (2).png'] );
  assert.deepEqual ( metadata['tags'], ['Import-ffff'] );

} );
