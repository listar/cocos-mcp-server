const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('control panel never renders the authentication token value', () => {
    const templatePath = path.join(
        __dirname,
        '..',
        'static',
        'template',
        'vue',
        'mcp-server-app.html'
    );
    const template = fs.readFileSync(templatePath, 'utf8');
    const tokenInput = template.match(
        /<ui-input slot="content"[^>]*>[\s\S]*?@click="copyToken"[\s\S]*?<\/ui-input>/
    );

    assert.ok(tokenInput);
    assert.doesNotMatch(tokenInput[0], /settings\.authToken/);
    assert.match(tokenInput[0], /value="\*{8}"/);
});
