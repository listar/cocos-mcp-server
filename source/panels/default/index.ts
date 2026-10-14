/* eslint-disable vue/one-component-per-file */

import { readFileSync } from 'fs-extra';
import { join } from 'path';
import {
    createApp,
    App,
    defineComponent,
    ref,
    computed,
    nextTick,
    onMounted,
    onUnmounted,
    watch
} from 'vue';
import { errorLog } from '../../logger';
import { isDangerousByDefault, getToolAnnotations } from '../../tools/tool-security';

const panelDataMap = new WeakMap<any, App>();
const extensionVersion: string = require('../../../package.json').version;

interface ToolConfig {
    category: string;
    name: string;
    enabled: boolean;
    description: string;
}

interface ServerSettings {
    port: number;
    autoStart: boolean;
    debugLog: boolean;
    maxConnections: number;
    maxSessions: number;
    sessionIdleTimeoutMs: number;
    authToken: string;
    allowedOrigins: string;
    requestBodyLimitBytes: number;
    toolExecutionTimeoutMs: number;
    enableRestApi: boolean;
    hierarchyFirst: boolean;
}

const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
    scene: '场景', node: '节点', component: '组件', prefab: '预制体',
    project: '项目与资源', debug: '调试', preferences: '偏好设置',
    server: '服务器', broadcast: '广播', sceneAdvanced: '高级场景',
    sceneView: '场景视图', referenceImage: '参考图', assetAdvanced: '高级资源',
    validation: '数据校验'
};

module.exports = Editor.Panel.define({
    listeners: {
        show() { },
        hide() { },
    },
    template: readFileSync(join(__dirname, '../../../static/template/default/index.html'), 'utf-8'),
    style: readFileSync(join(__dirname, '../../../static/style/default/index.css'), 'utf-8'),
    $: {
        app: '#app',
        panelTitle: '#panelTitle',
    },
    ready() {
        if (!this.$.app) return;

        const app = createApp({});
        app.config.compilerOptions.isCustomElement = (tag) => tag.startsWith('ui-');

        app.component('McpServerApp', defineComponent({
            setup() {
                const activeTab = ref('server');
                const serverRunning = ref(false);
                const serverStatusText = ref('Stopped');
                const serverError = ref('');
                const connectedClients = ref(0);
                const httpUrl = ref('');
                const isProcessing = ref(false);
                const settingsChanged = ref(false);

                const settings = ref<ServerSettings>({
                    port: 3000,
                    autoStart: false,
                    debugLog: false,
                    maxConnections: 10,
                    maxSessions: 10,
                    sessionIdleTimeoutMs: 30 * 60 * 1000,
                    authToken: '',
                    allowedOrigins: '',
                    requestBodyLimitBytes: 1024 * 1024,
                    toolExecutionTimeoutMs: 30000,
                    enableRestApi: false,
                    hierarchyFirst: true
                });

                const availableTools = ref<ToolConfig[]>([]);
                const toolCategories = ref<string[]>([]);
                const searchQuery = ref('');
                const toolFilter = ref('all');
                const toolsBusy = ref(false);
                const toolsLoaded = ref(false);
                const toolMessage = ref('');
                const toolError = ref('');
                const pendingRisk = ref<ToolConfig | null>(null);
                const riskPanel = ref<HTMLElement | null>(null);
                const collapsedCategories = ref<string[]>([]);
                const qualifiedName = (tool: Pick<ToolConfig, 'category' | 'name'>) => tool.category + '_' + tool.name;
                const isRisky = (tool: ToolConfig) => isDangerousByDefault(qualifiedName(tool));
                const isReadOnly = (tool: ToolConfig) => getToolAnnotations(qualifiedName(tool)).readOnlyHint;
                const filteredTools = computed(() => availableTools.value.filter(tool => {
                    const query = searchQuery.value.trim().toLowerCase();
                    const matches = (qualifiedName(tool) + ' ' + tool.description + ' ' +
                        (CATEGORY_DISPLAY_NAMES[tool.category] ?? '')).toLowerCase().includes(query);
                    return matches && (toolFilter.value === 'all' ||
                        (toolFilter.value === 'enabled' && tool.enabled) ||
                        (toolFilter.value === 'disabled' && !tool.enabled) ||
                        (toolFilter.value === 'risk' && isRisky(tool)));
                }));
                const visibleCategories = computed(() => toolCategories.value.filter(category =>
                    filteredTools.value.some(tool => tool.category === category)));
                const toggleCategory = (category: string) => {
                    collapsedCategories.value = collapsedCategories.value.includes(category)
                        ? collapsedCategories.value.filter(item => item !== category)
                        : [...collapsedCategories.value, category];
                };

                const statusClass = computed(() => ({
                    running: serverRunning.value,
                    stopped: !serverRunning.value
                }));

                const totalTools = computed(() => availableTools.value.length);
                const enabledToolCount = computed(() => availableTools.value.filter(t => t.enabled).length);
                const disabledToolCount = computed(() => totalTools.value - enabledToolCount.value);

                const switchTab = (tabName: string) => {
                    activeTab.value = tabName;
                    if (tabName === 'tools' && !toolsLoaded.value) {
                        loadToolManagerState();
                    }
                };

                const applyServerStatus = (status: any) => {
                    if (!status) return;
                    serverRunning.value = Boolean(status.running);
                    serverStatusText.value = status.running ? 'Running' : 'Stopped';
                    if (typeof status.error === 'string' || status.running) {
                        serverError.value = status.error ?? '';
                    }
                    connectedClients.value = status.clients ?? 0;
                    httpUrl.value = status.running
                        ? `http://127.0.0.1:${status.port}/mcp`
                        : '';
                };

                const refreshServerStatus = async () => {
                    const status = await Editor.Message.request(
                        'cocos-mcp-server',
                        'get-server-status'
                    );
                    applyServerStatus(status);
                    return status;
                };

                const toggleServer = async () => {
                    if (isProcessing.value) return;
                    isProcessing.value = true;
                    serverError.value = '';
                    try {
                        if (serverRunning.value) {
                            applyServerStatus(await Editor.Message.request('cocos-mcp-server', 'stop-server'));
                        } else {
                            const currentSettings = {
                                port: settings.value.port,
                                autoStart: settings.value.autoStart,
                                enableDebugLog: settings.value.debugLog,
                                maxConnections: settings.value.maxConnections,
                                maxSessions: settings.value.maxSessions,
                                sessionIdleTimeoutMs: settings.value.sessionIdleTimeoutMs,
                                authToken: settings.value.authToken,
                                allowedOrigins: parseAllowedOrigins(settings.value.allowedOrigins),
                                requestBodyLimitBytes: settings.value.requestBodyLimitBytes,
                                toolExecutionTimeoutMs: settings.value.toolExecutionTimeoutMs,
                                enableRestApi: settings.value.enableRestApi,
                                hierarchyFirst: settings.value.hierarchyFirst
                            };
                            await Editor.Message.request('cocos-mcp-server', 'update-settings', currentSettings);
                            applyServerStatus(await Editor.Message.request('cocos-mcp-server', 'start-server'));
                        }
                        await refreshServerStatus();
                    } catch (error: any) {
                        serverError.value = /EADDRINUSE/.test(String(error?.message))
                            ? `端口 ${settings.value.port} 已被占用，请更换端口或停止占用它的服务。`
                            : '启动或停止请求失败，请重新加载扩展后重试。';
                        errorLog('MCP Panel', 'Failed to toggle server', error);
                    } finally {
                        isProcessing.value = false;
                    }
                };

                const saveSettings = async () => {
                    if (isProcessing.value) return;
                    isProcessing.value = true;
                    try {
                        const settingsData = {
                            port: settings.value.port,
                            autoStart: settings.value.autoStart,
                            enableDebugLog: settings.value.debugLog,
                            maxConnections: settings.value.maxConnections,
                            maxSessions: settings.value.maxSessions,
                            sessionIdleTimeoutMs: settings.value.sessionIdleTimeoutMs,
                            authToken: settings.value.authToken,
                            allowedOrigins: parseAllowedOrigins(settings.value.allowedOrigins),
                            requestBodyLimitBytes: settings.value.requestBodyLimitBytes,
                            toolExecutionTimeoutMs: settings.value.toolExecutionTimeoutMs,
                            enableRestApi: settings.value.enableRestApi,
                            hierarchyFirst: settings.value.hierarchyFirst
                        };
                        await Editor.Message.request('cocos-mcp-server', 'update-settings', settingsData);
                        await refreshServerStatus();
                        settingsChanged.value = false;
                    } catch (error) {
                        errorLog('MCP Panel', 'Failed to save settings', error);
                    } finally {
                        isProcessing.value = false;
                    }
                };

                const copyUrl = async () => {
                    try {
                        await navigator.clipboard.writeText(httpUrl.value);
                    } catch (error) {
                        errorLog('MCP Panel', 'Failed to copy URL', error);
                    }
                };

                const copyToken = async () => {
                    try {
                        await navigator.clipboard.writeText(settings.value.authToken);
                    } catch (error) {
                        errorLog('MCP Panel', 'Failed to copy auth token', error);
                    }
                };

                const parseAllowedOrigins = (value: string): string[] => {
                    return value
                        .split(',')
                        .map(origin => origin.trim())
                        .filter(Boolean);
                };

                const loadToolManagerState = async () => {
                    if (toolsBusy.value) return;
                    toolsBusy.value = true;
                    toolError.value = '';
                    try {
                        const result = await Editor.Message.request('cocos-mcp-server', 'getToolManagerState');
                        if (!result?.success) throw new Error('Load failed');
                        availableTools.value = result.availableTools ?? [];
                        toolCategories.value = Array.from(new Set(availableTools.value.map(t => t.category)));
                        toolsLoaded.value = true;
                    } catch (error) {
                        toolError.value = '工具列表加载失败，请重试。';
                        errorLog('MCP Panel', 'Failed to load tool manager state', error);
                    } finally {
                        toolsBusy.value = false;
                    }
                };

                const applyToolUpdates = async (tools: ToolConfig[], enabled: boolean) => {
                    if (toolsBusy.value) return;
                    const updates = tools.filter(tool => tool.enabled !== enabled)
                        .map(tool => ({ category: tool.category, name: tool.name, enabled }));
                    if (!updates.length) {
                        toolMessage.value = '没有需要更改的工具。批量启用会跳过高风险工具。';
                        return;
                    }
                    toolsBusy.value = true;
                    toolError.value = '';
                    toolMessage.value = '';
                    try {
                        const result = await Editor.Message.request('cocos-mcp-server', 'updateToolStatusBatch', updates);
                        if (!result?.success) throw new Error('Save failed');
                        const names = new Set(updates.map(qualifiedName));
                        availableTools.value = availableTools.value.map(tool =>
                            names.has(qualifiedName(tool)) ? { ...tool, enabled } : tool);
                        toolMessage.value = '已保存：' + updates.length + ' 个工具已' + (enabled ? '启用' : '停用') + '。';
                    } catch (error) {
                        toolError.value = '保存失败，尚未确认更改。请重新加载列表核对后重试。';
                        errorLog('MCP Panel', 'Failed to update tools', error);
                    } finally {
                        toolsBusy.value = false;
                    }
                };

                const updateToolStatus = (tool: ToolConfig) => {
                    if (toolsBusy.value) return;
                    if (!tool.enabled && isRisky(tool)) {
                        pendingRisk.value = tool;
                        void nextTick(() => {
                            riskPanel.value?.scrollIntoView({ block: 'nearest' });
                            riskPanel.value?.focus();
                        });
                        return;
                    }
                    void applyToolUpdates([tool], !tool.enabled);
                };
                const confirmRisk = async () => {
                    const tool = pendingRisk.value;
                    pendingRisk.value = null;
                    if (tool) await applyToolUpdates([tool], true);
                };
                const bulkTools = (enabled: boolean, category?: string) => applyToolUpdates(
                    filteredTools.value.filter(tool => (!category || tool.category === category) &&
                        (!enabled || !isRisky(tool))), enabled);
                const getToolsByCategory = (category: string) =>
                    filteredTools.value.filter(tool => tool.category === category);
                const categorySummary = (category: string) => {
                    const tools = availableTools.value.filter(tool => tool.category === category);
                    return tools.filter(tool => tool.enabled).length + ' / ' + tools.length + ' 已启用';
                };

                const getCategoryDisplayName = (category: string): string => {
                    return CATEGORY_DISPLAY_NAMES[category] ?? category;
                };

                watch(
                    settings,
                    () => { settingsChanged.value = true; },
                    { deep: true, flush: 'sync' }
                );

                let statusPollTimer: ReturnType<typeof setInterval> | undefined;

                onMounted(async () => {
                    await loadToolManagerState();

                    try {
                        const status = await refreshServerStatus();
                        if (status?.settings) {
                            settings.value = {
                                port: status.settings.port ?? 3000,
                                autoStart: status.settings.autoStart ?? false,
                                debugLog: status.settings.enableDebugLog ?? false,
                                maxConnections: status.settings.maxConnections ?? 10,
                                maxSessions: status.settings.maxSessions ?? 10,
                                sessionIdleTimeoutMs: status.settings.sessionIdleTimeoutMs ?? 30 * 60 * 1000,
                                authToken: status.settings.authToken ?? '',
                                allowedOrigins: (status.settings.allowedOrigins ?? []).join(', '),
                                requestBodyLimitBytes: status.settings.requestBodyLimitBytes ?? 1024 * 1024,
                                toolExecutionTimeoutMs: status.settings.toolExecutionTimeoutMs ?? 30000,
                                enableRestApi: status.settings.enableRestApi ?? false,
                                hierarchyFirst: status.settings.hierarchyFirst !== false
                            };
                            settingsChanged.value = false;
                        }
                    } catch (error) {
                        errorLog('MCP Panel', 'Failed to load server settings', error);
                    }

                    statusPollTimer = setInterval(async () => {
                        try {
                            await refreshServerStatus();
                        } catch (error) {
                            errorLog('MCP Panel', 'Failed to poll server status', error);
                        }
                    }, 2000);
                });

                onUnmounted(() => {
                    if (statusPollTimer) clearInterval(statusPollTimer);
                });

                return {
                    extensionVersion,
                    activeTab,
                    serverRunning,
                    serverStatusText,
                    serverError,
                    connectedClients,
                    httpUrl,
                    isProcessing,
                    settings,
                    availableTools,
                    toolCategories,
                    settingsChanged,
                    statusClass,
                    totalTools,
                    enabledToolCount,
                    disabledToolCount,
                    switchTab,
                    toggleServer,
                    saveSettings,
                    copyUrl,
                    copyToken,
                    loadToolManagerState,
                    updateToolStatus,
                    searchQuery, toolFilter, toolsBusy, toolsLoaded, toolMessage, toolError,
                    pendingRisk, riskPanel, confirmRisk, isRisky, isReadOnly, qualifiedName,
                    filteredTools, visibleCategories, collapsedCategories, toggleCategory,
                    bulkTools, categorySummary,
                    getToolsByCategory,
                    getCategoryDisplayName
                };
            },
            template: readFileSync(join(__dirname, '../../../static/template/vue/mcp-server-app.html'), 'utf-8'),
        }));

        app.mount(this.$.app);
        panelDataMap.set(this, app);
    },
    beforeClose() { },
    close() {
        panelDataMap.get(this)?.unmount();
    },
});
