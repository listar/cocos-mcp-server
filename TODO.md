# Upgrade TODO

Last reviewed: June 7, 2026

This roadmap tracks work after the security and protocol stabilization pass. Priorities are ordered by user impact and engineering risk.

## P0 Completed

- [x] Replace the handwritten MCP lifecycle with `@modelcontextprotocol/sdk`.
- [x] Support negotiated MCP protocol versions and stateful Streamable HTTP sessions.
- [x] Add Bearer authentication and generate a persistent random token.
- [x] Bind to loopback and enforce Host and Origin checks.
- [x] Add request-body, connection, session, and tool-execution limits.
- [x] Make REST endpoints opt-in.
- [x] Enforce tool enablement, including the empty-configuration case.
- [x] Validate tool arguments with JSON Schema.
- [x] Return failed tool calls as MCP errors.
- [x] Disable dangerous tools by default and require `confirm: true`.
- [x] Fix server lifecycle races when stopping or updating settings.
- [x] Fix confirmed Cocos 3.8 API contract errors.
- [x] Add HTTP and Cocos message contract regression tests.
- [x] Remove vulnerable `uuid` usage and update dependencies to a clean audit.
- [x] Update the control panel and connection documentation for authentication.

## P1 Reliability Implemented

Implementation and verification are complete. `npm test` passes in the bundled Cocos 3.8.8 Electron runtime, and `npm run test:editor` completed the full Cocos 3.8.8 GUI workflow on June 7, 2026. The harness isolates its runtime directories and warms AssetDB/Scene before mutation tests; see `docs/editor-smoke.md`.

### P1-01 Verify the actual Cocos runtime

- [x] Record the Node.js and Electron versions used by supported Cocos Creator releases.
- [x] Verify that `@modelcontextprotocol/sdk@1.29.x` runs inside the target editor runtime.
- [x] Define the exact supported Cocos patch version: 3.8.8.

Done when: the compatibility matrix contains tested editor versions and a start/connect/tools-list smoke result for each.

### P1-02 Make prefab operations project-independent

- [x] Remove hard-coded `/Users/lizhiyong/NewProject_3` fallback paths from `prefab-tools.ts`.
- [x] Resolve all filesystem paths from `Editor.Project.path`.
- [x] Replace the historical custom serializer and undocumented messages with verified Cocos 3.8.8 flows.
- [x] Cover load, instantiate, revert, duplicate, and restore in the editor harness; intentionally omit unsupported create/update tools.

Done when: prefab tools contain no machine-specific paths and the core workflows pass an editor integration checklist.

### P1-03 Reconcile tool configurations

- [x] Add newly introduced tools to existing saved configurations.
- [x] Remove stale tools that no longer exist.
- [x] Preserve user choices while applying security defaults to new dangerous tools.
- [x] Validate imported configuration structure, known categories, tool names, duplicates, and field types.
- [x] Add a configuration schema version and migration tests.

Done when: upgrading the extension cannot silently hide new safe tools or retain removed tools.

### P1-04 Add real editor smoke tests

- [x] Generate a small isolated Cocos fixture project.
- [x] Cover scene open/save, node CRUD, component CRUD, property mutation, and prefab restore.
- [x] Verify scene-view messages in both 2D and 3D modes.
- [x] Verify editor restart, auto-start, settings update, and clean shutdown.
- [x] Isolate the editor profile, home, cache, and temporary directories and warm runtime assets before mutations.
- [x] Document expected editor state before and after each smoke case.

Done when: a repeatable checklist or harness validates the highest-risk workflows in Cocos Creator.

### P1-05 Fix incomplete tool semantics

- [x] Remove the unused `node_duplicate_node.includeChildren` argument.
- [x] Remove misleading `project_run_project` and `project_build_project`; retain the truthful `open_build_panel`.
- [x] Remove unsupported prefab create/update paths and review fallback/partial-success results.
- [x] Add or standardize verification data for the audited mutation tools.

Done when: tool names, descriptions, results, and actual editor effects agree.

### P1-06 Harden session and HTTP behavior

- [x] Add scheduled idle-session cleanup instead of cleanup only on incoming requests.
- [x] Add tests for session deletion, idle expiry, maximum sessions, and shutdown with an open SSE stream.
- [x] Add tests for body limits, tool timeout, REST gating, CORS preflight, and `tools/list_changed`.
- [x] Separate active HTTP request limits from maximum MCP session limits.

Done when: lifecycle and limit behavior is deterministic under concurrent clients.

### P1-07 Audit security classification

- [x] Replace prefix-based read-only inference with explicit per-tool metadata.
- [x] Review all 153 tools for destructive, idempotent, read-only, and open-world annotations.
- [x] Require confirmation for reviewed filesystem-writing and external-opening tools.
- [x] Add tests that every arbitrary-code execution tool remains disabled by default.

Done when: annotations and confirmation policy are explicit and reviewed for every tool.

### P1-08 Reduce noisy and sensitive logging

- [x] Remove unconditional debug logs from component, node, and prefab paths.
- [x] Route diagnostic output through `enableDebugLog`.
- [x] Redact tokens, request bodies, scripts, values, detail objects, and user paths, with regression coverage.

Done when: normal operation is quiet and debug logging has a documented redaction policy.

## P2 Maintainability And Release

### P2-01 Produce an installable release artifact

- [x] Use an npm package as the initial release artifact; a dedicated Cocos ZIP can be added later if distribution requires it.
- [x] Ensure the artifact includes `dist/`, `static/`, `i18n/`, the global installer, and required manifest files.
- [x] Exclude source-only files, tests, local agent instructions, and project settings.
- [x] Add `npm run test:package` to pack, install into a temporary project, resolve runtime dependencies, and load the extension entry point.

Done when: a user can install a release without running TypeScript locally.

### P2-02 Add continuous integration

- [ ] Run `npm ci`, `npm test`, `npm audit`, and `git diff --check`.
- [ ] Verify the release artifact contents.
- [ ] Cache dependencies without committing generated output.

Done when: pull requests cannot merge with build, test, audit, or packaging failures.

### P2-03 Split oversized tool modules

- [ ] Break up `prefab-tools.ts`, `component-tools.ts`, `node-tools.ts`, and `project-tools.ts`.
- [ ] Extract schema definitions, Cocos message adapters, conversion helpers, and verification logic.
- [ ] Keep the public `ToolExecutor` boundary stable.

Done when: high-risk files have focused responsibilities and can be tested without loading thousands of lines.

### P2-04 Improve type safety

- [ ] Replace tool `args: any` with generated or declared argument interfaces.
- [ ] Type common Cocos dump shapes and message results.
- [ ] Replace generic `ToolResponse.data` where stable response contracts exist.
- [ ] Introduce typed helpers for `Editor.Message.request`.

Done when: common contract mistakes are caught by TypeScript rather than runtime tests.

### P2-05 Generate tool documentation

- [ ] Generate category counts, names, descriptions, schemas, and risk annotations from `getTools()`.
- [ ] Add a schema-lint test for duplicate names and malformed definitions.
- [ ] Keep README at the category level and publish detailed generated reference docs separately.

Done when: tool reference documentation cannot drift from runtime definitions.

### P2-06 Finish control-panel UX and localization

- [ ] Add token rotation with explicit confirmation.
- [ ] Explain dangerous-tool behavior next to bulk enable controls.
- [ ] Warn before enabling arbitrary execution tools.
- [ ] Move hard-coded Chinese panel strings into the existing i18n system.
- [ ] Improve error and save-state feedback.

Done when: the panel is fully usable in Chinese and English and clearly communicates security consequences.

### P2-07 Establish release discipline

- [ ] Add `CHANGELOG.md`.
- [ ] Choose semantic versioning rules for protocol, tools, and settings migrations.
- [ ] Add a release checklist and tag process.

Done when: each release has a versioned artifact, migration notes, and reproducible verification.

## P3 Product Enhancements

- [ ] Add named tool presets such as Read Only, Scene Editing, Asset Management, and Full Access.
- [ ] Consider MCP resources for scene hierarchy, logs, and project metadata.
- [ ] Consider MCP prompts for common scene-building workflows.
- [ ] Add opt-in performance metrics for tool duration and failure rates without collecting project content.
- [ ] Evaluate support for newer Cocos Creator versions after the 3.8.x matrix is stable.

## Deferred By Design

- Remote network binding is not planned while authentication is a single local token.
- Arbitrary script and component-method execution should remain opt-in and confirmation-gated.
- GUI compatibility claims require a successful full `npm run test:editor` result. Release automation should use the default standalone mode; intentional concurrent maintenance runs must use the isolated override documented in `docs/editor-smoke.md`.
