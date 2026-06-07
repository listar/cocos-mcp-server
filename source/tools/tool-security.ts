import { ToolAnnotations } from '../types';

export const SECURITY_POLICY_VERSION = 2;

interface ToolSecurityPolicy {
    readOnly: boolean;
    requiresConfirmation: boolean;
    openWorld: boolean;
}

const policies = new Map<string, ToolSecurityPolicy>();

function registerCategory(
    category: string,
    readOnlyTools: string[],
    mutatingTools: string[]
): void {
    for (const toolName of readOnlyTools) {
        register(`${category}_${toolName}`, true);
    }
    for (const toolName of mutatingTools) {
        register(`${category}_${toolName}`, false);
    }
}

function register(qualifiedName: string, readOnly: boolean): void {
    if (policies.has(qualifiedName)) {
        throw new Error(`Duplicate tool security policy: ${qualifiedName}`);
    }
    policies.set(qualifiedName, {
        readOnly,
        requiresConfirmation: false,
        openWorld: false
    });
}

registerCategory('scene', [
    'get_current_scene',
    'get_scene_list',
    'get_scene_hierarchy'
], [
    'open_scene',
    'save_scene',
    'create_scene',
    'save_scene_as',
    'close_scene'
]);

registerCategory('node', [
    'get_node_info',
    'find_nodes',
    'find_node_by_name',
    'get_all_nodes',
    'detect_node_type'
], [
    'create_node',
    'set_node_property',
    'set_node_transform',
    'delete_node',
    'move_node',
    'duplicate_node'
]);

registerCategory('component', [
    'get_components',
    'get_component_info',
    'get_available_components'
], [
    'add_component',
    'remove_component',
    'set_component_property',
    'attach_script'
]);

registerCategory('prefab', [
    'get_prefab_list',
    'load_prefab',
    'get_prefab_info',
    'validate_prefab'
], [
    'instantiate_prefab',
    'revert_prefab',
    'duplicate_prefab',
    'restore_prefab_node'
]);

registerCategory('project', [
    'get_project_info',
    'get_project_settings',
    'get_asset_info',
    'get_assets',
    'get_build_settings',
    'check_builder_status',
    'query_asset_path',
    'query_asset_uuid',
    'query_asset_url',
    'find_asset_by_name',
    'get_asset_details'
], [
    'refresh_assets',
    'import_asset',
    'open_build_panel',
    'start_preview_server',
    'stop_preview_server',
    'create_asset',
    'copy_asset',
    'move_asset',
    'delete_asset',
    'save_asset',
    'reimport_asset'
]);

registerCategory('debug', [
    'get_console_logs',
    'get_node_tree',
    'get_performance_stats',
    'validate_scene',
    'get_editor_info',
    'get_project_logs',
    'get_log_file_info',
    'search_project_logs'
], [
    'clear_console',
    'execute_script'
]);

registerCategory('preferences', [
    'query_preferences_config',
    'get_all_preferences',
    'export_preferences'
], [
    'open_preferences_settings',
    'set_preferences_config',
    'reset_preferences',
    'import_preferences'
]);

registerCategory('server', [
    'query_server_ip_list',
    'query_sorted_server_ip_list',
    'query_server_port',
    'get_server_status',
    'check_server_connectivity',
    'get_network_interfaces'
], []);

registerCategory('broadcast', [
    'get_broadcast_log',
    'get_active_listeners'
], [
    'listen_broadcast',
    'stop_listening',
    'clear_broadcast_log'
]);

registerCategory('sceneAdvanced', [
    'query_scene_ready',
    'query_scene_dirty',
    'query_scene_classes',
    'query_scene_components',
    'query_component_has_script',
    'query_nodes_by_asset_uuid'
], [
    'reset_node_property',
    'move_array_element',
    'remove_array_element',
    'copy_node',
    'paste_node',
    'cut_node',
    'reset_node_transform',
    'reset_component',
    'restore_prefab',
    'execute_component_method',
    'execute_scene_script',
    'scene_snapshot',
    'scene_snapshot_abort',
    'begin_undo_recording',
    'end_undo_recording',
    'cancel_undo_recording',
    'soft_reload_scene'
]);

registerCategory('sceneView', [
    'query_gizmo_tool_name',
    'query_gizmo_pivot',
    'query_gizmo_view_mode',
    'query_gizmo_coordinate',
    'query_view_mode_2d_3d',
    'query_grid_visible',
    'query_icon_gizmo_3d',
    'query_icon_gizmo_size',
    'get_scene_view_status'
], [
    'change_gizmo_tool',
    'change_gizmo_pivot',
    'change_gizmo_coordinate',
    'change_view_mode_2d_3d',
    'set_grid_visible',
    'set_icon_gizmo_3d',
    'set_icon_gizmo_size',
    'focus_camera_on_nodes',
    'align_camera_with_view',
    'align_view_with_node',
    'reset_scene_view'
]);

registerCategory('referenceImage', [
    'query_reference_image_config',
    'query_current_reference_image',
    'list_reference_images'
], [
    'add_reference_image',
    'remove_reference_image',
    'switch_reference_image',
    'set_reference_image_data',
    'refresh_reference_image',
    'set_reference_image_position',
    'set_reference_image_scale',
    'set_reference_image_opacity',
    'clear_all_reference_images'
]);

registerCategory('assetAdvanced', [
    'generate_available_url',
    'query_asset_db_ready',
    'validate_asset_references',
    'get_asset_dependencies',
    'get_unused_assets',
    'export_asset_manifest'
], [
    'save_asset_meta',
    'open_asset_external',
    'batch_import_assets',
    'batch_delete_assets',
    'compress_textures'
]);

registerCategory('validation', [
    'validate_json_params',
    'safe_string_value',
    'format_mcp_request'
], []);

const CONFIRMATION_TOOLS = new Set([
    'scene_save_scene',
    'scene_create_scene',
    'scene_save_scene_as',
    'node_delete_node',
    'component_remove_component',
    'prefab_revert_prefab',
    'prefab_duplicate_prefab',
    'prefab_restore_prefab_node',
    'project_import_asset',
    'project_create_asset',
    'project_copy_asset',
    'project_move_asset',
    'project_delete_asset',
    'project_save_asset',
    'debug_clear_console',
    'debug_execute_script',
    'preferences_set_preferences_config',
    'preferences_reset_preferences',
    'preferences_import_preferences',
    'broadcast_clear_broadcast_log',
    'sceneAdvanced_reset_node_property',
    'sceneAdvanced_remove_array_element',
    'sceneAdvanced_cut_node',
    'sceneAdvanced_reset_node_transform',
    'sceneAdvanced_reset_component',
    'sceneAdvanced_restore_prefab',
    'sceneAdvanced_execute_component_method',
    'sceneAdvanced_execute_scene_script',
    'sceneAdvanced_soft_reload_scene',
    'referenceImage_remove_reference_image',
    'referenceImage_clear_all_reference_images',
    'assetAdvanced_save_asset_meta',
    'assetAdvanced_open_asset_external',
    'assetAdvanced_batch_import_assets',
    'assetAdvanced_batch_delete_assets',
    'assetAdvanced_compress_textures'
]);

const OPEN_WORLD_TOOLS = new Set([
    'debug_execute_script',
    'sceneAdvanced_execute_component_method',
    'sceneAdvanced_execute_scene_script',
    'project_import_asset',
    'preferences_import_preferences',
    'assetAdvanced_open_asset_external',
    'assetAdvanced_batch_import_assets'
]);

for (const toolName of CONFIRMATION_TOOLS) {
    const policy = policies.get(toolName);
    if (!policy) throw new Error(`Confirmation policy references unknown tool: ${toolName}`);
    policy.requiresConfirmation = true;
}

for (const toolName of OPEN_WORLD_TOOLS) {
    const policy = policies.get(toolName);
    if (!policy) throw new Error(`Open-world policy references unknown tool: ${toolName}`);
    policy.openWorld = true;
}

function getPolicy(qualifiedName: string): ToolSecurityPolicy {
    const policy = policies.get(qualifiedName);
    if (!policy) {
        throw new Error(`Missing explicit security policy for tool: ${qualifiedName}`);
    }
    return policy;
}

export function validateToolSecurityCoverage(qualifiedNames: Iterable<string>): void {
    const registered = new Set(qualifiedNames);
    for (const toolName of registered) {
        getPolicy(toolName);
    }
    for (const toolName of policies.keys()) {
        if (!registered.has(toolName)) {
            throw new Error(`Security policy references an unregistered tool: ${toolName}`);
        }
    }
}

export function isDangerousByDefault(qualifiedName: string): boolean {
    return getPolicy(qualifiedName).requiresConfirmation;
}

export function requiresConfirmation(qualifiedName: string): boolean {
    return getPolicy(qualifiedName).requiresConfirmation;
}

export function getToolAnnotations(qualifiedName: string): ToolAnnotations {
    const policy = getPolicy(qualifiedName);
    return {
        readOnlyHint: policy.readOnly,
        destructiveHint: policy.requiresConfirmation,
        idempotentHint: policy.readOnly,
        openWorldHint: policy.openWorld
    };
}

export function getReviewedToolNames(): string[] {
    return Array.from(policies.keys());
}
