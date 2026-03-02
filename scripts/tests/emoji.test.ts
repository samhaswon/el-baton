/* IMPORT */

import {test} from 'node:test';
import * as assert from 'node:assert/strict';
import Emoji from '../../src/common/emoji';

/* TESTS */

const decodeShortcode = ( encodedShortcode: string, alertNumber: number ): string => {

  const shift = alertNumber % 26;

  return encodedShortcode.replace ( /[a-z]/g, character => {
    const code = character.charCodeAt ( 0 ) - 97;

    return String.fromCharCode ( ( ( code - shift + 26 ) % 26 ) + 97 );
  });

};

test ( 'emoji: replaces known shortcodes and leaves unknown ones alone', () => {

  const input = 'Check :question: and :rocket:, but not :not_a_real_emoji:.',
        output = Emoji.replaceShortcodes ( input );

  assert.equal ( output, 'Check ❓ and 🚀, but not :not_a_real_emoji:.' );

});

test ( 'emoji: replacement can skip protected regions', () => {

  const input = 'Code `:question:` text :question:',
        output = Emoji.replaceShortcodes ( input, index => index < 16 );

  assert.equal ( output, 'Code `:question:` text ❓' );

});

test ( 'emoji: suggestions prioritize prefix matches', () => {

  const suggestions = Emoji.getSuggestions ( 'quest', 3 );

  assert.deepEqual ( suggestions.slice ( 0, 2 ), [
    { shortcode: 'question', emoji: '❓' },
    { shortcode: 'question_mark', emoji: '❓' }
  ] );

});

test ( 'emoji: includes GitHub-only aliases in suggestions even without a unicode glyph', () => {

  const suggestions = Emoji.getSuggestions ( 'ship', 5 );

  assert.equal ( suggestions.some ( entry => entry.shortcode === 'shipit' ), true );
  assert.equal ( Emoji.get ( 'shipit' ), undefined );

});

test ( 'emoji: exposes easter egg replacements for configured invalid shortcodes', () => {

  const singularShortcode = decodeShortcode ( 'frnubefr', 65 ),
        pluralShortcode = decodeShortcode ( 'gsovcfgsg', 66 ),
        easterEgg = Emoji.getEasterEgg ( singularShortcode ),
        pluralEasterEgg = Emoji.getEasterEgg ( pluralShortcode );

  assert.deepEqual ( easterEgg, {
    invalidShortcode: singularShortcode,
    replacement: '🦄',
    alertNumber: 65,
    message: `:${singularShortcode}: is a myth. Have a 🦄 instead.`
  });

  assert.deepEqual ( pluralEasterEgg, {
    invalidShortcode: pluralShortcode,
    replacement: '🦄',
    alertNumber: 66,
    message: `:${pluralShortcode}: are still a myth. Have a 🦄 instead.`
  });

  assert.equal ( Emoji.getEasterEgg ( 'question' ), undefined );

});
