/* eslint-disable vue/one-component-per-file */

import { readFileSync } from 'fs-extra';
import { join } from 'path';
import {
    createApp,
    App,
    defineComponent,
    ref,
    computed,
    onMounted,
    onUnmounted,
    watch
} from 'vue';
import { errorLog } from '../../logger';

const panelDataMap = new WeakMap<any, App>();

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
}

const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
    scene: 'Scene Tools',
    node: 'Node Tools',
    component: 'Component Tools',
    prefab: 'Prefab Tools',
    project: 'Project Tools',
    debug: 'Debug Tools',
    preferences: 'Preferences Tools',
    server: 'Server Tools',
    broadcast: 'Broadcast Tools',
    sceneAdvanced: 'Advanced Scene Tools',
    sceneView: 'Scene View Tools',
    referenceImage: 'Reference Image Tools',
    assetAdvanced: 'Advanced Asset Tools',
    validation: 'Validation Tools'
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
                    enableRestApi: false
                });

                const availableTools = ref<ToolConfig[]>([]);
                const toolCategories = ref<string[]>([]);

                const statusClass = computed(() => ({
                    running: serverRunning.value,
                    stopped: !serverRunning.value
                }));

                const totalTools = computed(() => availableTools.value.length);
                const enabledToolCount = computed(() => availableTools.value.filter(t => t.enabled).length);
                const disabledToolCount = computed(() => totalTools.value - enabledToolCount.value);

                const switchTab = (tabName: string) => {
                    activeTab.value = tabName;
                    if (tabName === 'tools') {
                        loadToolManagerState();
                    }
                };

                const applyServerStatus = (status: any) => {
                    if (!status) return;
                    serverRunning.value = Boolean(status.running);
                    serverStatusText.value = status.running ? 'Running' : 'Stopped';
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
                    try {
                        if (serverRunning.value) {
                            await Editor.Message.request('cocos-mcp-server', 'stop-server');
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
                                enableRestApi: settings.value.enableRestApi
                            };
                            await Editor.Message.request('cocos-mcp-server', 'update-settings', currentSettings);
                            await Editor.Message.request('cocos-mcp-server', 'start-server');
                        }
                        await refreshServerStatus();
                    } catch (error) {
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
                            enableRestApi: settings.value.enableRestApi
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
                    try {
                        const result = await Editor.Message.request('cocos-mcp-server', 'getToolManagerState');
                        if (result?.success) {
                            availableTools.value = result.availableTools ?? [];
                            const categories = new Set(availableTools.value.map(t => t.category));
                            toolCategories.value = Array.from(categories);
                        }
                    } catch (error) {
                        errorLog('MCP Panel', 'Failed to load tool manager state', error);
                    }
                };

                const updateToolStatus = async (category: string, name: string, enabled: boolean) => {
                    // Optimistic update
                    const toolIndex = availableTools.value.findIndex(t => t.category === category && t.name === name);
                    if (toolIndex !== -1) {
                        availableTools.value[toolIndex].enabled = enabled;
                        availableTools.value = [...availableTools.value];
                    }
                    try {
                        const result = await Editor.Message.request('cocos-mcp-server', 'updateToolStatus', category, name, enabled);
                        if (!result?.success && toolIndex !== -1) {
                            // Roll back on failure
                            availableTools.value[toolIndex].enabled = !enabled;
                            availableTools.value = [...availableTools.value];
                        }
                    } catch (error) {
                        // Roll back on error
                        if (toolIndex !== -1) {
                            availableTools.value[toolIndex].enabled = !enabled;
                            availableTools.value = [...availableTools.value];
                        }
                        errorLog('MCP Panel', 'Failed to update tool status', error);
                    }
                };

                const saveChanges = async () => {
                    try {
                        const updates = availableTools.value.map(tool => ({
                            category: String(tool.category),
                            name: String(tool.name),
                            enabled: Boolean(tool.enabled)
                        }));
                        await Editor.Message.request('cocos-mcp-server', 'updateToolStatusBatch', updates);
                    } catch (error) {
                        errorLog('MCP Panel', 'Failed to save tool changes', error);
                    }
                };

                const selectAllTools = async () => {
                    availableTools.value.forEach(t => { t.enabled = true; });
                    await saveChanges();
                };

                const deselectAllTools = async () => {
                    availableTools.value.forEach(t => { t.enabled = false; });
                    await saveChanges();
                };

                const toggleCategoryTools = async (category: string, enabled: boolean) => {
                    availableTools.value.forEach(t => {
                        if (t.category === category) t.enabled = enabled;
                    });
                    await saveChanges();
                };

                const getToolsByCategory = (category: string) => {
                    return availableTools.value.filter(t => t.category === category);
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
                                enableRestApi: status.settings.enableRestApi ?? false
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
                    activeTab,
                    serverRunning,
                    serverStatusText,
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
                    selectAllTools,
                    deselectAllTools,
                    saveChanges,
                    toggleCategoryTools,
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
