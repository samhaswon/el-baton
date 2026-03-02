/* IMPORT */

import {test} from 'node:test';
import * as assert from 'node:assert/strict';
import * as https from 'node:https';
import Emoji from '../../src/common/emoji';

/* HELPERS */

const fetchGitHubEmojis = (): Promise<Record<string, string>> => {

  return new Promise ( ( resolve, reject ) => {
    const request = https.get ( 'https://api.github.com/emojis', {
      headers: {
        'user-agent': 'el-baton-tests',
        'accept': 'application/vnd.github+json'
      }
    }, response => {
      if ( response.statusCode !== 200 ) {
        reject ( new Error ( `GitHub emojis request failed with status ${response.statusCode}` ) );
        response.resume ();
        return;
      }

      let content = '';

      response.setEncoding ( 'utf8' );
      response.on ( 'data', chunk => {
        content += chunk;
      });
      response.on ( 'end', () => {
        try {
          resolve ( JSON.parse ( content ) );
        } catch ( error ) {
          reject ( error );
        }
      });
    });

    request.on ( 'error', reject );

  });

};

/* TESTS */

test ( 'emoji: GitHub API aliases are covered by the local emoji dataset', { skip: process.env.ENABLE_NETWORK_TESTS !== '1' }, async () => {

  const githubEmojis = await fetchGitHubEmojis (),
        supportedShortcodes = new Set ( Emoji.getAllShortcodes () ),
        missing = Object.keys ( githubEmojis ).filter ( shortcode => !supportedShortcodes.has ( shortcode ) );

  assert.deepEqual ( missing, [], `Missing GitHub emoji aliases: ${missing.join ( ', ' ) || 'none'}. These gaps may be GitHub-specific custom aliases rather than standard gemoji entries.` );

});
