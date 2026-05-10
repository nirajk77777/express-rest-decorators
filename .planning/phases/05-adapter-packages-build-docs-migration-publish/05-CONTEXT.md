# Phase 5: Adapter Packages, Build, Docs, Migration, Publish - Context

**Gathered:** 2026-05-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Ship a publishable v1.0.0 of the library to npm. This phase converts the stable API surface from Phases 1–4 into a published package with documentation, build pipeline, CI, and release automation. No new runtime features; only packaging, docs, and publish-time concerns.

In scope (from ROADMAP.md Phase 5 + CLAUDE.md Direction Override):
- **Build pipeline**: `tshy` produces dual ESM+CJS from a **single-package repo** (BUILD-01, BUILD-06). One `package.json`, one `src/`, one `dist/`. No monorepo, no workspaces.
- **Publish gates**: `prepublishOnly` runs `attw` (`@arethetypeswrong/cli`) + `publint` green (BUILD-07).
- **Test reality**: Vitest 3 suite passes under both `pool: 'forks'` and `pool: 'threads'` (BUILD-08).
- **Lint/format**: Biome 2 enforced in CI; ESLint 9 + `@typescript-eslint` 8 fallback documented if a decorator-aware rule is needed (BUILD-09).
- **CI matrix**: Node 20/22/24 on Linux; Express 5.2.x; pool-forks + pool-threads (BUILD-02).
- **Engines/peers**: `engines.node: ">=20.0.0"`, peer `express: ^5.1.0` (already in `package.json`).
- **TypeDI integration (DI-03)**: Documented `useContainer({ get: t => Container.get(t) })` recipe in README — NOT a separate adapter package. Same recipe applies uniformly to TypeDI / tsyringe / Awilix / etc.
- **Validators (VAL-02)**: README documents Zod, Valibot, ArkType usage — they implement Standard Schema natively, no adapter code needed.
- **README (DOCS-01)**: Opening 30-line runnable example using Zod + Express 5, including required tsconfig snippet (`experimentalDecorators: true`, `emitDecoratorMetadata: true`, `import 'reflect-metadata'`).
- **Migration guide (DOCS-02)**: Lean opinionated guide vs `routing-controllers` v0.11. Lead chapter: parameter-decorator → method-level input. Single Breaking Changes table. 5–7 short chapters.
- **API reference (DOCS-03)**: TypeDoc HTML, hosted on GitHub Pages.
- **Changelog + release (DOCS-04)**: Keep-a-Changelog `CHANGELOG.md` driven by Changesets; npm publish with provenance via GitHub Actions; manual-approval gate via the Changesets `Version Packages` PR.
- **Initial release**: RC ladder — `1.0.0-rc.1` → iterate → `1.0.0` after a clean RC install rehearsal.
- **npm name**: `express-controllers` (unscoped). Planner verifies availability; fallback `@nirajk/express-controllers` if taken.
- **Dev tooling**: Migrate from npm (`package-lock.json`) to pnpm 10 (`pnpm-lock.yaml`) per CLAUDE.md.
- **Repo governance**: LICENSE (MIT), CONTRIBUTING.md, README, GitHub repo URL in `package.json#repository`. Issue/PR templates and CODE_OF_CONDUCT are nice-to-have, deferred unless trivially cheap.

Out of scope (deferred):
- Separate `@scope/express-controllers-typedi` npm package — reframed to documentation-only per D-01 (single-package rule wins).
- class-validator legacy adapter — PROJECT.md schedules for v1.x; not a v1.0.0 deliverable.
- OS matrix beyond Linux (no Windows/macOS CI in v1).
- Express 5.1.x in matrix — peer dep range covers it; we test against 5.2.x in CI.
- Pluggable `printRoutes` sink, configurable `requestIdHeader`, and other Phase 4 v1.x deferrals — all stay deferred.
- Documentation site beyond README + TypeDoc HTML — no Vite/Starlight site in v1.
- Codemods for migration — PROJECT.md explicitly out of scope; migration guide is doc-only.
- Auto-injection by `design:paramtypes` — Phase 1 deferral; remains deferred.

</domain>

<spec_lock>
## Locked Requirements (from ROADMAP.md SC + REQUIREMENTS.md REQ-IDs)

⚠ **Reconciliation note for planner**: ROADMAP.md SC #1 currently reads
*"The monorepo (pnpm workspaces, `packages/core` + `packages/typedi`) builds dual ESM+CJS via `tshy`…"*. This wording is **superseded** by CLAUDE.md's Direction Override (2026-05-08) and BUILD-06, which lock a single-package repo. The planner should treat SC #1 as: *"The single-package repo builds dual ESM+CJS via `tshy` against TypeScript 5.8+; `prepublishOnly` runs `attw` and `publint` green; CI matrix passes across Node 20/22/24 (Linux); Vitest 3 suites pass under both `pool: 'forks'` and `pool: 'threads'`."* The roadmap text will be corrected as part of Phase 5's plans.

⚠ **ROADMAP plan list typo**: Phase 5's "Plans" subsection in ROADMAP.md is a copy-paste of Phase 4's filenames (`04-01-PLAN.md` … `04-06-PLAN.md`). Real plan filenames will be `05-01-PLAN.md` etc. Planner should overwrite that section.

⚠ **DI-03 reframing**: REQUIREMENTS.md DI-03 reads "A separate `@scope/express-controllers-typedi` adapter package is published alongside core." Per D-01 below, DI-03 ships as a **documented `useContainer` recipe** (not a separate package). The requirement should be reworded at planning time; the SC#4 wording ("A separate `@scope/express-controllers-typedi` adapter package is published") needs the same reframing. ROADMAP/REQUIREMENTS edits are part of Phase 5's plan-1 doc-rewrite scope.

</spec_lock>

<decisions>
## Implementation Decisions

### Packaging + DI integration

- **D-01: TypeDI ships as a docs-only recipe.** No `@scope/express-controllers-typedi` npm package. README documents the uniform 5-line recipe applicable to TypeDI, tsyringe, Awilix, and any container with a `.get(token)` shape:
  ```ts
  import { Container } from 'typedi';
  import { useContainer } from 'express-controllers';
  useContainer({ get: token => Container.get(token) });
  ```
  **Why**: CLAUDE.md Direction Override + BUILD-06 lock a single-package repo. Shipping a sibling package would re-introduce the workspaces shape we explicitly rejected. The `useContainer(IocAdapter)` hook from Phase 1 D-04..D-05 is already universal — TypeDI gets no special-casing in core. **DI-03 satisfied via documentation, not by publishing a sibling adapter.**
  **Implication**: REQUIREMENTS.md DI-03 wording and ROADMAP.md SC #4 wording both need updates as part of Phase 5 plan-1 (doc rewrite). Migration guide chapter on DI shows the same recipe alongside the "any container" framing.

- **D-02: npm name is `express-controllers` (unscoped).** Planner runs `npm view express-controllers` during plan-1 to verify availability. Fallback if taken: `@nirajk/express-controllers`. The chosen name appears in README/migration-guide examples, `package.json#name`, and all install commands. No working-title placeholders ship to npm.

### Build + publish pipeline

- **D-03: Initial release is an RC ladder.** Publish `1.0.0-rc.1` to npm under `dist-tag: next`, then install it into a fresh project as a smoke test (Phase 5 final plan). Iterate `rc.N` as needed. Promote to `1.0.0` (`dist-tag: latest`) only after an RC installs cleanly into a vanilla project and runs the README's 30-line example end-to-end.
  **Why**: First-publish risk is highest; RC tags exercise the full pipeline (`tshy` build, `attw`, `publint`, `--provenance`, type-resolution into a real consumer's `tsconfig`) without locking semver. Standard practice for OSS first releases.
  **Implication**: CHANGELOG.md tracks RCs; `Version Packages` PR is created once per RC; release notes accumulate into the eventual `1.0.0` entry.

- **D-04: `tshy` is the only build tool.** No `tsup`, `tsdown`, `swc`, `esbuild`, or hand-rolled dual-config. tshy's `tsc`-based emit preserves legacy decorator + `emitDecoratorMetadata` semantics exactly — required because the library reads `Reflect.getMetadata("design:paramtypes", ...)` in `MetadataBuilder` (Phase 1 D-04 / D-05).
  **Implication**: `package.json#exports` is generated by tshy; do not hand-edit. `dist/esm` and `dist/commonjs` are tshy-managed. Source layout stays `src/` → `dist/`.

- **D-05: `prepublishOnly` runs `attw` + `publint` (BUILD-07).** Both must pass green; CI runs them on every PR too (so they fail fast, not just at publish time). Configuration:
  - `@arethetypeswrong/cli`: dual ESM+CJS type resolution check; `attw --pack`.
  - `publint`: dual-package config sanity; runs against `pnpm pack` output.
  - Both block publish if they emit any error-level diagnostic.

- **D-06: Test matrix per BUILD-08.** Vitest config exposes two scripts: `test:forks` (`pool: 'forks'`) and `test:threads` (`pool: 'threads'`). CI runs both on every Node version; each must pass. Same tests, same fixtures — pool variation is the proof that no module-state assumption sneaks in.

### CI + release automation

- **D-07: CI matrix is Node 20/22/24 × Linux only × Express 5.2.x × {forks, threads}.** Six jobs per PR (3 Node × 2 pools), single Linux runner, single Express version. No macOS, no Windows, no Express 5.1 cell.
  **Why**: Express, multer, cors, cookie, tinyglobby are all pure JS with no OS-specific behavior. Glob loader paths are normalized internally. Test minutes matter for an unfunded OSS project. If a Windows-specific bug ever surfaces, add a Windows job at that point.
  **Implication**: Document in CONTRIBUTING that maintainers should at minimum spot-check on Windows for path-related changes; otherwise users are the first line of feedback.

- **D-08: Changesets-driven release with manual approval gate.** Workflow:
  1. Contributors add `.changeset/*.md` describing their change in PRs.
  2. Changesets bot opens / updates a "Version Packages" PR aggregating pending changesets.
  3. Merging the Version Packages PR triggers a GitHub Action that runs `tshy`, `attw`, `publint`, then `npm publish --provenance` under the `next` (during RC ladder) or `latest` (after `1.0.0` ships) dist-tag.
  4. Same workflow builds TypeDoc HTML and pushes to `gh-pages`.
  **Why**: Manual approval = the merge of the Version Packages PR. No accidental publishes from a tag push. npm provenance attestation is automatic when running inside GitHub Actions with `id-token: write`. Standard pattern for 2026 OSS TS libraries.

- **D-09: TypeDoc HTML is hosted on GitHub Pages.** Built from `tsc --emitDeclarationOnly` output by the same release workflow. Lives at `https://<gh-user>.github.io/express-controllers/`. README links to it. Not bundled in the npm tarball (keeps tarball lean).

### Documentation

- **D-10: README opens with a 30-line CRUD `@JsonController` Zod example.** Shape:
  - Imports: `reflect-metadata` first, then library + Zod + express.
  - One controller class with one `@Get('/:id', { params: { id: z.coerce.number() } })` and one `@Post('/', { body: schemaForBody })`.
  - `useExpressControllers(app, { controllers: [UserController] })`.
  - `app.listen(3000)`.
  - tsconfig snippet immediately below: `experimentalDecorators: true`, `emitDecoratorMetadata: true`, `target: ES2022`, `useDefineForClassFields: false`.
  **Why**: Hits routing + validation + JSON serialization + async error in 30 lines. Most representative of the value prop. SC #2 acceptance test = `pnpm create` a fresh project, copy the example, `pnpm install <package> zod express reflect-metadata`, `pnpm dev`, hit the routes, observe JSON.

- **D-11: Migration guide is lean and opinionated.** Structure:
  1. **Why this exists** (3 paragraphs: Express-only, modern decorators, validator-agnostic).
  2. **The big break: parameter decorators → method-level input declaration** (lead chapter, before/after example, rationale).
  3. **Breaking Changes table** (single table covering: Koa drop, Express v5 only, validator surface change, DI hook change, file/cookie/session decorator → slot model, glob loader semantics, parameter-decorator removal). Two columns: *RC v0.11* | *express-controllers v1*.
  4. **Per-feature migration recipes** (5–7 short chapters; ~1 page each): controllers, routing, input declaration, middleware/interceptors/auth, file uploads (slot model), cookies/sessions (slot model), DI (`useContainer` recipe).
  5. **What's gone** (Koa, parameter decorators as primary, class-validator-as-default, body-parser).
  6. **What's new on top** (`getRequestContext` + ALS, `printRoutes`).
  No exhaustive RC-decorator-by-decorator mapping; users with a specific decorator question are pointed at the table. Codemods are explicitly out of scope (PROJECT.md).

- **D-12: VAL-02 satisfied by README "Validators" section.** Three subsections (Zod / Valibot / ArkType), ~10 lines each, showing the same controller route with each schema library. No adapter code in any subsection — Standard Schema is the integration surface. Zod is the canonical example; Valibot/ArkType show the surface is real.

### Repo governance

- **D-13: License is MIT.** Single `LICENSE` file at repo root. `package.json#license: "MIT"`. Standard for OSS TS libraries; permissive; minimal cognitive load for users.

- **D-14: Migrate dev tooling to pnpm 10.** Phase 5 plan deletes `package-lock.json`, adds `pnpm-lock.yaml` (committed), updates `package.json#packageManager` field, documents `pnpm install` in CONTRIBUTING, updates GitHub Actions workflow to install pnpm via `pnpm/action-setup`. Consumers are unaffected (the package is published as plain npm; users install with their own pm).

- **D-15: Minimal governance files.** Required for v1: `LICENSE`, `CONTRIBUTING.md` (build/test/release workflow + changeset instructions), `README.md`, `CHANGELOG.md`, `package.json#repository` URL. Deferred to v1.x unless trivial: GitHub issue/PR templates, `CODE_OF_CONDUCT.md`, `SECURITY.md`. The library is small and audience is modest — heavy governance ceremony is overhead.

### Claude's Discretion

The user accepted recommended options for every gray area; the following sub-decisions are intentionally left to research + planner:

- **Plan ordering / waves** — likely Wave 1: doc rewrites (REQUIREMENTS DI-03, ROADMAP SC #1/#4, ROADMAP plans typo) + LICENSE + pnpm migration + tshy bootstrap; Wave 2: README + migration guide + CI workflow + Biome config + attw/publint wiring; Wave 3: Changesets bootstrap + TypeDoc + GitHub Pages workflow; Wave 4: rc.1 publish + smoke install. Planner sequences definitively.
- **Exact tshy config** — entry points, sub-path exports list (just `.` for v1, no `./adapters/typedi` since DI-03 is docs-only), `dialects: ['esm','commonjs']`. Planner researches current tshy 3.x config shape and locks.
- **Biome 2 config baseline** — `recommended` + a curated set of stylistic rules consistent with the project's existing code. Planner inspects existing `src/` style and writes minimal `biome.json`. Fallback to ESLint 9 + `@typescript-eslint` 8 documented in CONTRIBUTING if a specific decorator rule is needed.
- **`@arethetypeswrong/cli` config** — node10/node16/bundler resolution checks; the ignore list (if any) for known false positives in the dual-package report. Planner runs `attw --pack` against a draft build and addresses real issues, ignores known noise.
- **TypeDoc theme + entry-point selection** — likely the default theme + `src/index.ts` as the only entry point. Planner picks a current TypeDoc 0.x option set.
- **GitHub Actions workflow file count** — `ci.yml` (PR matrix), `release.yml` (Changesets + publish), `docs.yml` (TypeDoc → gh-pages) vs a single combined workflow. Planner consolidates per current GitHub Actions best practice.
- **Provenance / OIDC setup** — GitHub Actions `permissions: id-token: write`, `contents: write` plus npm token via `NPM_TOKEN` secret. Standard 2025/2026 setup; planner copies a known-good template.
- **CHANGELOG.md seeding** — what goes in the `1.0.0-rc.1` entry. Planner drafts from the Phase 1–4 SC list + this phase's deliverables.
- **README badge set** — npm version, CI status, license, types, install size. Planner picks the standard set (no opinion needed from user).
- **Changesets `pre` mode** — whether to use `changeset pre enter rc` for the RC ladder. Likely yes (changesets has built-in pre-release support that maps cleanly to `1.0.0-rc.N`). Planner confirms.
- **Migration guide file location** — single `MIGRATION.md` at repo root vs `docs/migration.md`. Planner picks; root is simpler for visibility.
- **Repo URL / GitHub username** — needed for `package.json#repository`, `homepage`, `bugs.url`. Planner asks user during execution if it isn't already on file.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project direction (truth — read first)
- `CLAUDE.md` §"Project" + §"Constraints" + §"Technology Stack" + §"Direction Override (2026-05-08)" — single-package repo (BUILD-06), legacy decorators + reflect-metadata, dual ESM+CJS via tshy, Vitest 3, Biome 2, Standard Schema, Node ≥20, Express ^5.1.0 peer.
- `.planning/PROJECT.md` — mission, constraints, modest-adoption OSS audience, "Resolved Decisions" block (DI hook, validation surface, dual ESM+CJS, tshy build, Biome lint, single-package).
- `.planning/ROADMAP.md` §"Phase 5: Adapter Packages, Build, Docs, Migration, Publish" — goal, depends-on, **5 success criteria** (the goal-backward verification target). **Note**: SC #1 monorepo wording and SC #4 separate-package wording are **superseded** per CLAUDE.md override (see `<spec_lock>` above); the doc-rewrite plan in this phase corrects them.

### Requirements (Phase 5 owns these REQ-IDs)
- `.planning/REQUIREMENTS.md` — `BUILD-01` (tshy dual ESM+CJS), `BUILD-02` (Node ≥20, CI 20/22/24), `BUILD-06` (single-package — **lock**), `BUILD-07` (attw + publint), `BUILD-08` (Vitest forks + threads), `BUILD-09` (Biome 2 + ESLint fallback), `DI-03` (TypeDI adapter — **reframed as docs-only per D-01**), `VAL-02` (Zod/Valibot/ArkType README docs), `DOCS-01` (30-line README example), `DOCS-02` (migration guide), `DOCS-03` (TypeDoc), `DOCS-04` (Keep-a-Changelog + Changesets + provenance).

### Phase 1–4 outputs (entire library surface — all stable; nothing added in Phase 5 except docs/build)
- `.planning/phases/01-metadata-decorator-skeleton/01-CONTEXT.md` — foundation; D-04..D-07 (WeakMap storage, decorator-as-pure-registrar, IoC contract). The DI hook recipe in D-01 of this phase consumes Phase 1's `useContainer(IocAdapter)`.
- `.planning/phases/02-runtime-express-adapter-happy-path/02-CONTEXT.md` — runtime + Express adapter; the "happy path" the README example exercises.
- `.planning/phases/03-middleware-interceptors-auth-error-handling/03-CONTEXT.md` — middleware/interceptor/auth surface documented in migration-guide chapter 4.
- `.planning/phases/04-uploads-cookies-sessions-render-request-context/04-CONTEXT.md` — slot-based file/cookie/session model + ALS request context; documented in migration-guide chapters 5–6 + README sections.
- `src/index.ts` — full public barrel; everything exported here is part of the v1 API and must appear in TypeDoc + migration guide where it differs from RC.
- `package.json` — current state (`name: "express-controllers"`, `type: "module"`, `engines.node: ">=20.0.0"`, peer `express: ^5.0.0`); Phase 5 updates: peer to `^5.1.0`, adds `exports`/`main`/`module`/`types` (tshy-managed), `prepublishOnly`, `repository`, `homepage`, `bugs`, `keywords`, `license`, `packageManager` (pnpm 10), `files` (`dist`, `README.md`, `CHANGELOG.md`, `LICENSE`, `MIGRATION.md`).
- `tsconfig.json` — current legacy-decorator config; Phase 5 may need a tshy-aware tsconfig split (`tsconfig.json` for editor + `tsconfig.build.json` for tshy) — planner decides per current tshy guidance.
- `vitest.config.ts` — extended for `test:forks` and `test:threads` scripts.

### State
- `.planning/STATE.md` — current position; Phases 1–4 complete; Phase 5 ready to plan; v1.0.0 milestone in progress.

### Research (from project bootstrapping; the `<research_summary>` Phase 5 was pre-flagged for in SUMMARY.md)
- `.planning/research/SUMMARY.md` §"Research Flags" — Phase 5 IS pre-flagged: "dual-package + Standard Schema ergonomics under real bundlers (webpack/vite/rollup smoke matrix); verify the (deferred-to-v1.x) class-validator quarantine pattern doesn't leak `reflect-metadata` into core consumer bundles." Planner SHOULD trigger `/gsd-research-phase` for the bundler smoke matrix (webpack/vite/rollup) — particularly to verify lazy-import expressions for cors / multer / cookie / tinyglobby transpile correctly under tshy in both module formats.
- `.planning/research/STACK.md` — full stack rationale (tshy, Vitest, Biome, Standard Schema, Zod/Valibot/ArkType peer ranges, pnpm).
- `.planning/research/ARCHITECTURE.md` — three-layer model documented in migration guide.
- `.planning/research/PITFALLS.md` — relevant for known dual-package, ESM/CJS interop, and `reflect-metadata` ordering pitfalls; migration guide cross-references where applicable.
- `.planning/research/FEATURES.md` — feature catalogue; cross-reference for migration-guide breaking-change table.

### External (publish-pipeline references — read before locking config)
- tshy docs (https://isaacs.github.io/tshy/) — `tsc`-based dual ESM+CJS, exports field generation, sub-path exports.
- `@arethetypeswrong/cli` README (https://github.com/arethetypeswrong/arethetypeswrong.github.io) — `attw --pack`; node10/node16/bundler resolution checks.
- publint docs (https://publint.dev/) — dual-package config validation rules.
- Changesets docs (https://github.com/changesets/changesets) — `changeset add`, `changeset version`, `changeset publish`, `pre enter rc` mode for RC ladders.
- npm provenance docs (https://docs.npmjs.com/generating-provenance-statements) — `--provenance` flag, GitHub Actions OIDC setup.
- GitHub Actions Changesets action (https://github.com/changesets/action) — Version Packages PR automation.
- Vitest pool docs (https://vitest.dev/config/#pool) — `forks` vs `threads` semantics; what a passing forks-only-and-failing-threads run signals.
- Biome v2 docs (https://biomejs.dev/) — config schema; lint rule baseline.
- TypeDoc docs (https://typedoc.org/) — entry-point config, theme options, GitHub Pages workflow.
- Keep-a-Changelog spec (https://keepachangelog.com/) — section ordering, semver mapping.
- Express v5 release notes (https://expressjs.com/2024/10/15/v5-release.html) — peer-range rationale; native async error.
- routing-controllers v0.11 source (https://github.com/typestack/routing-controllers) — migration guide reference for breaking-change documentation.

</canonical_refs>

<code_context>
## Existing Code Insights

### Current package.json shape (will be updated in Phase 5)
- `name: "express-controllers"` — matches D-02; verify availability before rc.1 publish.
- `version: "0.0.0"` — Changesets will manage (first published version `1.0.0-rc.1`).
- `type: "module"` — kept; tshy emits both ESM and CJS regardless of root `type`.
- `main: "./src/index.ts"` / `types: "./src/index.ts"` — DEV-only convenience; tshy replaces these with proper `exports` + `main` + `module` + `types` pointing into `dist/`.
- `engines.node: ">=20.0.0"` — matches BUILD-02; do not narrow.
- `dependencies: { "reflect-metadata": "^0.2.2" }` — runtime dep per Phase 1 D-05; stays.
- `peerDependencies.express: "^5.0.0"` — bump to `^5.1.0` per BUILD-03 (current value is too permissive).
- `peerDependenciesMeta` — extend with `optional: true` entries for `multer`, `cors`, `cookie`, `tinyglobby` per Phase 4 D-15 (lazy peers).
- `devDependencies` — add `tshy`, `@arethetypeswrong/cli`, `publint`, `typedoc`, `@biomejs/biome`, `@changesets/cli`. Already present: `vitest`, `@vitest/coverage-v8`, `typescript`, peers + their `@types/*`, `arktype` (validator smoke test).

### Existing src/ layout (stable; Phase 5 doesn't touch runtime code)
- `src/adapter/` — Phase 2/3/4 runtime; stable v1 surface.
- `src/container/` — `useContainer` + default WeakMap container (Phase 1 D-04..D-05); the recipe in D-01 of this phase plugs into this hook.
- `src/decorators/` — full decorator surface; documented in TypeDoc + migration guide.
- `src/errors/` — `HttpError` family.
- `src/guard/` — runtime guard (Phase 1 / BUILD-04) — README's tsconfig snippet's existence rationale.
- `src/interfaces/` — public-facing interfaces.
- `src/metadata/` — `MetadataBuilder` + storage WeakMaps.
- `src/types/` — public type-only re-exports including `StandardSchemaV1`.
- `src/index.ts` — public barrel; tshy entry point.

### Established patterns (must be honored in Phase 5)
- **Single-package repo** (BUILD-06; CLAUDE.md override) — no `packages/*` directories, no `pnpm-workspace.yaml`, no workspace protocol references.
- **Lazy peer imports** (Phase 4 D-15) — Phase 5's `attw`/`publint`/bundler-smoke check must verify these `import()` expressions transpile correctly in both ESM and CJS dist outputs. This is the load-bearing concern flagged for `/gsd-research-phase` in research/SUMMARY.md.
- **Zero global state in core** (cross-phase) — Phase 5 doesn't introduce any.
- **No `reflect-metadata` leakage into consumer bundles via optional adapters** — research/SUMMARY.md flags the (deferred-to-v1.x) class-validator quarantine pattern. Phase 5 doesn't ship the class-validator adapter, so the concern is reduced to "don't accidentally re-export `reflect-metadata`" and "lazy peers must not pull `reflect-metadata` transitively". Verified by `attw --pack` + a manual bundler smoke during planning.

### Integration Points
- **Phase 5 → npm** — `1.0.0-rc.1` is the first artifact; `1.0.0` is the milestone deliverable. Once `1.0.0` ships, the public API in `src/index.ts` is locked under semver — any breaking change from that point requires a major bump.
- **Phase 5 → users** — README + migration guide + TypeDoc are the user-facing surface. The 30-line example (D-10) is the smoke test for "can a new user actually use this library."
- **Phase 5 ↔ Phase 1–4** — Phase 5 reads through every prior phase's public surface; it adds NO new runtime code (only docs/build/CI/governance). If a planning conflict surfaces (e.g., a public symbol's name reads awkwardly in TypeDoc), the fix is in this phase via a minor public-API rename — but with the explicit cost that any rename touches Phases 1–4's tests too. Avoid renames unless TypeDoc readability is genuinely broken.

</code_context>

<specifics>
## Specific Ideas

- **`express-controllers` (unscoped) with `@nirajk/express-controllers` fallback** (D-02) — planner verifies via `npm view express-controllers` in plan-1.
- **RC ladder: `1.0.0-rc.1` → iterate → `1.0.0`** (D-03) — Changesets `pre enter rc` mode; npm `next` dist-tag during RC; promote to `latest` on `1.0.0` ship.
- **30-line README example: CRUD `@JsonController`** (D-10) — one `@Get('/:id', { params })` + one `@Post('/', { body })`, Zod, tsconfig snippet immediately below the code block.
- **Migration guide leads with parameter-decorator → method-level input** (D-11) — chapter 1 is the BIG break; everything else lives in the Breaking Changes table + 5–7 short recipe chapters.
- **TypeDI is a docs recipe, not a package** (D-01) — `useContainer({ get: t => Container.get(t) })`, presented uniformly with tsyringe/Awilix in the README's DI section.
- **CI matrix is small and Linux-only** (D-07) — Node 20/22/24 × {forks, threads} = 6 jobs; Express 5.2.x; no OS matrix.
- **GitHub Pages for TypeDoc** (D-09) — published from the same release workflow as npm.
- **MIT license, pnpm 10 dev, minimal governance** (D-13/D-14/D-15) — LICENSE + CONTRIBUTING + README + CHANGELOG + repository URL is the governance set for v1.
- **Reframe DI-03 + ROADMAP SC #1/#4** (spec_lock note) — plan-1 of this phase rewrites REQUIREMENTS.md DI-03 wording, ROADMAP.md Phase 5 SC #1 (single-package not monorepo), ROADMAP.md SC #4 (docs-only adapter recipe), and the duplicated "Plans" subsection (currently mirrors Phase 4 filenames).

</specifics>

<deferred>
## Deferred Ideas

- **Separate `@scope/express-controllers-typedi` npm package** — rejected for v1 per single-package rule (D-01). Reconsider in v1.x ONLY if a real user request surfaces with a strong reason a docs recipe doesn't suffice.
- **class-validator legacy adapter** — PROJECT.md schedules for v1.x. If shipped, MUST stay quarantined behind a sub-path export (`<lib>/adapters/class-validator`) and its `reflect-metadata` leakage verified by bundler smoke.
- **Documentation site** (Vite/Starlight/VitePress) — README + TypeDoc HTML on GitHub Pages is sufficient for v1. Revisit if the README outgrows itself.
- **Codemods for migration** — explicitly out of scope per PROJECT.md.
- **OS matrix in CI** (Windows / macOS) — defer until a real OS-specific bug is reported.
- **Express 5.1.x cell in CI matrix** — peer range covers it; testing 5.2.x only is sufficient signal. Add 5.1 cell if a regression specific to 5.1 is reported.
- **CODE_OF_CONDUCT.md / SECURITY.md / issue templates / PR templates** — defer to v1.x unless trivially cheap during plan execution.
- **Configurable `requestIdHeader`, pluggable `printRoutes` sink, `@Render` shared locals, etc.** — all Phase 4 deferrals; remain deferred.
- **Auto-injection by `design:paramtypes`** — Phase 1 deferral; remains deferred. README explicitly documents the `useContainer` recipe as the way to wire DI.
- **Bundler smoke matrix** beyond a single sanity check — research/SUMMARY.md flagged webpack/vite/rollup smoke. Plan 1 of this phase MAY fold the smoke into a `examples/bundler-smoke/` ignored-in-publish folder that CI runs once per PR. Planner decides whether to do all three or pick one (likely Vite, the most common consumer story).
- **Promote name to scoped `@expresscontrollers/core`-style branding** — defer until ecosystem signals a sub-package family is needed (which contradicts the single-package rule, hence unlikely).
- **README badges beyond standard set** — GitHub stars, downloads, etc. Standard set first; revisit at v1.0.0+.

</deferred>

---

*Phase: 5-Adapter Packages, Build, Docs, Migration, Publish*
*Context gathered: 2026-05-10*
