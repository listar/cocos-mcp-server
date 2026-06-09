const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { getInstallPaths, installGlobal } = require('../scripts/install-global');

test('global installer uses the versioned Cocos 3.8.8 extension directory', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cocos-mcp-global-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const repoPath = path.resolve(__dirname, '..');
    const paths = getInstallPaths({ cocosHome: root, repoPath });

    assert.equal(
        paths.targetPath,
        path.join(root, 'builtin-extensions', '3.8.8', 'cocos-mcp-server')
    );

    const first = installGlobal({ cocosHome: root, repoPath });
    const second = installGlobal({ cocosHome: root, repoPath });
    assert.equal(first.changed, true);
    assert.equal(second.changed, false);
    assert.equal(fs.realpathSync(paths.targetPath), fs.realpathSync(repoPath));
});

test('global installer backs up an existing extension', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cocos-mcp-backup-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const repoPath = path.resolve(__dirname, '..');
    const paths = getInstallPaths({ cocosHome: root, repoPath });
    fs.mkdirSync(paths.targetPath, { recursive: true });
    fs.writeFileSync(path.join(paths.targetPath, 'old.txt'), 'old');

    const result = installGlobal({ cocosHome: root, repoPath });
    assert.equal(result.changed, true);
    assert.ok(result.backupPath);
    assert.equal(fs.readFileSync(path.join(result.backupPath, 'old.txt'), 'utf8'), 'old');
    assert.equal(fs.realpathSync(paths.targetPath), fs.realpathSync(repoPath));
});
