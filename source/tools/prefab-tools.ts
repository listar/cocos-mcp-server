import * as fs from 'fs';
import * as path from 'path';
import { PrefabInfo, ToolDefinition, ToolExecutor, ToolResponse } from '../types';

export class PrefabTools implements ToolExecutor {
    getTools(): ToolDefinition[] {
        return [
            {
                name: 'get_prefab_list',
                description: 'Get all prefabs in the project',
                inputSchema: {
                    type: 'object',
                    properties: {
                        folder: {
                            type: 'string',
                            description: 'Folder path to search',
                            default: 'db://assets'
                        }
                    }
                }
            },
            {
                name: 'load_prefab',
                description: 'Resolve and parse a prefab asset',
                inputSchema: {
                    type: 'object',
                    properties: {
                        prefabPath: { type: 'string', description: 'Prefab asset path' }
                    },
                    required: ['prefabPath']
                }
            },
            {
                name: 'instantiate_prefab',
                description: 'Instantiate a prefab in the scene and verify the created node',
                inputSchema: {
                    type: 'object',
                    properties: {
                        prefabPath: { type: 'string', description: 'Prefab asset path' },
                        parentUuid: { type: 'string', description: 'Optional parent node UUID' },
                        position: {
                            type: 'object',
                            properties: {
                                x: { type: 'number' },
                                y: { type: 'number' },
                                z: { type: 'number' }
                            }
                        }
                    },
                    required: ['prefabPath']
                }
            },
            {
                name: 'revert_prefab',
                description: 'Restore a prefab instance to its asset state',
                inputSchema: {
                    type: 'object',
                    properties: {
                        nodeUuid: { type: 'string', description: 'Prefab instance node UUID' }
                    },
                    required: ['nodeUuid']
                }
            },
            {
                name: 'get_prefab_info',
                description: 'Get prefab asset and metadata information',
                inputSchema: {
                    type: 'object',
                    properties: {
                        prefabPath: { type: 'string', description: 'Prefab asset path' }
                    },
                    required: ['prefabPath']
                }
            },
            {
                name: 'validate_prefab',
                description: 'Parse and validate the basic Cocos prefab JSON structure',
                inputSchema: {
                    type: 'object',
                    properties: {
                        prefabPath: { type: 'string', description: 'Prefab asset path' }
                    },
                    required: ['prefabPath']
                }
            },
            {
                name: 'duplicate_prefab',
                description: 'Duplicate a prefab through the Cocos Asset Database',
                inputSchema: {
                    type: 'object',
                    properties: {
                        sourcePrefabPath: { type: 'string', description: 'Source prefab path' },
                        targetPrefabPath: { type: 'string', description: 'Target prefab path or folder' },
                        newPrefabName: { type: 'string', description: 'Name used when target is a folder' }
                    },
                    required: ['sourcePrefabPath', 'targetPrefabPath']
                }
            },
            {
                name: 'restore_prefab_node',
                description: 'Restore the prefab link associated with a scene node',
                inputSchema: {
                    type: 'object',
                    properties: {
                        nodeUuid: { type: 'string', description: 'Prefab instance node UUID' }
                    },
                    required: ['nodeUuid']
                }
            }
        ];
    }

    async execute(toolName: string, args: any): Promise<ToolResponse> {
        switch (toolName) {
            case 'get_prefab_list':
                return this.getPrefabList(args.folder);
            case 'load_prefab':
                return this.loadPrefab(args.prefabPath);
            case 'instantiate_prefab':
                return this.instantiatePrefab(args);
            case 'revert_prefab':
            case 'restore_prefab_node':
                return this.restorePrefab(args.nodeUuid);
            case 'get_prefab_info':
                return this.getPrefabInfo(args.prefabPath);
            case 'validate_prefab':
                return this.validatePrefab(args.prefabPath);
            case 'duplicate_prefab':
                return this.duplicatePrefab(args);
            default:
                throw new Error(`Unknown tool: ${toolName}`);
        }
    }

    private async getPrefabList(folder = 'db://assets'): Promise<ToolResponse> {
        try {
            const normalizedFolder = folder.replace(/\/+$/, '');
            const results: any[] = await Editor.Message.request('asset-db', 'query-assets', {
                pattern: `${normalizedFolder}/**/*.prefab`
            });
            const prefabs: PrefabInfo[] = results.map(asset => ({
                name: asset.name,
                path: asset.url,
                uuid: asset.uuid,
                folder: asset.url.substring(0, asset.url.lastIndexOf('/'))
            }));
            return { success: true, data: prefabs };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    private async loadPrefab(prefabPath: string): Promise<ToolResponse> {
        try {
            const assetInfo = await this.queryPrefabAsset(prefabPath);
            const prefabData = await this.readPrefabFile(prefabPath, assetInfo);
            return {
                success: true,
                data: {
                    uuid: assetInfo.uuid,
                    name: assetInfo.name,
                    url: assetInfo.url,
                    objectCount: prefabData.length
                },
                verificationData: {
                    assetResolved: true,
                    jsonParsed: true
                }
            };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    private async instantiatePrefab(args: any): Promise<ToolResponse> {
        try {
            const assetInfo = await this.queryPrefabAsset(args.prefabPath);
            const options: any = {
                assetUuid: assetInfo.uuid,
                type: assetInfo.type || 'cc.Prefab'
            };
            if (args.parentUuid) options.parent = args.parentUuid;
            if (args.position) options.position = args.position;

            const result = await Editor.Message.request('scene', 'create-node', options);
            const nodeUuid = Array.isArray(result) ? result[0] : result;
            const nodeData = nodeUuid
                ? await Editor.Message.request('scene', 'query-node', nodeUuid).catch(() => null)
                : null;
            if (!nodeUuid || !nodeData) {
                return {
                    success: false,
                    error: 'Cocos Creator did not verify the instantiated prefab node',
                    verificationData: { assetUuid: assetInfo.uuid, nodeExists: false }
                };
            }
            return {
                success: true,
                data: {
                    nodeUuid,
                    prefabPath: assetInfo.url ?? args.prefabPath,
                    parentUuid: args.parentUuid,
                    position: args.position
                },
                message: 'Prefab instantiated successfully',
                verificationData: { assetUuid: assetInfo.uuid, nodeExists: true }
            };
        } catch (error: any) {
            return { success: false, error: `Prefab instantiation failed: ${error.message}` };
        }
    }

    private async restorePrefab(nodeUuid: string): Promise<ToolResponse> {
        try {
            const nodeData: any = await Editor.Message.request('scene', 'query-node', nodeUuid);
            const prefab = nodeData?.__prefab__;
            if (!prefab?.rootUuid || !prefab?.uuid) {
                return { success: false, error: 'Node is not linked to a prefab instance' };
            }
            await (Editor.Message.request as any)(
                'scene',
                'restore-prefab',
                prefab.rootUuid,
                prefab.uuid
            );
            return {
                success: true,
                data: {
                    nodeUuid,
                    rootUuid: prefab.rootUuid,
                    prefabUuid: prefab.uuid
                },
                message: 'Prefab instance restored successfully',
                verificationData: { nodeUuid, restored: true }
            };
        } catch (error: any) {
            return { success: false, error: `Prefab restore failed: ${error.message}` };
        }
    }

    private async getPrefabInfo(prefabPath: string): Promise<ToolResponse> {
        try {
            const assetInfo = await this.queryPrefabAsset(prefabPath);
            const metaInfo: any = await Editor.Message.request(
                'asset-db',
                'query-asset-meta',
                assetInfo.uuid
            ).catch(() => null);
            const assetUrl = assetInfo.url ?? prefabPath;
            const info: PrefabInfo = {
                name: assetInfo.name,
                uuid: assetInfo.uuid,
                path: assetUrl,
                folder: assetUrl.substring(0, assetUrl.lastIndexOf('/')),
                createTime: metaInfo?.createTime,
                modifyTime: metaInfo?.modifyTime,
                dependencies: metaInfo?.depends || []
            };
            return { success: true, data: info };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    private async validatePrefab(prefabPath: string): Promise<ToolResponse> {
        try {
            const assetInfo = await this.queryPrefabAsset(prefabPath);
            const prefabData = await this.readPrefabFile(prefabPath, assetInfo);
            const nodeCount = prefabData.filter(item => item?.__type__ === 'cc.Node').length;
            const componentCount = prefabData.filter(item =>
                typeof item?.__type__ === 'string'
                && item.__type__.startsWith('cc.')
                && item.__type__ !== 'cc.Node'
                && item.__type__ !== 'cc.Prefab'
                && item.__type__ !== 'cc.PrefabInfo'
            ).length;
            const hasPrefabAsset = prefabData.some(item => item?.__type__ === 'cc.Prefab');
            const hasRootNode = prefabData.some(item =>
                item?.__type__ === 'cc.Node' && item._parent === null
            );
            const issues: string[] = [];
            if (!hasPrefabAsset) issues.push('Missing cc.Prefab asset object');
            if (!hasRootNode) issues.push('Missing root cc.Node object');
            return {
                success: true,
                data: {
                    isValid: issues.length === 0,
                    issues,
                    nodeCount,
                    componentCount
                },
                verificationData: { assetResolved: true, jsonParsed: true }
            };
        } catch (error: any) {
            return { success: false, error: `Failed to validate prefab: ${error.message}` };
        }
    }

    private async duplicatePrefab(args: any): Promise<ToolResponse> {
        try {
            const sourceInfo = await this.queryPrefabAsset(args.sourcePrefabPath);
            let targetPath = args.targetPrefabPath;
            if (!targetPath.endsWith('.prefab')) {
                const name = args.newPrefabName || `${sourceInfo.name || 'Prefab'}Copy`;
                targetPath = `${targetPath.replace(/\/$/, '')}/${name}.prefab`;
            }
            const copied: any = await Editor.Message.request(
                'asset-db',
                'copy-asset',
                args.sourcePrefabPath,
                targetPath,
                { overwrite: false, rename: false }
            );
            if (!copied?.uuid) {
                return { success: false, error: 'Cocos Creator did not return the copied asset' };
            }
            return {
                success: true,
                data: {
                    sourcePrefabPath: args.sourcePrefabPath,
                    targetPrefabPath: copied.url ?? targetPath,
                    uuid: copied.uuid
                },
                verificationData: { assetCopied: true, uuid: copied.uuid }
            };
        } catch (error: any) {
            return { success: false, error: `Failed to duplicate prefab: ${error.message}` };
        }
    }

    private async queryPrefabAsset(prefabPath: string): Promise<any> {
        const assetInfo: any = await Editor.Message.request(
            'asset-db',
            'query-asset-info',
            prefabPath
        );
        if (!assetInfo) throw new Error(`Prefab not found: ${prefabPath}`);
        return assetInfo;
    }

    private async readPrefabFile(prefabPath: string, assetInfo?: any): Promise<any[]> {
        if (!assetInfo) await this.queryPrefabAsset(prefabPath);
        const sourcePath = this.resolveProjectAssetPath(prefabPath);
        this.assertInsideProject(sourcePath);
        if (!fs.existsSync(sourcePath)) {
            throw new Error(`Prefab file does not exist: ${prefabPath}`);
        }
        const parsed = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
        if (!Array.isArray(parsed)) throw new Error('Prefab JSON root must be an array');
        return parsed;
    }

    private resolveProjectAssetPath(assetPath: string): string {
        if (!assetPath.startsWith('db://assets')) {
            throw new Error('Prefab path must use the db://assets scheme');
        }
        const relativePath = assetPath.slice('db://assets'.length).replace(/^[/\\]+/, '');
        return path.join(Editor.Project.path, 'assets', relativePath);
    }

    private assertInsideProject(filePath: string): void {
        const projectRoot = path.resolve(Editor.Project.path);
        const relative = path.relative(projectRoot, path.resolve(filePath));
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
            throw new Error('Prefab source must be inside the current Cocos project');
        }
    }
}
