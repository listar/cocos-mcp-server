const test = require('node:test');
const assert = require('node:assert/strict');
const { MCPServer } = require('../dist/mcp-server');

const TOKEN = 'test-token-that-is-long-enough';

function createSettings(overrides = {}) {
    return {
        port: 0,
        autoStart: false,
        enableDebugLog: false,
        allowedOrigins: ['https://allowed.example'],
        maxConnections: 2,
        maxSessions: 2,
        sessionIdleTimeoutMs: 30 * 60 * 1000,
        authToken: TOKEN,
        requestBodyLimitBytes: 16 * 1024,
        toolExecutionTimeoutMs: 2000,
        enableRestApi: false,
        ...overrides
    };
}

async function initializeSession(baseUrl, clientName = 'test') {
    const response = await postMcp(baseUrl, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
            protocolVersion: '2025-11-25',
            capabilities: {},
            clientInfo: { name: clientName, version: '1.0.0' }
        }
    });
    assert.equal(response.status, 200);
    const sessionId = response.headers.get('mcp-session-id');
    assert.ok(sessionId);
    return sessionId;
}

function mcpHeaders(extra = {}) {
    return {
        Authorization: `Bearer ${TOKEN}`,
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
        ...extra
    };
}

async function postMcp(baseUrl, body, headers = {}) {
    return fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: mcpHeaders(headers),
        body: JSON.stringify(body)
    });
}

test('MCP HTTP endpoint enforces security and protocol behavior', async t => {
    const server = new MCPServer(createSettings());
    server.updateEnabledTools([{
        category: 'validation',
        name: 'safe_string_value',
        enabled: true,
        description: ''
    }]);
    await server.start();
    t.after(async () => server.stop());

    const { port } = server.getStatus();
    const baseUrl = `http://127.0.0.1:${port}`;

    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);

    const unauthorized = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
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
                clientInfo: { name: 'test', version: '1.0.0' }
            }
        })
    });
    assert.equal(unauthorized.status, 401);

    const forbiddenOrigin = await postMcp(baseUrl, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
            protocolVersion: '2025-11-25',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0.0' }
        }
    }, { Origin: 'https://forbidden.example' });
    assert.equal(forbiddenOrigin.status, 403);

    const initialize = await postMcp(baseUrl, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
            protocolVersion: '2025-11-25',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0.0' }
        }
    });
    assert.equal(initialize.status, 200);
    const sessionId = initialize.headers.get('mcp-session-id');
    assert.ok(sessionId);
    const initializeBody = await initialize.json();
    assert.equal(initializeBody.result.protocolVersion, '2025-11-25');

    const initialized = await postMcp(baseUrl, {
        jsonrpc: '2.0',
        method: 'notifications/initialized'
    }, {
        'MCP-Protocol-Version': '2025-11-25',
        'MCP-Session-Id': sessionId
    });
    assert.equal(initialized.status, 202);

    const toolsList = await postMcp(baseUrl, {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {}
    }, {
        'MCP-Protocol-Version': '2025-11-25',
        'MCP-Session-Id': sessionId
    });
    assert.equal(toolsList.status, 200);
    const toolsBody = await toolsList.json();
    assert.deepEqual(toolsBody.result.tools.map(tool => tool.name), [
        'validation_safe_string_value'
    ]);

    const invalidCall = await postMcp(baseUrl, {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
            name: 'validation_safe_string_value',
            arguments: {}
        }
    }, {
        'MCP-Protocol-Version': '2025-11-25',
        'MCP-Session-Id': sessionId
    });
    assert.equal(invalidCall.status, 200);
    const invalidCallBody = await invalidCall.json();
    assert.equal(invalidCallBody.result.isError, true);
    assert.match(invalidCallBody.result.structuredContent.error, /Invalid arguments/);

    const getMcp = await fetch(`${baseUrl}/mcp`, {
        headers: {
            Authorization: `Bearer ${TOKEN}`,
            Accept: 'text/event-stream'
        }
    });
    assert.equal(getMcp.status, 400);
});

test('empty enabled-tool configuration exposes and executes no tools', async () => {
    const server = new MCPServer(createSettings());
    server.updateEnabledTools([]);
    assert.deepEqual(server.getAvailableTools(), []);

    await assert.rejects(
        server.executeToolCall('validation_safe_string_value', { value: 'hello' }),
        /Tool is disabled/
    );
});

test('dangerous tools require explicit confirmation in their schema', () => {
    const server = new MCPServer(createSettings());
    const tool = server.getAvailableTools()
        .find(candidate => candidate.name === 'node_delete_node');

    assert.ok(tool);
    assert.equal(tool.annotations.destructiveHint, true);
    assert.ok(tool.inputSchema.required.includes('confirm'));
    assert.equal(tool.inputSchema.properties.confirm.const, true);
});

test('session deletion and maximum session count are deterministic', async t => {
    const server = new MCPServer(createSettings({ maxSessions: 1 }));
    await server.start();
    t.after(async () => server.stop());
    const baseUrl = `http://127.0.0.1:${server.getStatus().port}`;

    const sessionId = await initializeSession(baseUrl, 'first');
    const rejected = await postMcp(baseUrl, {
        jsonrpc: '2.0',
        id: 2,
        method: 'initialize',
        params: {
            protocolVersion: '2025-11-25',
            capabilities: {},
            clientInfo: { name: 'second', version: '1.0.0' }
        }
    });
    assert.equal(rejected.status, 429);

    const deleted = await fetch(`${baseUrl}/mcp`, {
        method: 'DELETE',
        headers: mcpHeaders({
            'MCP-Protocol-Version': '2025-11-25',
            'MCP-Session-Id': sessionId
        })
    });
    assert.equal(deleted.status, 200);
    assert.equal(server.getStatus().clients, 0);
    await initializeSession(baseUrl, 'replacement');
});

test('idle sessions are removed by the scheduled cleanup timer', async t => {
    const server = new MCPServer(createSettings({ sessionIdleTimeoutMs: 100 }));
    await server.start();
    t.after(async () => server.stop());
    const baseUrl = `http://127.0.0.1:${server.getStatus().port}`;
    const sessionId = await initializeSession(baseUrl);

    await new Promise(resolve => setTimeout(resolve, 350));
    assert.equal(server.getStatus().clients, 0);
    const response = await postMcp(baseUrl, {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {}
    }, {
        'MCP-Protocol-Version': '2025-11-25',
        'MCP-Session-Id': sessionId
    });
    assert.equal(response.status, 404);
});

test('HTTP limits, REST gating, CORS preflight, timeout, and list changes are enforced', async t => {
    const server = new MCPServer(createSettings({
        requestBodyLimitBytes: 256,
        toolExecutionTimeoutMs: 25
    }));
    await server.start();
    t.after(async () => server.stop());
    const baseUrl = `http://127.0.0.1:${server.getStatus().port}`;

    const oversized = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: mcpHeaders(),
        body: JSON.stringify({ padding: 'x'.repeat(1000) })
    });
    assert.equal(oversized.status, 413);

    const restDisabled = await fetch(`${baseUrl}/api/tools`, {
        headers: { Authorization: `Bearer ${TOKEN}` }
    });
    assert.equal(restDisabled.status, 404);

    const preflight = await fetch(`${baseUrl}/mcp`, {
        method: 'OPTIONS',
        headers: {
            Origin: 'https://allowed.example',
            Host: `127.0.0.1:${server.getStatus().port}`
        }
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://allowed.example');

    const sessionId = await initializeSession(baseUrl);
    const runtime = server.protocolRuntimes.get(sessionId);
    let listChangedCount = 0;
    runtime.server.sendToolListChanged = async () => { listChangedCount++; };
    server.updateEnabledTools([]);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(listChangedCount, 1);

    const registered = server.registeredTools.get('validation_safe_string_value');
    registered.executor = {
        getTools: () => [],
        execute: () => new Promise(() => {})
    };
    server.updateEnabledTools([{
        category: 'validation',
        name: 'safe_string_value',
        enabled: true,
        description: ''
    }]);
    await assert.rejects(
        server.executeToolCall('validation_safe_string_value', { value: 'hello' }),
        /timed out/
    );
});

test('REST API can be enabled and shutdown closes an open SSE request', async () => {
    const server = new MCPServer(createSettings({ enableRestApi: true }));
    await server.start();
    const baseUrl = `http://127.0.0.1:${server.getStatus().port}`;

    const tools = await fetch(`${baseUrl}/api/tools`, {
        headers: { Authorization: `Bearer ${TOKEN}` }
    });
    assert.equal(tools.status, 200);

    const sessionId = await initializeSession(baseUrl);
    const streamPromise = fetch(`${baseUrl}/mcp`, {
        headers: {
            Authorization: `Bearer ${TOKEN}`,
            Accept: 'text/event-stream',
            'MCP-Protocol-Version': '2025-11-25',
            'MCP-Session-Id': sessionId
        }
    }).catch(() => null);

    await Promise.race([
        server.stop(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('shutdown timed out')), 1000))
    ]);
    await Promise.race([
        streamPromise,
        new Promise(resolve => setTimeout(resolve, 100))
    ]);
    assert.equal(server.getStatus().running, false);
});
