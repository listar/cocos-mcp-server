# Cocos MCP Server

[English](README.EN.md) | 中文

面向 Cocos Creator 3.8.8 的编辑器扩展，通过 MCP Streamable HTTP 让 Codex、Claude Code、Cursor 等 AI 客户端操作场景、节点、组件、预制体和项目资源。

当前版本提供 **14 个工具分类、153 个工具**，使用官方 `@modelcontextprotocol/sdk`，并默认启用本地鉴权和高风险操作保护。

## 主要能力

- 标准 MCP JSON-RPC 2.0 / Streamable HTTP 传输
- Cocos Creator 编辑器 IPC 与 `scene.ts` 引擎上下文调用
- Vue 3 控制面板、服务器设置和工具启停管理
- Bearer Token 鉴权、Origin 白名单、请求大小限制和工具超时
- 高风险工具默认关闭，执行时必须显式传入 `confirm: true`
- 153 个工具均有显式只读、破坏性、幂等和外部访问安全分类
- MCP 参数 JSON Schema 校验和结构化错误返回
- Node.js 内置测试框架覆盖 HTTP 协议与关键 Cocos API 契约

## 兼容性

| 项目 | 支持情况 |
|---|---|
| Cocos Creator | **3.8.8（已验证）**；其他 3.8 补丁版本未声明支持 |
| Electron | `31.3.1`（Cocos Creator 3.8.8 内置） |
| Node.js | `20.15.1`（Cocos Creator 3.8.8 内置） |
| Chromium | `126.0.6478.185` |
| MCP SDK | `@modelcontextprotocol/sdk@1.29.x`，已在上述 Electron 运行时完成 initialize/tools-list 冒烟 |
| MCP 传输 | Streamable HTTP |
| 监听地址 | `127.0.0.1` |

## 安装与构建

项目级安装可将仓库放入：

```text
{cocos-project}/extensions/cocos-mcp-server/
```

全局开发安装推荐在仓库中运行：

```bash
npm install
npm run install:global
```

该命令会构建扩展，并将当前仓库链接到 Cocos Creator 3.8.8 实际扫描的目录：

```text
~/.CocosCreator/builtin-extensions/3.8.8/cocos-mcp-server/
```

手动安装到其他受支持版本时可传入版本号：

```bash
npm run install:global -- --version 3.8.8
```

安装或重新构建后需要重启 Cocos Creator。扩展加载成功后，菜单中会出现 **扩展 → Cocos MCP Server → 打开 MCP 面板**。

`npm pack` 生成的 npm 发布包已包含 `dist/`、静态资源和 i18n，不包含源码、测试和本地代理说明。运行 `npm run test:package` 可执行打包、临时安装和入口加载验证。

> Cocos 3.8.8 不扫描旧目录 `~/.CocosCreator/extensions/`。全局扩展必须使用上面的版本级目录，或运行 `npm run install:global`。

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
| `prefab` | 8 | 预制体查询、校验、实例化、复制和还原 |
| `project` | 22 | 项目信息、资源数据库、构建面板和预览服务 |
| `debug` | 10 | 日志、节点树、性能、场景验证和脚本执行 |
| `preferences` | 7 | 编辑器偏好设置查询、修改和导入导出 |
| `server` | 6 | Cocos 编辑器服务器和网络信息 |
| `broadcast` | 5 | 编辑器广播监听与日志 |
| `sceneAdvanced` | 23 | 撤销、快照、复制粘贴和高级场景操作 |
| `sceneView` | 20 | Gizmo、网格、相机和场景视图设置 |
| `referenceImage` | 12 | 场景参考图管理 |
| `assetAdvanced` | 11 | 批量资源、依赖分析、压缩和清单 |
| `validation` | 3 | JSON、字符串和 MCP 请求格式辅助 |
| **合计** | **153** | |

当前启用的工具以运行时 `tools/list` 为准。启用 REST API 后，也可通过 `/api/tools` 查看当前启用工具。

## 设置

设置保存在 `{project}/settings/`：

- `mcp-server.json`：服务器、安全和限制设置
- `tool-manager.json`：工具配置及启停状态

| 设置 | 默认值 | 说明 |
|---|---:|---|
| `port` | `3000` | HTTP 监听端口 |
| `autoStart` | `false` | 插件加载时自动启动 |
| `enableDebugLog` | `false` | 输出脱敏后的调试日志 |
| `maxConnections` | `10` | 最大并发 HTTP 请求数 |
| `maxSessions` | `10` | 最大 MCP 会话数 |
| `sessionIdleTimeoutMs` | `1800000` | 空闲会话清理时间，默认 30 分钟 |
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
npm run test:editor # 创建隔离项目并运行真实编辑器冒烟；默认拒绝与其他 Cocos 实例并行
npm run test:package # 验证发布包内容、临时安装和运行时依赖
npm run install:global # 构建并链接到 Cocos 3.8.8 全局扩展目录
npm audit           # 依赖安全审计
```

测试覆盖：

- MCP 初始化、会话删除/过期/上限、鉴权、Origin、工具列表和参数错误
- 请求体限制、工具超时、REST 开关、CORS 预检、SSE 关闭和 `tools/list_changed`
- 空工具配置与危险工具确认参数
- 配置补齐/清理/导入迁移与全部 153 个工具的显式安全分类
- Cocos 3.8.8 内置 Electron/Node 中的 MCP initialize/tools-list
- 组件删除、节点复制、Prefab 还原、Builder、场景保存与场景视图等关键 Cocos 消息契约

真实编辑器脚本、前后状态和运行限制见 [docs/editor-smoke.md](docs/editor-smoke.md)。

## 新增工具

1. 在现有 `ToolExecutor` 中添加定义和执行分支，或创建新分类。
2. 需要 `cc.*` 时，在 `scene.ts` 添加方法，并同步 `package.json` 的 `contributions.scene.methods`。
3. 在 `source/tools/tool-security.ts` 中评估危险性和确认要求。
4. 为输入参数提供准确的 JSON Schema。
5. 为 Cocos 消息参数和返回值补充契约测试。
6. 运行 `npm test`。

## 已知限制

- Cocos 3.8.8 没有稳定公开的“从节点创建 Prefab”与“回写 Prefab”消息，因此这两个误导性工具不再暴露。
- `scene_open_scene` 和 `scene_save_scene` 由 Cocos 异步处理；结果表示命令已派发，调用方应随后查询场景状态。
- 真实编辑器冒烟默认阻止并行 Cocos 实例；维护验证可显式设置 `ALLOW_CONCURRENT_COCOS_SMOKE=1`，测试 runtime 会隔离 profile、HOME、缓存和临时目录。
- 工具分类文件体积较大，类型中仍有较多 `any`。

调试日志默认关闭。开启后，令牌、请求体、脚本、属性值、详情对象和用户目录会被脱敏。

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
