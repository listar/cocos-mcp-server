const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function loadSettings(projectPath) {
    global.Editor = { Project: { path: projectPath } };
    delete require.cache[require.resolve('../dist/settings')];
    return require('../dist/settings');
}

test('malformed server settings are repaired with a stable generated token', t => {
    const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'cocos-mcp-settings-'));
    t.after(() => {
        delete global.Editor;
        fs.rmSync(projectPath, { recursive: true, force: true });
    });
    const settingsDir = path.join(projectPath, 'settings');
    const settingsPath = path.join(settingsDir, 'mcp-server.json');
    fs.mkdirSync(settingsDir, { recursive: true });
    fs.writeFileSync(settingsPath, '{ invalid json');

    const { readSettings } = loadSettings(projectPath);
    const first = readSettings();
    const repaired = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    const second = readSettings();

    assert.equal(first.authToken.length, 48);
    assert.equal(repaired.authToken, first.authToken);
    assert.equal(second.authToken, first.authToken);
    assert.deepEqual(repaired.allowedOrigins, []);
});

test('server settings normalize unsafe origins and numeric limits', t => {
    const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'cocos-mcp-normalize-'));
    t.after(() => {
        delete global.Editor;
        fs.rmSync(projectPath, { recursive: true, force: true });
    });
    const { normalizeSettings } = loadSettings(projectPath);
    const settings = normalizeSettings({
        port: 80,
        allowedOrigins: ['*', ' https://example.test ', 'https://example.test'],
        maxConnections: 1000,
        authToken: 'short'
    });

    assert.equal(settings.port, 1024);
    assert.deepEqual(settings.allowedOrigins, ['https://example.test']);
    assert.equal(settings.maxConnections, 100);
    assert.equal(settings.authToken.length, 48);
});
