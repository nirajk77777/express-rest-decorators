# Phase 2: Runtime + Express Adapter (Happy Path) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-09
**Phase:** 02-Runtime + Express Adapter (Happy Path)
**Areas discussed:** Bootstrap & registration, Validation execution & error shape, Response writing, Error middleware integration

---

## Bootstrap & registration

### Q1 — Phase 3/4 boot options handling in Phase 2

| Option | Description | Selected |
|--------|-------------|----------|
| Accept silently as no-op | Type the BootOptions surface fully now; Phase 2 reads only the keys it owns. Forward-compatible. | ✓ |
| Reject unknown keys with actionable error | Throw at boot if a not-yet-implemented key is present. Catches typos but causes churn between phases. | |
| Warn-and-ignore with console.warn | Log once per key with 'not implemented until Phase X'. Visible but noisy. | |

**User's choice:** Accept silently as no-op
**Notes:** Initial discussion was rejected so the user could clarify; Q1 was confirmed in the explanatory pass.

### Q2 — Body parser auto-mount policy

| Option | Description | Selected |
|--------|-------------|----------|
| Consumer mounts — lib never touches | Aligns with CLAUDE.md guidance. README example shows `app.use(express.json())` explicitly. Lib stays unopinionated. | |
| createExpressServer auto-mounts; useExpressControllers does not | Asymmetric: opinionated entry point auto-mounts; "I already have an app" entry point doesn't. Mirrors original routing-controllers. | ✓ |
| Both auto-mount with { bodyParser: false } opt-out | Convenient but useExpressControllers silently injecting middleware can surprise users with custom limits. | |

**User's choice:** createExpressServer auto-mounts; useExpressControllers does not
**Notes:** First pass tentatively chose "Both auto-mount with opt-out"; user paused for clarification, then re-asked and selected the asymmetric option.

### Q3 — routePrefix + @Controller(basePath) + @Get(path) composition

| Option | Description | Selected |
|--------|-------------|----------|
| Concatenate + normalize | Strip trailing slashes, collapse double slashes, allow empty parts. Forgiving; matches routing-controllers. | ✓ |
| Concatenate verbatim | Pass through as-is to Express. Less library code; misuse becomes path-to-regexp's problem. | |
| Reject any trailing slash at registration | Strict; teaches the rule but adds boot-time friction. | |

**User's choice:** Concatenate + normalize

### Q4 — v4-pattern detection location and aggressiveness

| Option | Description | Selected |
|--------|-------------|----------|
| Adapter at mount time; flag *, :id?, :id(regex), unnamed (regex) groups | Runs in Phase 2; preserves Phase 1's zero-HTTP boundary. Pre-empts cryptic v8 errors and satisfies SC #4. | ✓ |
| Phase 1 MetadataBuilder build-time check | Earliest feedback but violates Phase 1's zero-Express constraint. | |
| Skip explicit detection; let path-to-regexp v8 throw | Smaller code, but raw v8 errors don't name controller/method/fix — SC #4 won't pass. | |

**User's choice:** Adapter at mount time; flag *, :id?, :id(regex), unnamed (regex) groups

---

## Validation execution & error shape

### Q1 — Multi-slot validation failure policy

| Option | Description | Selected |
|--------|-------------|----------|
| Aggregate all 4 slots into single BadRequestError | Best UX — client sees every field problem at once. Matches routing-controllers. | ✓ |
| Short-circuit at first failure | Cheaper, but client fixes one error, retries, hits the next. Painful for multi-field forms. | |
| Aggregate, but params failure short-circuits | Pragmatic special case — params failure invalidates the route. Adds complexity. | |

**User's choice:** Aggregate all 4 slots, single BadRequestError

### Q2 — Validation execution order

| Option | Description | Selected |
|--------|-------------|----------|
| Promise.all over the 4 slots | Sync schemas resolve immediately; async ones overlap. Single await. | ✓ |
| Sequential await per slot in fixed order | Simpler stack traces. Slower if any slot is async. | |

**User's choice:** Promise.all over the 4 slots

### Q3 — Canonical error JSON shape

| Option | Description | Selected |
|--------|-------------|----------|
| { status, name, message, source, errors: [{ slot, path, message }] } | Stable, machine-readable; matches BadRequestError signature from Phase 1. | ✓ |
| RFC 7807 Problem Details | Standards-compliant but verbose; routing-controllers migrators won't recognize it. | |
| Nested by slot: { errors: { body: [...], query: [...] } } | Easier to find errors per slot but harder to iterate flatly. | |

**User's choice:** { status, name, message, source, errors: [{ slot, path, message }] }

### Q4 — Path notation in error details

| Option | Description | Selected |
|--------|-------------|----------|
| Dotted with bracketed indices: 'items[0].name' | Reads naturally; matches Zod/Joi conventions. | ✓ |
| JSON Pointer: '/items/0/name' | RFC 6901 standard but less familiar to TS devs. | |
| Raw array passed through: ['items', 0, 'name'] | Most flexible for clients but harder to read. | |

**User's choice:** Dotted with bracketed indices

---

## Response writing: JSON, streams, async iterables

### Q1 — @JsonController vs @Controller serialization difference

| Option | Description | Selected |
|--------|-------------|----------|
| @JsonController forces JSON for ALL returns; @Controller content-negotiates by return type | Explicit and predictable; matches routing-controllers. | ✓ |
| @JsonController only sets default Content-Type; both serialize identically | Simpler but blurs the distinction. | |
| @Controller returns string-only by default; objects under @Controller throw at registration | Forces @JsonController for any non-string return; breaks routing-controllers parity. | |

**User's choice:** @JsonController forces JSON for ALL returns; @Controller content-negotiates

### Q2 — Stream / async-iterable detection

| Option | Description | Selected |
|--------|-------------|----------|
| Duck-type: .pipe first, then Symbol.asyncIterator via Readable.from | Catches Node Readable, Web ReadableStream adapters, generators uniformly. | ✓ |
| instanceof Readable for streams; explicit @Stream() decorator opt-in for iterables | More explicit but requires a new decorator and forces opt-in. | |
| Only Node Readable (instanceof); async iterables fall through to JSON | Smallest surface; would fail RES-08. | |

**User's choice:** Duck-type detection (.pipe first, then Symbol.asyncIterator)

### Q3 — Null/undefined return handling pre-Phase-3

| Option | Description | Selected |
|--------|-------------|----------|
| Honor @OnNull/@OnUndefined; default 204 No Content if neither set | Reads Phase 1 response-shaper metadata. Matches routing-controllers. | ✓ |
| Honor decorators; default null → 200 with JSON body 'null' | Strictly honest but rarely useful. | |
| Always 204; ignore @OnNull/@OnUndefined in Phase 2 | Defers shaper machinery to Phase 3 but breaks a Phase 1 contract. | |

**User's choice:** Honor @OnNull/@OnUndefined; default 204 No Content

### Q4 — Stream error handling mid-response

| Option | Description | Selected |
|--------|-------------|----------|
| Forward to next(err); error middleware checks res.headersSent and aborts | Library error middleware logs + res.destroy() if headersSent; otherwise formats JSON. | ✓ |
| Destroy the stream + close the socket; do NOT call next(err) | Simplest but error invisible to user error handlers and logging. | |
| Buffer the entire stream first; if it errors, send a JSON error | Avoids partial responses but defeats streaming. | |

**User's choice:** Forward to next(err) with res.headersSent guard

---

## Error middleware integration

### Q1 — Where the library mounts its single error middleware

| Option | Description | Selected |
|--------|-------------|----------|
| After all controller routers, automatically | Predictable; matches Express convention. Phase 3's @Middleware({type:'after'}) hook can insert ahead. | ✓ |
| User must manually call installErrorHandler(app) | Explicit but high footgun if forgotten. | |
| Mount before controllers; rely on Express bubbling errors | Technically works but breaks the mental model. | |

**User's choice:** After all controller routers, automatically

### Q2 — How `source` field is attached to thrown errors

| Option | Description | Selected |
|--------|-------------|----------|
| Wrap the handler call: catch → attach source if missing → rethrow via next(err) | Works for sync throws and rejected promises. User-thrown HttpErrors with explicit source win. | ✓ |
| Use AsyncLocalStorage to make source ambient | Cleaner but ALS not introduced until Phase 4 — premature. | |
| Only attach source for HttpError; leave native errors bare | Strict but ERR-05 says all errors include source. | |

**User's choice:** Per-handler wrapper attaches source if missing

### Q3 — defaultErrorHandler boot option semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Boolean toggle: defaultErrorHandler: false skips mounting | Simple; matches routing-controllers. | ✓ |
| Function form: replaces the lib's formatter | More flexible but overlaps with Phase 3's @Middleware({type:'after'}). | |
| Both: boolean OR function (or object form) | Most flexible but adds API surface and complicates the contract. | |

**User's choice:** Boolean toggle

### Q4 — Error JSON shape for non-validation errors

| Option | Description | Selected |
|--------|-------------|----------|
| HttpError → toJSON(); non-HttpError → generic 500, no err.message leak | Dev-mode (NODE_ENV !== 'production') includes stack for debugging. | ✓ |
| Always include err.message and err.stack regardless of env | Best DX but security risk in production. | |
| Match validation shape: always include errors[] | Consistency but empty errors[] is awkward. | |

**User's choice:** HttpError toJSON(); non-HttpError generic 500; dev-only stack

---

## Claude's Discretion

User accepted recommended options or moved on without deep follow-up — these are delegated to research + planner:

- Single-implementation factoring between `useExpressControllers` and `createExpressServer`
- Per-`Router` options (caseSensitive/strict/mergeParams) — defaults for now
- Controller mount order when multiple are passed
- IocAdapter integration in Phase 2 (uses Phase 1's `getContainer().get(...)`)
- Standard Schema feature-detection probe (presence of `'~standard'.validate`)
- `validation` boot option semantics (accept and ignore unless forced)
- v4-pattern detector module location

## Deferred Ideas

- `@Middleware({ type: 'after' })` user error handler running ahead of lib default — Phase 3 (ERR-04)
- Function/object-form `defaultErrorHandler` — overlaps with Phase 3 hook
- Per-`Router` options exposed via boot options or `@Controller` — likely v1.x
- Auto-injection by constructor type via `design:paramtypes` — non-goal per project policy
- Glob-loading of controllers — Phase 4 (UTIL-02)
- `printRoutes: true` boot-time table log — Phase 4 (API-04, UTIL-03)
- Lazy-loaded `cors` integration — Phase 4 (UTIL-04)
- AsyncLocalStorage `getRequestContext()` — Phase 4 (NEW-01)
