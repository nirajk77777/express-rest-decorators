# Phase 4: Uploads, Cookies, Sessions, Render, Request Context - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-10
**Phase:** 4-Uploads, Cookies, Sessions, Render, Request Context
**Areas discussed:** InputDeclaration slot shapes, @Render / @Redirect / @Location semantics, AsyncLocalStorage init point + requestId, Boot ergonomics (CORS / glob / printRoutes)

---

## Area selection

| Option | Description | Selected |
|--------|-------------|----------|
| InputDeclaration slot shapes | Cookies / session / uploads slots; map vs flag shape; @UploadedFile / @UploadedFiles registration form | ✓ |
| @Render / @Redirect / @Location semantics | Decorator + handler return composition; template interpolation; @JsonController and interceptor interaction; status defaults | ✓ |
| AsyncLocalStorage init point + requestId | Where als.run() wraps; requestId source-of-truth; coordination with Phase 3's "no req namespace pollution" warning | ✓ |
| Boot ergonomics: CORS, glob, printRoutes | Lazy import strategy; mixed Class[] + glob[] arrays; printRoutes output format | ✓ |

**User's choice:** All four areas selected.

---

## InputDeclaration slot shapes

### Q1 — Cookies slot shape

| Option | Description | Selected |
|--------|-------------|----------|
| Named-key map (like params/query) | `cookies?: Record<string, true \| StandardSchemaV1>`; per-cookie validation; symmetric with existing slots | ✓ |
| Single schema over the whole cookies bag | `cookies?: true \| StandardSchemaV1`; mirrors Phase 3 currentUser; loses per-cookie typing | |
| Both supported | Accept either form; runtime form-detection branching | |

### Q2 — Session slot shape

| Option | Description | Selected |
|--------|-------------|----------|
| Single flag/schema (true \| StandardSchemaV1) | Mirrors Phase 3 currentUser; sessions typically opaque user-shaped objects | ✓ |
| Named-key map (like params/query) | Per-key schema control; verbose for typical use | |
| Both supported | Accept either form | |

### Q3 — File upload declaration shape

| Option | Description | Selected |
|--------|-------------|----------|
| Slot on InputDeclaration via @UploadedFile / @UploadedFiles markers | Plain factory functions (NOT param decorators) populate `files` slot; explicit limits/fileFilter required | ✓ |
| Top-level uploads slot, bag-shaped | Single multer config object; closer to multer native API; less symmetric | |
| Method decorator @Upload(config) + slot for files | Splits configuration (decorator) from access (slot); more moving parts | |

### Q4 — Pipeline placement of new slots

| Option | Description | Selected |
|--------|-------------|----------|
| Parallel arms in Phase 2 D-06 Promise.all | Cookies/session/files added as additional arms; multer mw mounts before validation | ✓ |
| Sequential extension (uploads first, then bag) | Multer mw separate; cookies/session/files resolve sequentially after parallel resolution | |
| Let planner decide | Defer to planner once multer-as-mw composition is researched | |

**Notes:** All recommended options accepted. The named-key map for cookies vs single-schema for session reflects the asymmetric use cases (cookies are atomic strings; sessions are user-shaped opaque objects).

---

## @Render / @Redirect / @Location semantics

### Q1 — @Redirect template interpolation rules

| Option | Description | Selected |
|--------|-------------|----------|
| Template + handler-returned object interpolation | `@Redirect('/users/:id')` + `{ id: 42 }` → `/users/42`; string return overrides; undefined uses bare template; matches RC | ✓ |
| Handler return string is the URL; template is fallback | Simpler model but breaks RC parity | |
| Decorator-only target (handler return ignored) | Simplest but limits dynamic redirects | |

### Q2 — Interaction with @JsonController and interceptors

| Option | Description | Selected |
|--------|-------------|----------|
| Override JsonController; interceptors run on the value | Render/Redirect/Location take precedence; interceptors transform raw return before shaper consumes; preserves Phase 3 D-08 invariant | ✓ |
| Override JsonController; interceptors skipped on these paths | Simpler but breaks "interceptors transform values" rule | |
| Coexist with JsonController; throw if both set | Forces user to opt out via @Controller; rigid | |

### Q3 — Default status codes

| Option | Description | Selected |
|--------|-------------|----------|
| Redirect 302, Location 200, Render 200 | Standard Express defaults; @HttpCode overrides apply | ✓ |
| Redirect 303, others 200 | More REST-correct but breaks RC parity | |
| Let planner decide based on Express v5 research | Defer | |

### Q4 — @Render data shape from handler return

| Option | Description | Selected |
|--------|-------------|----------|
| Handler returns the locals object directly | `{ name, email }` → `res.render('view', { name, email })`; matches Express + RC | ✓ |
| Handler returns `{ view?, locals }` | More structured but verbose | |
| Handler return = locals; @Render(template, defaultLocals?) merges | Layout-data convenience; bigger API | |

**Notes:** All recommended options accepted. Interceptors-then-shaper sequence preserves Phase 3's "interceptors transform domain values, not transport bytes" contract.

---

## AsyncLocalStorage init point + requestId

### Q1 — Pipeline slot for ALS wrapper

| Option | Description | Selected |
|--------|-------------|----------|
| Outermost — mounted by library before any user/lib middleware | First app.use the lib owns; every mw / interceptor / handler / downstream service sees getRequestContext() populated; SC #5 satisfied | ✓ |
| Per-controller-router | Per-router mount; lib-global mw misses context; strictly worse than outermost | |
| Opt-in via boot option (requestContext: true) | Saves tiny perf for opt-out users; adds foot-gun | |

### Q2 — requestId resolution rule

| Option | Description | Selected |
|--------|-------------|----------|
| X-Request-Id header (non-empty) else crypto.randomUUID() | SC #5 wording exactly; no uuid dep; no auto response header | ✓ |
| Same + emit X-Request-Id response header | Tracing correlation convenience; extra opinion | |
| Opt-in boot option for header source | Configurable header name; bigger API | |

### Q3 — Storage location for requestId

| Option | Description | Selected |
|--------|-------------|----------|
| ALS only — req carries no Phase 4 state | Honors Phase 3 namespacing concern fully; no Symbol fight | ✓ |
| ALS + Symbol-keyed property on req | Both accessors; collision-safe; slight redundancy | |
| ALS + plain req.requestId | Fastest read; conflicts with user middleware; Phase 3 explicitly warned against this | |

### Q4 — getRequestContext() API shape

| Option | Description | Selected |
|--------|-------------|----------|
| getRequestContext(): { req, res, requestId } — throws outside scope | Single function; actionable error on misuse; matches SC #5 verbatim | ✓ |
| Returns context \| undefined | Soft fallback hides bugs | |
| Class-based + helper | Both class statics and function alias; redundant | |

**Notes:** All recommended options accepted. ALS-only storage is a direct response to Phase 3's explicit warning that Phase 4 should NOT put per-request state on req.

---

## Boot ergonomics: CORS, glob, printRoutes

### Q1 — Optional peer load strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Lazy import at first-use; throw actionable error if missing | `import('cors')` etc. only when feature is used; zero cost for non-users | ✓ |
| Eager check at boot if feature is configured | Fail fast at boot vs first request | |
| Mix — fail-fast at boot for cors/glob, lazy for multer | Most accurate; adds doc branching | |

### Q2 — Glob loading shape

| Option | Description | Selected |
|--------|-------------|----------|
| Mixed array: (ClassConstructor \| string)[] | Free interleaving; matches RC; default extensions; cwd-relative resolution | ✓ |
| Either-or: classes OR globs, not mixed | Simpler runtime; users want to mix | |
| Separate option: controllerGlobs: string[] | Cleaner typing; bigger API | |

### Q3 — printRoutes output strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Column table to console.log | METHOD \| PATH \| CONTROLLER.METHOD; sorted by mount order; zero-dep | ✓ |
| Return route table from useExpressControllers / createExpressServer | More flexible; breaks "just turn it on" DX | |
| Pluggable sink: printRoutes: true \| (routes) => void | Structured logging integration | |

### Q4 — Boot order for CORS / ALS / printRoutes

| Option | Description | Selected |
|--------|-------------|----------|
| ALS → cors → lib globals → controllers → printRoutes log | ALS outermost; CORS next so preflight skips controller stack; printRoutes after mount; glob expansion before mount | ✓ |
| CORS as ordinary lib global (user can position via middlewares array) | Less opinionated; users could insert auth before CORS | |
| Defer to planner / research | Capture principles only | |

**Notes:** All recommended options accepted. CORS gets a dedicated outer slot specifically because preflight responses need to skip the entire controller stack (auth, validation, handler) per CORS-spec semantics.

---

## Claude's Discretion

The user accepted recommended options for every decision; these are intentionally left to research + planner (full list in CONTEXT.md `<decisions>` § "Claude's Discretion"):

- `UploadedFile` / `UploadedFiles` exact factory return shape (marker symbol vs structural shape).
- Multer middleware composition (hidden `@UseBefore` equivalent vs dedicated registration step).
- Internal file layout under `src/adapter/` (likely `cookies.ts`, `session.ts`, `uploads.ts`, `render.ts`, `request-context.ts`, `print-routes.ts`, `glob-loader.ts`).
- Template-interpolation regex / parser for `@Redirect` / `@Location`.
- Glob-loader ESM/CJS interop edge cases; `tinyglobby` + dynamic-import patterns.
- `req.session` typing (docs-only augmentation guidance vs exported helper).
- `crypto.randomUUID()` import path (top-level static vs global).
- `MetadataBuilder` extension shape; coordinate with Phase 3's parallel extension.

---

## Deferred Ideas

(Full list in CONTEXT.md `<deferred>`. Highlights:)

- Configurable `requestIdHeader` (override `X-Request-Id`).
- Auto-emit `X-Request-Id` response header.
- `@CurrentUser()`, `@Cookie()`, `@Session()` parameter decorators (slot-based wins in v1).
- Bag-level cookies schema / per-key session schema (asymmetric defaults in v1).
- Multer global `defaults` boot option (no implicit defaults rule).
- `@Upload`-style RC back-compat parameter decorator.
- `@Render` shared-locals merging.
- Pluggable `printRoutes` sink / return-value variant.
- 303 See Other default for `@Redirect`.
- CORS as ordinary user-positioned global.
- Per-controller `routePrefix` glob filter.
- Request-context typed extensions.
