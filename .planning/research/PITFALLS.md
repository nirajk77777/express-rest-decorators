# Pitfalls Research

**Domain:** TypeScript decorator-based REST controller library on Express v5
**Researched:** 2026-05-07
**Confidence:** HIGH (Express v5 migration, TC39 Stage 3 decorators, dual-package hazard verified against official docs and GitHub issues; routing-controllers-specific pitfalls cross-referenced against its CHANGELOG and README)

---

## Critical Pitfalls

### Pitfall 1: Parameter decorators don't exist in TC39 Stage 3

**What goes wrong:**
The most-used decorators in routing-controllers — `@Body()`, `@Param()`, `@QueryParam()`, `@HeaderParam()`, `@Req()`, `@Res()`, `@CurrentUser()`, etc. — are **parameter decorators** in legacy TS (`experimentalDecorators`). TC39 Stage 3 has **no parameter decorators at all**. A naive port "just compiles" against `experimentalDecorators: false` and then silently breaks: parameter metadata is never registered, all handler arguments arrive as `undefined`, and 90% of the public API stops working.

**Why it happens:**
Library authors assume "Stage 3 decorators" means "decorators, but with new syntax." It doesn't. TC39 deliberately omitted parameter decorators (still Stage 1, no consensus). InversifyJS hit this exact wall and had to redesign `@inject`.

**How to avoid:**
- Move parameter binding off parameters entirely. Two viable patterns:
  - **(A) Method-level binding decorator:** `@Get('/users/:id') @Bind({ id: Param('id'), body: Body() }) getUser(args) {…}` — single decorator on the method declaratively wires args.
  - **(B) Builder/inline accessors:** No parameter decorator at all; expose `req.body`, `req.params.id` via a typed `ctx`/`req` object passed as the first arg, with optional schema-validated DTOs via a method decorator.
- Whatever shape is chosen, document it as the headline breaking change vs routing-controllers; do not pretend `@Body()` on a parameter still works.
- Provide a codemod-or-recipe in the migration guide showing the 1:1 transform.

**Warning signs:**
- TS compiles but every handler receives `undefined` args at runtime.
- README examples still show `@Get() get(@Param('id') id: string)` — that is legacy syntax and will not work.
- Tests pass under `experimentalDecorators: true` and fail under `false`.

**Phase to address:**
**Phase 1 (Architecture/API design)** — this is the single biggest API-shape decision; getting it wrong means a v2 rewrite.

---

### Pitfall 2: `emitDecoratorMetadata` is legacy-only and `Symbol.metadata` is the new game

**What goes wrong:**
Library author enables `emitDecoratorMetadata: true` expecting `design:paramtypes` to flow into Stage 3 decorators. It doesn't — `emitDecoratorMetadata` only emits when `experimentalDecorators: true`. With Stage 3, type metadata must be obtained via:
- `Symbol.metadata` (the spec'd `context.metadata` object inside decorators), or
- explicit user-provided types (zod schemas, classes passed as args), or
- a separate TS transformer (`typescript-rtti`, `ts-reflect`).

If the library silently relies on `reflect-metadata` + `design:paramtypes`, type-driven coercion (string → number for `:id`, JSON parse for body, etc.) silently produces `undefined` or wrong types.

**Why it happens:**
Carry-over assumption from the routing-controllers world where `reflect-metadata` is mandatory. Stage 3 decorators receive a `context` object with a `metadata` property (per `Symbol.metadata` proposal, available natively in Node 22+ and via polyfill earlier).

**How to avoid:**
- Do **not** require `reflect-metadata` for the core runtime. State this explicitly.
- Pass types **explicitly**: `@Bind({ id: Param('id', Number), body: Body(CreateUserSchema) })`. The schema or constructor *is* the type information.
- If `Symbol.metadata` is used, polyfill it once at entry (`(Symbol as any).metadata ??= Symbol.for('Symbol.metadata')`) and document Node version requirement.
- Make the validation adapter responsible for coercion — don't reinvent it inside the router.

**Warning signs:**
- `package.json` has `reflect-metadata` in `dependencies` (not `peerDependencies` or absent).
- Internal code reads `Reflect.getMetadata('design:paramtypes', …)`.
- Examples that say "import 'reflect-metadata'" at top of every file.

**Phase to address:**
**Phase 1 (Architecture)** — decide metadata strategy before any decorator is written.

---

### Pitfall 3: Consumer/library decorator-mode mismatch silently miscompiles

**What goes wrong:**
Library is authored with Stage 3 decorators. A consumer's `tsconfig.json` still has `experimentalDecorators: true`. Consumer decorators on their controller are interpreted as **legacy** decorators while the library's runtime expects **Stage 3** decorator-context shape. Symptoms: `context is undefined`, `addInitializer is not a function`, decorators run but registrations never happen.

**Why it happens:**
Decorator semantics are determined by the **caller's** tsconfig, not the library's. There's no runtime check. Many existing codebases still have `experimentalDecorators` on for legacy reasons (TypeORM, NestJS pre-11, class-validator, InversifyJS).

**How to avoid:**
- Defensive runtime detection in every decorator: check `typeof context === 'object' && context !== null && 'kind' in context`. Throw a loud, actionable error otherwise: `"Express-controllers requires TC39 Stage 3 decorators. Set 'experimentalDecorators': false (or remove it) in tsconfig.json. See <docs URL>."`
- README's installation section must list a tsconfig snippet as **required**, not optional.
- Provide a `verifyDecoratorMode()` helper users can call at boot.

**Warning signs:**
- Mysterious "cannot read property 'kind' of undefined" stack traces from inside the library.
- Users reporting "decorators don't seem to fire."

**Phase to address:**
**Phase 1 (Architecture)** for the runtime guard; **Phase N (Docs/Migration)** for the install instructions.

---

### Pitfall 4: Module-level `MetadataArgsStorage` global singleton

**What goes wrong:**
routing-controllers stores all decorator registrations in a module-scoped `defaultMetadataArgsStorage` singleton. This breaks in three real scenarios:
1. **Two versions installed** (monorepo, peer-dep mismatch): each gets its own singleton; controllers registered against version A are invisible to version B's `createExpressServer`.
2. **HMR / hot reload / Vitest module reset:** decorators re-register on each reload, accumulating duplicate routes, leading to "header already sent" or duplicate handler invocations.
3. **Multi-instance:** can't run two isolated app instances (e.g. test harness + main app) in the same process.

**How to avoid:**
- No module-level mutable state for registrations. Either:
  - **Per-app registry:** decorators stash metadata on the **class itself** (via `Symbol.metadata` or a `WeakMap<Class, Metadata>`), and `createExpressApp({ controllers: [...] })` reads from the passed classes — never from a global store.
  - **Explicit bootstrap:** users must pass class references; the library never auto-discovers from a global.
- If a registry is unavoidable, key it by a `Symbol.for('express-controllers/registry/v1')` so duplicate copies share state, and make registration idempotent (de-dupe on class identity).
- Test explicitly: spin up two `createExpressApp` instances in one Vitest worker and assert they don't cross-pollute.

**Warning signs:**
- `export const defaultStorage = new MetadataArgsStorage()` at module top.
- Decorators have side effects on import (push into global array).
- Vitest tests fail when run together but pass individually.

**Phase to address:**
**Phase 1 (Architecture)** — this is structural; cannot be retrofitted.

---

### Pitfall 5: Side-effectful decorator imports break tree-shaking and SSR

**What goes wrong:**
If decorators register into a global as a *side effect of evaluating the class*, then importing a controller file always pulls it into the bundle and runs its registration even when unused. This bloats serverless cold starts and breaks `sideEffects: false` declarations.

**How to avoid:**
- Decorators should only **annotate** classes (attach metadata to the class). The act of *registering* a controller with the app happens explicitly via `createExpressApp({ controllers: [UserController] })`.
- Set `"sideEffects": false` in `package.json` and verify with a bundler test.
- No top-level work in any module the user imports.

**Warning signs:**
- A controller imported but never passed to `createExpressApp` still produces routes.
- Bundle analyzer shows controller code in chunks that don't reference it.

**Phase to address:**
**Phase 1 (Architecture)**, verified in **Phase N (Build/Publish)**.

---

### Pitfall 6: Express v5 `path-to-regexp` v8 strictness — wildcard, optional, regex

**What goes wrong:**
Express v5 ships `path-to-regexp` v8, which is strictly stricter than v6/v0.1.x:
- Bare `*` is **invalid** — must be a named splat: `/*splat`. `app.all('*', …)` throws `Missing parameter name at position 1`.
- Optional `?` syntax changed: `/users/:id?` → `/users{/:id}` (braces).
- Regex in routes (`/users/:id(\\d+)`) **removed entirely**. No more inline regex parameters.
- Wildcards capture as **arrays** of path segments, not strings: `req.params.splat = ['a','b','c']`, not `'a/b/c'`.
- Named params disallow some characters that v0.1 allowed.

If the library auto-builds Express paths from decorator strings (e.g. `@Get('/users/*')`), every existing routing-controllers app breaks.

**How to avoid:**
- Document the v5 path syntax explicitly in `@Get`/`@Post`/etc. JSDoc with examples.
- Validate path strings at **registration time** (not request time): try `pathToRegexp.parse(path)` in a wrapper and throw a clear error pointing at the controller and method.
- Provide a codemod or migration table in the migration guide: `*` → `*splat`, `:id?` → `{/:id}`, `:id(\\d+)` → use a validator instead.
- Add a test fixture covering: bare splat, named splat, optional segment, root-with-splat (`/{*splat}`), nested params.

**Warning signs:**
- TypeError thrown at boot, not runtime.
- Users reporting "worked in routing-controllers, fails on startup."

**Phase to address:**
**Phase 2 (Adapter / Routing)** — first real interaction with Express.

[Sources: [expressjs/express#6606](https://github.com/expressjs/express/issues/6606), [Migrating to Express 5](https://expressjs.com/en/guide/migrating-5.html)]

---

### Pitfall 7: Removed Express v4 APIs the library used to lean on

**What goes wrong:**
Express v5 removed:
- `req.param(name)` — must use `req.params[name]` / `req.query[name]` / `req.body[name]` directly.
- `app.del(...)` — use `app.delete(...)`.
- `res.send(status, body)` — use `res.status(status).send(body)`.
- `res.sendfile()` (lowercase) — use `res.sendFile()`.
- `res.json(status, body)`, `res.jsonp(status, body)` — same status/body separation.
- `req.acceptsCharset` / `Languages` (singular) — pluralized.
- `app.param(fn)` (function form) — only the named form remains.
- Implicit `body-parser` — Express v5 ships `express.json()` and `express.urlencoded()` built-in; the standalone `body-parser` package is not auto-loaded.

routing-controllers historically did `res.send(code, body)` in some code paths. A direct port keeps these and silently fails (TypeError at runtime, or wrong response).

**How to avoid:**
- Audit every Express call site against the v5 migration guide before porting. Maintain a checklist as a code comment.
- Use the v5 built-ins for body parsing; do not depend on `body-parser` package.
- Lint rule or grep CI step that fails on `res.send(`<number>`, `, `app.del`, `req.param(`.

**Warning signs:**
- `npm test` passes locally on Express 4.x in `node_modules` cache; fails on fresh install with v5.
- TS types accept the call (legacy `@types/express` lying) but runtime throws.

**Phase to address:**
**Phase 2 (Adapter)** — initial Express integration.

---

### Pitfall 8: Express v5 native async error handling — don't double-wrap

**What goes wrong:**
Express v5 natively awaits returned promises and forwards rejections to error middleware. routing-controllers v4-era handlers wrap every action in a try/catch + `next(err)` shim. Porting that wrapper into v5 causes:
- **Double error reporting:** error middleware fires twice (once from try/catch's `next(err)`, once from Express's own promise handling), or
- **Swallowed errors** if the wrapper catches and resolves silently while Express expects rejection,
- **`Cannot set headers after they are sent`** when both the wrapper and Express attempt to write a response.

**How to avoid:**
- Adapter handlers should be `async (req, res, next) => { … }` and **return** (or `throw`) — let Express v5 propagate. No `.catch(next)` or `try { … } catch (e) { next(e) }`.
- The interceptor/error chain should run as middleware, not as a wrapper around the handler.
- Test: throw inside a handler, throw inside a middleware, reject a promise — all three should reach the error handler exactly once.

**Warning signs:**
- Error handler is invoked twice.
- "Cannot set headers after they are sent" in error scenarios.
- Double logging of the same exception.

**Phase to address:**
**Phase 2 (Adapter)** — explicit non-goal to port the v4 wrapper.

---

### Pitfall 9: Coupling validation/transformation lib to core (the class-validator trap)

**What goes wrong:**
routing-controllers historically hard-coupled `class-validator` and `class-transformer` to the core. Consequences:
- Users who don't validate still pull both into their bundle (~50KB+).
- Users on zod/valibot fight the library instead of using it.
- Security CVEs in class-validator (e.g. `forbidUnknownValues` default flip in 0.14.0) caused breaking changes in routing-controllers itself.
- `class-validator` requires `experimentalDecorators` — fundamentally incompatible with this project's Stage 3 stance.

**How to avoid:**
- **No validator in core.** Define a minimal `ValidationAdapter` interface:
  ```ts
  interface ValidationAdapter<TSchema = unknown> {
    validate(schema: TSchema, value: unknown): { success: true; data: unknown } | { success: false; error: ValidationError };
  }
  ```
- Ship adapters as separate packages: `@express-controllers/zod`, `@express-controllers/valibot`. class-validator adapter is optional and clearly flagged as "requires experimentalDecorators" — likely not viable given Stage 3 commitment; surface this tradeoff up front.
- Core depends on zero schema libraries. `peerDependencies` only.

**Warning signs:**
- `import { validate } from 'class-validator'` in core.
- `class-transformer` in `dependencies`.
- Bundle includes validation code when no validator is configured.

**Phase to address:**
**Phase 1 (Architecture)** — adapter contract; **Phase 3+** for first adapter implementation.

---

### Pitfall 10: DI container abstraction (`useContainer`) leaks and confuses

**What goes wrong:**
routing-controllers' `useContainer(Container)` is a global mutable hook. Failure modes:
- Set after `createExpressServer` ran → some controllers instantiated with default `new`, some via container → state inconsistency.
- Multiple containers in one process (test harness + app) — can't.
- `getFromContainer` falls back silently to `new` for unknown classes — surprising debugging.
- Users without DI pay for the abstraction (an extra indirection on every request) without benefit.
- Coupling to TypeDI/InversifyJS docs for a feature most users don't need.

**How to avoid:**
- **Default to plain `new ControllerClass()`** with no DI.
- Expose a single per-app option: `createExpressApp({ controllers, instantiate: (Class) => myContainer.get(Class) })`. No global `useContainer`. No fallback magic — if `instantiate` throws, surface that clearly.
- Document that DI is fully the user's problem; library does not import or know about TypeDI/Inversify/tsyringe.
- Validate the open question (PROJECT.md): may end up DI-agnostic with no API at all, just `new ControllerClass()`. That's a legitimate v1 shipping answer.

**Warning signs:**
- Module-level `let container = …` mutable export.
- "DI works in dev but breaks in tests" reports.
- Library imports any DI library directly.

**Phase to address:**
**Phase 1 (Architecture)** — decide DI surface; **Phase N (Docs)** to document it as user-owned.

---

### Pitfall 11: Dual ESM + CJS package hazard

**What goes wrong:**
Shipping both `dist/index.cjs` and `dist/index.mjs` from the same package introduces multiple traps:
1. **Dual instance hazard:** A consumer's bundle pulls in the ESM copy; a transitive dep pulls in the CJS copy. Two copies of the library run side-by-side. Module-scoped state (registries, singletons) diverges. `instanceof Controller` fails across copies.
2. **Wrong types resolved:** `"types"` in `exports` must come **first** in each conditional; `"import"`/`"require"` ordering matters; nodenext vs bundler resolution disagrees.
3. **Top-level `import { X } from './subpath'`** without the `.js` extension breaks ESM at runtime even though TS compiles fine.
4. CJS consumers calling top-level-await ESM dependency → blows up.
5. `__dirname` / `import.meta.url` used wrong in the dual build.

**How to avoid:**
- **Strongly consider ESM-only.** Modest-adoption greenfield in 2026 + Node 20+ peer dep + Vitest tests = ESM-only is defensible and removes the entire dual-package class of bugs. Document as a deliberate stance.
- If dual is required, use `tsup` or `tshy` with verified output and the canonical exports map:
  ```json
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs"
    }
  }
  ```
- `"type": "module"` + `.cjs` for the CJS file (not the other way around).
- All internal imports use `.js` extension (compiled-output relative, ESM-correct).
- `arethetypeswrong` CLI in CI: `npx @arethetypeswrong/cli pack`.
- `publint` in CI.
- No module-scoped mutable state (covered by Pitfall 4) — eliminates the dual-instance hazard's worst symptom.

**Warning signs:**
- `attw` / `publint` warnings.
- Consumer reports "MODULE_NOT_FOUND" or "type X is not assignable to type X" (two copies).
- Runtime `instanceof` checks failing.

**Phase to address:**
**Phase N (Build/Publish)** — but the no-global-state architectural decision in **Phase 1** is what makes the dual hazard survivable.

---

### Pitfall 12: Peer dep range too narrow or too wide

**What goes wrong:**
- `"express": "^5.0.0"`: tight today, fine. But if Express releases v6 with a breaking path-to-regexp change, this library silently allows install — users hit runtime issues.
- `"express": ">=5"`: too loose; future v6 breaks unannounced.
- `"typescript": "^5.0.0"`: TS 5.0 had Stage 3 decorators with quirks; 5.2+ stabilized. A user on 5.0 might hit obscure decorator-context bugs.
- Forgotten peer deps (e.g. forgetting to declare `express` as peer at all).

**How to avoid:**
- `peerDependencies`: `"express": "^5.0.0"`, `"typescript": ">=5.2 <6"`. Pin minimums to versions actually tested in CI.
- CI matrix tests against multiple Express 5.x and TS versions.
- `peerDependenciesMeta` for optional adapters.
- Bump major version of this library when bumping peer-dep majors.

**Warning signs:**
- Users on TS 5.0 reporting weird decorator behavior.
- Express v6 prerelease in user env (unpinned `>=5`) introduces unexpected breaks.

**Phase to address:**
**Phase N (Build/Publish)**.

---

### Pitfall 13: Middleware ordering surprises (decorator order vs. registration)

**What goes wrong:**
Decorators on a class evaluate **bottom-to-top** for class decorators and **top-to-bottom** for method decorators in TC39 Stage 3 (which differs from legacy in subtle ways). Users write:
```ts
@UseBefore(Auth)
@UseBefore(Logger)
@Get('/x')
handler() {}
```
…and expect Auth-then-Logger or Logger-then-Auth based on visual order — but the actual execution order depends on (a) how the library *registers* them with Express (push vs unshift), (b) decorator evaluation order, and (c) global middleware ordering relative to per-route. Subtle, hard-to-debug, often "works in dev, fails in prod."

**How to avoid:**
- Define and document a **single, explicit order rule**: "Middleware executes in the visual top-to-bottom order they appear in source." Implement to match.
- Provide an array form to remove ambiguity: `@UseBefore([Auth, Logger])` runs in array order.
- Test middleware ordering deterministically: a vitest fixture that registers 3 middlewares with side effects into an array and asserts the array's contents exactly.
- Document the relationship between class-level and method-level middleware (class wraps method, both wrap handler).

**Warning signs:**
- Users asking "why does my auth middleware run after my logger?"
- Different behavior between Node 20 and 22 (decorator evaluation timing changed in some prereleases).

**Phase to address:**
**Phase 2 (Adapter)** — implement; **Phase N (Docs)** — document.

---

### Pitfall 14: "Magic" 500s — debuggability of decorator-driven errors

**What goes wrong:**
Decorator-based frameworks tend to swallow stack traces. User sees `500 Internal Server Error` with no clue whether it came from a validator, an interceptor, the handler, the response transformer, or an error handler. routing-controllers users have repeatedly complained about this on GitHub.

**How to avoid:**
- Every internal layer wraps the underlying error with `cause` (ES2022 native): `throw new ValidationFailedError('body validation failed', { cause: zodError })`.
- Library-thrown errors have a clear discriminating type and a `source` field (`'validation' | 'auth' | 'handler' | 'interceptor' | 'transformer'`).
- A `debug` namespace (`debug('express-controllers:routing')`, `:dispatch`, `:error`) for opt-in tracing — same pattern Express uses.
- Default error response includes `error.constructor.name` in non-prod; production hides it but logs it.
- Don't catch errors silently anywhere in the pipeline.

**Warning signs:**
- Stack traces that don't include the user's controller method.
- Issues filed asking "where did this 500 come from?"
- Internal `try { … } catch {}` (silent catch) anywhere in source.

**Phase to address:**
**Phase 2 (Adapter)** baseline; **Phase 3 (Validation/Pipeline)** for typed errors.

---

### Pitfall 15: Type inference failure on handler return types

**What goes wrong:**
Method decorators in Stage 3 can change the type of what they wrap. Naïvely typed:
```ts
function Get(path: string) {
  return function (target: any, context: ClassMethodDecoratorContext) { … };
}
```
…compiles, but users get no type checking on `return { user: ... }` vs the response schema, no autocompletion on `req.params.id`, no inferred response type for OpenAPI tooling. Worse: a poorly typed decorator can erase the method's return type to `any`.

**How to avoid:**
- Decorator factory signatures use generics: `function Get<T>(path: string): <This, Args extends any[], Return extends T>(value: (this: This, ...args: Args) => Return, context: ClassMethodDecoratorContext<This, …>) => …`.
- Test typings: a `tsd` or `expect-type` test asserting that `@Get('/x') get(): Promise<User>` keeps the `Promise<User>` return type.
- Provide a typed `Handler<TReq, TRes>` helper users can opt into for strong inference.
- For path params: use template literal types (`` `/users/:id` `` infers `{ id: string }`) — at least for simple cases.

**Warning signs:**
- IntelliSense shows `(method) Controller.get(): any`.
- Users reporting "no autocompletion on the return value."

**Phase to address:**
**Phase 1 (Architecture/Types)** — decorator type signatures are foundational.

---

### Pitfall 16: Vitest + decorators gotchas

**What goes wrong:**
- Vitest with default `pool: 'threads'` and decorators that mutate global state → cross-test pollution (tied to Pitfall 4).
- TS decorator transform: `vite-node` / esbuild used by Vitest **does not transform legacy decorators**. Stage 3 decorators are fine in current esbuild (>=0.21), but mixing config (a dependency that needs `experimentalDecorators` like class-validator) hits a wall.
- `globals: true` + module-augmenting decorators leads to type pollution.
- `vi.mock` of decorator factories: hoisting interacts badly; the mock often runs *after* class evaluation.
- Snapshot tests of route trees: order-sensitive; flaky if registration depends on import order.

**How to avoid:**
- Vitest config: `pool: 'forks'` for tests touching the registry, or per-test-file isolation.
- Avoid `globals: true`; use explicit imports (`import { describe, it, expect } from 'vitest'`).
- Make the registry isolatable: each test creates a fresh app via `createExpressApp(...)` rather than relying on module-scope state.
- Test registration determinism: sort routes before snapshotting.
- Don't use class-validator in tests; if its features are needed, write tests against the adapter interface with a stub.
- Use `supertest` against the assembled app, not the raw registry — tests the real Express path.

**Warning signs:**
- Tests pass alone, fail in `--run` mode.
- "Decorators not applied" errors only in test, not in dev/build.
- Snapshot diffs that are pure ordering noise.

**Phase to address:**
**Phase N (Test infrastructure)** — set up early so it stays clean.

---

### Pitfall 17: Trust proxy and async-context behavior changes in v5

**What goes wrong:**
- Express v5 changed default `trust proxy` semantics in some edge cases; behavior with `X-Forwarded-*` headers can differ from v4. Auth code that grabs `req.ip` for rate limiting or audit logs may suddenly read the load balancer IP instead of the client.
- `req.host` is removed (`req.hostname` only).
- `query parser` default may parse arrays/objects differently (v5 uses `simple` parsing if configured), affecting `@QueryParam`.
- `AsyncLocalStorage` patterns: Express v5's native async error propagation interacts well with ALS, but only if the library doesn't break the async chain by manually wrapping with non-awaited `.then()`.

**How to avoid:**
- Document that `trust proxy` and `query parser` are **app-level Express settings** the user controls — library doesn't override them.
- Auth/IP-extraction examples in docs should show the explicit `req.ip` usage and recommend setting `app.set('trust proxy', …)` explicitly.
- Preserve async chain: every internal hop is `await`-ed. No floating promises.
- Add a smoke test that runs an ALS-backed correlation ID through a handler and asserts it's preserved across middleware → handler → interceptor.

**Warning signs:**
- `req.ip` returns `127.0.0.1` behind a proxy.
- `req.query.tags` is `'a,b,c'` instead of `['a','b','c']` (or vice versa).
- ALS context is `undefined` inside interceptors.

**Phase to address:**
**Phase 2 (Adapter)** for the async-chain preservation; **Phase N (Docs)** for trust-proxy documentation.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Module-level `defaultMetadataStorage` global | Fast to implement; mirrors routing-controllers | Multi-instance, HMR, monorepo, dual-package hazards (Pitfalls 4 & 11) | **Never** — structurally wrong |
| `import 'reflect-metadata'` requirement | Reuse legacy patterns | Forces consumers into legacy decorator world; breaks Stage 3 promise (Pitfall 2) | **Never** for the core; optional in a class-validator adapter only |
| Hard-coded class-validator/class-transformer | Fast feature parity with routing-controllers | Bundle bloat, CVE coupling, incompatible with Stage 3 (Pitfall 9) | **Never** — adapters from day 1 |
| Global `useContainer(c)` (mutable) | Familiar API | Test isolation broken, surprises (Pitfall 10) | **Never** — per-app instantiate hook only |
| Dual ESM+CJS via shotgun bundler config | Broad compat | Type resolution mismatches, dual-instance hazard (Pitfall 11) | Acceptable **only** with `attw` + `publint` in CI and verified architecturally; consider ESM-only |
| Skipping `attw` / `publint` in CI | Fewer CI minutes | Subtle types/exports breakage discovered by users | **Never** for a public OSS package |
| Migrating routing-controllers tests verbatim | Fast test coverage | Tests carry Koa/legacy assumptions; false confidence | **Never** — tests written from scratch (already in PROJECT.md) |
| Docs without runnable examples | Faster ship | Adoption stalls; "does this even work?" issues | Acceptable for pre-v1 milestone only |
| Migration guide as a stub | Faster v1 | Users abandon migration; bad reputation | **Never** for v1 — it's a stated requirement |
| `experimentalDecorators` "fallback" mode | Compat with old codebases | Doubles code paths, doubles bugs, defeats project's premise | **Never** |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Express v5 `body-parser` | Importing `body-parser` package | Use `express.json()` / `express.urlencoded()` (built-in) |
| Express v5 path syntax | `@Get('*')`, `@Get('/users/:id?')`, `@Get('/u/:id(\\d+)')` | `@Get('/{*splat}')`, `@Get('/users{/:id}')`, validate `id` via schema (Pitfall 6) |
| zod adapter | Treating zod errors as plain `Error` | Map `ZodError.issues` into a structured `ValidationError[]` shape the user can render |
| valibot adapter | Re-throwing raw valibot output | Same: normalize across adapters into one shared error shape |
| class-validator (if supported) | Assuming `experimentalDecorators` works alongside Stage 3 | Document as **incompatible**; if shipped, do so as separate package with very loud caveat |
| `multer` for file uploads | Bundling multer into core | Optional peer dep; `@UploadedFile()`-equivalent decorator only resolves if multer middleware is installed |
| TypeORM / Prisma in handlers | Library trying to "manage transactions" | Out of scope; document `AsyncLocalStorage`-based patterns users can build |
| OpenAPI generators | Coupling to `routing-controllers-openapi` style | Expose a metadata-introspection API so third parties can write a generator |
| Vitest | `globals: true` + auto-mock conflicts | Explicit imports, `pool: 'forks'` for registry tests |
| Bundlers (webpack/rollup/esbuild) | Side-effectful imports break tree-shaking | `"sideEffects": false` (Pitfall 5) |
| Node version | Assuming `Symbol.metadata` exists | Polyfill at entry; document Node 20+ minimum (verify against Express v5's own minimum) |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Building the route tree on every request | High p99 latency, CPU pegged | Build once at `createExpressApp`; never re-introspect at request time | At any throughput, but obvious >1k rps |
| Reflecting types per request via `Reflect.getMetadata` | CPU spikes, GC pressure | Resolve metadata at registration, cache on the route entry | Above ~500 rps |
| Per-request `class-transformer` plainToClass on large payloads | High latency on JSON-heavy endpoints | Make response transformation opt-in per route; don't run on every response (routing-controllers historical issue [#226]) | Payloads >100KB or >500 rps |
| Zod schema parsed on every request without caching | CPU CPU CPU | Build the schema once per route at registration; only `.parse()` per request | Always; worse with complex unions |
| Wrapping every handler in N decorators that each create a new closure per request | GC pressure, allocation churn | Closures created at registration time, reused | >1k rps |
| Sync interceptors that internally `await` then return a sync value | Awaits the entire chain even when not needed | Distinguish sync vs async interceptors at the type level | >5k rps |
| Logging full request body on every request via interceptor | Disk/network saturation | Sample logging; structured logging at the user's choice — not a default | Production at any scale |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Validation off by default | Mass-assignment / injection / SSRF via unchecked body | Validation **required-to-opt-in-per-route** (i.e. no implicit "all body is fine"); document this as an explicit security stance |
| Echoing thrown error message to client | Stack traces / SQL strings leaked to attackers | Default `HttpError` -> `{statusCode, message}` only; raw `Error` instances → generic 500 unless explicitly opted in. Internal details only logged. |
| `class-validator` `forbidUnknownValues: false` historical default | Validation bypass via unexpected payload shapes (CVE in routing-controllers history) | If shipping a class-validator adapter: default to `forbidUnknownValues: true` and document the tradeoff |
| `@CurrentUser()` returning `undefined` silently when auth not configured | Endpoints that should be auth-gated act as if anonymous | Throw at registration if `@Authorized()` is on a route but no `authChecker` is provided to `createExpressApp` |
| Trusting `req.headers['x-forwarded-for']` for rate limiting without `trust proxy` | Spoofed client IPs bypass rate limits | Document `app.set('trust proxy', …)` requirement; surface `req.ip` semantics in auth examples (Pitfall 17) |
| File uploads without size/type/count limits | DoS via huge files; RCE via arbitrary file types | If shipping `@UploadedFile()`, require explicit `limits` and `fileFilter` (no defaults) |
| CORS as a library decorator without explicit origin | Wide-open CORS in production | Don't ship a built-in `@Cors()` decorator; document standard `cors` middleware pattern instead |
| Session/cookie decorators that use `httpOnly: false` defaults | Session theft via XSS | Don't default cookie options at all; require user to pass them |
| Auto-binding of all req properties to handler args | Prototype pollution / unexpected key reaches handler | Bind only what's explicitly declared in `@Bind({ … })` |

---

## UX Pitfalls (developer experience for library users)

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| README without a copy-pasteable runnable example | Adoption stalls; no first-success | Top of README: ~30-line server with one controller, a route, a validated body — works as-is |
| Migration guide that lists changes without code transformations | Migration is hard; users give up | Each breaking change has before/after code blocks |
| Decorator names diverging from routing-controllers without alias hints | Confusion for migrating users | If renamed, the migration guide has a 1:1 table; consider deprecation alias for top-5 decorators in v1 only |
| Silent "did nothing" — typo in decorator name produces no error | Users debug for hours | Don't allow string-keyed decorator dispatch; validate at registration |
| Errors that say "validation failed" without naming the field | User has to add their own debugging | All validation errors include `path` and `expected`/`actual` context |
| Examples requiring `import 'reflect-metadata'` then library doesn't actually need it | "Why is this here?" → distrust | Examples have *only* what's needed |
| `tsconfig.json` requirements buried in FAQ | First-attempt failures | Put required tsconfig at top of installation section |
| Long decorator stacks with no order rule documented | Debugging middleware order | Single rule: top-to-bottom (Pitfall 13); state it once, prominently |
| TypeScript `any` leaking into `req`/`res` types | Loss of autocompletion | Strongly typed handler signatures (Pitfall 15) |
| Multiple ways to do the same thing (e.g. method body inject vs param decorator vs DTO) | Decision fatigue, inconsistent codebases | Pick one canonical pattern; document alternatives only as escape hatches |

---

## "Looks Done But Isn't" Checklist

- [ ] **Decorators:** Compile under both `experimentalDecorators: true` and `false`? — Verify they **fail loudly** under `true` (per Pitfall 3), not silently miscompile.
- [ ] **Path syntax:** Tested against Express v5's `path-to-regexp` v8? — Verify bare `*`, `:id?`, and `:id(\\d+)` all throw clear errors at registration.
- [ ] **Async errors:** Throw inside handler / middleware / interceptor — verify error handler is invoked **exactly once** for each.
- [ ] **Dual package:** `npx @arethetypeswrong/cli pack` clean? `npx publint` clean? Tested ESM consumer + CJS consumer + both bundlers (webpack, vite)?
- [ ] **Tree-shaking:** Imported-but-unused controller produces no routes and no bundle bloat? — Verify with `rollup --analyze`.
- [ ] **Multi-instance:** Two `createExpressApp({ controllers: [Same] })` in same process don't cross-contaminate routes?
- [ ] **HMR:** Vite/tsx watch mode reload doesn't accumulate duplicate routes?
- [ ] **Validation adapters:** zod adapter and at least one other (valibot) implemented and tested against the same conformance suite?
- [ ] **Migration guide:** Every breaking change vs routing-controllers has a code transformation example?
- [ ] **README:** First example is copy-pasteable, runs as-is, demonstrates a route, a validated body, and an error path?
- [ ] **Types:** `tsd`/`expect-type` tests prove return-type inference, path-param inference, and decorator-context shape?
- [ ] **Peer deps:** `peerDependencies` declared for `express` and `typescript`; CI matrix tests multiple versions?
- [ ] **`reflect-metadata`:** Not in `dependencies`. Not required for core. Verified by uninstalling it from a fresh consumer project and running tests?
- [ ] **`Symbol.metadata` polyfill:** Either polyfilled at entry (with documented Node version requirements) or not used.
- [ ] **CHANGELOG:** Every breaking change between prereleases is in the CHANGELOG with a migration note.
- [ ] **License + provenance:** SPDX header, `npm provenance`, signed releases.
- [ ] **Test isolation:** Vitest passes with `--run --pool=forks` *and* `--run --pool=threads`?
- [ ] **DI:** If `instantiate` hook is shipped, an example *without* it works first; DI is positioned as opt-in only?
- [ ] **Body parsing:** Built-in `express.json()` / `express.urlencoded()` works without `body-parser` package installed?
- [ ] **Error sources:** Errors carry `cause` and a `source` field so users can trace 500s (Pitfall 14)?

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Module-level global registry shipped (Pitfall 4) | **HIGH** | Architectural rewrite; major version bump; migration script for users; or accept the bug forever. Avoid by getting Phase 1 right. |
| Hard-coupled validator (Pitfall 9) | **HIGH** | Extract to adapter package; deprecate old API path; major version bump. Plan as adapter from day 1. |
| Parameter-decorator API shipped (Pitfall 1) | **HIGH** | Entire DSL change; major version bump; codemod required for users. Get the API shape right in Phase 1. |
| Wrong dual-package config (Pitfall 11) | **MEDIUM** | Republish with corrected `exports`; bump patch; users' lockfiles update on next install. `attw`+`publint` in CI prevents recurrence. |
| Wrong peer-dep range (Pitfall 12) | **LOW** | Patch release tightening range. |
| Express v5 path syntax docs wrong (Pitfall 6) | **LOW** | Doc patch + a runtime "did you mean…" hint in the path-validation error. |
| Decorator/runtime mismatch silent failure (Pitfall 3) | **MEDIUM** | Add runtime guard in patch; loud error; users update tsconfig. |
| `reflect-metadata` accidentally required (Pitfall 2) | **LOW** | Remove import; patch release. |
| Middleware ordering inconsistent (Pitfall 13) | **MEDIUM** | Pick the rule, fix the implementation, document — but it's a behavior change for any users relying on the buggy order. Major-version bump. |
| Performance: re-reflection per request (Performance Traps) | **MEDIUM** | Cache at registration; patch release. Detected by a synthetic benchmark in CI. |
| Security: validation-off-by-default shipped (Security) | **HIGH** | Flip the default; major version bump; migration note. Better: ship right the first time. |

---

## Pitfall-to-Phase Mapping

Phases are rough guesses pending roadmap synthesis; map will be tightened during planning.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| #1 No parameter decorators | **Phase 1: API/Architecture** | Public API has zero parameter decorators; demo app uses `@Bind` (or chosen pattern) |
| #2 Metadata via `Symbol.metadata`, no `reflect-metadata` | **Phase 1: API/Architecture** | `reflect-metadata` not in `dependencies`; tests pass without it |
| #3 Decorator-mode mismatch | **Phase 1: API/Architecture** | Runtime guard test asserts loud error under `experimentalDecorators: true` |
| #4 No global registry | **Phase 1: API/Architecture** | Two-instance isolation test green |
| #5 No side-effect imports | **Phase 1 + Phase N: Build** | `"sideEffects": false`; bundler test asserts unused-import dead-codes |
| #6 Express v5 path syntax | **Phase 2: Adapter** | Path-validation tests cover `*splat`, `{/:id}`, root-with-splat |
| #7 Removed v4 APIs | **Phase 2: Adapter** | Grep CI rule + Express v5 supertest matrix |
| #8 Native async errors | **Phase 2: Adapter** | "Error fires exactly once" test for handler/middleware/interceptor |
| #9 Pluggable validation | **Phase 1 + Phase 3** | Core has zero schema-lib deps; zod adapter conformance test passes |
| #10 DI as per-app hook only | **Phase 1: API/Architecture** | No global `useContainer`; per-app `instantiate` covered by test |
| #11 Dual ESM+CJS hazard | **Phase N: Build/Publish** | `attw` + `publint` green in CI; ESM and CJS smoke consumers in CI |
| #12 Peer-dep ranges | **Phase N: Build/Publish** | CI matrix across Express 5.x and TS versions |
| #13 Middleware ordering | **Phase 2: Adapter** + **Phase N: Docs** | Deterministic ordering test; doc passage |
| #14 Debuggability | **Phase 2 + Phase 3** | Errors carry `cause`; `debug` namespace tested |
| #15 Type inference | **Phase 1: API/Architecture** | `tsd`/`expect-type` tests for return-type and param-inference |
| #16 Vitest hygiene | **Phase N: Test infra** | Tests pass under `--pool=forks` and `--pool=threads` |
| #17 Trust-proxy / async chain | **Phase 2: Adapter** + **Phase N: Docs** | ALS smoke test; trust-proxy documented |

---

## Sources

- [Migrating to Express 5 (official)](https://expressjs.com/en/guide/migrating-5.html) — verified breaking changes (path-to-regexp, removed APIs, native async errors)
- [expressjs/express#6606 — Wildcard `*` causes path-to-regexp error](https://github.com/expressjs/express/issues/6606)
- [expressjs/express#6711 — Restore `*` wildcard discussion](https://github.com/expressjs/express/issues/6711)
- [TypeScript 5.0 release notes — Stage 3 decorators](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-0.html) — confirms no parameter decorators, no metadata emit
- [TypeScript handbook — Decorators](https://www.typescriptlang.org/docs/handbook/decorators.html)
- [TC39 decorator-metadata proposal — `Symbol.metadata`](https://github.com/tc39/proposal-decorator-metadata)
- [routing-controllers CHANGELOG](file:///Users/niraj/Desktop/Projects/routing-controllers/CHANGELOG.md) — historical bugs: multi-route execution per request (#568, #491), middleware ordering (#543), input-validation bypass (#518), `class-validator` 0.14 `forbidUnknownValues` flip
- [routing-controllers README](file:///Users/niraj/Desktop/Projects/routing-controllers/README.md) — documents `reflect-metadata` requirement, `class-validator`/`class-transformer` coupling, `useContainer` global
- [Are The Types Wrong? (`attw`)](https://github.com/arethetypeswrong/arethetypeswrong.github.io)
- [publint](https://publint.dev/) — package.json/exports verification
- [path-to-regexp v8 changelog](https://github.com/pillarjs/path-to-regexp) — wildcard/optional/regex syntax changes
- [InversifyJS Stage 3 decorator migration discussion](https://github.com/inversify/InversifyJS/issues) — parameter-decorator workarounds
- PROJECT.md (this project) — explicit constraints: TC39 Stage 3, Express v5 only, pluggable validation, dual ESM+CJS, Vitest, modest adoption

---
*Pitfalls research for: TypeScript decorator-based REST controller library on Express v5*
*Researched: 2026-05-07*
