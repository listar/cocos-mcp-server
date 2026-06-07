const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { execFileSync, spawn } = require('node:child_process');

const REPO_PATH = path.resolve(__dirname, '..');
const COCOS_ROOT = '/Applications/Cocos/Creator/3.8.8/CocosCreator.app';
const COCOS_EXECUTABLE = process.env.COCOS_CREATOR_EXECUTABLE
    || path.join(COCOS_ROOT, 'Contents/MacOS/CocosCreator');
const DEFAULT_ASSETS = path.join(
    COCOS_ROOT,
    'Contents/Resources/resources/3d/engine/editor/assets/default_file_content'
);
const TOKEN = 'editor-smoke-token-2026-06-07';
const PROTOCOL_VERSION = '2025-11-25';
const WARMUP_ATTEMPTS = 2;

async function main() {
    assertFile(COCOS_EXECUTABLE);
    assertFile(path.join(REPO_PATH, 'dist/main.js'));
    assertNoConcurrentEditor();

    const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'cocos-mcp-editor-smoke-'));
    let editor = null;
    try {
        const startupSceneUuid = prepareFixture(projectPath);
        const firstPort = await reservePort();
        writeServerSettings(projectPath, firstPort, TOKEN);
        enableSmokeTools(projectPath);

        await warmFixture(projectPath, firstPort, TOKEN);
        writeStartupSceneSettings(projectPath, startupSceneUuid);

        editor = launchEditor(projectPath);
        await waitForHealth(editor, firstPort);
        await runWorkflow(firstPort, TOKEN, projectPath);
        await stopEditor(editor);
        editor = null;

        const secondPort = await reservePort();
        const secondToken = `${TOKEN}-updated`;
        writeServerSettings(projectPath, secondPort, secondToken);
        editor = launchEditor(projectPath);
        await waitForHealth(editor, secondPort);
        const client = await createMcpClient(secondPort, secondToken);
        await client.call('project_get_project_info', {});
        await stopEditor(editor);
        editor = null;

        console.log(JSON.stringify({
            success: true,
            cocosVersion: '3.8.8',
            projectPath,
            cases: [
                'isolated runtime warmup',
                'extension auto-start',
                'settings reload',
                'MCP initialize/tools',
                'scene open/save',
                'node create/query/transform/duplicate/delete',
                'component add/query/remove',
                'prefab load/instantiate/restore/duplicate',
                'scene view 2D/3D',
                'clean editor shutdown'
            ]
        }, null, 2));
    } catch (error) {
        if (editor) await stopEditor(editor).catch(() => undefined);
        console.error(`Editor smoke failed. Fixture retained at ${projectPath}`);
        throw error;
    }

    if (process.env.KEEP_COCOS_SMOKE_FIXTURE !== '1') {
        fs.rmSync(projectPath, { recursive: true, force: true });
    }
}

function assertNoConcurrentEditor() {
    if (process.env.ALLOW_CONCURRENT_COCOS_SMOKE === '1' || process.platform !== 'darwin') {
        return;
    }
    try {
        const output = execFileSync('pgrep', [
            '-fl',
            'CocosCreator.app/Contents/MacOS/CocosCreator'
        ], { encoding: 'utf8' }).trim();
        if (output) {
            throw new Error(
                'Close other Cocos Creator instances before running the editor smoke test. '
                + 'Concurrent instances can break the isolated scene process. '
                + 'Set ALLOW_CONCURRENT_COCOS_SMOKE=1 only when this is intentional.'
            );
        }
    } catch (error) {
        if (error.status === 1) return;
        throw error;
    }
}

function prepareFixture(projectPath) {
    fs.mkdirSync(path.join(projectPath, 'assets'), { recursive: true });
    fs.mkdirSync(path.join(projectPath, 'extensions'), { recursive: true });
    fs.writeFileSync(path.join(projectPath, 'package.json'), JSON.stringify({
        name: 'CocosMcpEditorSmoke',
        uuid: randomUUID(),
        creator: { version: '3.8.8' }
    }, null, 2));

    copyDefaultAsset('scene/default.scene', path.join(projectPath, 'assets/Smoke.scene'));
    copyDefaultAsset('scene/default.scene.meta', path.join(projectPath, 'assets/Smoke.scene.meta'));
    copyDefaultAsset('scene/default.scene', path.join(projectPath, 'assets/SmokeAlt.scene'));
    copyDefaultAsset('scene/default.scene.meta', path.join(projectPath, 'assets/SmokeAlt.scene.meta'));
    copyDefaultAsset('prefab/default.prefab', path.join(projectPath, 'assets/SmokePrefab.prefab'));
    copyDefaultAsset('prefab/default.prefab.meta', path.join(projectPath, 'assets/SmokePrefab.prefab.meta'));
    renameScene(path.join(projectPath, 'assets/Smoke.scene'), 'Smoke');
    renameScene(path.join(projectPath, 'assets/SmokeAlt.scene'), 'SmokeAlt');
    const startupSceneUuid = rewriteMetaUuid(path.join(projectPath, 'assets/Smoke.scene.meta'));
    rewriteMetaUuid(path.join(projectPath, 'assets/SmokeAlt.scene.meta'));
    rewriteMetaUuid(path.join(projectPath, 'assets/SmokePrefab.prefab.meta'));

    fs.symlinkSync(
        REPO_PATH,
        path.join(projectPath, 'extensions/cocos-mcp-server'),
        'dir'
    );
    return startupSceneUuid;
}

function writeStartupSceneSettings(projectPath, startupSceneUuid) {
    const packageSettingsPath = path.join(projectPath, 'settings/v2/packages');
    fs.mkdirSync(packageSettingsPath, { recursive: true });
    fs.writeFileSync(path.join(packageSettingsPath, 'scene.json'), JSON.stringify({
        __version__: '1.0.3',
        'current-scene': startupSceneUuid
    }, null, 2));
}

function rewriteMetaUuid(metaPath) {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    meta.uuid = randomUUID();
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    return meta.uuid;
}

function renameScene(scenePath, name) {
    const scene = JSON.parse(fs.readFileSync(scenePath, 'utf8'));
    if (scene[0]) scene[0]._name = name;
    if (scene[1]) scene[1]._name = name;
    fs.writeFileSync(scenePath, JSON.stringify(scene, null, 2));
}

function copyDefaultAsset(relativeSource, destination) {
    const source = path.join(DEFAULT_ASSETS, relativeSource);
    assertFile(source);
    fs.copyFileSync(source, destination);
}

function writeServerSettings(projectPath, port, authToken) {
    const settingsPath = path.join(projectPath, 'settings');
    fs.mkdirSync(settingsPath, { recursive: true });
    fs.writeFileSync(path.join(settingsPath, 'mcp-server.json'), JSON.stringify({
        port,
        autoStart: true,
        enableDebugLog: false,
        allowedOrigins: [],
        maxConnections: 4,
        maxSessions: 2,
        sessionIdleTimeoutMs: 60_000,
        authToken,
        requestBodyLimitBytes: 1024 * 1024,
        toolExecutionTimeoutMs: 60_000,
        enableRestApi: false
    }, null, 2));
}

function enableSmokeTools(projectPath) {
    global.Editor = { Project: { path: projectPath } };
    const { ToolManager } = require(path.join(REPO_PATH, 'dist/tools/tool-manager.js'));
    const manager = new ToolManager();
    const config = manager.getCurrentConfiguration();
    for (const [category, name] of [
        ['scene', 'save_scene'],
        ['node', 'delete_node'],
        ['component', 'remove_component'],
        ['prefab', 'duplicate_prefab'],
        ['prefab', 'restore_prefab_node']
    ]) {
        manager.updateToolStatus(config.id, category, name, true);
    }
    delete global.Editor;
}

function launchEditor(projectPath) {
    const runtimePath = path.join(projectPath, '.cocos-smoke-runtime');
    const profilePath = path.join(runtimePath, 'profile');
    const homePath = path.join(runtimePath, 'home');
    const temporaryPath = path.join(runtimePath, 'tmp');
    const xdgPath = path.join(runtimePath, 'xdg');
    for (const directory of [profilePath, homePath, temporaryPath, xdgPath]) {
        fs.mkdirSync(directory, { recursive: true });
    }
    const environment = {
        ...process.env,
        HOME: homePath,
        TMPDIR: `${temporaryPath}${path.sep}`,
        TMP: temporaryPath,
        TEMP: temporaryPath,
        XDG_CACHE_HOME: path.join(xdgPath, 'cache'),
        XDG_CONFIG_HOME: path.join(xdgPath, 'config'),
        XDG_DATA_HOME: path.join(xdgPath, 'data'),
        XDG_STATE_HOME: path.join(xdgPath, 'state')
    };
    delete environment.ELECTRON_RUN_AS_NODE;
    const child = spawn(COCOS_EXECUTABLE, [
        '--project',
        projectPath,
        '--user-data-dir',
        profilePath,
        '--can-show-upgrade-dialog',
        'false'
    ], {
        env: environment,
        stdio: ['ignore', 'pipe', 'pipe']
    });
    child.logTail = '';
    const collect = chunk => {
        child.logTail = (child.logTail + chunk.toString('utf8')).slice(-20_000);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    return child;
}

async function warmFixture(projectPath, port, token) {
    let lastError;
    for (let attempt = 1; attempt <= WARMUP_ATTEMPTS; attempt += 1) {
        const editor = launchEditor(projectPath);
        try {
            await waitForHealth(editor, port);
            const client = await createMcpClient(port, token);
            await retry(
                () => client.call('project_get_asset_info', {
                    assetPath: 'db://assets/Smoke.scene'
                }),
                120_000
            );
            await retry(
                () => client.call('project_get_asset_info', {
                    assetPath: 'db://assets/SmokePrefab.prefab'
                }),
                120_000
            );
            await retry(async () => {
                const ready = await client.call('sceneAdvanced_query_scene_ready', {});
                if (ready.data?.ready !== true) {
                    throw new Error('Scene process is not ready during warmup');
                }
                return ready;
            }, 120_000);
            await stopEditor(editor);
            return;
        } catch (error) {
            lastError = error;
            await stopEditor(editor).catch(() => undefined);
            if (attempt < WARMUP_ATTEMPTS) {
                await delay(2000);
            }
        }
    }
    throw lastError;
}

async function waitForHealth(editor, port) {
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
        if (editor.exitCode !== null) {
            throw new Error(`Cocos exited before MCP startup:\n${editor.logTail}`);
        }
        try {
            const response = await fetch(`http://127.0.0.1:${port}/health`);
            if (response.ok) return;
        } catch {
            // Editor and extension are still loading.
        }
        await delay(1000);
    }
    throw new Error(`Timed out waiting for MCP health endpoint:\n${editor.logTail}`);
}

async function runWorkflow(port, token, projectPath) {
    const client = await createMcpClient(port, token);
    const tools = await client.listTools();
    const toolNames = new Set(tools.map(tool => tool.name));
    for (const requiredTool of [
        'scene_open_scene',
        'scene_save_scene',
        'node_create_node',
        'node_delete_node',
        'component_add_component',
        'component_remove_component',
        'prefab_instantiate_prefab',
        'prefab_restore_prefab_node',
        'sceneView_change_view_mode_2d_3d'
    ]) {
        if (!toolNames.has(requiredTool)) {
            throw new Error(`Required smoke tool is not enabled: ${requiredTool}`);
        }
    }

    await client.call('project_get_project_info', {});
    await retry(async () => {
        const ready = await client.call('sceneAdvanced_query_scene_ready', {});
        if (ready.data?.ready !== true) throw new Error('Scene process is not ready');
        return ready;
    }, 120_000);
    await retry(async () => {
        const current = await client.call('scene_get_current_scene', {});
        if (current.data?.name !== 'Smoke') throw new Error('Startup scene is not loaded');
        return current;
    }, 60_000);
    await client.call('scene_open_scene', {
        scenePath: 'db://assets/SmokeAlt.scene'
    });
    await retry(async () => {
        const current = await client.call('scene_get_current_scene', {});
        if (current.data?.name !== 'SmokeAlt') throw new Error('Alternate scene is not loaded');
        return current;
    }, 60_000);
    const hierarchy = await retry(() => client.call('scene_get_scene_hierarchy', {}), 30_000);
    const rootUuid = hierarchy.data?.uuid;
    if (!rootUuid) throw new Error('Scene hierarchy did not provide a root UUID');

    const created = await client.call('node_create_node', {
        name: 'McpSmokeNode',
        parentUuid: rootUuid
    });
    const nodeUuid = created.data?.uuid;
    if (!nodeUuid) throw new Error('Node creation did not return a UUID');
    await client.call('node_get_node_info', { uuid: nodeUuid });
    await client.call('node_set_node_transform', {
        uuid: nodeUuid,
        position: { x: 12, y: 34, z: 0 },
        scale: { x: 1.25, y: 1.25, z: 1 }
    });
    const sceneFile = path.join(projectPath, 'assets/SmokeAlt.scene');
    const modifiedBeforeSave = fs.statSync(sceneFile).mtimeMs;
    await client.call('scene_save_scene', { confirm: true });
    await waitForFileModification(sceneFile, modifiedBeforeSave, 20_000);

    await client.call('component_add_component', {
        nodeUuid,
        componentType: 'cc.UITransform'
    });
    const components = await client.call('component_get_components', { nodeUuid });
    const uiTransform = components.data?.components?.find(
        component => component.type === 'cc.UITransform'
    );
    if (!uiTransform) throw new Error('UITransform was not found after component creation');
    await client.call('component_remove_component', {
        nodeUuid,
        componentType: uiTransform.type,
        confirm: true
    });

    const duplicated = await client.call('node_duplicate_node', { uuid: nodeUuid });
    const duplicateUuid = duplicated.data?.newUuid;
    if (!duplicateUuid) throw new Error('Node duplication did not return a UUID');
    await client.call('node_delete_node', { uuid: duplicateUuid, confirm: true });

    await client.call('prefab_load_prefab', {
        prefabPath: 'db://assets/SmokePrefab.prefab'
    });
    const instance = await client.call('prefab_instantiate_prefab', {
        prefabPath: 'db://assets/SmokePrefab.prefab',
        parentUuid: rootUuid
    });
    const prefabNodeUuid = instance.data?.nodeUuid;
    if (!prefabNodeUuid) throw new Error('Prefab instantiation did not return a UUID');
    await client.call('node_set_node_transform', {
        uuid: prefabNodeUuid,
        position: { x: 50, y: 0, z: 0 }
    });
    await client.call('prefab_restore_prefab_node', {
        nodeUuid: prefabNodeUuid,
        confirm: true
    });
    await client.call('prefab_duplicate_prefab', {
        sourcePrefabPath: 'db://assets/SmokePrefab.prefab',
        targetPrefabPath: 'db://assets/SmokePrefabCopy.prefab',
        confirm: true
    });

    await client.call('sceneView_change_view_mode_2d_3d', { is2D: true });
    const mode2d = await client.call('sceneView_query_view_mode_2d_3d', {});
    if (mode2d.data?.is2D !== true) throw new Error('Scene view did not switch to 2D');
    await client.call('sceneView_change_view_mode_2d_3d', { is2D: false });
    const mode3d = await client.call('sceneView_query_view_mode_2d_3d', {});
    if (mode3d.data?.is2D !== false) throw new Error('Scene view did not switch to 3D');

    await client.call('node_delete_node', { uuid: nodeUuid, confirm: true });
}

async function createMcpClient(port, token) {
    const baseUrl = `http://127.0.0.1:${port}/mcp`;
    const commonHeaders = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json'
    };
    let requestId = 0;
    const initialize = await fetch(baseUrl, {
        method: 'POST',
        headers: commonHeaders,
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: ++requestId,
            method: 'initialize',
            params: {
                protocolVersion: PROTOCOL_VERSION,
                capabilities: {},
                clientInfo: { name: 'editor-smoke', version: '1.0.0' }
            }
        })
    });
    if (!initialize.ok) {
        throw new Error(`MCP initialize failed: ${initialize.status} ${await initialize.text()}`);
    }
    const sessionId = initialize.headers.get('mcp-session-id');
    if (!sessionId) throw new Error('MCP initialize did not return a session ID');
    const sessionHeaders = {
        ...commonHeaders,
        'MCP-Protocol-Version': PROTOCOL_VERSION,
        'MCP-Session-Id': sessionId
    };
    await fetch(baseUrl, {
        method: 'POST',
        headers: sessionHeaders,
        body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'notifications/initialized'
        })
    });

    async function request(method, params) {
        const response = await fetch(baseUrl, {
            method: 'POST',
            headers: sessionHeaders,
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: ++requestId,
                method,
                params
            })
        });
        const text = await response.text();
        if (!response.ok) throw new Error(`${method} HTTP ${response.status}: ${text}`);
        const body = JSON.parse(text);
        if (body.error) throw new Error(`${method}: ${body.error.message}`);
        return body.result;
    }

    return {
        async listTools() {
            const result = await request('tools/list', {});
            return result.tools;
        },
        async call(name, args) {
            const result = await request('tools/call', {
                name,
                arguments: args
            });
            const structured = result.structuredContent
                || JSON.parse(result.content?.[0]?.text || '{}');
            if (result.isError || structured.success === false) {
                throw new Error(`${name}: ${structured.error || 'tool failed'}`);
            }
            return structured;
        }
    };
}

async function stopEditor(editor) {
    if (editor.exitCode !== null) return;
    editor.kill('SIGTERM');
    await Promise.race([
        new Promise(resolve => editor.once('exit', resolve)),
        delay(10_000).then(() => {
            if (editor.exitCode === null) editor.kill('SIGKILL');
        })
    ]);
}

async function retry(action, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    let lastError;
    while (Date.now() < deadline) {
        try {
            return await action();
        } catch (error) {
            lastError = error;
            await delay(1000);
        }
    }
    throw lastError;
}

async function waitForFileModification(filePath, previousMtime, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (fs.statSync(filePath).mtimeMs > previousMtime) return;
        await delay(250);
    }
    throw new Error(`Scene save did not update ${filePath}`);
}

function reservePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            server.close(error => error ? reject(error) : resolve(address.port));
        });
    });
}

function assertFile(filePath) {
    if (!fs.existsSync(filePath)) throw new Error(`Required file not found: ${filePath}`);
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
