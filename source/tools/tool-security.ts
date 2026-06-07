import { ToolAnnotations } from '../types';

const ARBITRARY_EXECUTION_TOOLS = new Set([
    'debug_execute_script',
    'sceneAdvanced_execute_component_method',
    'sceneAdvanced_execute_scene_script'
]);

const DESTRUCTIVE_TOOLS = new Set([
    ...ARBITRARY_EXECUTION_TOOLS,
    'assetAdvanced_batch_delete_assets',
    'assetAdvanced_save_asset_meta',
    'component_remove_component',
    'node_delete_node',
    'prefab_restore_prefab_node',
    'prefab_revert_prefab',
    'prefab_update_prefab',
    'preferences_reset_preferences',
    'preferences_set_preferences_config',
    'project_delete_asset',
    'project_move_asset',
    'project_save_asset',
    'sceneAdvanced_cut_node',
    'sceneAdvanced_remove_array_element',
    'sceneAdvanced_restore_prefab',
    'sceneAdvanced_soft_reload_scene'
]);

const READ_ONLY_PREFIXES = [
    'check_',
    'detect_',
    'export_',
    'find_',
    'format_',
    'get_',
    'list_',
    'query_',
    'safe_',
    'search_',
    'validate_'
];

export function isDangerousByDefault(qualifiedName: string): boolean {
    return DESTRUCTIVE_TOOLS.has(qualifiedName);
}

export function requiresConfirmation(qualifiedName: string): boolean {
    return DESTRUCTIVE_TOOLS.has(qualifiedName);
}

export function getToolAnnotations(qualifiedName: string, methodName: string): ToolAnnotations {
    const destructive = DESTRUCTIVE_TOOLS.has(qualifiedName);
    const readOnly = !destructive && READ_ONLY_PREFIXES.some(prefix => methodName.startsWith(prefix));

    return {
        readOnlyHint: readOnly,
        destructiveHint: destructive,
        idempotentHint: readOnly,
        openWorldHint: ARBITRARY_EXECUTION_TOOLS.has(qualifiedName)
    };
}
