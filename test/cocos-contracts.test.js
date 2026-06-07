const test = require('node:test');
const assert = require('node:assert/strict');
const { ComponentTools } = require('../dist/tools/component-tools');
const { NodeTools } = require('../dist/tools/node-tools');
const { ProjectTools } = require('../dist/tools/project-tools');
const { SceneAdvancedTools } = require('../dist/tools/scene-advanced-tools');
const { SceneViewTools } = require('../dist/tools/scene-view-tools');
const { ServerTools } = require('../dist/tools/server-tools');
const { PrefabTools } = require('../dist/tools/prefab-tools');
const { ValidationTools } = require('../dist/tools/validation-tools');

function installEditor(request) {
    global.Editor = {
        Message: { request },
        Project: {
            name: 'Test',
            path: '/tmp/test',
            uuid: 'project-uuid'
        }
    };
}

test.afterEach(() => {
    delete global.Editor;
});

test('remove_component sends the component UUID', async () => {
    const calls = [];
    let queryCount = 0;
    installEditor(async (...args) => {
        calls.push(args);
        if (args[1] === 'query-node') {
            queryCount++;
            return {
                __comps__: queryCount === 1
                    ? [{
                        __type__: 'cc.Sprite',
                        value: { uuid: { value: 'component-uuid' } }
                    }]
                    : []
            };
        }
        return undefined;
    });

    const result = await new ComponentTools().execute('remove_component', {
        nodeUuid: 'node-uuid',
        componentType: 'cc.Sprite'
    });

    assert.equal(result.success, true);
    assert.deepEqual(
        calls.find(call => call[1] === 'remove-component'),
        ['scene', 'remove-component', { uuid: 'component-uuid' }]
    );
});

test('duplicate_node handles the documented UUID array result', async () => {
    installEditor(async () => ['copy-1']);
    const result = await new NodeTools().execute('duplicate_node', {
        uuid: 'source'
    });

    assert.equal(result.success, true);
    assert.equal(result.data.newUuid, 'copy-1');
    assert.deepEqual(result.data.newUuids, ['copy-1']);
});

test('save_scene dispatches the asynchronous editor request', async () => {
    const calls = [];
    global.Editor = {
        Message: {
            send: (...args) => calls.push(['send', ...args]),
            request: async (...args) => {
                calls.push(['request', ...args]);
                return false;
            }
        },
        Project: { name: 'Test', path: '/tmp/test', uuid: 'project-uuid' }
    };
    const { SceneTools } = require('../dist/tools/scene-tools');
    const result = await new SceneTools().execute('save_scene', {});

    assert.equal(result.success, true);
    assert.deepEqual(calls, [
        ['request', 'scene', 'save-scene']
    ]);
});

test('open_scene dispatches the asynchronous editor request', async () => {
    const calls = [];
    global.Editor = {
        Message: {
            send: (...args) => calls.push(['send', ...args]),
            request: async (...args) => {
                calls.push(['request', ...args]);
                if (args[0] === 'asset-db') return 'scene-asset-uuid';
                if (args[1] === 'query-node-tree') return { uuid: 'scene-root-uuid' };
                return undefined;
            }
        },
        Project: { name: 'Test', path: '/tmp/test', uuid: 'project-uuid' }
    };
    const { SceneTools } = require('../dist/tools/scene-tools');
    const result = await new SceneTools().execute('open_scene', {
        scenePath: 'db://assets/Smoke.scene'
    });

    assert.equal(result.success, true);
    assert.deepEqual(calls, [
        ['request', 'asset-db', 'query-uuid', 'db://assets/Smoke.scene'],
        ['request', 'scene', 'open-scene', 'scene-asset-uuid']
    ]);
});

test('scene view uses align-view-with-node', async () => {
    const calls = [];
    installEditor(async (...args) => calls.push(args));
    const result = await new SceneViewTools().execute('align_view_with_node', {});

    assert.equal(result.success, true);
    assert.deepEqual(calls[0], ['scene', 'align-view-with-node']);
});

test('builder open specifies the default panel', async () => {
    const calls = [];
    installEditor(async (...args) => calls.push(args));
    const result = await new ProjectTools().execute('open_build_panel', {});

    assert.equal(result.success, true);
    assert.deepEqual(calls[0], ['builder', 'open', 'default']);
});

test('server IP sorting uses the supported query-ip-list message', async () => {
    const calls = [];
    installEditor(async (...args) => {
        calls.push(args);
        return ['192.168.1.10', '10.0.0.2', '10.0.0.1'];
    });
    const result = await new ServerTools().execute('query_sorted_server_ip_list', {});

    assert.equal(result.success, true);
    assert.equal(calls[0][1], 'query-ip-list');
    assert.deepEqual(result.data.sortedIPList, [
        '10.0.0.1',
        '10.0.0.2',
        '192.168.1.10'
    ]);
});

test('prefab restore follows the Cocos 3.8.8 inspector runtime contract', async () => {
    const calls = [];
    installEditor(async (...args) => {
        calls.push(args);
        if (args[1] === 'query-node') {
            return {
                __prefab__: {
                    rootUuid: 'prefab-root-uuid',
                    uuid: 'prefab-asset-uuid'
                }
            };
        }
        return true;
    });

    const advanced = await new SceneAdvancedTools().execute('restore_prefab', {
        nodeUuid: 'node-uuid'
    });
    const prefab = await new PrefabTools().execute('restore_prefab_node', {
        nodeUuid: 'node-uuid'
    });

    assert.equal(advanced.success, true);
    assert.equal(prefab.success, true);
    assert.deepEqual(calls, [
        ['scene', 'query-node', 'node-uuid'],
        ['scene', 'restore-prefab', 'prefab-root-uuid', 'prefab-asset-uuid'],
        ['scene', 'query-node', 'node-uuid'],
        ['scene', 'restore-prefab', 'prefab-root-uuid', 'prefab-asset-uuid']
    ]);
});

test('safe_string_value escapes backspace without changing word boundaries', async () => {
    const result = await new ValidationTools().execute('safe_string_value', {
        value: `hello world${String.fromCharCode(8)}`
    });

    assert.equal(result.success, true);
    assert.equal(result.data.safeValue, 'hello world\\b');
});
