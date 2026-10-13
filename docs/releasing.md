# Release checklist

Use semantic versioning:
- Patch: compatible fixes, security updates, and documentation.
- Minor: additive tools or settings with backwards-compatible defaults.
- Major: incompatible protocol, tool argument/result, or settings changes.

1. Update package.json and package-lock.json together. MCP reports the manifest version.
2. Update CHANGELOG.md with behavior changes and any migration steps.
3. Run npm ci, npm test, npm audit --registry=https://registry.npmjs.org, npm run test:package, and git diff --check.
4. Run npm run test:editor on Cocos Creator 3.8.8 before release. The hosted CI runner does not include Cocos; its runtime test is explicitly skipped there. Never terminate an existing user editor to run verification.
5. Run npm pack and inspect the versioned archive. The prepack hook builds dist; consumers do not need TypeScript.
6. Review and commit the release changes, then tag the reviewed commit as vX.Y.Z and publish the verified artifact through the maintainer's release process.

GitHub branch protection must be configured separately to require the Verify workflow. Merely adding the workflow does not prevent merging.

Use the official npm registry for audit: some mirrors do not implement the security advisory endpoint.
