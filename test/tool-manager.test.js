const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function loadToolManager(projectPath) {
    global.Editor = { Project: { path: projectPath } };
    delete require.cache[require.resolve('../dist/tools/tool-manager')];
    return require('../dist/tools/tool-manager');
}

test('tool configurations reconcile current tools and security defaults', t => {
    const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'cocos-mcp-config-'));
    t.after(() => fs.rmSync(projectPath, { recursive: true, force: true }));
    const settingsPath = path.join(projectPath, 'settings');
    fs.mkdirSync(settingsPath, { recursive: true });
    fs.writeFileSync(path.join(settingsPath, 'tool-manager.json'), JSON.stringify({
        configurations: [{
            id: 'legacy',
            name: 'Legacy',
            tools: [
                {
                    category: 'validation',
                    name: 'safe_string_value',
                    enabled: false,
                    description: 'old'
                },
                {
                    category: 'project',
                    name: 'run_project',
                    enabled: true,
                    description: 'removed'
                },
                {
                    category: 'node',
                    name: 'delete_node',
                    enabled: true,
                    description: 'dangerous'
                }
            ],
            createdAt: '2025-01-01T00:00:00.000Z',
            updatedAt: '2025-01-01T00:00:00.000Z'
        }],
        currentConfigId: 'missing',
        maxConfigSlots: 5,
        securityMigrationVersion: 0,
        configurationSchemaVersion: 0
    }));

    const {
        ToolManager,
        TOOL_CONFIGURATION_SCHEMA_VERSION
    } = loadToolManager(projectPath);
    const manager = new ToolManager();
    const available = manager.getAvailableTools();
    const config = manager.getCurrentConfiguration();

    assert.equal(available.length, 153);
    assert.equal(config.tools.length, available.length);
    assert.equal(config.schemaVersion, TOOL_CONFIGURATION_SCHEMA_VERSION);
    assert.equal(config.tools.some(tool => tool.name === 'run_project'), false);
    assert.equal(
        config.tools.find(tool => tool.name === 'safe_string_value').enabled,
        false
    );
    assert.equal(config.tools.find(tool => tool.name === 'delete_node').enabled, false);
    assert.equal(
        config.tools.find(tool => tool.name === 'get_current_scene').enabled,
        true
    );

    const persisted = JSON.parse(
        fs.readFileSync(path.join(settingsPath, 'tool-manager.json'), 'utf8')
    );
    assert.equal(persisted.currentConfigId, 'legacy');
    assert.equal(persisted.configurationSchemaVersion, TOOL_CONFIGURATION_SCHEMA_VERSION);
    assert.equal(persisted.securityMigrationVersion, 2);
});

test('configuration imports reject unknown and duplicate tools', t => {
    const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'cocos-mcp-import-'));
    t.after(() => fs.rmSync(projectPath, { recursive: true, force: true }));
    const { ToolManager } = loadToolManager(projectPath);
    const manager = new ToolManager();

    assert.throws(() => manager.importConfiguration(JSON.stringify({
        id: 'x',
        name: 'Unknown',
        tools: [{
            category: 'project',
            name: 'run_project',
            enabled: true,
            description: ''
        }]
    })), /Unknown tool/);

    const duplicate = {
        category: 'validation',
        name: 'safe_string_value',
        enabled: true,
        description: ''
    };
    assert.throws(() => manager.importConfiguration(JSON.stringify({
        id: 'x',
        name: 'Duplicate',
        tools: [duplicate, duplicate]
    })), /Duplicate tool/);
});

test('imported dangerous tools remain disabled by default', t => {
    const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'cocos-mcp-dangerous-'));
    t.after(() => fs.rmSync(projectPath, { recursive: true, force: true }));
    const { ToolManager } = loadToolManager(projectPath);
    const manager = new ToolManager();
    const config = manager.importConfiguration(JSON.stringify({
        id: 'x',
        name: 'Imported',
        tools: [
            {
                category: 'debug',
                name: 'execute_script',
                enabled: true,
                description: ''
            },
            {
                category: 'sceneAdvanced',
                name: 'execute_component_method',
                enabled: true,
                description: ''
            },
            {
                category: 'sceneAdvanced',
                name: 'execute_scene_script',
                enabled: true,
                description: ''
            }
        ]
    }));

    for (const name of [
        'execute_script',
        'execute_component_method',
        'execute_scene_script'
    ]) {
        assert.equal(config.tools.find(tool => tool.name === name).enabled, false);
    }
});
