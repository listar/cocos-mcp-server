const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const DEFAULT_COCOS_EXECUTABLE =
    '/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator';

test('MCP SDK initializes inside the supported Cocos 3.8.8 Electron runtime', t => {
    const executable = process.env.COCOS_CREATOR_EXECUTABLE || DEFAULT_COCOS_EXECUTABLE;
    if (!fs.existsSync(executable)) {
        t.skip(`Cocos executable not found: ${executable}`);
        return;
    }

    const repoPath = path.resolve(__dirname, '..');
    const script = `
        const { MCPServer } = require(${JSON.stringify(path.join(repoPath, 'dist/mcp-server.js'))});
        const token = 'runtime-smoke-token-long-enough';
        const server = new MCPServer({
            port: 0,
            autoStart: false,
            enableDebugLog: false,
            allowedOrigins: [],
            maxConnections: 2,
            maxSessions: 2,
            sessionIdleTimeoutMs: 60000,
            authToken: token,
            requestBodyLimitBytes: 65536,
            toolExecutionTimeoutMs: 2000,
            enableRestApi: false
        });
        (async () => {
            await server.start();
            const port = server.getStatus().port;
            const response = await fetch('http://127.0.0.1:' + port + '/mcp', {
                method: 'POST',
                headers: {
                    Authorization: 'Bearer ' + token,
                    Accept: 'application/json, text/event-stream',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'initialize',
                    params: {
                        protocolVersion: '2025-11-25',
                        capabilities: {},
                        clientInfo: { name: 'cocos-runtime-test', version: '1.0.0' }
                    }
                })
            });
            const body = await response.json();
            console.log(JSON.stringify({
                node: process.versions.node,
                electron: process.versions.electron,
                chrome: process.versions.chrome,
                status: response.status,
                protocolVersion: body.result && body.result.protocolVersion,
                toolCount: server.getAvailableTools().length
            }));
            await server.stop();
        })().catch(error => {
            console.error(error);
            process.exitCode = 1;
        });
    `;

    const output = execFileSync(executable, ['-e', script], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        encoding: 'utf8',
        timeout: 15_000
    }).trim();
    const result = JSON.parse(output.split(/\r?\n/).at(-1));

    assert.equal(result.node, '20.15.1');
    assert.equal(result.electron, '31.3.1');
    assert.equal(result.chrome, '126.0.6478.185');
    assert.equal(result.status, 200);
    assert.equal(result.protocolVersion, '2025-11-25');
    assert.equal(result.toolCount, 153);
});
