# AGENTS.md

Guidance for Codex and other coding agents working in this repository.

## Project

Cocos MCP Server is a Cocos Creator 3.8.8 editor extension. It exposes 153 editor tools in 14 categories through MCP Streamable HTTP.

The server uses:

- `@modelcontextprotocol/sdk` for MCP lifecycle and transport behavior
- Node.js `http` for the loopback HTTP server
- `Editor.Message` for Cocos Creator IPC
- `source/scene.ts` for direct `cc.*` engine access
- Vue 3 for the editor control panel

## Commands

```bash
npm install          # Install dependencies
npm run build        # Compile source/ to dist/
npm run watch        # Watch TypeScript compilation
npm test             # Build and run node:test regression tests
npm run test:editor  # Run the standalone Cocos 3.8.8 editor smoke
npm run test:package # Verify the installable npm release artifact
npm run install:global # Link this checkout into the Cocos 3.8.8 global extension directory
npm audit            # Check dependency advisories
```

Run `npm test` after code changes. Real editor behavior must also be verified in Cocos Creator when a change touches Cocos IPC or `cc.*`.

## Execution Contexts

```text
AI Client
    |
    | MCP Streamable HTTP
    v
MCPServer (source/mcp-server.ts)
    |
    | Editor.Message
    v
Extension Main Process (source/main.ts)
    |
    | execute-scene-script
    v
Scene Script (source/scene.ts)
    |
    v
cc.* APIs
```

Hard rule: do not call `cc.*` from the extension process. Add engine operations to `source/scene.ts` and invoke them through `Editor.Message.request('scene', 'execute-scene-script', ...)`.

## Key Files

| File | Responsibility |
|---|---|
| `source/main.ts` | Extension lifecycle, IPC methods, server recreation |
| `source/mcp-server.ts` | HTTP security, MCP sessions, schemas, routing, timeouts |
| `source/scene.ts` | Scene-script methods with direct engine access |
| `source/settings.ts` | Server and tool-manager persistence/migration |
| `source/tools/tool-manager.ts` | Tool discovery, configurations, enablement |
| `source/tools/tool-security.ts` | Dangerous-tool defaults, confirmation, annotations |
| `source/tools/*.ts` | The 14 tool executors |
| `source/panels/default/index.ts` | Vue control panel |
| `test/*.test.js` | HTTP and Cocos message contract tests |
| `TODO.md` | Prioritized upgrade roadmap |

## Tool Model

Every category implements:

```typescript
interface ToolExecutor {
    getTools(): ToolDefinition[];
    execute(toolName: string, args: any): Promise<ToolResponse>;
}
```

`MCPServer` registers each local name as `<category>_<tool>`. For example, `create_node` in the `node` executor becomes `node_create_node`.

Categories:

`scene`, `node`, `component`, `prefab`, `project`, `debug`, `preferences`, `server`, `broadcast`, `sceneAdvanced`, `sceneView`, `referenceImage`, `assetAdvanced`, `validation`.

## Security Invariants

Do not weaken these without an explicit product decision:

- Bind only to `127.0.0.1`.
- Require authentication everywhere except `GET /health`.
- Reject browser Origins unless explicitly allowed.
- Keep REST endpoints disabled by default.
- Treat an empty enabled-tool configuration as zero exposed tools.
- Validate tool arguments before execution.
- Return failed tool results with MCP `isError: true`.
- Apply request-size, connection, session, and execution-time limits.
- Keep destructive and arbitrary-execution tools disabled by default.
- Require `confirm: true` for tools classified by `tool-security.ts`.

Never log or document a real project `authToken`.

## HTTP Behavior

- `POST /mcp`: initialize, notifications, and MCP requests
- `GET /mcp`: session SSE stream when supported
- `DELETE /mcp`: close a session
- `GET /health`: unauthenticated health check
- `/api/*`: authenticated and available only when `enableRestApi` is true

The server uses stateful MCP transports. Initialization returns `MCP-Session-Id`; subsequent requests must use that session and include `MCP-Protocol-Version`.

## Settings

`{project}/settings/mcp-server.json` contains:

- `port`
- `autoStart`
- `enableDebugLog`
- `allowedOrigins`
- `maxConnections`
- `maxSessions`
- `sessionIdleTimeoutMs`
- `authToken`
- `requestBodyLimitBytes`
- `toolExecutionTimeoutMs`
- `enableRestApi`

`{project}/settings/tool-manager.json` stores named tool configurations, schema versions, and security migration state.

Always pass settings through `normalizeSettings`. Updating settings must preserve stopped/running state and current tool enablement.

## Adding or Changing Tools

1. Add the definition and executor branch.
2. Use a precise JSON Schema, including required fields and bounds.
3. Route engine access through `scene.ts`.
4. Register new scene methods in `package.json` under `contributions.scene.methods`.
5. Classify destructive/open-world behavior in `tool-security.ts`.
6. Add or update a contract test.
7. Run `npm test`.

For a new category, also register it in both `MCPServer.initializeTools()` and `ToolManager` discovery.

## Cocos Contract Notes

- `scene/remove-component` expects a component UUID, not a node UUID plus type.
- `scene/duplicate-node` can return an array of UUIDs.
- Cocos 3.8.8 Inspector restores prefabs with `restore-prefab(rootUuid, prefabUuid)`, despite the bundled declaration advertising a single options object.
- `builder/open` requires a panel name such as `'default'`.
- Cocos message names and return shapes must be checked against 3.8.x types or verified in-editor.

For inherently asynchronous editor commands, success must explicitly mean "dispatched", include a warning, and be verified by a later query or editor smoke case.

## Tests

Tests use Node's built-in `node:test` runner after compiling TypeScript.

Current coverage includes:

- Authentication and Origin checks
- MCP initialization and session routing
- Tool listing, disabled tools, argument validation, and dangerous-tool schemas
- Component removal, node duplication, prefab restore, builder, server IP, and scene-view message contracts

`npm test` includes the bundled Electron runtime smoke. `npm run test:editor` creates a temporary real project and rejects another Cocos instance by default. Use `ALLOW_CONCURRENT_COCOS_SMOKE=1` only for intentional maintenance verification; the harness isolates its runtime directories. Never terminate a user's active editor to make the smoke run.

## Generated Output

`dist/` is generated by `npm run build`. Do not manually edit generated JavaScript.

The current release packaging story is incomplete: `npm pack --dry-run` does not include `dist/`. Treat release packaging as an open task in `TODO.md`.
