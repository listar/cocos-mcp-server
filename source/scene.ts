import { join } from 'path';
module.paths.push(join(Editor.App.path, 'node_modules'));

// Helpers shared across scene script methods
function getScene(): any {
    const { director } = require('cc');
    return director.getScene();
}

function requireActiveScene(): any {
    const scene = getScene();
    if (!scene) throw new Error('No active scene');
    return scene;
}

function findNodeByUuid(scene: any, nodeUuid: string): any {
    const visit = (node: any): any => {
        if (node.uuid === nodeUuid) return node;
        for (const child of node.children ?? []) {
            const found = visit(child);
            if (found) return found;
        }
        return null;
    };
    const node = visit(scene);
    if (!node) throw new Error(`Node not found: ${nodeUuid}`);
    return node;
}

function findDescendantByName(scene: any, name: string): any {
    const visit = (node: any): any => {
        if (node !== scene && node.name === name) return node;
        for (const child of node.children ?? []) {
            const found = visit(child);
            if (found) return found;
        }
        return null;
    };
    return visit(scene);
}

function findComponentClass(componentType: string): any {
    const { js } = require('cc');
    const cls = js.getClassByName(componentType);
    if (!cls) throw new Error(`Component type not found: ${componentType}`);
    return cls;
}

function loadAssetReference(cc: any, value: string, assetType: any): Promise<any> {
    return new Promise((resolve, reject) => {
        cc.assetManager.resources.load(value, assetType, (resourceError: any, resource: any) => {
            if (!resourceError && resource) {
                resolve(resource);
                return;
            }

            cc.assetManager.loadAny({ uuid: value }, (uuidError: any, asset: any) => {
                if (uuidError || !asset) {
                    reject(uuidError ?? resourceError ?? new Error(`Asset not found: ${value}`));
                    return;
                }
                resolve(asset);
            });
        });
    });
}

export const methods: { [key: string]: (...any: any) => any } = {
    createNewScene() {
        try {
            const { director, Scene } = require('cc');
            const scene = new Scene();
            scene.name = 'New Scene';
            director.runScene(scene);
            return { success: true, message: 'New scene created successfully' };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    },

    addComponentToNode(nodeUuid: string, componentType: string) {
        try {
            const scene = requireActiveScene();
            const node = findNodeByUuid(scene, nodeUuid);
            const ComponentClass = findComponentClass(componentType);
            const component = node.addComponent(ComponentClass);
            return {
                success: true,
                message: `Component ${componentType} added successfully`,
                data: { componentId: component.uuid }
            };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    },

    removeComponentFromNode(nodeUuid: string, componentType: string) {
        try {
            const scene = requireActiveScene();
            const node = findNodeByUuid(scene, nodeUuid);
            const ComponentClass = findComponentClass(componentType);
            const component = node.getComponent(ComponentClass);
            if (!component) {
                return { success: false, error: `Component ${componentType} not found on node` };
            }
            node.removeComponent(component);
            return { success: true, message: `Component ${componentType} removed successfully` };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    },

    createNode(name: string, parentUuid?: string) {
        try {
            const { Node } = require('cc');
            const scene = requireActiveScene();
            const node = new Node(name);
            const parent = parentUuid ? findNodeByUuid(scene, parentUuid) : scene;
            parent.addChild(node);
            return {
                success: true,
                message: `Node '${name}' created successfully`,
                data: { uuid: node.uuid, name: node.name }
            };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    },

    getNodeInfo(nodeUuid: string) {
        try {
            const scene = requireActiveScene();
            const node = findNodeByUuid(scene, nodeUuid);
            return {
                success: true,
                data: {
                    uuid: node.uuid,
                    name: node.name,
                    active: node.active,
                    position: node.position,
                    rotation: node.rotation,
                    scale: node.scale,
                    parent: node.parent?.uuid,
                    children: node.children.map((child: any) => child.uuid),
                    components: node.components.map((comp: any) => ({
                        type: comp.constructor.name,
                        enabled: comp.enabled
                    }))
                }
            };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    },

    getAllNodes() {
        try {
            const scene = requireActiveScene();
            const nodes: any[] = [];

            const collect = (node: any) => {
                nodes.push({
                    uuid: node.uuid,
                    name: node.name,
                    active: node.active,
                    parent: node.parent?.uuid
                });
                node.children.forEach(collect);
            };

            scene.children.forEach(collect);
            return { success: true, data: nodes };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    },

    findNodeByName(name: string) {
        try {
            const scene = requireActiveScene();
            const node = findDescendantByName(scene, name);
            if (!node) {
                return { success: false, error: `Node not found: ${name}` };
            }
            return {
                success: true,
                data: {
                    uuid: node.uuid,
                    name: node.name,
                    active: node.active,
                    position: node.position
                }
            };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    },

    findNodes(pattern: string, exactMatch: boolean = false) {
        try {
            const scene = requireActiveScene();
            const normalizedPattern = pattern.toLowerCase();
            const nodes: any[] = [];

            const visit = (node: any, parentPath: string) => {
                const nodePath = parentPath ? `${parentPath}/${node.name}` : node.name;
                if (node !== scene) {
                    const matches = exactMatch
                        ? node.name === pattern
                        : node.name.toLowerCase().includes(normalizedPattern);
                    if (matches) {
                        nodes.push({
                            uuid: node.uuid,
                            name: node.name,
                            path: nodePath
                        });
                    }
                }
                for (const child of node.children ?? []) {
                    visit(child, nodePath);
                }
            };

            visit(scene, '');
            return { success: true, data: nodes };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    },

    attachScript(nodeUuid: string, scriptPath: string) {
        try {
            const scene = requireActiveScene();
            const node = findNodeByUuid(scene, nodeUuid);
            const scriptName = scriptPath.split('/').pop()?.replace(/\.[^.]+$/, '');
            if (!scriptName) {
                return { success: false, error: `Invalid script path: ${scriptPath}` };
            }
            const ComponentClass = findComponentClass(scriptName);
            const existing = node.getComponent(ComponentClass);
            const component = existing ?? node.addComponent(ComponentClass);
            return {
                success: true,
                message: `Script ${scriptName} attached successfully`,
                data: {
                    componentId: component.uuid,
                    existing: Boolean(existing)
                }
            };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    },

    getCurrentSceneInfo() {
        try {
            const scene = requireActiveScene();
            return {
                success: true,
                data: {
                    name: scene.name,
                    uuid: scene.uuid,
                    nodeCount: scene.children.length
                }
            };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    },

    setNodeProperty(nodeUuid: string, property: string, value: any) {
        try {
            const scene = requireActiveScene();
            const node = findNodeByUuid(scene, nodeUuid);

            switch (property) {
                case 'position': node.setPosition(value.x ?? 0, value.y ?? 0, value.z ?? 0); break;
                case 'rotation': node.setRotationFromEuler(value.x ?? 0, value.y ?? 0, value.z ?? 0); break;
                case 'scale':    node.setScale(value.x ?? 1, value.y ?? 1, value.z ?? 1); break;
                case 'active':   node.active = value; break;
                case 'name':     node.name = value; break;
                default:         (node as any)[property] = value;
            }

            return { success: true, message: `Property '${property}' updated successfully` };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    },

    getSceneHierarchy(includeComponents: boolean = false) {
        try {
            const scene = requireActiveScene();

            const processNode = (node: any): any => {
                const result: any = {
                    name: node.name,
                    uuid: node.uuid,
                    active: node.active,
                    children: node.children?.map(processNode) ?? []
                };
                if (includeComponents) {
                    result.components = node.components.map((comp: any) => ({
                        type: comp.constructor.name,
                        enabled: comp.enabled
                    }));
                }
                return result;
            };

            return { success: true, data: scene.children.map(processNode) };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    },

    createPrefabFromNode(nodeUuid: string, prefabPath: string) {
        try {
            const scene = requireActiveScene();
            findNodeByUuid(scene, nodeUuid);
            return {
                success: false,
                error: 'Prefab file creation is not supported in the scene script context',
                instruction: `Use the editor prefab tool to create ${prefabPath}`
            };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    },

    async setComponentProperty(nodeUuid: string, componentType: string, property: string, value: any) {
        try {
            const scene = requireActiveScene();
            const node = findNodeByUuid(scene, nodeUuid);
            const ComponentClass = findComponentClass(componentType);
            const component = node.getComponent(ComponentClass);
            if (!component) {
                return { success: false, error: `Component ${componentType} not found on node` };
            }

            const cc = require('cc');

            if (property === 'spriteFrame' && componentType === 'cc.Sprite' && typeof value === 'string') {
                component.spriteFrame = await loadAssetReference(cc, value, cc.SpriteFrame);
            } else if (property === 'material' && typeof value === 'string') {
                component.material = await loadAssetReference(cc, value, cc.Material);
            } else {
                component[property] = value;
            }

            return { success: true, message: `Component property '${property}' updated successfully` };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }
};
