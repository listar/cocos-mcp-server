# Cocos MCP Server

[English](README.EN.md) | 中文

面向 Cocos Creator 3.8.x 的编辑器扩展，通过 MCP Streamable HTTP 让 Codex、Claude Code、Cursor 等 AI 客户端操作场景、节点、组件、预制体和项目资源。

当前版本提供 **14 个工具分类、157 个工具**，使用官方 `@modelcontextprotocol/sdk`，并默认启用本地鉴权和高风险操作保护。

## 主要能力

- 标准 MCP JSON-RPC 2.0 / Streamable HTTP 传输
- Cocos Creator 编辑器 IPC 与 `scene.ts` 引擎上下文调用
- Vue 3 控制面板、服务器设置和工具启停管理
- Bearer Token 鉴权、Origin 白名单、请求大小限制和工具超时
- 高风险工具默认关闭，执行时必须显式传入 `confirm: true`
- MCP 参数 JSON Schema 校验和结构化错误返回
- Node.js 内置测试框架覆盖 HTTP 协议与关键 Cocos API 契约

## 兼容性

| 项目 | 支持情况 |
|---|---|
| Cocos Creator | 3.8.x |
| Node.js | MCP SDK 要求 Node.js 18+；仍需在目标 Cocos Electron 运行时验证 |
| MCP 传输 | Streamable HTTP |
| 监听地址 | `127.0.0.1` |

## 安装与构建

将仓库放入项目级或全局扩展目录：

```text
{cocos-project}/extensions/cocos-mcp-server/
```

```text
~/.CocosCreator/extensions/cocos-mcp-server/
```

从源码安装后执行：

```bash
npm install
npm run build
```

然后在 Cocos Creator 的 **扩展 → 扩展管理器** 中启用 `cocos-mcp-server`。

> 当前发布流程尚未固化为包含 `dist/` 的安装包。从源码安装时必须先构建，详见 [TODO.md](TODO.md)。

## 快速开始

1. 通过 **扩展 → Cocos MCP Server** 打开控制面板。
2. 复制自动生成的“访问令牌”。
3. 点击“启动服务器”。
4. 使用 `http://127.0.0.1:3000/mcp` 和 Bearer Token 配置客户端。

### Claude Code

```bash
claude mcp add --transport http \
  --header "Authorization: Bearer <access-token>" \
  cocos-creator http://127.0.0.1:3000/mcp
```

### HTTP 客户端配置

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

不同客户端的字段可能略有差异，但都需要把令牌作为 `Authorization: Bearer <access-token>` 请求头发送。

## 安全模型

- HTTP 服务只监听 `127.0.0.1`。
- 首次加载时生成随机访问令牌，持久化到 `{project}/settings/mcp-server.json`。
- 除 `/health` 外，所有端点都需要 Bearer Token 或 `X-MCP-Token`。
- 浏览器跨域默认关闭；只允许设置中明确列出的 Origin。
- REST API 默认关闭。
- 危险工具默认禁用；即使启用，也必须在参数中传入 `confirm: true`。
- 工具参数通过 JSON Schema 校验；工具执行失败会返回 MCP `isError: true`。

不要提交包含真实 `authToken` 的项目设置文件。

## HTTP 端点

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| `GET` | `/health` | 否 | 健康状态、工具数和会话数 |
| `POST` | `/mcp` | 是 | MCP 初始化、通知和工具调用 |
| `GET` | `/mcp` | 是 | MCP SSE 流，由会话和客户端能力决定 |
| `DELETE` | `/mcp` | 是 | 关闭 MCP 会话 |
| `GET` | `/api/tools` | 是 | REST API 启用时列出工具与示例 |
| `POST` | `/api/{category}/{tool}` | 是 | REST API 启用时调用工具 |

初始化成功后，客户端必须在后续 MCP 请求中携带服务端返回的 `MCP-Session-Id` 和协商后的 `MCP-Protocol-Version`。

## 工具分类

MCP 暴露的完整工具名格式为 `<category>_<tool>`，例如 `node_create_node`。

| 分类 | 数量 | 用途 |
|---|---:|---|
| `scene` | 8 | 场景查询、打开、保存和层级结构 |
| `node` | 11 | 节点创建、查找、变换、移动和删除 |
| `component` | 7 | 组件查询、增删、属性设置和脚本挂载 |
| `prefab` | 10 | 预制体查询、实例化、创建、更新和还原 |
| `project` | 24 | 项目信息、资源数据库、构建面板和预览服务 |
| `debug` | 10 | 日志、节点树、性能、场景验证和脚本执行 |
| `preferences` | 7 | 编辑器偏好设置查询、修改和导入导出 |
| `server` | 6 | Cocos 编辑器服务器和网络信息 |
| `broadcast` | 5 | 编辑器广播监听与日志 |
| `sceneAdvanced` | 23 | 撤销、快照、复制粘贴和高级场景操作 |
| `sceneView` | 20 | Gizmo、网格、相机和场景视图设置 |
| `referenceImage` | 12 | 场景参考图管理 |
| `assetAdvanced` | 11 | 批量资源、依赖分析、压缩和清单 |
| `validation` | 3 | JSON、字符串和 MCP 请求格式辅助 |
| **合计** | **157** | |

当前启用的工具以运行时 `tools/list` 为准。启用 REST API 后，也可通过 `/api/tools` 查看当前启用工具。

## 设置

设置保存在 `{project}/settings/`：

- `mcp-server.json`：服务器、安全和限制设置
- `tool-manager.json`：工具配置及启停状态

| 设置 | 默认值 | 说明 |
|---|---:|---|
| `port` | `3000` | HTTP 监听端口 |
| `autoStart` | `false` | 插件加载时自动启动 |
| `enableDebugLog` | `false` | 输出服务器调试日志 |
| `maxConnections` | `10` | 最大 MCP 会话及并发请求限制 |
| `authToken` | 自动生成 | HTTP 访问令牌 |
| `allowedOrigins` | `[]` | 浏览器 Origin 白名单 |
| `requestBodyLimitBytes` | `1048576` | 最大请求体，默认 1 MiB |
| `toolExecutionTimeoutMs` | `30000` | 单个工具执行超时 |
| `enableRestApi` | `false` | 是否启用 `/api/*` |

## 架构

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

关键约束：`cc.*` 只能在 `scene.ts` 的场景脚本上下文中调用。扩展进程中的工具必须通过 `Editor.Message` 路由。

## 开发

```bash
npm run build       # TypeScript -> dist/
npm run watch       # 监听编译
npm test            # 构建并运行 Node.js 回归测试
npm audit           # 依赖安全审计
```

测试覆盖：

- MCP 初始化、会话、鉴权、Origin、工具列表和参数错误
- 空工具配置与危险工具确认参数
- 组件删除、节点复制、Prefab 还原、Builder、场景视图等关键 Cocos 消息契约

仍需在 Cocos Creator 3.8.x 中进行真实编辑器集成测试。

## 新增工具

1. 在现有 `ToolExecutor` 中添加定义和执行分支，或创建新分类。
2. 需要 `cc.*` 时，在 `scene.ts` 添加方法，并同步 `package.json` 的 `contributions.scene.methods`。
3. 在 `source/tools/tool-security.ts` 中评估危险性和确认要求。
4. 为输入参数提供准确的 JSON Schema。
5. 为 Cocos 消息参数和返回值补充契约测试。
6. 运行 `npm test`。

## 已知限制

- `run_project` 和 `build_project` 当前主要打开 Cocos 构建面板，完整构建仍需 UI 操作。
- 部分 Prefab 高级流程包含历史兼容代码，尚需在真实项目中系统验证。
- 工具分类文件体积较大，类型中仍有较多 `any`。
- 当前自动测试不启动 Cocos Creator。

后续升级计划见 [TODO.md](TODO.md)。

## 常见问题

**返回 `401 Unauthorized`**

检查客户端是否发送了控制面板中当前令牌对应的 `Authorization` 请求头。

**返回 `403 Forbidden origin`**

非浏览器客户端通常不要发送 `Origin`。浏览器客户端需将精确 Origin 加入 `allowedOrigins`。

**工具未出现在 `tools/list`**

在控制面板的工具管理中启用该工具。危险工具默认关闭。

**返回 `Scene not ready`**

先在 Cocos Creator 中打开一个场景。

**修改源码后没有生效**

运行 `npm run build`，再在扩展管理器中重新加载扩展。

## License

MIT
