const test = require('node:test');
const assert = require('node:assert/strict');
const { MCPServer } = require('../dist/mcp-server');

test('every registered tool has explicit security annotations', () => {
    const server = new MCPServer({
        port: 0,
        autoStart: false,
        enableDebugLog: false,
        allowedOrigins: [],
        maxConnections: 1,
        maxSessions: 1,
        sessionIdleTimeoutMs: 1000,
        authToken: 'security-test-token-long-enough',
        requestBodyLimitBytes: 16 * 1024,
        toolExecutionTimeoutMs: 1000,
        enableRestApi: false
    });
    const tools = server.getAvailableTools();

    assert.equal(tools.length, 153);
    for (const tool of tools) {
        assert.equal(typeof tool.annotations.readOnlyHint, 'boolean', tool.name);
        assert.equal(typeof tool.annotations.destructiveHint, 'boolean', tool.name);
        assert.equal(typeof tool.annotations.idempotentHint, 'boolean', tool.name);
        assert.equal(typeof tool.annotations.openWorldHint, 'boolean', tool.name);
    }

    for (const name of [
        'debug_execute_script',
        'sceneAdvanced_execute_component_method',
        'sceneAdvanced_execute_scene_script'
    ]) {
        const tool = tools.find(candidate => candidate.name === name);
        assert.equal(tool.annotations.destructiveHint, true);
        assert.equal(tool.annotations.openWorldHint, true);
        assert.ok(tool.inputSchema.required.includes('confirm'));
    }
});
