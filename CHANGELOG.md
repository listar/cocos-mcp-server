# Changelog

## 1.0.1 — 2026-10-13

### Fixed

- Reserve MCP session capacity before asynchronous initialization, including release after failure.
- Expose MCP session and protocol response headers to explicitly allowed browser origins.
- Reject non-object tool arguments before execution, including REST calls to tools without required arguments.
- Read the MCP server version from the package manifest.
- Preserve startup failure feedback and retry behavior in the control panel.

### Maintenance

- Update MCP SDK to 1.32.1, Vue to 3.5.44, and affected transitive dependencies; official-registry audit reports zero vulnerabilities.
- Add regression coverage for browser sessions, initialization races, and invalid argument types.
- Add Node.js 20/22 CI checks for tests, dependency audit, release packaging, and whitespace.
- Document release verification and semantic versioning.

No settings migration is required. Authentication, loopback binding, tool enablement, and confirmation defaults are unchanged.

### Verification

- 33 regression tests passed, including the bundled Cocos Electron runtime.
- Cocos Creator 3.8.8 full GUI smoke passed in isolated concurrent maintenance mode.
- Release package clean-install verification passed.
- Official npm registry audit: zero vulnerabilities.
