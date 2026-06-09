# Cocos MCP Server

English | [中文](README.md)

A Cocos Creator 3.8.8 editor extension that exposes scene, node, component, prefab, and project operations to Codex, Claude Code, Cursor, and other AI clients over MCP Streamable HTTP.

The current implementation provides **153 tools in 14 categories**, uses the official `@modelcontextprotocol/sdk`, and enables local authentication and high-risk operation safeguards by default.

## Highlights

- Standard MCP JSON-RPC 2.0 over Streamable HTTP
- Cocos Creator editor IPC and `scene.ts` engine-context execution
- Vue 3 control panel with server settings and per-tool enablement
- Bearer authentication, Origin allowlist, request limits, and tool timeouts
- Dangerous tools disabled by default and gated by `confirm: true`
- Explicit read-only, destructive, idempotent, and open-world policy for all 153 tools
- JSON Schema validation and structured MCP error results
- Node.js regression tests for HTTP behavior and key Cocos API contracts

## Compatibility

| Item | Support |
|---|---|
| Cocos Creator | **3.8.8 verified**; other 3.8 patch releases are not claimed |
| Electron | `31.3.1` bundled with Cocos Creator 3.8.8 |
| Node.js | `20.15.1` bundled with Cocos Creator 3.8.8 |
| Chromium | `126.0.6478.185` |
| MCP SDK | `@modelcontextprotocol/sdk@1.29.x`, initialize/tools-list smoke tested in that runtime |
| MCP transport | Streamable HTTP |
| Bind address | `127.0.0.1` |

## Installation

For a project-level install, place the repository in:

```text
{cocos-project}/extensions/cocos-mcp-server/
```

For a global development install, run:

```bash
npm install
npm run install:global
```

This builds the extension and links the checkout into the directory actually scanned by Cocos Creator 3.8.8:

```text
~/.CocosCreator/builtin-extensions/3.8.8/cocos-mcp-server/
```

To target another supported version explicitly:

```bash
npm run install:global -- --version 3.8.8
```

Restart Cocos Creator after installing or rebuilding. A successful load adds **Extension → Cocos MCP Server → Open MCP Panel**.

The npm artifact produced by `npm pack` includes `dist/`, static assets, and i18n while excluding source files, tests, and local agent instructions. Run `npm run test:package` to pack, clean-install, and load the extension entry point.

> Cocos Creator 3.8.8 does not scan the legacy `~/.CocosCreator/extensions/` directory. Use the versioned directory above or `npm run install:global`.

## Quick Start

1. Open **Extension → Cocos MCP Server**.
2. Copy the generated access token.
3. Start the server.
4. Configure the client with `http://127.0.0.1:3000/mcp` and the Bearer token.

### Claude Code

```bash
claude mcp add --transport http \
  --header "Authorization: Bearer <access-token>" \
  cocos-creator http://127.0.0.1:3000/mcp
```

### HTTP Client Configuration

```json
{
  "mcpServers": {
    "cocos-creator": {
      "type": "http",
      "url": "http://127.0.0.1:3000/mcp",
      "headers": {
        "Authorization": "Bearer <access-token>"
      }
    }
  }
}
```

Client configuration fields vary, but the token must be sent as `Authorization: Bearer <access-token>`.

## Security Model

- The HTTP server binds only to `127.0.0.1`.
- A random access token is generated on first load and stored in `{project}/settings/mcp-server.json`.
- Every endpoint except `/health` requires a Bearer token or `X-MCP-Token`.
- Browser CORS access is denied by default and requires an exact configured Origin.
- The REST API is disabled by default.
- Dangerous tools are disabled by default and still require `confirm: true` when enabled.
- Tool arguments are validated against JSON Schema.
- Tool failures are returned with MCP `isError: true`.

Do not commit project settings containing a real `authToken`.

## HTTP Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/health` | No | Health, tool, and session status |
| `POST` | `/mcp` | Yes | MCP initialization, notifications, and requests |
| `GET` | `/mcp` | Yes | MCP SSE stream, depending on session and client capabilities |
| `DELETE` | `/mcp` | Yes | Close an MCP session |
| `GET` | `/api/tools` | Yes | List tools when the REST API is enabled |
| `POST` | `/api/{category}/{tool}` | Yes | Invoke a tool when the REST API is enabled |

After initialization, clients must send the returned `MCP-Session-Id` and negotiated `MCP-Protocol-Version` on subsequent MCP requests.

## Tool Categories

Qualified MCP names use `<category>_<tool>`, for example `node_create_node`.

| Category | Count | Scope |
|---|---:|---|
| `scene` | 8 | Scene queries, opening, saving, and hierarchy |
| `node` | 11 | Node creation, lookup, transforms, movement, and deletion |
| `component` | 7 | Component queries, mutation, properties, and script attachment |
| `prefab` | 8 | Prefab lookup, validation, instantiation, duplication, and restore |
| `project` | 22 | Project data, asset database, builder UI, and preview server |
| `debug` | 10 | Logs, node tree, performance, validation, and script execution |
| `preferences` | 7 | Editor preference queries, mutation, import, and export |
| `server` | 6 | Cocos editor server and network information |
| `broadcast` | 5 | Editor broadcast listeners and logs |
| `sceneAdvanced` | 23 | Undo, snapshots, clipboard, and advanced scene operations |
| `sceneView` | 20 | Gizmos, grid, camera, and scene view settings |
| `referenceImage` | 12 | Scene reference image management |
| `assetAdvanced` | 11 | Batch assets, dependencies, compression, and manifests |
| `validation` | 3 | JSON, string, and MCP request helpers |
| **Total** | **153** | |

Use runtime `tools/list` as the authoritative list of currently enabled tools. `/api/tools` exposes the same enabled set when the REST API is enabled.

## Settings

Settings are stored under `{project}/settings/`:

- `mcp-server.json`: server, security, and limit settings
- `tool-manager.json`: tool configurations and enablement state

| Setting | Default | Description |
|---|---:|---|
| `port` | `3000` | HTTP listening port |
| `autoStart` | `false` | Start when the extension loads |
| `enableDebugLog` | `false` | Enable redacted debug logs |
| `maxConnections` | `10` | Maximum concurrent HTTP requests |
| `maxSessions` | `10` | Maximum MCP sessions |
| `sessionIdleTimeoutMs` | `1800000` | Idle session cleanup, 30 minutes by default |
| `authToken` | Generated | HTTP access token |
| `allowedOrigins` | `[]` | Browser Origin allowlist |
| `requestBodyLimitBytes` | `1048576` | Maximum request body, 1 MiB by default |
| `toolExecutionTimeoutMs` | `30000` | Per-tool execution timeout |
| `enableRestApi` | `false` | Enable `/api/*` |

## Architecture

```text
AI Client
    |
    | MCP Streamable HTTP + Bearer Token
    v
MCPServer (source/mcp-server.ts)
    |
    | Editor.Message IPC
    v
Extension Main Process (source/main.ts)
    |
    | execute-scene-script
    v
Scene Script Context (source/scene.ts)
    |
    v
cc.* Engine APIs
```

Important constraint: `cc.*` APIs can only run in the `scene.ts` scene-script context. Extension-process tools must route through `Editor.Message`.

## Development

```bash
npm run build       # TypeScript -> dist/
npm run watch       # Watch compilation
npm test            # Build and run Node.js regression tests
npm run test:editor # Isolated real-editor smoke; concurrent Cocos instances are rejected by default
npm run test:package # Verify package contents, clean installation, and runtime dependencies
npm run install:global # Build and link into the Cocos 3.8.8 global extension directory
npm audit           # Dependency security audit
```

Current tests cover:

- MCP initialization, session deletion/expiry/limits, authentication, Origin handling, and validation
- Body limits, tool timeout, REST gating, CORS preflight, SSE shutdown, and `tools/list_changed`
- Empty tool configurations and dangerous-tool confirmation
- Configuration reconciliation/import migration and explicit security policy for all 153 tools
- MCP initialize/tools-list inside the Cocos 3.8.8 Electron/Node runtime
- Key Cocos message contracts for components, nodes, prefabs, builder, and scene view

See [docs/editor-smoke.md](docs/editor-smoke.md) for the real-editor harness and expected state transitions.

## Adding a Tool

1. Add a definition and execution branch to an existing `ToolExecutor`, or create a category.
2. For `cc.*` access, add a `scene.ts` method and register it in `package.json` under `contributions.scene.methods`.
3. Classify the tool in `source/tools/tool-security.ts`.
4. Provide an accurate JSON Schema for its arguments.
5. Add a contract test for Cocos message parameters and return values.
6. Run `npm test`.

## Known Limitations

- Cocos 3.8.8 has no stable public message for creating a prefab from a node or applying a node back to a prefab, so those misleading tools are not exposed.
- `scene_open_scene` and `scene_save_scene` are asynchronous Cocos operations; clients should query scene state afterward.
- The real-editor smoke blocks concurrent Cocos instances by default. Maintainers may explicitly set `ALLOW_CONCURRENT_COCOS_SMOKE=1`; the fixture isolates its profile, home, caches, and temporary directories.
- Several tool modules are large and still rely heavily on `any`.

Debug logging is off by default. When enabled, tokens, request bodies, scripts, property values, detail objects, and user paths are redacted.

See [TODO.md](TODO.md) for the upgrade roadmap.

## Troubleshooting

**`401 Unauthorized`**

Verify that the client sends the current token shown in the control panel.

**`403 Forbidden origin`**

Non-browser clients should normally omit `Origin`. Browser clients need an exact entry in `allowedOrigins`.

**A tool is missing from `tools/list`**

Enable it in Tool Management. Dangerous tools are disabled by default.

**`Scene not ready`**

Open a scene in Cocos Creator first.

**Source changes are not applied**

Run `npm run build`, then reload the extension.

## License

MIT
