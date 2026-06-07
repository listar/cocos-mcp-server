import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';
import { MCPServerSettings, ToolManagerSettings, ToolConfiguration } from './types';

export const DEFAULT_SETTINGS: MCPServerSettings = {
    port: 3000,
    autoStart: false,
    enableDebugLog: false,
    allowedOrigins: [],
    maxConnections: 10,
    authToken: '',
    requestBodyLimitBytes: 1024 * 1024,
    toolExecutionTimeoutMs: 30000,
    enableRestApi: false
};

export const DEFAULT_TOOL_MANAGER_SETTINGS: ToolManagerSettings = {
    configurations: [],
    currentConfigId: '',
    maxConfigSlots: 5,
    securityMigrationVersion: 0
};

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

export function normalizeSettings(
    updates: Partial<MCPServerSettings>,
    base: MCPServerSettings = DEFAULT_SETTINGS
): MCPServerSettings {
    const merged = { ...base, ...updates };
    const allowedOrigins = Array.isArray(merged.allowedOrigins)
        ? merged.allowedOrigins
            .filter((origin): origin is string => typeof origin === 'string')
            .map(origin => origin.trim())
            .filter(origin => origin.length > 0 && origin !== '*')
        : [];

    return {
        port: clampInteger(merged.port, DEFAULT_SETTINGS.port, 1024, 65535),
        autoStart: Boolean(merged.autoStart),
        enableDebugLog: Boolean(merged.enableDebugLog),
        allowedOrigins: Array.from(new Set(allowedOrigins)),
        maxConnections: clampInteger(merged.maxConnections, DEFAULT_SETTINGS.maxConnections, 1, 100),
        authToken: typeof merged.authToken === 'string' && merged.authToken.trim().length >= 16
            ? merged.authToken.trim()
            : randomBytes(24).toString('hex'),
        requestBodyLimitBytes: clampInteger(
            merged.requestBodyLimitBytes,
            DEFAULT_SETTINGS.requestBodyLimitBytes,
            16 * 1024,
            16 * 1024 * 1024
        ),
        toolExecutionTimeoutMs: clampInteger(
            merged.toolExecutionTimeoutMs,
            DEFAULT_SETTINGS.toolExecutionTimeoutMs,
            1000,
            5 * 60 * 1000
        ),
        enableRestApi: Boolean(merged.enableRestApi)
    };
}

function getSettingsDir(): string {
    return path.join(Editor.Project.path, 'settings');
}

function ensureSettingsDir(): void {
    const dir = getSettingsDir();
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function getSettingsPath(): string {
    return path.join(getSettingsDir(), 'mcp-server.json');
}

function getToolManagerSettingsPath(): string {
    return path.join(getSettingsDir(), 'tool-manager.json');
}

export function readSettings(): MCPServerSettings {
    try {
        ensureSettingsDir();
        const filePath = getSettingsPath();
        let rawSettings: Partial<MCPServerSettings> = {};
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf8');
            rawSettings = JSON.parse(content);
        }
        const settings = normalizeSettings(rawSettings);
        const serialized = JSON.stringify(settings, null, 2);
        if (!fs.existsSync(filePath) || fs.readFileSync(filePath, 'utf8') !== serialized) {
            fs.writeFileSync(filePath, serialized);
        }
        return settings;
    } catch (e) {
        console.error('[Settings] Failed to read server settings:', e);
    }
    return normalizeSettings({});
}

export function saveSettings(settings: MCPServerSettings): void {
    try {
        ensureSettingsDir();
        const normalized = normalizeSettings(settings);
        fs.writeFileSync(getSettingsPath(), JSON.stringify(normalized, null, 2));
    } catch (e) {
        console.error('[Settings] Failed to save server settings:', e);
        throw e;
    }
}

export function readToolManagerSettings(): ToolManagerSettings {
    try {
        ensureSettingsDir();
        const filePath = getToolManagerSettingsPath();
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf8');
            return { ...DEFAULT_TOOL_MANAGER_SETTINGS, ...JSON.parse(content) };
        }
    } catch (e) {
        console.error('[Settings] Failed to read tool manager settings:', e);
    }
    return { ...DEFAULT_TOOL_MANAGER_SETTINGS };
}

export function saveToolManagerSettings(settings: ToolManagerSettings): void {
    try {
        ensureSettingsDir();
        fs.writeFileSync(getToolManagerSettingsPath(), JSON.stringify(settings, null, 2));
    } catch (e) {
        console.error('[Settings] Failed to save tool manager settings:', e);
        throw e;
    }
}

export function exportToolConfiguration(config: ToolConfiguration): string {
    return JSON.stringify(config, null, 2);
}

export function importToolConfiguration(configJson: string): ToolConfiguration {
    let config: any;
    try {
        config = JSON.parse(configJson);
    } catch (e) {
        throw new Error('Invalid JSON format');
    }
    if (!config.id || !config.name || !Array.isArray(config.tools)) {
        throw new Error('Invalid configuration structure: missing required fields (id, name, tools)');
    }
    return config as ToolConfiguration;
}
