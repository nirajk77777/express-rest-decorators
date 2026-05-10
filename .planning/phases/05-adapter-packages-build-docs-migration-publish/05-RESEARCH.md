# Phase 5: Adapter Packages, Build, Docs, Migration, Publish - Research

**Researched:** 2026-05-10
**Domain:** npm publish pipeline — tshy dual-build, attw/publint gates, Vitest pool matrix, Biome 2 lint, Changesets RC ladder, npm provenance, TypeDoc, pnpm migration, README/migration-guide authoring
**Confidence:** HIGH (tooling APIs verified; npm registry checked; key decisions traced from CONTEXT.md)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Packaging + DI integration**
- D-01: TypeDI ships as a docs-only recipe. No separate `@scope/express-controllers-typedi` npm package. DI-03 satisfied via documentation only.
- D-02: npm name is `express-controllers` (unscoped). **CRITICAL: name is TAKEN on npm.** `npm view express-controllers` returns a live package (`drudge/express-controllers@1.0.0`, "Dead simple MVC routing for express"). Fallback is `@nirajk/express-controllers`.
- D-03: Initial release is an RC ladder: `1.0.0-rc.1` → iterate → `1.0.0`. Publish under `dist-tag: next`; promote to `latest` on `1.0.0` ship.
- D-04: `tshy` is the only build tool. No tsup, tsdown, swc, esbuild, or hand-rolled dual-config.
- D-05: `prepublishOnly` runs `attw` + `publint`. Both must pass green; CI runs them on every PR.
- D-06: Vitest exposes two scripts: `test:forks` (`pool: 'forks'`) and `test:threads` (`pool: 'threads'`). CI runs both on every Node version.
- D-07: CI matrix is Node 20/22/24 × Linux only × Express 5.2.x × {forks, threads}. Six jobs per PR.
- D-08: Changesets-driven release with manual approval gate via Version Packages PR.
- D-09: TypeDoc HTML hosted on GitHub Pages, built from same release workflow as npm.
- D-10: README opens with a 30-line CRUD `@JsonController` Zod example + tsconfig snippet.
- D-11: Migration guide is lean and opinionated, 6-chapter structure.
- D-12: VAL-02 satisfied by README "Validators" section. No adapter code; Standard Schema is the surface.
- D-13: License is MIT.
- D-14: Migrate dev tooling to pnpm 10.
- D-15: Minimal governance files: LICENSE, CONTRIBUTING.md, README.md, CHANGELOG.md, `package.json#repository`.

### Claude's Discretion
- Plan ordering / waves
- Exact tshy config (entry points, sub-path exports — just `.` for v1, no `./adapters/typedi`)
- Biome 2 config baseline
- `@arethetypeswrong/cli` config (ignore list for false positives)
- TypeDoc theme + entry-point selection
- GitHub Actions workflow file count (ci.yml / release.yml / docs.yml vs combined)
- Provenance / OIDC setup
- CHANGELOG.md seeding (rc.1 entry content)
- README badge set
- Changesets `pre` mode (confirmed: `changeset pre enter rc`)
- Migration guide file location (MIGRATION.md at repo root vs docs/)
- Repo URL / GitHub username

### Deferred Ideas (OUT OF SCOPE)
- Separate `@scope/express-controllers-typedi` npm package
- class-validator legacy adapter
- Documentation site (Vite/Starlight/VitePress)
- Codemods for migration
- OS matrix in CI beyond Linux
- Express 5.1.x in CI matrix
- CODE_OF_CONDUCT.md / SECURITY.md / issue/PR templates
- Configurable requestIdHeader, pluggable printRoutes sink, etc.
- Auto-injection by `design:paramtypes`
- Bundler smoke matrix beyond a single sanity check
- Scoped `@expresscontrollers/core`-style branding
- README badges beyond standard set
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BUILD-01 | Library builds dual ESM + CJS via `tshy` with TypeScript 5.8+ | tshy 3.3.2 (pinned) config in Standard Stack; tsconfig.json already has correct legacy decorator flags |
| BUILD-02 | Library targets Node >=20; CI matrix runs Node 20/22/24 | GitHub Actions matrix documented; pnpm/action-setup@v6 pattern documented |
| BUILD-06 | Single-package repo; dual ESM+CJS published from root via `tshy` | tshy `exports` config maps only `.`; no sub-path adapter exports for v1 |
| BUILD-07 | `prepublishOnly` runs `attw` and `publint` to verify dual-package config | attw `--pack .` and `publint` CLI commands documented; CI step pattern shown |
| BUILD-08 | Vitest 3 suite runs on both `pool: 'forks'` and `pool: 'threads'` | Two npm scripts documented; vitest.config.ts extension pattern shown |
| BUILD-09 | Lint/format via Biome 2; ESLint 9 fallback documented | biome.json baseline documented; `unsafeParameterDecoratorsEnabled: true` is the key flag |
| DI-03 | TypeDI adapter — reframed as docs-only `useContainer` recipe | README recipe documented; no implementation needed |
| VAL-02 | README documents Zod, Valibot, ArkType usage | Three subsections pattern documented |
| DOCS-01 | README opens with runnable 30-line Zod + Express 5 example | Concrete example structure documented |
| DOCS-02 | Migration guide covers every breaking change vs routing-controllers v0.11 | 6-chapter structure documented with lead chapter on parameter-decorator → method-level input |
| DOCS-03 | TypeDoc API reference generated and published | typedoc.json config documented; GitHub Pages workflow pattern shown |
| DOCS-04 | CHANGELOG follows Keep-a-Changelog; Changesets + npm provenance | `changeset pre enter rc` workflow documented; GitHub Actions OIDC pattern documented |
</phase_requirements>

---

## Summary

Phase 5 converts four phases of stable runtime code into a published v1.0.0. No new runtime features. The work divides into five clusters: (1) build pipeline setup (tshy, attw, publint, pnpm migration), (2) CI wiring (Node 20/22/24 matrix, forks+threads, Biome), (3) release automation (Changesets RC ladder, npm provenance, GitHub Actions), (4) documentation (README example, migration guide, TypeDoc, GitHub Pages), and (5) the actual RC publish + smoke install.

The single biggest surprise uncovered in research: **the `express-controllers` npm name is already taken** by an unrelated abandoned package (`drudge/express-controllers@1.0.0`). The planner must confirm the fallback name `@nirajk/express-controllers` with the user before any publish step. The scoped name is confirmed available on the registry.

A second important finding: **tshy 4.x (current latest) switches to TypeScript 6 by default**, which is a breaking change relative to the project's TypeScript 5.8+ requirement. The project MUST pin `tshy@3.3.2` (latest 3.x, confirmed on npm) to stay on TypeScript 5. The tshy 3.x API is stable and well-understood; the pin is low-risk.

**Primary recommendation:** Wire tshy `^3.3.2` (pinned below 4 to avoid TS6), use Changesets `pre enter rc` mode for the RC ladder, emit TypeDoc from `src/index.ts`, and confirm package name with user before the rc.1 step.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Dual ESM+CJS build | Build tooling (tshy) | tsconfig.json | tshy orchestrates tsc; tsconfig provides compiler flags |
| Type gate (attw) | CI / prepublishOnly | — | Runs on packed tarball; checks type resolution across node10/node16/bundler |
| Package config gate (publint) | CI / prepublishOnly | — | Checks exports field, condition ordering, missing fields |
| Test isolation (forks/threads) | Vitest config | CI matrix | Two npm scripts; CI invokes both |
| Lint/format (Biome) | Developer tooling + CI | ESLint 9 fallback | Enforced in CI; runs on staged files via lint-staged |
| Release automation | GitHub Actions (release.yml) | Changesets CLI | Changesets action opens Version PR; merge triggers publish |
| npm provenance | GitHub Actions OIDC | npm registry | `--provenance` flag + `id-token: write` permission |
| TypeDoc API reference | Build tooling (typedoc) | GitHub Actions (docs.yml) | Generated from tsc declaration output; pushed to gh-pages |
| pnpm migration | package.json + lockfile | CI (pnpm/action-setup@v6) | packageManager field + pnpm-lock.yaml committed |
| README/migration docs | Repo root files | — | Static markdown; no generation needed |

---

## Standard Stack

### Core Build Tools
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `tshy` | `3.3.2` (pin `<4`) | Dual ESM+CJS build via tsc | tsc-based; preserves `emitDecoratorMetadata` exactly; auto-manages `exports` field. **Pinned at 3.x because 4.x switches to TS6 by default, incompatible with project's TS 5.8+ constraint.** [VERIFIED: npm registry] |
| `@arethetypeswrong/cli` | `0.18.2` | Type-resolution gate | De facto standard for dual-published TS packages; checks node10/node16/bundler resolution modes. [VERIFIED: npm registry] |
| `publint` | `0.3.20` | Package config gate | Catches malformed `exports`, wrong condition ordering, missing type fields before publish. [VERIFIED: npm registry] |
| `typedoc` | `0.28.19` | API reference generation | Current standard for TypeScript library docs; reads declarations. [VERIFIED: npm registry] |
| `@changesets/cli` | `2.31.0` | Versioning + changelog | Industry standard for OSS TS libraries; pre-release mode for RC ladder. [VERIFIED: npm registry] |
| `@biomejs/biome` | `2.4.15` | Lint + format | v2 has type-aware rules; `unsafeParameterDecoratorsEnabled` required for legacy decorators. [VERIFIED: npm registry] |

### Supporting Tools
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `changesets/action@v1` | v1 | GitHub Actions Version PR automation | In release.yml; creates/updates the Version Packages PR |
| `pnpm/action-setup@v6` | v6.0.6 | Install pnpm in CI | In every workflow that runs pnpm commands |
| `actions/setup-node@v4` | v4 | Node.js setup in CI | Pairs with pnpm/action-setup; set `registry-url` for npm auth |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `tshy@3.x` | `tshy@4.x` | 4.x uses TS6 by default — breaks `experimentalDecorators` + `emitDecoratorMetadata` until we upgrade TS. Pin 3.x for v1. |
| `tshy` | Pure `tsc` (two tsconfigs) | Works but requires hand-maintaining the `exports` field and two outDir configs — more error-prone. |
| Biome 2 | ESLint 9 + `@typescript-eslint` 8 | ESLint has more decorator-specific rules; switch if Biome lacks a specific rule you need. |
| Changesets | semantic-release | semantic-release lacks the manual-approval gate (Version PR) that D-08 requires. |

**Installation:**
```bash
pnpm add -D tshy@"<4" @arethetypeswrong/cli publint typedoc @changesets/cli @biomejs/biome
```

---

## Architecture Patterns

### System Architecture Diagram

```
Developer writes .changeset/*.md
        │
        ▼
Changesets bot opens "Version Packages" PR
        │
        ▼ (manual approval: merge PR)
        │
        ├──► npm publish (release.yml)
        │      │
        │      ├── pnpm install
        │      ├── pnpm build  (tshy → dist/esm + dist/commonjs)
        │      ├── attw --pack . (type gate)
        │      ├── publint     (package config gate)
        │      └── npm publish --provenance --tag next (rc) / latest (1.0.0)
        │
        └──► TypeDoc build → push to gh-pages (docs.yml)
                 │
                 └── typedoc src/index.ts → docs/ → gh-pages branch

PR CI (ci.yml):
  Matrix: Node 20, 22, 24 × {forks, threads} = 6 jobs
  ├── pnpm install
  ├── pnpm typecheck
  ├── pnpm test:forks    (vitest run --pool=forks)
  ├── pnpm test:threads  (vitest run --pool=threads)
  ├── pnpm build
  ├── attw --pack .
  └── publint
```

### Recommended Project Structure (after Phase 5)
```
/
├── src/                     # unchanged — Phase 1-4 deliverables
├── dist/                    # tshy output (committed? no — gitignored, built in CI)
│   ├── esm/
│   └── commonjs/
├── tests/                   # unchanged
├── .changeset/              # Changesets config + pending changesets
│   └── config.json
├── .github/
│   └── workflows/
│       ├── ci.yml           # PR matrix (6 jobs)
│       └── release.yml      # Changesets + publish + TypeDoc → gh-pages
├── docs/                    # TypeDoc output (gitignored; pushed to gh-pages)
├── CHANGELOG.md             # Changesets-managed
├── MIGRATION.md             # Root-level migration guide (most visible)
├── LICENSE                  # MIT
├── CONTRIBUTING.md
├── README.md
├── biome.json
├── typedoc.json
├── package.json             # updated with tshy field, pnpm, scripts
├── pnpm-lock.yaml           # committed
└── tsconfig.json            # unchanged (legacy decorator flags preserved)
```

### Pattern 1: tshy Configuration in package.json

**What:** The `tshy` field tells tshy which entry points to build and which dialects to emit.

**When to use:** Single entry point (`.`) for v1; no sub-path exports needed since DI-03 is docs-only.

```json
{
  "name": "@nirajk/express-controllers",
  "version": "0.0.0",
  "type": "module",
  "tshy": {
    "exports": {
      ".": "./src/index.ts",
      "./package.json": "./package.json"
    },
    "dialects": ["esm", "commonjs"],
    "main": false,
    "selfLink": false
  },
  "files": ["dist", "README.md", "CHANGELOG.md", "LICENSE", "MIGRATION.md"],
  "scripts": {
    "build": "tshy",
    "test:forks": "vitest run --pool=forks",
    "test:threads": "vitest run --pool=threads",
    "typecheck": "tsc --noEmit",
    "lint": "biome check .",
    "prepublishOnly": "pnpm build && attw --pack . && publint"
  }
}
```

After `tshy` runs, it auto-populates `exports`, `type`, and removes the hand-authored dev-only `main`/`types` fields. Do NOT hand-edit `exports` — tshy overwrites it on every build. [VERIFIED: tshy docs via WebFetch]

**tsconfig.json compatibility:** tshy 3.x overrides `outDir`, `rootDir`, `module`, and `moduleResolution` internally. The existing `tsconfig.json` (with `experimentalDecorators: true`, `emitDecoratorMetadata: true`, `target: ES2022`, `useDefineForClassFields: false`) is respected for compiler flags — those are not overridden. **However:** the current tsconfig has `"module": "NodeNext"` and `"moduleResolution": "NodeNext"` — tshy 3.x also sets these to NodeNext for both dialects, so no conflict. [VERIFIED: tshy README via WebFetch] [ASSUMED: exact tsconfig/tshy interaction with emitDecoratorMetadata — should be verified by a trial build in Wave 1]

**Generated exports shape:**
```json
{
  "exports": {
    ".": {
      "require": {
        "types": "./dist/commonjs/index.d.ts",
        "default": "./dist/commonjs/index.js"
      },
      "import": {
        "types": "./dist/esm/index.d.ts",
        "default": "./dist/esm/index.js"
      }
    },
    "./package.json": "./package.json"
  }
}
```
[VERIFIED: tshy docs via WebFetch — `types` key inside each condition; `default` key for runtime file]

**`main: false` rationale:** Setting `main: false` suppresses the legacy top-level `main`/`types`/`module` fields. The docs warn "relying on top-level main/types will likely cause incorrect types to be loaded in some scenarios." For a new package targeting Node 16+ resolution, `exports` alone is sufficient. If a consumer's toolchain requires a top-level `main`, omit `"main": false` and let tshy generate it. [CITED: tshy README]

### Pattern 2: attw Configuration

**What:** `@arethetypeswrong/cli` checks that type resolution works across all module resolution modes (node10, node16, bundler) for both the ESM and CJS exports.

**How to run:**
```bash
attw --pack .
```
This runs `npm pack`, analyzes the tarball, then deletes it. [VERIFIED: attw CLI README via WebFetch]

**Common issues for dual-published libraries:**
- `CJS_WITH_ESMODULE_DEFAULT_EXPORT`: The CJS build re-exports an ES module default export. Avoid `export default` anywhere in the library — use named exports exclusively (already the library's practice). [CITED: attw docs]
- `MISSING_EXPORTS_FIELD`: If `exports` is absent, attw flags it. tshy-generated `exports` prevents this.
- `NAMED_EXPORTS`: Warns when CJS consumers cannot access named exports. Not applicable if only named exports are used.
- Resolution failures under node10 mode: node10 doesn't understand `exports` field; checks the `main`/`types` fallback. If `main: false` is set, attw may warn under node10. **Decision for planner:** either accept `--profile node16` (ignores node10 failures) or add `main: true` to the tshy config to restore the top-level fields.

**Ignore rules:**
```bash
attw --pack . --ignore-rules false-cjs
```
Use `--ignore-rules` for known false positives. The `false-cjs` rule is the most common false positive for tshy-built packages where the CJS output is a proper `.js` file inside a `commonjs` folder with its own `package.json` (`type: "commonjs"`). [CITED: attw README]

**Profile shorthand** (useful for CI):
```bash
attw --pack . --profile node16
```
The `node16` profile ignores `node10` resolution failures — appropriate since we require Node >=20. [VERIFIED: attw CLI README via WebFetch]

### Pattern 3: publint Configuration

**What:** `publint` validates that `package.json` `exports`, `main`, `types`, and `files` fields are consistent and follow ecosystem conventions.

**How to run:**
```bash
publint
# or against a pack output:
publint --pack
```

**Common issues caught:**
- `CJS_WITH_ESMODULE_DEFAULT_EXPORT`: Same as attw — avoid `export default`. [CITED: publint docs]
- Missing `"types"` condition inside each export condition (must come first). tshy puts it first. [VERIFIED: publint rules via WebFetch]
- `"module"` condition must come before `"require"` — tshy handles this.
- `types` pointing to a `.ts` file (not `.d.ts`) — the current `package.json` has `"types": "./src/index.ts"` which is dev-only and must be removed/replaced by tshy before publish. tshy does this automatically. [VERIFIED: current package.json]

**No separate config file needed** — publint reads `package.json` directly.

### Pattern 4: Vitest Pool Configuration

**What:** Two npm scripts run the same test suite under two different isolation models to catch different classes of bugs.

**Threads vs Forks:**
| Property | `pool: 'threads'` | `pool: 'forks'` |
|----------|-------------------|-----------------|
| Mechanism | `worker_threads` | `child_process` |
| Speed | Faster (shared memory) | Slower (IPC) |
| Process APIs | No `process.chdir()` etc. | Full process API support |
| Native modules | Can segfault | Safe |
| State isolation | SharedArrayBuffer possible | Full OS-level isolation |
| Bug it surfaces | Thread-safety, shared-state assumptions | Process-level leaks |

**For the library:** The tests use `supertest` + `express` (no native bindings) so threads should work. Running both catches cases where a test makes implicit assumptions about module-level state shared across workers. [VERIFIED: Vitest pool docs via WebFetch]

**vitest.config.ts extension:**
```typescript
import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { decoratorMetadata: true, legacyDecorator: true },
        target: 'es2022',
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['reflect-metadata'],
    // pool is specified per-script; no default pool here
  },
});
```

Package scripts:
```json
{
  "test": "vitest run",
  "test:forks": "vitest run --pool=forks",
  "test:threads": "vitest run --pool=threads",
  "test:watch": "vitest"
}
```

**Key:** No need for a second vitest config file — the `--pool` flag overrides per-invocation. [VERIFIED: Vitest docs via WebFetch]

### Pattern 5: Biome 2 Configuration

**What:** `biome.json` at repo root enforces lint + format for all TypeScript files.

**Critical flag for this codebase:** `unsafeParameterDecoratorsEnabled: true` under `javascript.parser` — this is required because the library uses legacy parameter decorators (in tests, and potentially in example code). Without this flag, Biome may reject decorator syntax or report false positives. [VERIFIED: Biome docs via WebFetch]

```json
{
  "$schema": "https://biomejs.dev/schemas/2.4.15/schema.json",
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "trailingCommas": "all",
      "semicolons": "always",
      "arrowParentheses": "always"
    },
    "parser": {
      "unsafeParameterDecoratorsEnabled": true
    }
  },
  "files": {
    "ignore": ["dist/**", ".tshy-build/**", "node_modules/**", "docs/**"]
  }
}
```

**ESLint 9 fallback recipe** (document in CONTRIBUTING.md, do not install by default):
```bash
pnpm add -D eslint@9 @typescript-eslint/eslint-plugin@8 @typescript-eslint/parser@8 eslint-config-prettier prettier@3
```
Use if a specific decorator-aware rule is needed that Biome lacks. The most likely gap: `@typescript-eslint/no-unsafe-declaration-merging`, `@typescript-eslint/consistent-type-imports`, or decorator-specific rules from `@typescript-eslint/experimental-utils`. [ASSUMED: Biome decorator rule coverage gaps — not exhaustively verified]

### Pattern 6: Changesets RC Ladder

**What:** Changesets `pre` mode manages version numbers and dist-tags automatically during the RC ladder.

**Exact command sequence:**

```bash
# Step 1: Enter pre-release mode (run once; commits pre.json)
pnpm changeset pre enter rc

# Step 2: For each changeset during RC period — contributors add changesets normally
pnpm changeset add

# Step 3: Version bump (run before each RC publish)
pnpm changeset version
# This bumps package.json to 1.0.0-rc.1, updates CHANGELOG.md

# Step 4: Publish the RC (dist-tag is automatically set to "rc" from the pre name)
pnpm changeset publish
# publishes as --tag rc (not latest)

# Step 5: Subsequent RC bumps — repeat steps 3-4; version becomes 1.0.0-rc.2, etc.

# Step 6: When ready to ship 1.0.0
pnpm changeset pre exit
pnpm changeset version    # removes -rc.N suffix → 1.0.0
pnpm changeset publish    # publishes to --tag latest
```

[VERIFIED: Changesets pre-release docs via WebFetch]

**CHANGELOG.md behavior during pre mode:** Each `changeset version` run updates CHANGELOG.md with an entry for that RC version. When `pre exit` → `changeset version` runs, Changesets consolidates all RC entries into a single `1.0.0` entry. The RC entries are preserved for historical reference.

**Version Packages PR automation:** The `changesets/action` bot creates a PR titled "Version Packages" that runs `changeset version` automatically. Merging the PR is the "manual approval gate" per D-08. The `publish` step runs after merge on `push: branches: [main]`.

**CHANGELOG seeding for 1.0.0-rc.1:** The first `changeset add` should create a `minor` changeset covering all Phase 1-4 deliverables (the entire new library surface). Since there are no prior published versions, everything is "Added". Content suggestion:
- Added: `@Controller`, `@JsonController` and full HTTP method decorator suite
- Added: Method-level input declaration (`params`, `query`, `body`, `headers`, `cookies`, `session`, `files`)
- Added: Standard Schema (Zod/Valibot/ArkType) validation on all input slots
- Added: Express v5 native async error propagation — single library-installed error middleware
- Added: `@UseBefore` / `@UseAfter` / `@Middleware` / `@Interceptor` / `@UseInterceptor`
- Added: `@Authorized` / `authorizationChecker` / `currentUserChecker`
- Added: File upload support (`@UploadedFile` / `@UploadedFiles`) via optional multer peer
- Added: Cookie and session input slots via optional cookie peer
- Added: `getRequestContext()` via AsyncLocalStorage
- Added: `useContainer(IocAdapter)` hook; default lazy WeakMap container
- Added: `createExpressServer()` / `useExpressControllers()` bootstrap APIs
- Added: CORS, glob controller loading, `printRoutes` option

### Pattern 7: npm Provenance + GitHub Actions OIDC

**What:** Publishing with `--provenance` links the npm package to its GitHub Actions build via OIDC — creating a verifiable attestation that the tarball came from a specific workflow run.

**Requirements:**
- Must run on a GitHub-hosted runner (`ubuntu-latest`) [CITED: npm provenance docs]
- `permissions.id-token: write` in the workflow job [CITED: npm provenance docs]
- `NPM_TOKEN` secret in repo settings (classic automation token or granular with publish scope)
- `NODE_AUTH_TOKEN` env var (set by `actions/setup-node` from `NPM_TOKEN` secret)

**Canonical release.yml:**
```yaml
name: Release

on:
  push:
    branches: [main]

concurrency: ${{ github.workflow }}-${{ github.ref }}

jobs:
  release:
    name: Release
    runs-on: ubuntu-latest
    permissions:
      contents: write       # for Changesets to push version commits
      id-token: write       # for npm provenance OIDC
      pull-requests: write  # for Changesets to open Version Packages PR

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: pnpm/action-setup@v6
        with:
          version: 10

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          registry-url: 'https://registry.npmjs.org'
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile

      - id: changesets
        uses: changesets/action@v1
        with:
          publish: pnpm release
          createGithubReleases: true
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      # TypeDoc → gh-pages (runs only when a release was published)
      - if: steps.changesets.outputs.published == 'true'
        run: pnpm docs:build && pnpm docs:deploy
```

**`pnpm release` script in package.json:**
```json
{
  "scripts": {
    "release": "pnpm build && attw --pack . && publint && changeset publish --provenance"
  }
}
```

Note: `--provenance` is on `changeset publish`, not on `npm publish` directly, since Changesets calls `npm publish` internally. [ASSUMED: `changeset publish --provenance` flag passes through to `npm publish --provenance` — verify against Changesets 2.31.0 changelog if this fails]

**During RC ladder:** The dist-tag is automatically `rc` because of `changeset pre enter rc`. No manual `--tag` needed.

**After `pre exit`:** dist-tag becomes `latest` automatically.

### Pattern 8: TypeDoc Configuration

**What:** `typedoc.json` at repo root configures API reference generation.

```json
{
  "entryPoints": ["src/index.ts"],
  "entryPointStrategy": "resolve",
  "out": "docs",
  "name": "@nirajk/express-controllers",
  "readme": "README.md",
  "tsconfig": "./tsconfig.json",
  "skipErrorChecking": false,
  "gitRevision": "main",
  "excludePrivate": true,
  "excludeProtected": false,
  "includeVersion": true
}
```

[VERIFIED: TypeDoc Options.Input docs via WebFetch — `entryPoints`, `entryPointStrategy`, `out`, `readme` all confirmed]

**TypeDoc detects exports automatically** from `src/index.ts` — everything exported from the barrel appears in the generated docs. No need to enumerate sub-modules. [CITED: TypeDoc docs]

**Build + deploy command (add to package.json):**
```json
{
  "docs:build": "typedoc",
  "docs:deploy": "gh-pages -d docs"
}
```

Or use the `peaceiris/actions-gh-pages` GitHub Action in the workflow instead of a separate `gh-pages` CLI dep.

**TypeDoc version note:** 0.28.19 is the current version. TypeDoc follows TypeScript closely; 0.28.x supports TypeScript 5.8 via `@typescript/native-preview` or standard TS. The existing `tsconfig.json` is used directly. [VERIFIED: npm registry]

### Pattern 9: pnpm 10 Migration

**Steps (in order):**
1. Delete `package-lock.json`
2. Add `"packageManager": "pnpm@10.0.0"` (or `pnpm@11.0.9` — current npm latest) to `package.json`
3. Run `pnpm import` (converts npm lockfile → pnpm lockfile) or `pnpm install` fresh
4. Commit `pnpm-lock.yaml`
5. Update all GitHub Actions workflows to add `pnpm/action-setup@v6` step before `actions/setup-node`
6. Replace `npm ci` with `pnpm install --frozen-lockfile`
7. Replace `npm run <script>` with `pnpm <script>`
8. Update CONTRIBUTING.md: "Use `pnpm install` (not npm or yarn)"

**`pnpm/action-setup@v6` syntax:**
```yaml
- uses: pnpm/action-setup@v6
  with:
    version: 10
```
Or omit `version` and let it read from `packageManager` field. [VERIFIED: pnpm/action-setup@v6 docs via WebFetch]

**Environment availability:** pnpm is NOT installed on this machine (`pnpm not found` — verified by Bash). The first action during Phase 5 Wave 1 must be `npm install -g pnpm@10` or `corepack enable && corepack prepare pnpm@10 --activate`. CI will use `pnpm/action-setup@v6` so CI is unaffected.

### Anti-Patterns to Avoid

- **Hand-editing `exports` in package.json:** tshy overwrites it on every build. Any manual entry is lost.
- **Publishing with `type: "module"` and a `.cjs` extension in `dist/commonjs`:** tshy emits `.js` files in `dist/commonjs/` alongside a `package.json` with `"type": "commonjs"` — this is correct and what attw expects.
- **`reflect-metadata` in the npm tarball published exports:** The library already has `reflect-metadata` as a runtime `dependency` (not devDependency). It will be in the published package's `dependencies`. Consumers who install the package get it automatically. Do NOT move it to `peerDependencies` — consumers must not have to install it separately for the core runtime to work.
- **Using `changeset publish` without `--provenance` in the release script:** Always include `--provenance` in the publish step that runs in GitHub Actions.
- **Biome without `unsafeParameterDecoratorsEnabled`:** Will produce parse errors or lint warnings on decorator syntax in test files.
- **dist/ committed to git:** tshy generates `dist/`. Gitignore it; CI builds it fresh before publish.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Dual ESM+CJS build | Two tsconfig files + custom scripts | `tshy@3.3.2` | tshy manages outDir, rootDir, module resolution, exports field auto-population. Hand-rolled dual builds produce subtle `moduleResolution` mismatches. |
| Type resolution check | Manual `tsc --noEmit` on consumer | `attw --pack .` | attw covers all three resolution modes (node10/node16/bundler); tsc alone misses CJS/ESM masquerade and default-export issues. |
| Package field validation | Reading package.json manually | `publint` | publint knows all 2026 ecosystem conventions (Vite, webpack, Rollup, Node) for condition ordering, types placement, files field. |
| Changelog management | Manually editing CHANGELOG.md | Changesets | Changesets auto-generates Keep-a-Changelog entries, manages semver bumps, creates Version PRs, handles pre-release mode. |
| npm publish auth | Custom .npmrc scripting | `actions/setup-node` with `registry-url` + `NODE_AUTH_TOKEN` | setup-node writes .npmrc correctly for provenance; manual .npmrc often gets the auth token scope wrong. |
| API docs from source | README-only docs | TypeDoc | TypeDoc reads `.d.ts` declarations; stays in sync with code automatically; supports @param, @returns, @example JSDoc tags. |

**Key insight:** Every tool in this list was built specifically to handle the class of edge cases that appear only when you're actually publishing — not during development. Hand-rolling any of them wastes time on problems that are already solved.

---

## Common Pitfalls

### Pitfall 1: tshy 4.x installs by default and breaks TS 5 support

**What goes wrong:** `pnpm add -D tshy` installs 4.1.2 (current latest), which uses TypeScript 6 by default. TS6 has breaking changes; the existing tsconfig may fail to compile.

**Why it happens:** tshy 4.0 was released specifically to upgrade to TS6. The project is committed to TS 5.8+.

**How to avoid:** Always install with explicit version pin: `pnpm add -D tshy@"<4"` or `pnpm add -D tshy@3.3.2`. Lock in `package.json` devDependencies as `"tshy": "3.3.2"` (exact) or `"~3.3.2"` (patch-range).

**Warning signs:** `tsc` fails with "ts6 requires..." messages; `tsconfig.json` reports unexpected errors after `pnpm build`.

### Pitfall 2: `express-controllers` npm name is taken

**What goes wrong:** `npm publish` succeeds under `express-controllers` IF the user happens to control the package (they don't — it belongs to `drudge`). The publish will fail with a 403 or overwrite a different package.

**Why it happens:** The name was claimed in 2013 by an unrelated "Dead simple MVC routing for express" package. It has not been updated since.

**How to avoid:** Use the confirmed-available fallback `@nirajk/express-controllers`. Run `npm view express-controllers` at the start of plan execution to confirm it's still taken (it was as of 2026-05-10). If the user wants `express-controllers`, they must contact the current owner via npm's package-transfer process — this is out of scope for the Phase 5 plan.

**Warning signs:** `npm publish` returns 403 "You do not have permission to publish 'express-controllers'."

### Pitfall 3: dev-only `main`/`types` in package.json break publish gates

**What goes wrong:** The current `package.json` has `"main": "./src/index.ts"` and `"types": "./src/index.ts"` — valid for dev (TypeScript resolves `.ts` directly) but invalid in a published package. `publint` will error. `attw` will report wrong type resolution.

**Why it happens:** tshy is supposed to overwrite these fields on build. But if tshy is run with `"main": false` in the tshy config, it suppresses the top-level field generation. Conflict: the existing fields remain until tshy runs.

**How to avoid:** The `"main"` and `"types"` keys in the root `package.json` outside the `tshy` field should be removed before the first build. tshy will either regenerate them or leave them absent per the `main: false` config. Add a CI step that checks these don't point to `.ts` files post-build.

**Warning signs:** `publint` reports `EXPORTS_TYPES_SHOULD_NOT_BE_TS`; `attw` shows type resolution failure in node10 mode.

### Pitfall 4: `reflect-metadata` appears twice in consumer bundles

**What goes wrong:** The library has `reflect-metadata` in `dependencies`. A consumer who also installs `reflect-metadata` gets two copies — one from the library's node_modules, one from their own. In a dual-package scenario, the two copies may not be the same instance. `Reflect.defineMetadata` from one copy is invisible to `Reflect.getMetadata` from another.

**Why it happens:** ESM `reflect-metadata` is a singleton only within one module graph. Dual-package (ESM + CJS copies of the library) each have their own `reflect-metadata` instance.

**How to avoid:** The library architecture (Phase 1 decisions) uses `Reflect.getMetadata` only to READ TS-emitted keys (`design:paramtypes`), not to WRITE custom metadata. The library's own `Reflect` calls are already on the same instance as the consumer's (since `reflect-metadata` is a direct dependency, consumers share the library's instance). This is lower risk than it sounds. Verify with `attw` that no dual-package hazard is flagged.

**Warning signs:** `Reflect.getMetadata('design:paramtypes', SomeClass)` returns `undefined` at runtime despite the class being properly decorated.

### Pitfall 5: Changesets `changeset publish` not receiving `--provenance` in CI

**What goes wrong:** `changeset publish` calls `npm publish` internally. The `--provenance` flag must be passed to the `changeset publish` command, not to an outer `npm publish` call. If the release script calls `npm publish --provenance` directly, it bypasses Changesets' version management.

**Why it happens:** Library authors commonly add `--provenance` to a direct `npm publish` command and don't realize Changesets has its own publish abstraction.

**How to avoid:** The `pnpm release` script must be: `pnpm build && attw --pack . && publint && changeset publish --provenance`. Confirm `--provenance` is supported in Changesets 2.31.0 (should be — it passes flags through to `npm publish`). [ASSUMED: flag pass-through behavior — verify by checking Changesets 2.31.0 changelog or running a dry-run]

**Warning signs:** Package published without provenance attestation (visible in npm registry UI as "unverified").

### Pitfall 6: TypeDoc cannot find declarations if `tsc --emitDeclarationOnly` hasn't run

**What goes wrong:** TypeDoc 0.28.x can read TypeScript source directly OR from `.d.ts` declarations. If reading source, it needs the `tsconfig.json` compiler to process decorators. If the tsconfig uses SWC/esbuild transforms (as the test config does), TypeDoc may not understand them.

**Why it happens:** `vitest.config.ts` uses `unplugin-swc` for decorator metadata in tests. TypeDoc does not use Vitest's config — it uses `tsconfig.json` directly. The base `tsconfig.json` uses standard `tsc` which handles `experimentalDecorators` and `emitDecoratorMetadata` natively.

**How to avoid:** TypeDoc should use `tsconfig.json` (not a vitest-specific config). The `typedoc.json` `tsconfig` field should point to the root `tsconfig.json`. Run `typedoc` after a successful `tsc --emitDeclarationOnly` in the release workflow, or point TypeDoc at the source files directly (which is what `entryPoints: ["src/index.ts"]` does). [VERIFIED: TypeDoc docs — it reads source files through TS compiler]

**Warning signs:** TypeDoc generates empty pages or "0 exports found" output.

### Pitfall 7: pnpm lockfile not committed / CI cache mismatch

**What goes wrong:** If `pnpm-lock.yaml` is not committed, CI runs `pnpm install` without `--frozen-lockfile` and may resolve different versions than the developer had. This is especially dangerous for a publish step.

**How to avoid:** Always commit `pnpm-lock.yaml`. All CI commands use `pnpm install --frozen-lockfile`. The release workflow must not use `--no-frozen-lockfile`.

**Warning signs:** CI installs different package versions than local; `pnpm install --frozen-lockfile` fails with "lockfile is outdated."

---

## Code Examples

### README 30-Line Example Shape

The 30-line example (D-10) must demonstrate: routing, validation, JSON serialization, async error, and tsconfig requirement.

```typescript
// Source: CONTEXT.md D-10 + library API surface (src/index.ts)
import 'reflect-metadata';
import { z } from 'zod';
import express from 'express';
import {
  JsonController,
  Get,
  Post,
  useExpressControllers,
} from '@nirajk/express-controllers';

const UserSchema = z.object({ name: z.string(), email: z.string().email() });

@JsonController('/users')
class UserController {
  @Get('/:id', { params: { id: z.coerce.number() } })
  async getUser({ params }: { params: { id: number } }) {
    return { id: params.id, name: 'Alice' };
  }

  @Post('/', { body: UserSchema })
  async createUser({ body }: { body: z.infer<typeof UserSchema> }) {
    return { created: true, user: body };
  }
}

const app = express();
app.use(express.json());
await useExpressControllers(app, { controllers: [UserController] });
app.listen(3000, () => console.log('listening on :3000'));
```

Required tsconfig snippet (immediately below the code block in README):
```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "target": "ES2022",
    "useDefineForClassFields": false
  }
}
```

### CI Matrix Workflow (ci.yml)

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: [20, 22, 24]
        pool: [forks, threads]
    name: Node ${{ matrix.node }} / pool=${{ matrix.pool }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v6
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm test:${{ matrix.pool }}
      - run: pnpm build
      - run: attw --pack . --profile node16
      - run: publint
```

### Migration Guide Chapter Structure (MIGRATION.md)

```markdown
# Migrating from routing-controllers v0.11

## 1. Why This Exists
[3 paragraphs: Express-only focus, modern decorators, validator-agnostic]

## 2. The Big Break: Parameter Decorators → Method-Level Input

<!-- LEAD CHAPTER — this is the #1 change -->

**Before (routing-controllers v0.11):**
```ts
@Get('/users/:id')
async getUser(@Param('id') id: string, @Body() body: CreateUserDto) { ... }
```

**After (express-controllers v1):**
```ts
@Get('/users/:id', { params: { id: z.string() }, body: CreateUserSchema })
async getUser({ params, body }: { params: { id: string }, body: CreateUser }) { ... }
```

## 3. Breaking Changes Table

| Feature | routing-controllers v0.11 | express-controllers v1 |
|---------|--------------------------|------------------------|
| Parameter decorators | @Param, @Body, @QueryParam, etc. as arg decorators | Method-level input declaration `{ params, query, body }` |
| Koa support | Yes (dual Express/Koa) | Removed — Express v5 only |
| Express version | v4 | v5 only |
| Validator | class-validator + class-transformer (default) | Standard Schema (Zod/Valibot/ArkType) |
| DI hook | Global `useContainer(Container)` | Per-bootstrap `useContainer({ get: t => ... })` |
| File upload | @UploadedFile as parameter decorator | Method-level `{ files: { avatar: UploadedFile(...) } }` |
| Cookie access | @CookieParam as parameter decorator | Method-level `{ cookies: { sessionId: z.string() } }` |
| Glob loading | controllers: ['src/**/*.ts'] with require | controllers: ['src/**/*.ts'] with import() |
| reflect-metadata | Required for class-validator | Required (core runtime dep) |

## 4. Per-Feature Migration Recipes
[5-7 short chapters: controllers, routing, input, middleware/auth, files, cookies/session, DI]

## 5. What's Gone
[Koa, parameter decorators as primary, class-validator-as-default, body-parser]

## 6. What's New on Top
[getRequestContext() + ALS, printRoutes, native Express v5 async errors]
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| tshy 3.x (TS 5) | tshy 4.x (TS 6) | May 2026 (v4.0 release) | Project must pin tshy@3.3.2 until TS6 migration |
| `npm publish` without provenance | `npm publish --provenance` (OIDC) | 2023+ (npm feature) | Packages without provenance show as "unverified" in npm UI |
| Manual CHANGELOG | Changesets | 2020+ (standard for OSS TS) | Automated version management + PR gate |
| Top-level `main`/`types` | `exports` conditional field | 2022+ (Node 16 subpath exports became standard) | attw/publint enforce exports-first |
| Vitest `pool: 'threads'` (old default) | `pool: 'forks'` (Vitest 3 default) | Vitest 3.x | Forks is more compatible with process-dependent code |

**Deprecated/outdated:**
- `tshy@4.x` for this project: TS6 default breaks TS 5.8+ constraint — use 3.3.2
- `body-parser` package: Express 5 ships built-in `express.json()`/`express.urlencoded()` — already excluded from library
- Top-level `main`/`types` pointing to `.ts` source: dev-only convention; publish gates will flag it

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `changeset publish --provenance` passes `--provenance` through to `npm publish` | Changesets RC Ladder | The release script would need to run `npm publish --provenance` directly instead; would break Changesets version management unless restructured |
| A2 | tshy 3.x respects `experimentalDecorators: true` and `emitDecoratorMetadata: true` from `tsconfig.json` without overriding them | tshy Configuration | Build would produce CJS/ESM outputs without decorator metadata; `Reflect.getMetadata('design:paramtypes')` returns `undefined` at runtime |
| A3 | Biome 2.x has meaningful gaps in decorator-aware lint rules (vs `@typescript-eslint`) | Biome Configuration | If Biome is actually sufficient, no fallback needed; ESLint install instructions in CONTRIBUTING.md are unnecessary overhead |
| A4 | TypeDoc 0.28.19 processes `experimentalDecorators` + `emitDecoratorMetadata` via the standard tsconfig without extra config | TypeDoc Configuration | TypeDoc may fail to parse decorator syntax or generate incomplete docs |
| A5 | `tshy main: false` suppresses legacy top-level fields correctly in v3.3.2 | tshy Configuration | attw may report node10 resolution failure if top-level `types` is absent; may need `main: true` instead |

---

## Open Questions (RESOLVED)

> Per checker revision 2026-05-10: questions below are resolved or explicitly deferred to plan execution.

1. **Q1 — tshy `emitDecoratorMetadata` verification**
   - **Status: DEFERRED-TO-EXECUTION** — Plan 05-03 Task 2 structural grep is the verification gate. The smoke test asserts `dist/commonjs/index.js` and `dist/esm/index.js` both contain `__metadata(` or `Reflect.metadata(` helper calls; if either bundle is missing the helpers, tshy stripped `emitDecoratorMetadata: true` and the build fails fast.

2. **Q2 — Package name resolution**
   - **Status: RESOLVED** — use `@nirajk/express-controllers` (scoped). Per CONTEXT.md D-02 and CLI verification (`npm view express-controllers` returns drudge/1.0.0; `npm view @nirajk/express-controllers` returns 404). All plan examples and README copy reference the scoped name.

3. **Q3 — attw node10 profile decision**
   - **Status: RESOLVED** — use `--profile node16` everywhere (CI ci.yml, prepublishOnly, release.yml). The library targets Node >=20; node10 resolution is not a supported scenario.

4. **Q4 — `changeset publish --provenance` flag support**
   - **Status: DEFERRED-TO-EXECUTION** — Plan 05-07 Task 3 verifies the `--provenance` flag actually fires in the npm publish output. If `changeset publish` does not forward the flag, the documented fallback is direct `npm publish --provenance --access public --tag next` (which also satisfies D-03's dist-tag requirement; see Plan 05-06 critical points). Document the actual code path in 05-07-SUMMARY.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All CI + local dev | ✓ | v24.3.0 (local) | — |
| npm | Package registry interaction | ✓ | Bundled with Node | — |
| pnpm | Local dev + CI | ✗ | Not installed locally | `npm install -g pnpm@10` or `corepack enable && corepack prepare pnpm@10 --activate` |
| tshy | Build | ✗ | Not yet installed | Install as devDep in Wave 1 |
| attw | Publish gate | ✗ | Not yet installed | Install as devDep in Wave 1 |
| publint | Publish gate | ✗ | Not yet installed | Install as devDep in Wave 1 |
| TypeDoc | API docs | ✗ | Not yet installed | Install as devDep in Wave 2 |
| @changesets/cli | Release | ✗ | Not yet installed | Install as devDep in Wave 2 |
| @biomejs/biome | Lint | ✗ | Not yet installed | Install as devDep in Wave 1 |
| GitHub Actions | CI + release | ✓ (assumed — no local check possible) | — | — |
| npm registry write access | Publish | Unknown | — | User must have `NPM_TOKEN` with publish scope; scoped package requires org or user account |

**Missing dependencies with no fallback:**
- npm registry write access (`NPM_TOKEN`) — user must configure this secret; plan cannot automate it
- GitHub repository URL — needed for `package.json#repository`, `homepage`; planner must ask user

**Missing dependencies with fallback:**
- pnpm (local) — install via corepack; CI uses `pnpm/action-setup@v6` so unblocked in CI

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.1.x |
| Config file | `vitest.config.ts` (exists) |
| Quick run command | `vitest run --pool=forks` |
| Full suite command | `vitest run --pool=forks && vitest run --pool=threads` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BUILD-01 | Dual ESM+CJS build produces correct outputs | smoke | `node dist/commonjs/index.js` (CJS smoke) + `node --input-type=module 'import("./dist/esm/index.js")'` | ❌ Wave 1 |
| BUILD-06 | Single-package: no workspace, no packages/* | structural grep | `test -d packages && exit 1 || exit 0` | ❌ Wave 1 |
| BUILD-07 | attw + publint both pass | tool output | `attw --pack . --profile node16 && publint` | ❌ Wave 1 |
| BUILD-08 | Tests pass under both pools | CI job | `pnpm test:forks && pnpm test:threads` | ❌ Wave 1 (scripts) |
| BUILD-09 | Biome lint passes | tool output | `biome check .` | ❌ Wave 2 |
| DI-03 | useContainer recipe in README | manual review | README contains `useContainer({ get: t => Container.get(t) })` | ❌ Wave 3 |
| VAL-02 | README Zod/Valibot/ArkType sections | manual review | README contains three validator subsections | ❌ Wave 3 |
| DOCS-01 | 30-line README example | manual smoke | Copy example to fresh project, run it | ❌ Wave 4 |
| DOCS-02 | Migration guide chapters | manual review | MIGRATION.md exists with 6 chapters | ❌ Wave 3 |
| DOCS-03 | TypeDoc generates docs | tool output | `typedoc && test -d docs` | ❌ Wave 3 |
| DOCS-04 | CHANGELOG + Changesets + provenance | integration | RC publish rehearsal | ❌ Wave 4 |

### Sampling Rate
- **Per task commit:** `pnpm test:forks` (fastest; catches regressions)
- **Per wave merge:** `pnpm test:forks && pnpm test:threads && pnpm build && attw --pack . --profile node16 && publint`
- **Phase gate:** Full build + both pools + attw + publint green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/build/smoke.test.ts` — CJS + ESM import smoke; covers BUILD-01
- [ ] `scripts/check-single-package.sh` — grep gate for no workspace artifacts; covers BUILD-06

*(Existing test infrastructure covers all Phase 1-4 behavioral requirements; Phase 5 only needs build + publish tooling tests)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | — |
| V3 Session Management | No | — |
| V4 Access Control | No | — |
| V5 Input Validation | Indirectly | npm provenance; `attw` type gate prevents type confusion attacks |
| V6 Cryptography | No | npm handles signing; `--provenance` adds OIDC attestation |

### Known Threat Patterns for Publish Pipeline

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Supply chain: compromised tarball | Tampering | `--provenance` OIDC attestation links tarball to specific GitHub Actions run; consumers can verify |
| Name squatting / typosquatting | Spoofing | Scoped `@nirajk/express-controllers` is harder to squatte than unscoped names |
| Secret leakage (NPM_TOKEN) | Information Disclosure | NPM_TOKEN stored as GitHub secret; never logged; `actions/setup-node` writes `.npmrc` with token scoped to registry only |
| Stale dist in published tarball | Tampering | `prepublishOnly` builds fresh before pack; `files` field restricts what's packed |

---

## Sources

### Primary (HIGH confidence)
- npm registry — `npm view tshy`, `npm view @arethetypeswrong/cli`, `npm view publint`, `npm view typedoc`, `npm view @changesets/cli`, `npm view @biomejs/biome` — all versions verified 2026-05-10
- npm registry — `npm view express-controllers` — name taken (drudge@1.0.0) — verified 2026-05-10
- npm registry — `npm view @nirajk/express-controllers` — name available (404) — verified 2026-05-10
- tshy README (GitHub via WebFetch) — exports config, dialects, tsconfig overrides, generated package.json fields
- Changesets prereleases.md (GitHub via WebFetch) — `pre enter rc` exact command sequence, version behavior, `pre exit` → 1.0.0 promotion
- npm provenance docs (docs.npmjs.com via WebFetch) — `id-token: write`, `--provenance`, `NODE_AUTH_TOKEN`, GitHub-hosted runner requirement
- TypeDoc Options.Input docs (typedoc.org via WebFetch) — `entryPoints`, `entryPointStrategy`, `readme` options
- changesets/action README (GitHub via WebFetch) — canonical `release.yml` shape with `publish` input and `NPM_TOKEN`
- pnpm/action-setup@v6 (GitHub via WebFetch) — v6.0.6 syntax, `packageManager` field auto-detect
- Biome v2 configuration docs (biomejs.dev via WebFetch) — `unsafeParameterDecoratorsEnabled`, recommended rules
- Vitest pool docs (vitest.dev via WebFetch) — forks vs threads semantics

### Secondary (MEDIUM confidence)
- attw CLI README (GitHub via WebFetch) — `--pack`, `--profile`, `--ignore-rules` options; 12 problem categories
- publint rules (publint.dev/rules via WebFetch) — `CJS_WITH_ESMODULE_DEFAULT_EXPORT`, condition ordering rules, `@types/*` false positive
- tshy CHANGELOG (GitHub via WebFetch) — v4.0 switched to TS6 (confirmed breaking change for TS5 projects)

### Tertiary (LOW confidence)
- ASSUMED: `changeset publish --provenance` passes through to npm; verify against Changesets 2.31.0 changelog
- ASSUMED: tshy 3.x `emitDecoratorMetadata` pass-through is reliable; verify with Wave 1 smoke test
- ASSUMED: Biome 2.x decorator lint rule gaps; not exhaustively verified

---

## Metadata

**Confidence breakdown:**
- Build pipeline (tshy, attw, publint): HIGH — all tool versions verified on npm registry; config shapes verified from official docs
- Package name: HIGH — `npm view` confirmed `express-controllers` taken, `@nirajk/express-controllers` available
- Release automation (Changesets): HIGH — pre-release workflow verified from official docs
- CI (GitHub Actions): HIGH — well-documented pattern; pnpm/action-setup@v6 verified
- Biome decorator lint: MEDIUM — `unsafeParameterDecoratorsEnabled` documented; full decorator rule coverage not exhaustively checked
- tshy + emitDecoratorMetadata interaction: MEDIUM — tsc-based so should work; not verified end-to-end in this session

**Research date:** 2026-05-10
**Valid until:** 2026-06-10 (tshy, Changesets, and Biome are fast-moving; re-verify versions if planning extends beyond 30 days)
