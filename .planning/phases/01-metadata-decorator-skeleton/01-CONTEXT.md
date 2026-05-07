# Phase 1: Metadata & Decorator Skeleton - Context

**Gathered:** 2026-05-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Foundational decorator surface, per-class metadata model, error class hierarchy, and pluggable IoC contract — pure logic, **zero Express imports**. Built on legacy `experimentalDecorators` + `emitDecoratorMetadata` + `reflect-metadata` so constructor/parameter type metadata is available to the runtime. Single-package repo. Every other phase consumes this layer.

In scope (from ROADMAP.md Phase 1):
- `@Controller` / `@JsonController` and method decorators (`@Get`/`@Post`/`@Put`/`@Patch`/`@Delete`/`@Head`/`@All`/`@Method`)
- `MetadataBuilder.build([Class])` returning a fully-resolved tree (controllers → actions → input declarations → response shapers), with controller inheritance resolved
- `HttpError` base + 4xx/5xx subclasses (toJSON-serializable, ES2022 `cause`)
- `useContainer(IocAdapter)` hook + default lazy-`new` WeakMap-cached fallback
- Type-only `StandardSchemaV1` re-export and `Action` value shape
- Runtime guard: actionable error if `experimentalDecorators` / `emitDecoratorMetadata` / `reflect-metadata` is missing
- Response-shaper decorators referenced by RES-01/02/03 (`@HttpCode`, `@OnNull`, `@OnUndefined`, `@Header`, `@ContentType`)

Out of scope (deferred to later phases):
- Any Express imports, routing, or HTTP wiring (Phase 2)
- Schema validation runtime (Phase 2 — Phase 1 stores schemas opaquely as part of the input declaration)
- Middleware / interceptor / `@Authorized` runtime (Phase 3)
- Cookies, sessions, uploads, render, ALS context (Phase 4)
- Build pipeline, dual ESM+CJS, publish (Phase 5)

</domain>

<decisions>
## Implementation Decisions

### Direction reconciliation (meta — pre-planning chore)
- **D-01:** REQUIREMENTS.md `BUILD-04`, `BUILD-05`, `BUILD-06` and STATE.md "Key Decisions Locked-In" still describe the **old** direction (Stage 3 decorators, no `reflect-metadata` in core, pnpm-workspaces monorepo). They are **stale**. They MUST be rewritten to match the CLAUDE.md override + ROADMAP Phase 1 (legacy `experimentalDecorators: true` + `emitDecoratorMetadata: true`, `reflect-metadata` IS a core dep, single-package repo).
- **D-02:** The rewrite happens **before `/gsd-plan-phase 1`** as its own commit. Scope: surgical edits to `BUILD-04`/`BUILD-05`/`BUILD-06` wording, the "Key Decisions Locked-In" bullets in `STATE.md`, the `Out of Scope` line that says "class-validator support — incompatible with Stage 3 decorators". Do NOT renumber requirement IDs (preserves traceability table).
- **D-03:** Coverage table and per-phase requirement assignments stay unchanged — only the *content* of BUILD-04/05/06 changes.

### Metadata storage strategy
- **D-04:** **Hybrid storage.** Core uses module-private `WeakMap`s for its own metadata tree state, and `reflect-metadata` ONLY for TS-emitted type metadata (`design:paramtypes`, `design:returntype`, `design:type`).
  - `WeakMap<Function /* Class ctor */, ControllerMeta>` for class-level decorator output (`@Controller` / `@JsonController` base path, `routePrefix`, controller-level response shapers, etc.).
  - `WeakMap<object /* prototype */, Map<string|symbol, MethodMeta>>` for method-level decorator output (verb, path, optional input declaration, response shaper overrides).
  - Decorators NEVER call `Reflect.defineMetadata` to store library state. They DO call `Reflect.getMetadata('design:paramtypes', proto, key)` / `('design:returntype', proto, key)` to read TS-emitted types.
- **D-05:** **Rationale (capture for downstream agents):** WeakMap keys are bounded to the actual class refs the user passes in, eliminating namespace collisions with consumer code or other libraries that use `reflect-metadata`. It also avoids the dual-package-hazard footgun where two copies of the library would otherwise share a global Reflect store and silently overwrite each other's keys.
- **D-06:** **Inheritance handled by `MetadataBuilder`, not by decorators.** Decorators write only to the immediate class/prototype's WeakMap entry. `MetadataBuilder.build([SubClass])` walks `Object.getPrototypeOf(proto)` upward until null, merging method metadata top-down. On method-name collision the **subclass wins** (override semantics matching routing-controllers). Class-level metadata (basePath, controller-level shapers) follows the same walk: subclass class meta overrides base class meta where present, otherwise inherits.
- **D-07:** Decorator authoring contract: every decorator factory is a pure registrar — read TS type metadata if needed, mutate the appropriate WeakMap, return. No prototype-chain walking inside decorators (registration order would otherwise become load-bearing).

### Claude's Discretion
The user explicitly said "I'm ready for context" instead of discussing these — they're delegated to research + planner:
- **HttpError API surface** — exact constructor signatures, `toJSON()` shape, `details`/`source` field policy, ES2022 `cause` chaining, stack-trace policy. Must be lockable before Phase 2 (Phase 2 raises a `BadRequestError` with field-level error details and a `source` field, so the field shape is forced by Phase 2 SC #2).
- **`src/` folder layout** — flat vs grouped-by-concern vs routing-controllers mirror. Pick whichever the planner finds best supports the layered architecture in `research/ARCHITECTURE.md`.
- **Runtime mode guard** — detection strategy (probe at first decorator use vs at `MetadataBuilder.build()` vs both) and error-message wording. Must satisfy ROADMAP Phase 1 SC #2 ("clear runtime error … naming the project and pointing to documentation"). Rewritten BUILD-04 (per D-02) is the source of truth for the *direction* of the guard.
- **Public exports surface** — package-root barrel must include the items in ROADMAP Phase 1 SC #5 (`StandardSchemaV1` type-only re-export, `Action` value shape) plus all decorators, `HttpError` + subclasses, `useContainer`, `IocAdapter`, `MetadataBuilder.build`. Whether to expose the resolved metadata tree types (`ControllerMetadata`, `ActionMetadata`, etc.) — recommended yes (type-only) so adapter packages can consume them.
- **Method-level input declaration handling in Phase 1** — Phase 1 captures `{ params, query, body, headers }` from the method-decorator second arg into `MethodMeta.input` *opaquely* (treats schemas as `unknown` / `StandardSchemaV1 | undefined`). Phase 2 owns parsing/validation. No structural validation of the declaration shape in Phase 1 beyond TypeScript types.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project direction (truth — read first)
- `CLAUDE.md` §"Project" + §"Technology Stack" + §"Direction Override (2026-05-08)" — authoritative direction; supersedes any "Stage 3" / "monorepo" / "no reflect-metadata" wording elsewhere.
- `.planning/PROJECT.md` — project mission, constraints, audience.
- `.planning/ROADMAP.md` §"Phase 1: Metadata & Decorator Skeleton" — goal, depends-on, mapped requirements, **5 success criteria** (the goal-backward verification target).

### Requirements (note: stale until D-02 rewrite lands)
- `.planning/REQUIREMENTS.md` — full v1 requirement list. Phase 1 owns: `BUILD-04`, `BUILD-05`, `ROUTE-01`, `ROUTE-02`, `ROUTE-03`, `RES-01`, `RES-02`, `RES-03`, `RES-07`, `ERR-01`, `ERR-02`, `VAL-01`, `DI-01`, `DI-02`. **`BUILD-04`/`BUILD-05`/`BUILD-06` wording is currently stale (Stage 3 / no reflect-metadata / monorepo) — rewrite per D-02 before the planner reads this file.**

### Research (read for context, but Stage-3-era assumptions are overridden)
- `.planning/research/SUMMARY.md` — research synthesis.
- `.planning/research/ARCHITECTURE.md` — three-layer model (decorator → metadata → driver) lifted from routing-controllers internals; the *shape* is preserved, the *implementations* are modernized. Treat any "Stage 3 / Symbol.metadata" specifics as superseded by D-04/D-05/D-06.
- `.planning/research/STACK.md` — tooling choices (tshy, Vitest 3, Biome 2). Decorator/repo-shape sections are superseded by CLAUDE.md override.
- `.planning/research/PITFALLS.md` — known footguns; relevant especially for the runtime guard message.
- `.planning/research/FEATURES.md` — feature catalogue traced to requirements.

### State
- `.planning/STATE.md` — current position. **"Key Decisions Locked-In" bullets are stale (Stage 3 / monorepo / no reflect-metadata) — rewrite per D-02 before the planner reads this file.**

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **None.** Greenfield — no `src/`, no `package.json`, no prior code at the repo root. Phase 1 is the first source-producing phase.

### Established Patterns
- **None yet.** Phase 1 *establishes* the patterns later phases inherit (decorator authoring contract per D-07, metadata storage per D-04, inheritance walk per D-06, package-root export surface).

### Integration Points
- Phase 2 (`Runtime + Express Adapter`) consumes `MetadataBuilder.build([Class])` output and `HttpError` subclasses; the resolved metadata tree shape and `HttpError` constructor signatures are the cross-phase contract.
- Phase 5 (`Build, Publish`) consumes the package-root export surface — additions or renames there are breaking changes once v1 ships.

</code_context>

<specifics>
## Specific Ideas

- Decorators write to module-private WeakMaps; do NOT use `Reflect.defineMetadata` for library state. Reserve `reflect-metadata` reads for `design:paramtypes`/`design:returntype`/`design:type` only (the TS-emitted keys).
- WeakMap shape is locked: `WeakMap<Function, ControllerMeta>` keyed by class constructor; `WeakMap<object, Map<string|symbol, MethodMeta>>` keyed by class prototype. The inner `Map` keying by `string|symbol` matters — methods can have symbol keys.
- Inheritance merge order: walk `Object.getPrototypeOf(proto)` upward; subclass overrides base on collision. Class-level meta follows the same walk.
- Phase 1 stores the optional input declaration `{ params, query, body, headers }` opaquely; downstream Phase 2 parses/validates via Standard Schema's `~standard` property.
- Pre-planning chore: rewrite REQUIREMENTS.md `BUILD-04`/`BUILD-05`/`BUILD-06` and STATE.md "Key Decisions Locked-In" + the `Out of Scope` class-validator line as a single dedicated commit, then run `/gsd-plan-phase 1`.

</specifics>

<deferred>
## Deferred Ideas

- **`@scope/express-controllers-typedi` adapter package** — `DI-03`, lives in Phase 5; Phase 1 only ships the `IocAdapter` contract + default WeakMap container.
- **Class-validator legacy adapter** — currently `Out of Scope` for v1 in REQUIREMENTS.md. With the direction override (legacy decorators + `reflect-metadata` already in core), the *technical* blocker is gone — class-validator could now be supported as an optional adapter package. **Decision NOT taken in this phase.** Revisit at v1.x or in a future Phase-5-style packaging discussion. The current `Out of Scope` rationale ("incompatible with Stage 3 decorators") is itself stale and is part of the D-02 doc rewrite scope (rewrite the rationale, but keep the item in `Out of Scope` for v1 to honor the existing scope decision).
- **Auto-injection by constructor type via `design:paramtypes`** — technically possible now that `reflect-metadata` is in core, but project policy keeps DI strictly pluggable. Document non-goal explicitly; revisit only if a concrete user demand surfaces.

</deferred>

---

*Phase: 1-Metadata & Decorator Skeleton*
*Context gathered: 2026-05-08*
