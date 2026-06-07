import { randomUUID } from 'crypto';
import { ToolConfig, ToolConfiguration, ToolManagerSettings } from '../types';
import { readToolManagerSettings, saveToolManagerSettings, exportToolConfiguration, importToolConfiguration } from '../settings';
import { SceneTools } from './scene-tools';
import { NodeTools } from './node-tools';
import { ComponentTools } from './component-tools';
import { PrefabTools } from './prefab-tools';
import { ProjectTools } from './project-tools';
import { DebugTools } from './debug-tools';
import { PreferencesTools } from './preferences-tools';
import { ServerTools } from './server-tools';
import { BroadcastTools } from './broadcast-tools';
import { SceneAdvancedTools } from './scene-advanced-tools';
import { SceneViewTools } from './scene-view-tools';
import { ReferenceImageTools } from './reference-image-tools';
import { AssetAdvancedTools } from './asset-advanced-tools';
import { ValidationTools } from './validation-tools';
import {
    isDangerousByDefault,
    SECURITY_POLICY_VERSION,
    validateToolSecurityCoverage
} from './tool-security';
import { errorLog } from '../logger';

export const TOOL_CONFIGURATION_SCHEMA_VERSION = 1;

function createToolInstances(): Record<string, any> {
    return {
        scene: new SceneTools(),
        node: new NodeTools(),
        component: new ComponentTools(),
        prefab: new PrefabTools(),
        project: new ProjectTools(),
        debug: new DebugTools(),
        preferences: new PreferencesTools(),
        server: new ServerTools(),
        broadcast: new BroadcastTools(),
        sceneAdvanced: new SceneAdvancedTools(),
        sceneView: new SceneViewTools(),
        referenceImage: new ReferenceImageTools(),
        assetAdvanced: new AssetAdvancedTools(),
        validation: new ValidationTools()
    };
}

export class ToolManager {
    private settings: ToolManagerSettings;
    private availableTools: ToolConfig[] = [];

    constructor() {
        this.settings = readToolManagerSettings();
        this.availableTools = this.discoverTools();
        const recordsSanitized = this.sanitizeConfigurationRecords();

        if (this.settings.configurations.length === 0) {
            const now = new Date().toISOString();
            const config = this.createConfigurationRecord(
                'Default',
                'Auto-created default tool configuration',
                now
            );
            this.settings.configurations.push(config);
            this.settings.currentConfigId = config.id;
        }

        const reconciled = this.reconcileConfigurations();
        const securityMigrated = this.applySecurityMigration();
        const changed = recordsSanitized || reconciled || securityMigrated;
        if (changed) this.saveSettings();
    }

    private discoverTools(): ToolConfig[] {
        try {
            const instances = createToolInstances();
            const tools: ToolConfig[] = [];
            for (const [category, toolSet] of Object.entries(instances)) {
                for (const tool of toolSet.getTools()) {
                    tools.push({
                        category,
                        name: tool.name,
                        enabled: !isDangerousByDefault(`${category}_${tool.name}`),
                        description: tool.description
                    });
                }
            }
            validateToolSecurityCoverage(tools.map(tool => `${tool.category}_${tool.name}`));
            return tools;
        } catch (error) {
            errorLog('ToolManager', 'Failed to discover tools', error);
            return [];
        }
    }

    public getAvailableTools(): ToolConfig[] {
        return [...this.availableTools];
    }

    public getConfigurations(): ToolConfiguration[] {
        return [...this.settings.configurations];
    }

    public getCurrentConfiguration(): ToolConfiguration | null {
        if (!this.settings.currentConfigId) return null;
        return this.settings.configurations.find(c => c.id === this.settings.currentConfigId) ?? null;
    }

    public createConfiguration(name: string, description?: string): ToolConfiguration {
        if (this.settings.configurations.length >= this.settings.maxConfigSlots) {
            throw new Error(`Maximum configuration slots reached (${this.settings.maxConfigSlots})`);
        }

        const now = new Date().toISOString();
        const config = this.createConfigurationRecord(name, description, now);

        this.settings.configurations.push(config);
        this.settings.currentConfigId = config.id;
        this.saveSettings();

        return config;
    }

    public updateConfiguration(configId: string, updates: Partial<ToolConfiguration>): ToolConfiguration {
        const idx = this.findConfigIndex(configId);
        const name = typeof updates.name === 'string'
            ? updates.name.trim()
            : this.settings.configurations[idx].name;
        if (!name) throw new Error('Configuration name is required');
        const updated: ToolConfiguration = {
            ...this.settings.configurations[idx],
            name,
            description: typeof updates.description === 'string'
                ? updates.description
                : this.settings.configurations[idx].description,
            updatedAt: new Date().toISOString()
        };
        this.settings.configurations[idx] = updated;
        this.saveSettings();
        return updated;
    }

    public deleteConfiguration(configId: string): void {
        const idx = this.findConfigIndex(configId);
        this.settings.configurations.splice(idx, 1);

        if (this.settings.currentConfigId === configId) {
            this.settings.currentConfigId = this.settings.configurations[0]?.id ?? '';
        }
        this.saveSettings();
    }

    public setCurrentConfiguration(configId: string): void {
        this.findConfigIndex(configId); // validates existence
        this.settings.currentConfigId = configId;
        this.saveSettings();
    }

    public updateToolStatus(configId: string, category: string, toolName: string, enabled: boolean): void {
        const config = this.getConfig(configId);
        const tool = config.tools.find(t => t.category === category && t.name === toolName);
        if (!tool) {
            throw new Error(`Tool not found: ${category}/${toolName}`);
        }
        tool.enabled = enabled;
        config.updatedAt = new Date().toISOString();
        this.saveSettings();
    }

    public updateToolStatusBatch(configId: string, updates: { category: string; name: string; enabled: boolean }[]): void {
        const config = this.getConfig(configId);
        for (const update of updates) {
            const tool = config.tools.find(t => t.category === update.category && t.name === update.name);
            if (!tool) throw new Error(`Tool not found: ${update.category}/${update.name}`);
            tool.enabled = update.enabled;
        }
        config.updatedAt = new Date().toISOString();
        this.saveSettings();
    }

    public exportConfiguration(configId: string): string {
        return exportToolConfiguration(this.getConfig(configId));
    }

    public importConfiguration(configJson: string): ToolConfiguration {
        const config = importToolConfiguration(configJson);
        const importedTools = this.validateImportedTools(config.tools);
        const now = new Date().toISOString();
        const importedByName = new Map(
            importedTools.map(tool => [`${tool.category}_${tool.name}`, tool])
        );
        const normalized: ToolConfiguration = {
            schemaVersion: TOOL_CONFIGURATION_SCHEMA_VERSION,
            id: randomUUID(),
            name: config.name.trim(),
            description: typeof config.description === 'string' ? config.description : undefined,
            tools: this.availableTools.map(tool => {
                const imported = importedByName.get(`${tool.category}_${tool.name}`);
                return {
                    ...tool,
                    enabled: imported
                        ? imported.enabled && !isDangerousByDefault(`${tool.category}_${tool.name}`)
                        : tool.enabled
                };
            }),
            createdAt: now,
            updatedAt: now
        };
        if (!normalized.name) throw new Error('Configuration name is required');

        if (this.settings.configurations.length >= this.settings.maxConfigSlots) {
            throw new Error(`Maximum configuration slots reached (${this.settings.maxConfigSlots})`);
        }
        this.settings.configurations.push(normalized);
        this.saveSettings();
        return normalized;
    }

    public getEnabledTools(): ToolConfig[] {
        const current = this.getCurrentConfiguration();
        const source = current ? current.tools : this.availableTools;
        return source.filter(t => t.enabled);
    }

    public getToolManagerState() {
        const current = this.getCurrentConfiguration();
        return {
            success: true,
            availableTools: current ? current.tools : this.getAvailableTools(),
            selectedConfigId: this.settings.currentConfigId,
            configurations: this.getConfigurations(),
            maxConfigSlots: this.settings.maxConfigSlots
        };
    }

    private getConfig(configId: string): ToolConfiguration {
        const config = this.settings.configurations.find(c => c.id === configId);
        if (!config) throw new Error(`Configuration not found: ${configId}`);
        return config;
    }

    private findConfigIndex(configId: string): number {
        const idx = this.settings.configurations.findIndex(c => c.id === configId);
        if (idx === -1) throw new Error(`Configuration not found: ${configId}`);
        return idx;
    }

    private saveSettings(): void {
        saveToolManagerSettings(this.settings);
    }

    private createConfigurationRecord(
        name: string,
        description: string | undefined,
        now: string
    ): ToolConfiguration {
        return {
            schemaVersion: TOOL_CONFIGURATION_SCHEMA_VERSION,
            id: randomUUID(),
            name,
            description,
            tools: this.availableTools.map(tool => ({ ...tool })),
            createdAt: now,
            updatedAt: now
        };
    }

    private sanitizeConfigurationRecords(): boolean {
        const seenIds = new Set<string>();
        const sanitized = this.settings.configurations.filter((config: any) => {
            if (
                !config
                || typeof config !== 'object'
                || typeof config.id !== 'string'
                || !config.id
                || seenIds.has(config.id)
                || typeof config.name !== 'string'
                || !config.name.trim()
                || !Array.isArray(config.tools)
            ) {
                return false;
            }
            seenIds.add(config.id);
            return true;
        });
        const changed = sanitized.length !== this.settings.configurations.length;
        this.settings.configurations = sanitized;
        return changed;
    }

    private reconcileConfigurations(): boolean {
        let changed = false;
        const availableNames = new Set(
            this.availableTools.map(tool => `${tool.category}_${tool.name}`)
        );

        for (const config of this.settings.configurations) {
            const existing = new Map<string, ToolConfig>();
            for (const tool of Array.isArray(config.tools) ? config.tools : []) {
                if (
                    tool
                    && typeof tool.category === 'string'
                    && typeof tool.name === 'string'
                    && typeof tool.enabled === 'boolean'
                ) {
                    const key = `${tool.category}_${tool.name}`;
                    if (availableNames.has(key) && !existing.has(key)) existing.set(key, tool);
                }
            }

            const reconciled = this.availableTools.map(tool => {
                const previous = existing.get(`${tool.category}_${tool.name}`);
                return {
                    ...tool,
                    enabled: previous ? previous.enabled : tool.enabled
                };
            });
            if (
                config.schemaVersion !== TOOL_CONFIGURATION_SCHEMA_VERSION
                || JSON.stringify(config.tools) !== JSON.stringify(reconciled)
            ) {
                config.schemaVersion = TOOL_CONFIGURATION_SCHEMA_VERSION;
                config.tools = reconciled;
                config.updatedAt = new Date().toISOString();
                changed = true;
            }
        }

        if (!this.settings.configurations.some(config => config.id === this.settings.currentConfigId)) {
            this.settings.currentConfigId = this.settings.configurations[0]?.id ?? '';
            changed = true;
        }
        if (this.settings.configurationSchemaVersion !== TOOL_CONFIGURATION_SCHEMA_VERSION) {
            this.settings.configurationSchemaVersion = TOOL_CONFIGURATION_SCHEMA_VERSION;
            changed = true;
        }
        return changed;
    }

    private validateImportedTools(tools: ToolConfig[]): ToolConfig[] {
        const known = new Set(
            this.availableTools.map(tool => `${tool.category}_${tool.name}`)
        );
        const seen = new Set<string>();
        return tools.map((tool, index) => {
            if (
                !tool
                || typeof tool !== 'object'
                || typeof tool.category !== 'string'
                || typeof tool.name !== 'string'
                || typeof tool.enabled !== 'boolean'
            ) {
                throw new Error(`Invalid tool entry at index ${index}`);
            }
            const key = `${tool.category}_${tool.name}`;
            if (!known.has(key)) throw new Error(`Unknown tool in configuration: ${key}`);
            if (seen.has(key)) throw new Error(`Duplicate tool in configuration: ${key}`);
            seen.add(key);
            return tool;
        });
    }

    private applySecurityMigration(): boolean {
        if (this.settings.securityMigrationVersion >= SECURITY_POLICY_VERSION) return false;

        for (const config of this.settings.configurations) {
            for (const tool of config.tools) {
                if (isDangerousByDefault(`${tool.category}_${tool.name}`)) {
                    tool.enabled = false;
                }
            }
            config.updatedAt = new Date().toISOString();
        }

        this.settings.securityMigrationVersion = SECURITY_POLICY_VERSION;
        return true;
    }
}
