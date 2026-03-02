"use strict";
/* IMPORT */
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const assert = require("node:assert/strict");
const https = require("node:https");
const emoji_1 = require("../../src/common/emoji");
/* HELPERS */
const fetchGitHubEmojis = () => {
    return new Promise((resolve, reject) => {
        const request = https.get('https://api.github.com/emojis', {
            headers: {
                'user-agent': 'el-baton-tests',
                'accept': 'application/vnd.github+json'
            }
        }, response => {
            if (response.statusCode !== 200) {
                reject(new Error(`GitHub emojis request failed with status ${response.statusCode}`));
                response.resume();
                return;
            }
            let content = '';
            response.setEncoding('utf8');
            response.on('data', chunk => {
                content += chunk;
            });
            response.on('end', () => {
                try {
                    resolve(JSON.parse(content));
                }
                catch (error) {
                    reject(error);
                }
            });
        });
        request.on('error', reject);
    });
};
/* TESTS */
(0, node_test_1.test)('emoji: GitHub API aliases are covered by the local emoji dataset', { skip: process.env.ENABLE_NETWORK_TESTS !== '1' }, async () => {
    const githubEmojis = await fetchGitHubEmojis(), supportedShortcodes = new Set(emoji_1.default.getAllShortcodes()), missing = Object.keys(githubEmojis).filter(shortcode => !supportedShortcodes.has(shortcode));
    assert.deepEqual(missing, []);
});
