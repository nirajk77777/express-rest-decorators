<!-- GSD:project-start source:PROJECT.md -->
## Project

**Express Controllers (working title)**

An open-source TypeScript library for building structured, decorator-based REST APIs on Express v5 — a modernized, Express-only successor to [`routing-controllers`](https://github.com/typestack/routing-controllers). Targets TypeScript developers who want class-based controllers with modern decorators, native async error handling, and a pluggable validation/DI story. Public OSS package, modest adoption goal.

**Core Value:** **Bring the routing-controllers DX into the Express v5 + modern-TypeScript era** — same mental model, dropped Koa baggage, native async errors, decorator-based controllers (legacy `experimentalDecorators` + `reflect-metadata`), pluggable validators.

### Constraints

- **Tech stack**: TypeScript 5+, Express v5 (peer dep), Node 20+ (target TBD — confirm during requirements)
- **Module format**: Dual ESM + CJS — broad ecosystem compatibility
- **Decorators**: Legacy TypeScript decorators only — `experimentalDecorators: true` + `emitDecoratorMetadata: true` + `reflect-metadata` shim required
- **Repo shape**: Single-package repo (no monorepo, no workspaces) — `src/` → `dist/`, dual ESM+CJS published from one root
- **Validation**: Pluggable adapters — must not hard-depend on any single schema lib
- **DI**: Pluggable hook at most — no opinionated container in core (pending research)
- **Tests**: Vitest only — no Jest carry-over
- **Compatibility**: Express v5 only — no v4 fallback
- **Audience**: Public OSS, modest adoption — docs/examples/migration guide required for v1
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

> **⚠️ Direction Override (2026-05-08):** The Stack Research below was generated assuming **TC39 Stage 3 decorators** and a **monorepo** shape. The project has since diverged — see the **Constraints** block above. **Authoritative summary of the override:**
> - **Decorators are legacy** (`experimentalDecorators: true` + `emitDecoratorMetadata: true`); `reflect-metadata` IS imported by core and is required at runtime.
> - **Single-package repo** — no `packages/core` + `packages/typedi` split; one `package.json`, one `src/`, one `dist/`.
> - DI remains pluggable via `useContainer(IocAdapter)` (no specific container in core).
> - Where the research below says "no `reflect-metadata` in core", "Stage 3 only", "monorepo", "pnpm workspaces", "`packages/core`", "`packages/typedi`", or recommends `experimentalDecorators: false` / `emitDecoratorMetadata: false` — treat that guidance as **superseded**. tshy, Vitest 3, Biome 2, Standard Schema, Node 20+, and Express 5 guidance remain in force.

## Executive Summary
- **TypeScript 5.8+** — supports both legacy decorators (`experimentalDecorators` + `emitDecoratorMetadata`) and Stage 3; this project uses the legacy mode.
- **Node 20+** as peer engines floor; Node 22 as the recommended/CI default. Node 20 hits EOL April 2026, but a brand-new library shipping in 2026 should not lock out 20 users immediately — set `engines: ">=20.0.0"` and document Node 22 LTS as the recommended runtime.
- **Express v5.1.0+** as a peer dependency (5.1.0 is the current `latest` tag on npm; 5.2.x is the most recent published).
- **tshy** for dual ESM+CJS builds — uses `tsc` under the hood (preserves legacy decorator + `emitDecoratorMetadata` emit exactly), generates correct `exports`, no bundling pitfalls. Avoid `tsup`/`tsdown`/`esbuild`-based bundlers because their decorator and `emitDecoratorMetadata` handling can diverge from `tsc`.
- **Vitest 3.x** as the test runner.
- **Biome v2** for lint+format (single-binary, fast, sufficient for a focused library), with the explicit caveat that Biome's decorator-aware lint coverage is thinner than `@typescript-eslint`'s — falling back to ESLint 9 + `@typescript-eslint` is acceptable if any decorator-specific lint rule is needed.
- **Standard Schema** (`@standard-schema/spec`) as the *primary* validator integration surface, with thin first-party adapters for **Zod v4**, **Valibot v1**, and **class-validator v0.14** as separate optional peer deps.
- **`reflect-metadata` IS used by core.** Legacy decorators rely on `reflect-metadata` for the `Reflect.getMetadata("design:paramtypes", ...)` runtime; consumers must `import "reflect-metadata"` once at the top of their entry file (documented in README). This enables type-driven introspection for DI and validation hooks.
- **Single-package repo.** One `package.json`, one `src/`, one `dist/`. Dual ESM+CJS via tshy from a single root. No pnpm workspaces, no `packages/*` split. Optional integrations (TypeDI adapter, etc.) live as sub-path exports (`<lib>/adapters/typedi`) within the same package.
- **pnpm 10** for development; package itself published with no opinion on consumer's package manager.
- **No DI in core.** A `useContainer(resolver)` hook is the most we should expose, and even that is optional. Auto-injection by constructor type *is* technically possible (legacy decorators + `reflect-metadata` emit `design:paramtypes`), but the policy remains: keep DI pluggable, no specific container in core.
## Recommended Stack
### Core Technologies
| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **TypeScript** | `^5.8.0` (range `>=5.2 <7`) | Language + decorator transform | Stage 3 decorators have been stable since TS 5.0; `Symbol.metadata` runtime emit landed in 5.2. TS 6.0 is a "bridge" release prepping for TS 7's Go-based compiler — avoid being on the bleeding edge for a v1 library. **Confidence: HIGH** |
| **Node.js (peer engine)** | `>=20.0.0`, recommend 22 LTS | Runtime | Node 20 is in maintenance LTS until April 2026; Node 22 is the active LTS through Oct 2026; Node 24 went LTS in Oct 2025. Express v5 requires `>=18`, so 20+ is safely above that floor. **Confidence: HIGH** |
| **Express** | peer `^5.1.0` (or `>=5.1.0 <6`) | HTTP framework being wrapped | Express 5.1.0 became the npm `latest` in March 2025; 5.2.x is current. v5 introduced native async error propagation (the whole reason this library exists in its modernized form). **Confidence: HIGH** |
| **tshy** | `^3.x` (latest stable) | Dual ESM+CJS build | Uses `tsc` (not esbuild/swc/rolldown) — preserves Stage 3 decorator semantics exactly as TS emits them. Auto-generates `package.json#exports`. Standard for `tsc`-based hybrid libraries (used by `node-tap`, `npm` CLI ecosystem). **Confidence: HIGH** |
| **Vitest** | `^3.x` | Test runner | ESM-native, fast, Jest-compatible API, decorators "just work" if Vite uses the TS plugin (no esbuild decorator transform). Use `@vitest/coverage-v8` for coverage. **Confidence: HIGH** |
| **Biome** | `^2.3.0` | Lint + format (one binary) | v2 added type-aware rules; 10–25× faster than ESLint+Prettier; single config file; zero peer-plugin churn. **Caveat: MEDIUM confidence** that all decorator-related lint rules we'd want are present — if a gap appears, switch this slot to ESLint 9 + `@typescript-eslint` 8 + `eslint-config-prettier` + Prettier 3. |
| **pnpm** | `^10.x` | Dev package manager | Workspace protocol (`workspace:*`), `publishConfig` overrides for `main`/`exports`/`types`, faster CI installs. Not imposed on consumers. **Confidence: HIGH** |
### Validation Adapters (peer dependencies, all optional)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **`@standard-schema/spec`** | `^1.0.0` | Validator-agnostic interface | **Primary** integration target. The library's `@Body()`, `@QueryParams()`, etc. accept anything implementing `StandardSchemaV1`. Zero runtime weight; pure type. |
| **Zod** | peer `^4.0.0` (also accept `^3.25.0`) | Schema validation | Primary validation choice for most users in 2026. v4 is 5× faster than v3 and ~14KB gzipped (down from ~53KB). Implements Standard Schema natively. |
| **Valibot** | peer `^1.0.0` | Modular schema validation | Tree-shakeable, ~1.4KB tree-shaken. Implements Standard Schema natively. Prefer for size-sensitive consumers. |
| **ArkType** | peer `^2.x` (optional) | TypeScript-syntax schemas | Implements Standard Schema natively. Optional — if Standard Schema integration is solid, ArkType "just works" with no specific adapter. |
| **class-validator** | peer `^0.14.0` (optional, legacy) | Decorator-on-class validation | Kept for migration parity with original routing-controllers. Requires `reflect-metadata` — isolate inside the legacy adapter package; do **not** allow it to leak into core. |
| **class-transformer** | peer `^0.5.1` (optional, legacy, paired with class-validator) | Plain → class instance | Same isolation rule as class-validator. |
### Supporting Libraries (runtime, kept minimal)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **`path-to-regexp`** | use Express's bundled v8 | Path matching | Already a transitive of Express 5; do not add as direct dep. Be aware of v8's stricter syntax (no unnamed regex groups) — surface this in docs. |
| **`cookie`** | `^1.0.2` | Cookie parsing for `@Cookies()` decorator | Tiny, no deps. |
| **`statuses`** / `http-status-codes` | `^2.x` | HTTP status code constants | Optional internal use; do not export. |
### Development Tools
| Tool | Purpose | Notes |
|------|---------|-------|
| **tshy** | Build hybrid ESM+CJS | Reads `tsconfig.json`; outputs to `./dist/{esm,commonjs}`; manages `exports` field. |
| **Vitest** | Tests | `vitest.config.ts` with `test.environment: 'node'`, `test.include: ['src/**/*.{test,spec}.ts']`. Use `@vitest/coverage-v8`. |
| **Biome** | Lint + format | `biome.json` with `formatter.enabled: true`, `linter.enabled: true`, `linter.rules.recommended: true`. |
| **publint** | npm publishing validator | Run as `prepublishOnly` script — catches malformed `exports`, missing types conditions, etc. |
| **`@arethetypeswrong/cli`** | Type-export validator | Run as `prepublishOnly` — verifies dual ESM+CJS type resolution. Mandatory for dual-published libraries. |
| **changesets** | Versioning + changelog | Industry standard for OSS TS libraries; integrates with GitHub Actions for release automation. |
| **Husky + lint-staged** (optional) | Pre-commit hooks | Light touch; enforce Biome on staged files. |
| **GitHub Actions** | CI | Matrix Node 20/22/24 × Express 5.1/5.2; required green before publish. |
## TypeScript Configuration
### Legacy Decorators tsconfig (CRITICAL — overrides earlier "Stage 3" guidance)
- `experimentalDecorators: true` — required.
- `emitDecoratorMetadata: true` — required; the library reads `design:paramtypes` for type-driven introspection.
- `target: ES2022` — fine for legacy decorators too.
- `useDefineForClassFields: false` — ensures legacy decorator semantics around class fields are preserved.
- Consumers must `import "reflect-metadata"` once before any controller import; the README documents this loudly.
### Decorator Metadata Story (legacy)
- The library uses `Reflect.defineMetadata` / `Reflect.getMetadata` (provided by the `reflect-metadata` polyfill) to store and read route metadata, parameter type info (`design:paramtypes`), and return-type info (`design:returntype`).
- A `reflect-metadata` import is the first runtime concern: missing it produces a clear actionable error from the library's bootstrap.
- Decorator authors attach metadata to the class prototype via `Reflect.defineMetadata(KEY, value, target, propertyKey?)`; the bootstrap walks the controller list, reads metadata, and assembles the Express router.
## Build & Publishing
### Why tshy (not tsup/tsdown/esbuild)
| Bundler | Stage 3 decorators? | Verdict |
|---------|---------------------|---------|
| **tsc** (via tshy/zshy) | Native, correct | **Use this** |
| **tsup** (esbuild) | esbuild ≥0.18.5 supports Stage 3, but with subtle semantic gaps | Risky for a *decorator-centric library* |
| **tsdown** (Rolldown/Oxc) | Not yet supported (per tsdown docs as of March 2026) | **Avoid for now** |
| **swc** | Supports `2022-03` revision, not the latest `2023-11` | Risky |
| **Babel** | Full `2023-11` Stage 3 support via `@babel/plugin-proposal-decorators` | Acceptable but adds toolchain complexity |
### `package.json` Skeleton
## Pluggable Validation Strategy
- `@scope/lib/adapters/zod` — for users who want Zod-specific error formatting / `.parseAsync`. Optional; Standard Schema covers 95% of cases.
- `@scope/lib/adapters/valibot` — same.
- `@scope/lib/adapters/class-validator` — quarantines `reflect-metadata`, `class-validator`, `class-transformer`. Provides parity with the original library for migration users. **Document loudly** that opting in pulls in legacy decorator runtime concerns.
## Dependency Injection Strategy
- Default behavior: `new ControllerClass()` (zero-arg constructors). Cached via WeakMap.
- Users wanting tsyringe/typedi/InversifyJS/Awilix can wire `useContainer({ get: token => container.resolve(token) })`.
- Legacy decorators + `emitDecoratorMetadata` *do* emit `design:paramtypes`, so auto-injection by constructor type is technically achievable. The project policy nonetheless keeps DI **pluggable only** (no specific container in core) — type-based auto-injection, if added, would be opt-in via the container hook, not built into core.
## Alternatives Considered
| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| **tshy** | tsup | Only if tshy proves too rigid; tsup with esbuild ≥0.18.5 *can* handle Stage 3 but verify with snapshot tests of emitted JS. |
| **tshy** | zshy | Equally valid; `zshy` is newer (Colin Hacks). Pick tshy for ecosystem maturity. |
| **tshy** | Pure `tsc` (two configs) | Works but you hand-maintain `exports`. Use only if tshy's opinions clash. |
| **Biome v2** | ESLint 9 + `@typescript-eslint` 8 + Prettier 3 | If a decorator-specific lint rule is needed that Biome lacks. Document rule list before deciding. |
| **Vitest 3** | Node's built-in test runner | `node --test` is viable but lacks the Vitest DX (watch, UI, snapshots) needed for a test suite of this size. |
| **pnpm 10** | npm 10 / Bun | Bun is fast but its decorator/Stage-3 support is still maturing; not worth the risk for a decorator-centric lib in CI. |
| **Standard Schema first** | Direct Zod-only integration | Faster to ship, but locks consumers into Zod — violates "pluggable validation" requirement. |
| **No DI in core** | Built-in lightweight DI | Adds complexity without clear value; users with DI needs already have tsyringe/Awilix/etc. |
## What NOT to Use
| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **Stage 3 decorators** (`experimentalDecorators: false`) | Project requirement is legacy decorators + `reflect-metadata` for ecosystem parity and type-driven introspection. | `experimentalDecorators: true` + `emitDecoratorMetadata: true` + `import "reflect-metadata"`. |
| **Forgetting `import "reflect-metadata"`** at app entry | Library bootstrap depends on the `Reflect` shim being installed before any controller class is loaded. | Document loudly in README; throw an actionable error from bootstrap if `Reflect.getMetadata` is unavailable. |
| **Monorepo / pnpm workspaces / `packages/*`** | Project requirement is single-package repo. | One `package.json` at repo root; sub-path exports for optional adapters. |
| **tsdown** for the build (today) | Decorator + `emitDecoratorMetadata` handling not aligned with `tsc` as of March 2026. | tshy. |
| **swc / esbuild as primary transform** | Their decorator + metadata emit can diverge from `tsc`'s legacy decorator output. | `tsc` via tshy. |
| **Jest** | ESM/decorator config friction; project requirement says Vitest. | Vitest 3. |
| **`glob`-based controller discovery** | The original library shipped `glob` for `controllers: ["src/**/*.controller.ts"]` magic — fragile, slow, security-noisy. | Explicit array of controller classes in bootstrap. |
| **`template-url`** | Tiny abandoned dep from original. | `URL` / `URLPattern` (native). |
| **Hard dep on body-parser** | Express 5 has `express.json()`/`express.urlencoded()` built in. | Express's built-ins; document that consumer must call `app.use(express.json())`. |
| **Bundling deps into the published artifact** | Library should ship sources only; let consumers' bundlers tree-shake. | tshy outputs unbundled per-file `.js` — correct default. |
## Stack Patterns by Variant
- `pnpm add <lib> zod express` — both peer deps satisfied.
- Use Standard Schema integration; no special adapter import needed for basic flow.
- `pnpm add <lib> valibot express`.
- Same Standard Schema path; tree-shaking yields the smallest bundle.
- `pnpm add <lib> class-validator class-transformer express` (`reflect-metadata` is already a core dep — no need to install it again).
- Import from `<lib>/adapters/class-validator`. `import "reflect-metadata"` is required at app entry (already required by core anyway).
- `pnpm add tsyringe` (or any container).
- Call `useContainer({ get: t => container.resolve(t) })` once at bootstrap.
- Library performs no auto type-based injection.
## Version Compatibility Matrix
| Package | Compatible With | Notes |
|---------|-----------------|-------|
| TypeScript ^5.8 | tshy 3.x, Vitest 3.x, Biome 2.x | Stage 3 decorators stable since 5.0; metadata since 5.2. |
| Express ^5.1 | Node ≥18 (we require ≥20) | path-to-regexp v8 transitively. |
| Zod ^4 \|\| ^3.25 | TS ≥5.5 | Standard Schema available in 3.25+. |
| Valibot ^1 | TS ≥5.0 | Standard Schema native. |
| Vitest ^3 | Node ≥20 | Aligns with our peer engines floor. |
| Node 20, 22, 24 | Express 5, all above | CI matrix. Drop 20 from CI in late 2026 once it hits EOL. |
## Installation (developer-side)
# Library development setup
# Peer + optional peers (installed only for dev/testing)
## Confidence Assessment
| Area | Confidence | Rationale |
|------|------------|-----------|
| TypeScript version + tsconfig | HIGH | TS official docs, multiple sources confirm Stage 3 since 5.0, metadata since 5.2, ES2022 target, `experimentalDecorators: false`. |
| Express v5 versions / Node floor | HIGH | expressjs.com release notes (Oct 2024 GA, Mar 2025 default tag, requires Node ≥18). |
| Build tool (tshy) | HIGH | Multiple 2025/2026 articles converge; confirmed `tsc`-based and Stage-3-safe. tsdown explicitly *not* ready. |
| Vitest | HIGH | De facto standard for ESM-first TS libraries in 2026; project requirement. |
| Biome v2 vs ESLint | MEDIUM | Biome v2 viable; decorator-rule coverage not exhaustively verified — flagged with ESLint fallback. |
| Standard Schema strategy | HIGH | Co-authored by Zod/Valibot/ArkType maintainers; adopted by tRPC, TanStack Form, Next.js. |
| `reflect-metadata` exclusion | HIGH | TS 5.2 release notes + decorator proposal docs explicitly state Stage 3 ≠ `emitDecoratorMetadata`. |
| DI recommendation (none in core) | MEDIUM | Defensible technically; final call deferred to requirements phase per PROJECT.md. |
| pnpm choice | MEDIUM | Common dev preference; not load-bearing for the library itself. |
## Sources
- [Express v5 release announcement](https://expressjs.com/2024/10/15/v5-release.html) — Node ≥18, async error propagation, breaking changes. HIGH.
- [Express 5.1.0 default on npm + LTS schedule](https://expressjs.com/2025/03/31/v5-1-latest-release.html) — current `latest` tag rationale. HIGH.
- [Express releases (GitHub)](https://github.com/expressjs/express/releases) — verified 5.2.x most recent. HIGH.
- [TypeScript 5.2 announcement — decorator metadata](https://devblogs.microsoft.com/typescript/announcing-typescript-5-2-beta/) — `Symbol.metadata`, incompatibility with `emitDecoratorMetadata`. HIGH.
- [TypeScript 5.0 release notes — Stage 3 decorators](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-0.html) — Stage 3 stable since 5.0. HIGH.
- [TypeScript decorators handbook](https://www.typescriptlang.org/docs/handbook/decorators.html) — `target: ES2022`, `experimentalDecorators: false`. HIGH.
- [reflect-metadata npm](https://www.npmjs.com/package/reflect-metadata) — confirmed legacy-decorator runtime. HIGH.
- [tshy docs](https://isaacs.github.io/tshy/) — `tsc`-based dual ESM+CJS, manages exports. HIGH.
- [tsup vs tsdown vs unbuild 2026 (PkgPulse)](https://www.pkgpulse.com/guides/tsup-vs-tsdown-vs-unbuild-typescript-library-bundling-2026) — current state of the bundler space. MEDIUM.
- [tsdown target docs](https://tsdown.dev/options/target) — explicit "Stage 3 decorator support is not yet available" note (March 2026). HIGH.
- [zshy (Colin Hacks)](https://github.com/colinhacks/zshy) — `tsc`-based alternative to tshy. HIGH.
- [TypeScript ESM/CJS publishing in 2025/2026 (Liran Tal)](https://lirantal.com/blog/typescript-in-2025-with-esm-and-cjs-npm-publishing) — dual-publishing landscape. MEDIUM.
- [Vitest config docs](https://vitest.dev/config/) — Node env, decorator config via Vite TS plugin. HIGH.
- [Vite Stage 3 decorators discussion](https://github.com/vitejs/vite/discussions/21891) — confirms Babel/SWC transform considerations for esbuild-based pipelines. MEDIUM.
- [Biome v2 vs ESLint 2026 (PkgPulse)](https://www.pkgpulse.com/guides/biome-vs-eslint-vs-oxlint-2026) — Biome v2.3 status, type-aware rules. MEDIUM.
- [Standard Schema spec](https://standardschema.dev/schema) — co-authored by Zod/Valibot/ArkType. HIGH.
- [Zod versioning](https://zod.dev/v4/versioning) — peer-dep range guidance for libraries. HIGH.
- [Valibot vs Zod v4 (PkgPulse)](https://www.pkgpulse.com/guides/valibot-vs-zod-v4-typescript-validator-2026) — bundle sizes, perf. MEDIUM.
- [Node.js previous releases](https://nodejs.org/en/about/previous-releases) — Node 20 EOL April 2026, Node 22/24 LTS status. HIGH.
- [pnpm vs npm 2026](https://www.pkgpulse.com/guides/best-javascript-package-managers-2026) — workspace + publishConfig override. MEDIUM.
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
