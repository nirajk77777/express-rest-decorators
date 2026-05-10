---
'express-rest-decorators': patch
---

Release pipeline and documentation fixes.

- CI: drop pinned pnpm version in `ci` and `release` workflows; rely on the root `packageManager` field instead.
- Release: move npm provenance into `publishConfig` (changesets has no `--provenance` flag).
- Release: drop the redundant `--tag` override (changesets pre-mode auto-applies the `rc` dist-tag).
- Docs: correct TypeDoc and README URLs to the published GitHub Pages site.
