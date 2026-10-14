const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

function panel(request) {
    const filename = path.resolve(__dirname, '../dist/panels/default/index.js');
    const localRequire = createRequire(filename);
    let state;
    const vue = localRequire('vue');
    const app = {
        config: { compilerOptions: {} },
        component(_name, definition) { state = definition.setup(); },
        mount() {}
    };
    const context = {
        module: { exports: {} }, exports: {}, __dirname: path.dirname(filename),
        require(name) {
            return name === 'vue' ? { ...vue, createApp: () => app, onMounted() {}, onUnmounted() {} } : localRequire(name);
        },
        Editor: { Panel: { define: value => value }, Message: { request } },
        setInterval, clearInterval, navigator: {}
    };
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context);
    context.module.exports.ready.call({ $: { app: {} } });
    return state;
}

const tools = [
    { category: 'scene', name: 'get_current_scene', enabled: false, description: 'Current scene' },
    { category: 'debug', name: 'execute_script', enabled: false, description: 'Execute script' }
];

test('panel filtering and bulk enabling preserve dangerous tool defaults', async () => {
    const calls = [];
    const state = panel(async (_extension, method, updates) => {
        if (method === 'getToolManagerState') return { success: true, availableTools: tools.map(t => ({ ...t })) };
        calls.push(updates);
        return { success: true };
    });
    await state.loadToolManagerState();
    await state.bulkTools(true);
    assert.equal(calls[0].length, 1);
    assert.equal(state.availableTools.value[0].enabled, true);
    assert.equal(state.availableTools.value[1].enabled, false);
    state.searchQuery.value = '调试';
    assert.equal(state.filteredTools.value.length, 1);
    state.updateToolStatus(state.availableTools.value[1]);
    assert.ok(state.pendingRisk.value);
    assert.equal(calls.length, 1);
    await state.confirmRisk();
    assert.equal(state.availableTools.value[1].enabled, true);
});

test('panel shows save failures and prevents overlapping writes', async () => {
    let release;
    const state = panel(async (_extension, method) => {
        if (method === 'getToolManagerState') return { success: true, availableTools: tools.map(t => ({ ...t })) };
        return new Promise(resolve => { release = resolve; });
    });
    await state.loadToolManagerState();
    const pending = state.bulkTools(true);
    assert.equal(state.toolsBusy.value, true);
    await state.bulkTools(false);
    release({ success: false });
    await pending;
    assert.equal(state.availableTools.value[0].enabled, false);
    assert.match(state.toolError.value, /保存失败/);
    assert.equal(state.toolsBusy.value, false);
});
