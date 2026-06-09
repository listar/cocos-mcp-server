const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const repoPath = path.resolve(__dirname, '..');
const workPath = fs.mkdtempSync(path.join(os.tmpdir(), 'cocos-mcp-package-'));
const packPath = path.join(workPath, 'pack');
const installPath = path.join(workPath, 'install');

try {
    fs.mkdirSync(packPath);
    fs.mkdirSync(installPath);
    const output = execFileSync(
        npmExecutable,
        ['pack', '--json', '--ignore-scripts', '--pack-destination', packPath],
        { cwd: repoPath, encoding: 'utf8' }
    );
    const result = JSON.parse(output)[0];
    const files = new Set(result.files.map(file => file.path));

    for (const required of [
        'package.json',
        'dist/main.js',
        'dist/scene.js',
        'static/template/default/index.html',
        'i18n/en.js',
        'scripts/install-global.js'
    ]) {
        if (!files.has(required)) throw new Error(`Release package is missing ${required}`);
    }

    for (const forbidden of [
        'AGENTS.md',
        'CLAUDE.md',
        'TODO.md',
        'source/main.ts',
        'test/mcp-server.test.js',
        'scripts/editor-smoke.js',
        'tsconfig.json'
    ]) {
        if (files.has(forbidden)) throw new Error(`Release package includes ${forbidden}`);
    }

    fs.writeFileSync(
        path.join(installPath, 'package.json'),
        JSON.stringify({ private: true }, null, 2)
    );
    const archivePath = path.join(packPath, result.filename);
    execFileSync(
        npmExecutable,
        [
            'install',
            archivePath,
            '--ignore-scripts',
            '--omit=dev',
            '--no-audit',
            '--no-fund'
        ],
        { cwd: installPath, stdio: 'pipe' }
    );

    const installedPath = path.join(
        installPath,
        'node_modules',
        'cocos-mcp-server'
    );
    require(path.join(installedPath, 'dist', 'main.js'));
    require.resolve('@modelcontextprotocol/sdk/server/mcp.js', { paths: [installedPath] });
    require.resolve('vue', { paths: [installedPath] });

    console.log(
        `Release package verified and clean-installed: ${files.size} files, ${result.size} bytes`
    );
} finally {
    fs.rmSync(workPath, { recursive: true, force: true });
}
