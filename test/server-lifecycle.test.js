const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const { normalizeSettings } = require('../dist/settings');
const main = require('../dist/main');

test('start reports port conflicts and can retry successfully after the port is released', async t => {
    const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-lifecycle-'));
    global.Editor = { Project: { path: projectPath } };
    const occupied = http.createServer();
    occupied.listen(0, '127.0.0.1');
    await once(occupied, 'listening');
    const port = occupied.address().port;
    t.after(async () => {
        await main.unload();
        if (occupied.listening) await new Promise(resolve => occupied.close(resolve));
        delete global.Editor;
        fs.rmSync(projectPath, { recursive: true, force: true });
    });
    fs.mkdirSync(path.join(projectPath, 'settings'));
    fs.writeFileSync(path.join(projectPath, 'settings/mcp-server.json'), JSON.stringify(
        normalizeSettings({ port, autoStart: false })
    ));
    main.load();
    const failed = await main.methods.startServer();
    assert.equal(failed.running, false);
    assert.match(failed.error, new RegExp(String(port)));
    assert.match(failed.error, /已被占用/);
    assert.equal(main.methods.getServerStatus().error, failed.error);
    await new Promise(resolve => occupied.close(resolve));
    const started = await main.methods.startServer();
    assert.equal(started.running, true);
    assert.equal(started.error, '');
    const health = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(health.status, 200);
    const stopped = await main.methods.stopServer();
    assert.equal(stopped.running, false);
    assert.equal(stopped.error, '');
});

test('start without a loaded extension returns an explicit initialization error', async () => {
    global.Editor = { Project: { path: fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-unloaded-')) } };
    const projectPath = global.Editor.Project.path;
    try {
        const status = await main.methods.startServer();
        assert.equal(status.running, false);
        assert.match(status.error, /尚未初始化/);
    } finally {
        delete global.Editor;
        fs.rmSync(projectPath, { recursive: true, force: true });
    }
});
