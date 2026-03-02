"use strict";
/* IMPORT */
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const assert = require("node:assert/strict");
const emoji_1 = require("../../src/common/emoji");
/* TESTS */
(0, node_test_1.test)('emoji: replaces known shortcodes and leaves unknown ones alone', () => {
    const input = 'Check :question: and :rocket:, but not :not_a_real_emoji:.', output = emoji_1.default.replaceShortcodes(input);
    assert.equal(output, 'Check ❓ and 🚀, but not :not_a_real_emoji:.');
});
(0, node_test_1.test)('emoji: replacement can skip protected regions', () => {
    const input = 'Code `:question:` text :question:', output = emoji_1.default.replaceShortcodes(input, index => index < 16);
    assert.equal(output, 'Code `:question:` text ❓');
});
(0, node_test_1.test)('emoji: suggestions prioritize prefix matches', () => {
    const suggestions = emoji_1.default.getSuggestions('quest', 3);
    assert.deepEqual(suggestions.slice(0, 2), [
        { shortcode: 'question', emoji: '❓' },
        { shortcode: 'question_mark', emoji: '❓' }
    ]);
});
(0, node_test_1.test)('emoji: includes GitHub-only aliases in suggestions even without a unicode glyph', () => {
    const suggestions = emoji_1.default.getSuggestions('ship', 5);
    assert.equal(suggestions.some(entry => entry.shortcode === 'shipit'), true);
    assert.equal(emoji_1.default.get('shipit'), undefined);
});
