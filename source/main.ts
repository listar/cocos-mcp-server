import { MCPServer } from './mcp-server';
import { normalizeSettings, readSettings, saveSettings } from './settings';
import { MCPServerSettings } from './types';
import { ToolManager } from './tools/tool-manager';
import { debugLog, errorLog } from './logger';

let mcpServer: MCPServer | null = null;
let toolManager: ToolManager;
let serverError = '';

function startupErrorMessage(error: unknown, port: number): string {
    const code = (error as NodeJS.ErrnoException | null)?.code;
    if (code === 'EADDRINUSE') return `端口 ${port} 已被占用，请更换端口或停止占用它的服务。`;
    if (code === 'EACCES' || code === 'EPERM') return `无法监听端口 ${port}，请检查系统权限。`;
    return '服务器启动失败，请重新加载扩展后重试。';
}

export const methods: { [key: string]: (...any: any) => any } = {
    openPanel() {
        Editor.Panel.open('cocos-mcp-server');
    },

    async startServer() {
        if (!mcpServer) {
            serverError = '服务器尚未初始化，请重新加载扩展后重试。';
            return methods.getServerStatus();
        }
        serverError = '';
        try {
            mcpServer.updateEnabledTools(toolManager.getEnabledTools());
            await mcpServer.start();
        } catch (error) {
            serverError = startupErrorMessage(error, mcpServer.getSettings().port);
            errorLog('MCP', serverError);
        }
        return methods.getServerStatus();
    },

    async stopServer() {
        if (!mcpServer) {
            errorLog('MCP', 'Server is not initialized');
            return;
        }
        await mcpServer.stop();
        serverError = '';
        return methods.getServerStatus();
    },

    getServerStatus() {
        const status = mcpServer ? mcpServer.getStatus() : { running: false, port: 0, clients: 0 };
        const settings = mcpServer ? mcpServer.getSettings() : readSettings();
        return { ...status, settings, error: serverError };
    },

    async updateSettings(settings: Partial<MCPServerSettings>) {
        const currentSettings = mcpServer ? mcpServer.getSettings() : readSettings();
        const nextSettings = normalizeSettings(settings, currentSettings);
        const wasRunning = mcpServer?.getStatus().running ?? false;

        if (mcpServer) {
            await mcpServer.stop();
        }

        saveSettings(nextSettings);
        mcpServer = new MCPServer(nextSettings);
        serverError = '';
        mcpServer.updateEnabledTools(toolManager.getEnabledTools());
        if (wasRunning) {
            return methods.startServer();
        }

        return {
            ...mcpServer.getStatus(),
            settings: mcpServer.getSettings()
        };
    },

    getToolsList() {
        return mcpServer ? mcpServer.getAvailableTools() : [];
    },

    getFilteredToolsList() {
        if (!mcpServer) return [];
        const enabledTools = toolManager.getEnabledTools();
        mcpServer.updateEnabledTools(enabledTools);
        return mcpServer.getFilteredTools(enabledTools);
    },

    async getServerSettings() {
        return mcpServer ? mcpServer.getSettings() : readSettings();
    },

    // Alias kept for backwards compatibility with panel messages
    async getSettings() {
        return mcpServer ? mcpServer.getSettings() : readSettings();
    },

    async getToolManagerState() {
        return toolManager.getToolManagerState();
    },

    async createToolConfiguration(name: string, description?: string) {
        try {
            const config = toolManager.createConfiguration(name, description);
            return { success: true, id: config.id, config };
        } catch (error: any) {
            throw new Error(`Failed to create configuration: ${error.message}`);
        }
    },

    async updateToolConfiguration(configId: string, updates: any) {
        try {
            return toolManager.updateConfiguration(configId, updates);
        } catch (error: any) {
            throw new Error(`Failed to update configuration: ${error.message}`);
        }
    },

    async deleteToolConfiguration(configId: string) {
        try {
            toolManager.deleteConfiguration(configId);
            return { success: true };
        } catch (error: any) {
            throw new Error(`Failed to delete configuration: ${error.message}`);
        }
    },

    async setCurrentToolConfiguration(configId: string) {
        try {
            toolManager.setCurrentConfiguration(configId);
            return { success: true };
        } catch (error: any) {
            throw new Error(`Failed to set current configuration: ${error.message}`);
        }
    },

    async updateToolStatus(category: string, toolName: string, enabled: boolean) {
        try {
            const currentConfig = toolManager.getCurrentConfiguration();
            if (!currentConfig) {
                throw new Error('No active configuration');
            }
            toolManager.updateToolStatus(currentConfig.id, category, toolName, enabled);
            if (mcpServer) {
                mcpServer.updateEnabledTools(toolManager.getEnabledTools());
            }
            return { success: true };
        } catch (error: any) {
            throw new Error(`Failed to update tool status: ${error.message}`);
        }
    },

    async updateToolStatusBatch(updates: any[]) {
        try {
            const currentConfig = toolManager.getCurrentConfiguration();
            if (!currentConfig) {
                throw new Error('No active configuration');
            }
            toolManager.updateToolStatusBatch(currentConfig.id, updates);
            if (mcpServer) {
                mcpServer.updateEnabledTools(toolManager.getEnabledTools());
            }
            return { success: true };
        } catch (error: any) {
            throw new Error(`Failed to batch update tool status: ${error.message}`);
        }
    },

    async exportToolConfiguration(configId: string) {
        try {
            return { configJson: toolManager.exportConfiguration(configId) };
        } catch (error: any) {
            throw new Error(`Failed to export configuration: ${error.message}`);
        }
    },

    async importToolConfiguration(configJson: string) {
        try {
            return toolManager.importConfiguration(configJson);
        } catch (error: any) {
            throw new Error(`Failed to import configuration: ${error.message}`);
        }
    },

    async getEnabledTools() {
        return toolManager.getEnabledTools();
    }
};

export function load() {
    serverError = '';
    toolManager = new ToolManager();

    const settings = readSettings();
    mcpServer = new MCPServer(settings);
    debugLog('MCP', 'Extension loaded');
    mcpServer.updateEnabledTools(toolManager.getEnabledTools());

    if (settings.autoStart) {
        methods.startServer().catch((err: unknown) => {
            errorLog('MCP', 'Auto-start failed', err);
        });
    }
}

export async function unload() {
    if (mcpServer) {
        await mcpServer.stop();
        mcpServer = null;
    }
}
