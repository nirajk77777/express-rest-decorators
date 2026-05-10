# Phase 5: Adapter Packages, Build, Docs, Migration, Publish — Pattern Map

**Mapped:** 2026-05-10
**Files analyzed:** 18 new/modified files
**Analogs found:** 5 / 18 (most Phase 5 files are greenfield config/doc/CI)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `package.json` | config | transform | `package.json` (existing) | exact — modify in place |
| `tsconfig.json` | config | transform | `tsconfig.json` (existing) | exact — minor tshy awareness |
| `vitest.config.ts` | config | transform | `vitest.config.ts` (existing) | exact — add pool scripts only |
| `biome.json` | config | transform | none | no analog |
| `typedoc.json` | config | transform | none | no analog |
| `.changeset/config.json` | config | event-driven | none | no analog |
| `.github/workflows/ci.yml` | config | event-driven | none | no analog |
| `.github/workflows/release.yml` | config | event-driven | none | no analog |
| `LICENSE` | doc | — | none | no analog |
| `README.md` | doc | — | `src/index.ts` (barrel) | partial — barrel exports define all public API shown in README |
| `MIGRATION.md` | doc | — | none | no analog |
| `CONTRIBUTING.md` | doc | — | none | no analog |
| `CHANGELOG.md` | doc | — | none | no analog |
| `tests/build/smoke.test.ts` | test | batch | `tests/integration/end-to-end.test.ts` | role-match |
| `scripts/check-single-package.sh` | utility | batch | none | no analog |
| `pnpm-lock.yaml` | config | — | `package-lock.json` (existing) | exact — replaced by migration |
| `.gitignore` (update) | config | — | `.gitignore` (existing) | exact — add entries |
| `src/index.ts` (no change) | utility | — | `src/index.ts` (existing) | exact — read-only reference for TypeDoc entry point |

---

## Pattern Assignments

### `package.json` (config, transform)

**Analog:** `/Users/niraj/Desktop/Projects/routing-controlles-express/package.json`

**Current shape** (lines 1–49) — copy and extend:
```json
{
  "name": "express-controllers",
  "version": "0.0.0",
  "description": "Decorator-based REST controllers for Express v5 (modernized routing-controllers successor)",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "engines": { "node": ">=20.0.0" },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": { "reflect-metadata": "^0.2.2" },
  "peerDependencies": { "express": "^5.0.0" }
}
```

**Mutations required** (DO NOT hand-edit `exports` — tshy writes it):
1. Rename `name` to `@nirajk/express-controllers` (D-02; `express-controllers` is taken on npm).
2. Remove dev-only `"main": "./src/index.ts"` and `"types": "./src/index.ts"` top-level fields — tshy will regenerate correct ones pointing into `dist/`.
3. Add `"tshy"` field:
```json
"tshy": {
  "exports": {
    ".": "./src/index.ts",
    "./package.json": "./package.json"
  },
  "dialects": ["esm", "commonjs"],
  "main": false,
  "selfLink": false
}
```
4. Bump `peerDependencies.express` from `"^5.0.0"` to `"^5.1.0"`.
5. Add `peerDependenciesMeta` for lazy peers (multer, cors, cookie, tinyglobby) with `"optional": true`.
6. Add `"packageManager": "pnpm@10.0.0"`.
7. Add `"license": "MIT"`.
8. Add `"repository"`, `"homepage"`, `"bugs"` (GitHub URL — planner must ask user for repo URL).
9. Add `"keywords"` array.
10. Add `"files": ["dist", "README.md", "CHANGELOG.md", "LICENSE", "MIGRATION.md"]`.
11. Extend `"scripts"`:
```json
"scripts": {
  "build":          "tshy",
  "typecheck":      "tsc --noEmit",
  "test":           "vitest run",
  "test:forks":     "vitest run --pool=forks",
  "test:threads":   "vitest run --pool=threads",
  "test:watch":     "vitest",
  "lint":           "biome check .",
  "docs:build":     "typedoc",
  "release":        "pnpm build && attw --pack . --profile node16 && publint && changeset publish --provenance",
  "prepublishOnly": "pnpm build && attw --pack . --profile node16 && publint"
}
```
12. Add devDependencies:
```json
"tshy":                  "3.3.2",
"@arethetypeswrong/cli": "0.18.2",
"publint":               "0.3.20",
"typedoc":               "0.28.19",
"@changesets/cli":       "2.31.0",
"@biomejs/biome":        "2.4.15"
```

---

### `tsconfig.json` (config, transform)

**Analog:** `/Users/niraj/Desktop/Projects/routing-controlles-express/tsconfig.json`

**Existing shape** (lines 1–24) — preserve ALL compiler flags exactly:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "useDefineForClassFields": false,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": false,
    "outDir": "./dist",
    "rootDir": ".",
    "declaration": true,
    "sourceMap": true,
    "types": ["node", "reflect-metadata"]
  },
  "include": ["src/**/*", "tests/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Notes for tshy compatibility:**
- tshy 3.x overrides `outDir`, `rootDir`, `module`, and `moduleResolution` internally during build — these do NOT conflict (tshy uses NodeNext too).
- `experimentalDecorators: true` and `emitDecoratorMetadata: true` are NOT overridden by tshy — they pass through. This is the load-bearing requirement (Wave 1 smoke test verifies `Reflect.getMetadata('design:paramtypes', ControllerClass)` returns a non-undefined array).
- The `include: ["src/**/*", "tests/**/*"]` should remain for the editor/typecheck path. tshy reads only `src/` for the build.
- Consider splitting a `tsconfig.build.json` that excludes `tests/**/*` for tshy to avoid emitting test files — but only if tshy complains. Leave `tsconfig.json` unchanged first; add a build-specific override only if the trial build fails.

---

### `vitest.config.ts` (config, transform)

**Analog:** `/Users/niraj/Desktop/Projects/routing-controlles-express/vitest.config.ts`

**Current shape** (lines 1–25) — add no default `pool` (controlled per-script via `--pool` flag):
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
    // No default pool — controlled by --pool=forks or --pool=threads per script
  },
});
```

**Change:** The config file itself needs NO changes. The two new scripts (`test:forks`, `test:threads`) are added to `package.json` only. The `--pool` CLI flag overrides per invocation without needing a second config file.

---

### `tests/build/smoke.test.ts` (test, batch)

**Analog:** `/Users/niraj/Desktop/Projects/routing-controlles-express/tests/integration/end-to-end.test.ts`

**Import pattern** (end-to-end.test.ts lines 1–13):
```typescript
import 'reflect-metadata';
import { describe, it, expect, afterEach } from 'vitest';
import {
  Controller, JsonController,
  // ... named imports from src/index.ts barrel
} from '../../src/index.js';
```

**Core pattern for build smoke** — different from end-to-end but follows the same Vitest shell:
```typescript
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../../', import.meta.url).pathname;

describe('BUILD-01: dual ESM+CJS build outputs', () => {
  it('dist/esm/index.js exists after build', () => {
    expect(existsSync(join(ROOT, 'dist/esm/index.js'))).toBe(true);
  });
  it('dist/commonjs/index.js exists after build', () => {
    expect(existsSync(join(ROOT, 'dist/commonjs/index.js'))).toBe(true);
  });
  it('CJS output is importable and exports are present', () => {
    // Verify emitDecoratorMetadata survives the tshy build:
    // Reflect.getMetadata('design:paramtypes') must be non-undefined on a decorated class.
    const result = execSync(
      `node -e "require('./dist/commonjs/index.js'); console.log('ok')"`,
      { cwd: ROOT, encoding: 'utf8' },
    );
    expect(result.trim()).toBe('ok');
  });
});
```

**Note:** This test is a Wave 1 deliverable; it should run AFTER the build step in CI (`pnpm build && pnpm test:forks`), not as part of the main test suite (the build artifacts don't exist until `pnpm build` runs). Consider a separate `test:build` script or a vitest `globalSetup` that checks for `dist/` existence and skips if absent.

---

### `src/index.ts` (reference only — no changes in Phase 5)

**Purpose:** TypeDoc entry point. All exports from this barrel become the v1 API reference.

**Current exports** (lines 1–71) — read-only reference for TypeDoc and README:
- `./decorators/index.js` — `Controller`, `JsonController`, HTTP method decorators, response shapers
- `./errors/index.js` — `HttpError` + 7 subclasses
- `./container/index.js` — `IocAdapter`, `DefaultContainer`, `useContainer`, `getContainer`, `resetContainer`
- `./metadata/builder.js` — `buildMetadata`, `MetadataBuilder`
- `./guard/runtime-guard.js` — `checkLegacyDecoratorMode`
- `./types/action.js` — `Action`, `ClassConstructor` (type-only)
- `./types/standard-schema.js` — `StandardSchemaV1` (type-only)
- `./types/resolved.js` — `ControllerMetadata`, `ActionMetadata`, `ResponseHandlerMetadata` (type-only)
- `./metadata/types.js` — storage-layer arg shapes (type-only)
- `./adapter/boot.js` — `useExpressControllers`, `createExpressServer`
- `./adapter/boot-options.js` — `BootOptions`, `AuthorizationChecker`, `CurrentUserChecker` (type-only)
- `./interfaces/index.js` — middleware/interceptor interfaces (type-only)
- `./adapter/request-context.js` — `getRequestContext`, `RequestContext`
- `./adapter/uploads.js` — `UploadedFile`, `UploadedFiles`, upload types

**TypeDoc note:** `typedoc.json` points `entryPoints` at `src/index.ts`. Everything listed above appears in the generated HTML reference.

---

### `src/adapter/boot.ts` (reference only — import style analog for README example)

**Purpose:** Provides the actual import shape the README's 30-line example must use.

**Import style** (lines 1–34) — the README example should follow this named-import pattern:
```typescript
import 'reflect-metadata';  // ALWAYS first
import express from 'express';
import {
  JsonController,
  Get,
  Post,
  useExpressControllers,
} from '@nirajk/express-controllers';
```

**Note:** `boot.ts` itself is not modified in Phase 5. It is the reference for which symbols the README's `30-line example` can legitimately import.

---

## Shared Patterns

### TypeScript Source Style (apply to `tests/build/smoke.test.ts`)

**Source:** All files in `/Users/niraj/Desktop/Projects/routing-controlles-express/src/` and `tests/`

**Import style:**
- Named imports only — no `export default` anywhere in the library.
- `.js` extension on all relative imports (NodeNext module resolution):
  ```typescript
  import { buildMetadata } from '../metadata/builder.js';
  ```
- Type-only imports use `import type { ... }`:
  ```typescript
  import type { BootOptions } from './boot-options.js';
  ```
- `reflect-metadata` is the first import in any test file that exercises decorators:
  ```typescript
  import 'reflect-metadata';
  ```

**Code style conventions** (inferred from `src/adapter/boot.ts` and test files):
- 2-space indentation.
- Single quotes for strings.
- Trailing commas in multi-line arrays/objects.
- Semicolons always.
- Line width ~100 characters.
- Inline JSDoc on exported functions (not for internal helpers).
- Decision references in comments (`// D-01`, `// BUILD-06`) — preserve this convention in new files.

### `.gitignore` additions

**Analog:** `/Users/niraj/Desktop/Projects/routing-controlles-express/.gitignore` (existing entries: `node_modules`, `dist`, `coverage`, `*.log`, `.DS_Store`)

**Additions for Phase 5:**
```
.tshy-build/
docs/
pnpm-debug.log*
```

**`pnpm-lock.yaml` is committed** (NOT gitignored) — this is the opposite of `package-lock.json` convention; the lockfile replaces `package-lock.json` which IS gitignored.

---

## No Analog (Greenfield)

Files with no close match in the codebase. Planner should seed from the RESEARCH.md templates directly.

| File | Role | Data Flow | Seed Source |
|------|------|-----------|-------------|
| `biome.json` | config | — | RESEARCH.md Pattern 5 — complete template provided |
| `typedoc.json` | config | — | RESEARCH.md Pattern 8 — complete template provided |
| `.changeset/config.json` | config | event-driven | `pnpm changeset init` generates this; then edit `"$schema"`, `"changelog"`, `"commit": false`, `"linked": []`, `"access": "public"`, `"baseBranch": "main"`, `"updateInternalDependencies": "patch"` |
| `.github/workflows/ci.yml` | config | event-driven | RESEARCH.md Code Examples — "CI Matrix Workflow" template |
| `.github/workflows/release.yml` | config | event-driven | RESEARCH.md Pattern 7 — complete `release.yml` template |
| `LICENSE` | doc | — | Standard MIT text; swap in `2026 <author name>` |
| `README.md` | doc | — | RESEARCH.md Code Examples — "README 30-Line Example Shape"; CONTEXT.md D-10/D-11/D-12 for structure |
| `MIGRATION.md` | doc | — | RESEARCH.md Code Examples — "Migration Guide Chapter Structure"; CONTEXT.md D-11 for 6-chapter spec |
| `CONTRIBUTING.md` | doc | — | Greenfield; follow D-14 (pnpm install instructions), D-07 (CI matrix), Biome fallback recipe from RESEARCH.md Pattern 5 |
| `CHANGELOG.md` | doc | — | Keep-a-Changelog format; seed with `1.0.0-rc.1` entry per RESEARCH.md Pattern 6 "CHANGELOG seeding" |
| `pnpm-lock.yaml` | config | — | Generated by `pnpm install` after pnpm migration per RESEARCH.md Pattern 9 |
| `scripts/check-single-package.sh` | utility | batch | Greenfield; one-liner: `test -d packages && exit 1; test -f pnpm-workspace.yaml && exit 1; exit 0` |

---

## Key Patterns for Planner

### Wave ordering (per CONTEXT.md Claude's Discretion)

**Wave 1 — Foundation (build tooling + pnpm migration):**
- `package.json` mutations (tshy field, pnpm, scripts, files, peers)
- pnpm migration (delete `package-lock.json`, `pnpm install`, commit `pnpm-lock.yaml`)
- `biome.json` (greenfield — seed from RESEARCH.md Pattern 5)
- `.gitignore` additions
- `pnpm build` smoke + Wave 1 verification: `attw --pack . --profile node16 && publint`
- `tests/build/smoke.test.ts` (verify CJS/ESM + `emitDecoratorMetadata` survive tshy)

**Wave 2 — CI wiring:**
- `.github/workflows/ci.yml` (6-job matrix — seed from RESEARCH.md CI template)
- Biome CI step in `ci.yml`

**Wave 3 — Release automation + docs tooling:**
- `@changesets/cli` install + `pnpm changeset init`
- `.changeset/config.json` (edit post-init)
- `changeset pre enter rc` (commits `.changeset/pre.json`)
- `typedoc.json` (seed from RESEARCH.md Pattern 8)
- `.github/workflows/release.yml` (seed from RESEARCH.md Pattern 7)
- `LICENSE` (MIT)
- `CONTRIBUTING.md`
- `CHANGELOG.md` (seed rc.1 entry from RESEARCH.md Pattern 6)
- `README.md` (full authoring — 30-line example + badges + validators section + DI recipe)
- `MIGRATION.md` (6-chapter guide — seed from RESEARCH.md Code Examples)

**Wave 4 — RC publish + smoke install:**
- `package.json` final: confirm `@nirajk/express-controllers` name with user
- `changeset version` (bumps to `1.0.0-rc.1`, updates CHANGELOG)
- `pnpm release` dry-run / actual publish
- Fresh-project smoke install of the RC

### tshy build contract (critical for all plans)

**DO NOT hand-edit `exports`** in `package.json` — tshy overwrites it on every `pnpm build`. The planner must note this in every plan that touches `package.json`.

**The `exports` shape tshy will generate** (from RESEARCH.md Pattern 1):
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

### Package name decision point

**Express-controllers is taken** (`drudge/express-controllers@1.0.0`). Every plan that mentions the package name must use `@nirajk/express-controllers`. The planner should include a user-confirmation step in plan-1 before any publish action proceeds (in case the user wants to pursue the npm transfer process instead).

### attw profile

Use `--profile node16` in CI and `prepublishOnly` to skip node10 resolution failures (the library targets Node >=20; node10 toolchain compat is not required).

---

## Metadata

**Analog search scope:** `/Users/niraj/Desktop/Projects/routing-controlles-express/src/`, `/tests/`, root config files
**Files scanned:** `package.json`, `tsconfig.json`, `vitest.config.ts`, `src/index.ts`, `src/adapter/boot.ts`, `tests/integration/end-to-end.test.ts`, `.gitignore`
**Pattern extraction date:** 2026-05-10
