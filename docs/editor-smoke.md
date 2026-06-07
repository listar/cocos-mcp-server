# Cocos Editor Smoke Test

The real-editor harness creates a temporary Cocos Creator 3.8.8 project, links this extension, enables only the required dangerous tools, and removes the fixture after a successful run. Its Electron profile, home, XDG caches, and temporary directories are isolated inside the fixture.

## Prerequisites

- Build dependencies are installed with `npm install`.
- Cocos Creator 3.8.8 is installed at the default macOS location, or `COCOS_CREATOR_EXECUTABLE` points to its executable.
- Close every other Cocos Creator instance for the normal supported run. The harness rejects concurrent instances by default as a conservative guard.

## Run

```bash
npm run test:editor
```

Set `KEEP_COCOS_SMOKE_FIXTURE=1` to retain a successful fixture. Failed fixtures are always retained and their path is printed.

Maintainers can explicitly exercise the stronger concurrent-isolation path:

```bash
ALLOW_CONCURRENT_COCOS_SMOKE=1 npm run test:editor
```

Before mutations, the harness performs a separate warmup launch and waits for the fixture assets and Scene runtime. This avoids testing against a partially imported fresh project.

## Cases

| Case | Before | Action | Expected after |
|---|---|---|---|
| Runtime warmup | Fresh isolated project and runtime directories | Wait for AssetDB assets and Scene readiness, then restart | Built-in and fixture assets are available before mutations |
| Auto-start | Temporary project has `autoStart: true` | Launch editor | `/health` becomes available |
| Settings reload | First editor process is stopped | Change port and token, relaunch | New endpoint accepts only the new settings |
| MCP | Server is healthy | Initialize and list tools | Session and required tools are available |
| Scene open | `Smoke` is the startup scene | Open `SmokeAlt` | Current scene name becomes `SmokeAlt` |
| Scene save | A node transform is changed | Call `scene_save_scene` | `SmokeAlt.scene` modification time advances |
| Node CRUD | `SmokeAlt` is open | Create, query, transform, duplicate, delete | Every mutation returns a verified UUID |
| Component CRUD | Smoke node exists | Add, query, remove `cc.UITransform` | Component UUID is resolved and removal is verified |
| Prefab | Fixture prefab is imported | Load, instantiate, override, restore, duplicate | Instance link and copied asset are verified |
| Scene view | Scene process is ready | Switch to 2D, then 3D | Query returns the requested mode each time |
| Shutdown | MCP session is active | Terminate editor | Extension and editor processes exit cleanly |

## Verification Status

- `npm test` runs an MCP initialize/tools-list smoke inside the Cocos 3.8.8 Electron runtime.
- The GUI harness exposed and led to fixes for actual component UUID shape, prefab instantiation type, and prefab restore arguments.
- On June 7, 2026, the complete GUI workflow passed in Cocos Creator 3.8.8, including runtime warmup, restart/settings reload, scene open/save, node and component CRUD, prefab load/instantiate/restore/duplicate, 2D/3D scene-view switching, and clean shutdown.
- The successful verification also exercised `ALLOW_CONCURRENT_COCOS_SMOKE=1` while another project remained open; the existing project was not modified or terminated.
