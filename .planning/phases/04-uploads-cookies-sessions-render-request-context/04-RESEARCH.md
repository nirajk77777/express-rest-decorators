# Phase 4: Uploads, Cookies, Sessions, Render, Request Context — Research

**Researched:** 2026-05-10
**Domain:** Express v5 middleware composition, file uploads, cookie/session input binding, response shapers, AsyncLocalStorage, glob loading
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Cookies use `cookies?: Record<string, true | StandardSchemaV1>` — per-key map mirroring params/query/body/headers.
- **D-02:** Session uses `session?: true | StandardSchemaV1` — single flag/schema; user wires `express-session` themselves; Phase 4 only reads `req.session`.
- **D-03:** Uploads use slot-based factory functions `UploadedFile(field, opts)` / `UploadedFiles(field, opts)` — NOT parameter decorators. `limits` and `fileFilter` are **required**; registration throws with controller/method/field name if either is absent.
- **D-04:** Cookie/session/files slot resolution runs as additional arms in Phase 2 D-06's `Promise.all`. Multer middleware mounts before the validation step so `req.files` is populated.
- **D-05:** `@Redirect(template)` interpolates handler return object into template (`:name` placeholders). String return overrides entirely; undefined uses bare template. Default 302.
- **D-06:** `@Render(template)` passes handler return as locals to `res.render(view, locals)`. Non-object return throws actionable error. Default 200.
- **D-07:** `@Location(template)` sets the `Location` header without changing status. Same interpolation rules as `@Redirect`.
- **D-08:** `@Render`/`@Redirect`/`@Location` override `@JsonController` JSON serialization for that method. Coexistence allowed (the decorator wins).
- **D-09:** Phase 3 interceptors run on handler return value BEFORE the response shaper consumes it.
- **D-10:** Default status codes: Redirect → 302, Location → 200, Render → 200. `@HttpCode(...)` overrides apply.
- **D-11:** ALS wrapper mounts as the OUTERMOST library middleware — before CORS, before lib globals, before controller routers.
- **D-12:** `requestId` from `X-Request-Id` header (verbatim) or `crypto.randomUUID()` fallback. Header name fixed at `X-Request-Id` in v1.
- **D-13:** `requestId` lives ONLY in ALS — never on `req`. `getRequestContext()` is the sole accessor.
- **D-14:** `getRequestContext()` returns `{ req: Request; res: Response; requestId: string }` and throws when called outside an active request scope.
- **D-15:** All optional peers (`cors`, `multer`, `tinyglobby`, `cookie`) are lazy-imported at first-use. Missing peer throws: `"<feature> requires <pkg> as a peer dependency. Install it with: pnpm add <pkg>"`.
- **D-16:** Mixed array `controllers: (ClassConstructor | string)[]`. Strings expanded by `tinyglobby`, default extensions `['.ts', '.tsx', '.js', '.mjs', '.cjs']`. Globs resolved relative to `process.cwd()`. All exported classes from matched modules treated as controllers; non-class exports silently skipped.
- **D-17:** `printRoutes: true` logs a fixed-format column table (METHOD | PATH | CONTROLLER.METHOD) to `console.log` at boot after all routers mounted. Boolean-only opt-in.
- **D-18:** Locked boot order: glob expansion → ALS wrapper → CORS → lib globals BEFORE → per-controller routers → lib globals AFTER → user error mw → lib default error mw → printRoutes.

### Claude's Discretion

- `UploadedFile`/`UploadedFiles` exact factory return shape (internal marker symbol vs structural `{ __kind, field, options }`).
- Multer middleware composition position (hidden `@UseBefore`-equivalent vs dedicated step before validation arm).
- Internal file layout under `src/adapter/`.
- Template-interpolation regex/parser for `@Redirect` and `@Location` (`:name` substitution; handle missing keys).
- Glob-loader ESM/CJS interop edge cases (`.ts` files in various loaders).
- `req.session` typing (docs-only vs library type-augmentation helper).
- `crypto.randomUUID()` import path for ESM/CJS portability.
- `MetadataBuilder` extension shape for Phase 4 (`render?`/`redirect?`/`location?` fields in `ActionMetadata`).

### Deferred Ideas (OUT OF SCOPE)

- Configurable `requestIdHeader` boot option.
- Auto-emit `X-Request-Id` response header.
- `@CurrentUser()` parameter decorator.
- `@Cookie('sid')` / `@Session()` parameter decorators.
- Multer `defaults` boot option.
- `@Render(template, defaultLocals?)` shared-locals merging.
- Pluggable `printRoutes` sink.
- 303 vs 302 default for `@Redirect`.
- CORS as user-positioned global.
- Per-controller routePrefix glob filter.
- Request context typed extensions.
- Auto-injection by constructor `design:paramtypes`.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INPUT-04 | Cookie params via input declaration; library uses `cookie` package | Cookie package v1.1.1 confirmed; `cookie.parse()` API documented; lazy-load pattern verified |
| INPUT-05 | Session data via input declaration when `express-session` middleware is wired | express-session v1.19.0 confirmed; `req.session` read-only from library perspective; TypeScript augmentation documented |
| RES-04 | `@Redirect(template)` returning redirect target issues 3xx redirect | Express `res.redirect(status, url)` API confirmed; template interpolation via `:name` regex substitution |
| RES-05 | `@Location(template)` sets Location header | Express `res.location(url)` API confirmed; chaining with D-10 status |
| RES-06 | `@Render(template)` renders Express view-engine template with returned data | Express `res.render(view, locals)` API confirmed; view-engine setup is consumer's responsibility |
| UTIL-01 | File upload declarations; multer optional peer; explicit limits + fileFilter required | multer v2.1.1 confirmed Express v5 compatible; `.fields()` API for multiple fields; `limits` and `fileFilter` shapes documented |
| UTIL-02 | `UploadedFile(field, opts)` / `UploadedFiles(field, opts)` on input declaration | Factory function pattern (not parameter decorators) maps to multer `.single()`/`.array()` middleware |
| UTIL-03 | CORS via `cors: true | CorsOptions` boot option (lazy import) | `cors` v2.8.6 confirmed; `CorsOptions` shape from `@types/cors`; lazy `import('cors')` pattern verified |
| UTIL-04 | Controller glob loading via `tinyglobby` | tinyglobby v0.2.16 confirmed; dual ESM+CJS exports; `glob()` async API confirmed |
| API-04 | `printRoutes: true` logs route table at boot | Walking library metadata (not Express internals); fixed-format console.log output per D-17 |
| NEW-01 | `getRequestContext()` returning `{ req, res, requestId }` via AsyncLocalStorage | Node `AsyncLocalStorage` confirmed in Node 20+; `als.getStore()` API; throw-on-missing-context pattern |
| NEW-02 | Request context populated with `requestId` from `X-Request-Id` or generated UUID | `crypto.randomUUID()` confirmed available Node 20+; no `uuid` dep needed |
</phase_requirements>

---

## Summary

Phase 4 adds twelve requirements across five distinct technical areas: cookie/session input binding, file upload slot markers, response-shaper decorators (`@Render`/`@Redirect`/`@Location`), boot-time behaviors (CORS, glob loading, `printRoutes`), and the AsyncLocalStorage-backed request context. All patterns are standard and well-documented; none require novel technical approaches. The architecture follows the exact same decorator-as-pure-registrar + WeakMap storage + adapter-layer composition model established in Phases 1-3.

The key integration points are: (1) three new arms appended to the `Promise.all` in `validation.ts`; (2) response-shaper detection inserted before `writeResponse` in the handler pipeline; (3) ALS wrapper + CORS + printRoutes wired into `boot.ts` per D-18's locked order; (4) glob expansion widening the `controllers` array type in `boot-options.ts`. Multer's middleware must be mounted as a per-route pre-validation step, not as a global middleware. The ALS instance is module-scoped (single instance per process), and `als.run()` per request provides the cross-await guarantee.

**Primary recommendation:** Follow the established WeakMap storage pattern for `@Render`/`@Redirect`/`@Location` decorators (new fields on `ActionMetadata`); use `import()` dynamic imports for all four optional peers with actionable install-instruction errors; wire the ALS wrapper as the absolute first `app.use()` call in `useExpressControllers`; use multer's `.fields()` API even for single-field declarations to handle mixed input declarations cleanly.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Cookie parsing | API / Backend (library adapter) | — | `cookie.parse()` runs server-side at request time; no browser tier involvement for a library |
| Session access | API / Backend (library adapter) | Consumer's middleware | Library reads `req.session` (populated by consumer-wired `express-session`); zero library installation of session middleware |
| File upload handling | API / Backend (library adapter) | multer middleware | Multer runs as per-route Express middleware pre-validation; library composes it into the handler array |
| `@Render` / view rendering | API / Backend (library adapter) | Express view engine | Library calls `res.render(view, locals)`; view engine setup (EJS, Handlebars, Pug) is the consumer's responsibility |
| `@Redirect` / `@Location` | API / Backend (library adapter) | — | Library calls `res.redirect(status, url)` / `res.location(url)`; standard Express response methods |
| CORS preflight | API / Backend (outermost library middleware) | — | Must sit before auth/validation/controllers; dedicated outer slot per D-18 ensures preflight returns without reaching controller stack |
| Glob controller loading | API / Backend (boot-time) | `tinyglobby` | File system scan at boot, before router registration; runtime concern, not HTTP concern |
| Route table dump | API / Backend (boot-time) | — | Walk library metadata after all routers mounted; `console.log` dev-time output |
| AsyncLocalStorage context | API / Backend (outermost library middleware) | Node `async_hooks` | ALS `run()` wraps each request; cross-await propagation guaranteed by Node's async context mechanism |
| requestId generation | API / Backend (ALS middleware) | `X-Request-Id` header | Header-first, UUID fallback; entirely server-side |

---

## Standard Stack

### Core (all optional peers — never in `package.json#dependencies`)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `multer` | `^2.1.1` | Multipart/file upload middleware | Expressjs official package; v2.x dropped deprecated deps; Express v5 compatible (no `peerDependencies` restriction); busboy-backed |
| `cors` | `^2.8.6` | CORS middleware | Expressjs official package; de-facto standard; `CorsOptions` typed via `@types/cors` |
| `tinyglobby` | `^0.2.16` | Glob file expansion | Modern fast-glob alternative; ESM-native (`type: module`); dual ESM+CJS exports confirmed; used by Vite, Vitest internally |
| `cookie` | `^1.1.1` | Cookie header parsing | Expressjs official low-level package (express itself uses it); zero dependencies; lighter than `cookie-parser` middleware |
| `express-session` | `^1.19.0` | Session middleware | Expressjs official; store-agnostic; library never installs it — consumer's responsibility |

**Version verification:** [VERIFIED: npm registry 2026-05-10]
- `multer@2.1.1` — latest stable (`dist-tags.latest: 2.1.1`); next is `3.0.0-alpha.1`
- `cors@2.8.6` — latest stable
- `tinyglobby@0.2.16` — latest stable; dual ESM/CJS via `{ '.': { import: './dist/index.mjs', require: './dist/index.cjs' } }`
- `cookie@1.1.1` — latest stable
- `express-session@1.19.0` — latest stable

### TypeScript Type Packages (devDependencies only)

| Package | Version | Notes |
|---------|---------|-------|
| `@types/multer` | `^2.1.0` | Ships `Multer.File`, `multer.Options`, `multer.FileFilterCallback` |
| `@types/cors` | `^2.8.19` | Ships `CorsOptions` used in `BootOptions.cors` |
| `@types/express-session` | `^1.19.0` | Augments Express `Request` with `session: Session`; consumer must install for their own code |

**Installation (dev only — these are peers):**
```bash
pnpm add -D multer cors tinyglobby cookie @types/multer @types/cors
# express-session + @types/express-session are consumer's responsibility
```

**peerDependenciesMeta additions to package.json:**
```json
{
  "peerDependencies": {
    "multer": ">=2.0.0",
    "cors": ">=2.0.0",
    "tinyglobby": ">=0.2.0",
    "cookie": ">=0.6.0"
  },
  "peerDependenciesMeta": {
    "multer": { "optional": true },
    "cors": { "optional": true },
    "tinyglobby": { "optional": true },
    "cookie": { "optional": true }
  }
}
```

### Node Built-ins Used (no installation)

| Module | API | Node Requirement | Notes |
|--------|-----|-----------------|-------|
| `node:async_hooks` | `AsyncLocalStorage` | Node 12+ (stable 16+, Node 20 ✓) | `getStore()`, `run()` |
| `node:crypto` | `randomUUID()` | Node 14.17+ (Node 20 ✓) | Top-level `import { randomUUID } from 'node:crypto'` — works in both ESM and CJS |

---

## Architecture Patterns

### System Architecture Diagram

```
Request enters app
        │
        ▼
┌──────────────────────────────────────────────────────┐
│  app.use(als.run(ctx, next))   ← outermost (D-11)   │
│    ctx = { req, res, requestId }                     │
│    requestId: X-Request-Id header || randomUUID()    │
└──────────────────┬───────────────────────────────────┘
                   │
        ▼
┌──────────────────────────────────────────────────────┐
│  app.use(cors(corsOptions))    ← if cors option set  │
│  Preflight returns 200 here; skips controller stack  │
└──────────────────┬───────────────────────────────────┘
                   │
        ▼
┌──────────────────────────────────────────────────────┐
│  app.use(...globalBeforeHandlers)  ← Phase 3 D-01    │
└──────────────────┬───────────────────────────────────┘
                   │
        ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  Per-controller express.Router()                                             │
│                                                                              │
│  [...ctrlBefore, ...methodBefore, authGate?, multerMw?, invokeHandler,       │
│   ...methodAfter, ...ctrlAfter]                                              │
│                                                                              │
│  invokeHandler:                                                              │
│    1. resolveInputs(req, input, cuResolver) ──── Promise.all arms:           │
│         params / query / body / headers / currentUser  (existing)           │
│         cookies  ← new arm 6: cookie.parse(req.headers.cookie)              │
│         session  ← new arm 7: req.session (already populated by mw)         │
│         files    ← new arm 8: req.file / req.files (already populated)      │
│    2. getContainer().get(ControllerClass)                                    │
│    3. instance.method({ ...args, req, res, next })                           │
│    4. D-08 null/undefined short-circuit                                      │
│    5. runInterceptors (Phase 3)                                              │
│    6. responseShaper check:                                                  │
│         @Redirect → interpolate template, res.redirect(status, url)         │
│         @Location → interpolate template, res.location(url), writeResponse  │
│         @Render   → res.render(template, locals)                             │
│         default   → writeResponse(res, next, value, ...)                    │
└──────────────────┬───────────────────────────────────────────────────────────┘
                   │
        ▼
┌──────────────────────────────────────────────────────┐
│  app.use(...globalAfterNonErrorHandlers)             │
│  app.use(userErrorMiddleware)                        │
│  app.use(libraryErrorMiddleware)                     │
└──────────────────┬───────────────────────────────────┘
                   │
        ▼
┌──────────────────────────────────────────────────────┐
│  if (printRoutes) console.log(routeTable)            │
│  (runs once at boot, not per-request)                │
└──────────────────────────────────────────────────────┘
```

### Recommended File Layout under `src/`

```
src/
├── adapter/
│   ├── boot.ts                   # extend: ALS wrapper, CORS, glob expansion, printRoutes
│   ├── boot-options.ts           # extend: cors, printRoutes fields; widen controllers type
│   ├── validation.ts             # extend: cookies/session/files arms in Promise.all
│   ├── response.ts               # extend: responseShaper detection before writeResponse
│   ├── router-build.ts           # extend: multer middleware in handler array
│   ├── cookies.ts                # NEW: cookie.parse wrapper + per-key validation
│   ├── session.ts                # NEW: req.session access + optional schema validation
│   ├── uploads.ts                # NEW: multer lazy-load + marker-to-multer composition
│   ├── render.ts                 # NEW: @Render / @Redirect / @Location shaper logic
│   ├── request-context.ts        # NEW: ALS singleton + getRequestContext()
│   ├── print-routes.ts           # NEW: route-table formatter
│   └── glob-loader.ts            # NEW: tinyglobby lazy-load + module import + class extraction
├── decorators/
│   ├── response.ts               # extend: add @Render, @Redirect, @Location
│   └── index.ts                  # extend: re-export new decorators
├── metadata/
│   ├── types.ts                  # extend: InputDeclaration (cookies/session/files slots)
│   └── storage.ts                # extend: renderMap, redirectMap, locationMap WeakMaps
├── types/
│   └── resolved.ts               # extend: ActionMetadata (render/redirect/location fields)
└── index.ts                      # extend: export new public symbols
```

---

## Pattern 1: Lazy Peer Import

**What:** Dynamic `import()` at first use, never at module top-level. Throws actionable install instruction on `MODULE_NOT_FOUND`.

**When to use:** All four optional peers: `cors`, `multer`, `cookie`, `tinyglobby`.

```typescript
// Source: Node.js ESM dynamic import; pattern consistent with project conventions [VERIFIED: Node docs]
async function loadCors(): Promise<typeof import('cors')> {
  try {
    return await import('cors');
  } catch {
    throw new Error(
      'cors boot option requires cors as a peer dependency. Install it with: pnpm add cors'
    );
  }
}
```

**ESM/CJS interop note:** `import('cors')` in an ESM context returns `{ default: corsFn }` because `cors` is a CJS module. Access the function via `.default`. Under `tshy`-built CJS output (`require()`-style dynamic import via `createRequire`), the shape is flat. In practice, TypeScript's `esModuleInterop: true` handles this — `(await import('cors')).default` is the safe call form in both environments. [ASSUMED — tshy CJS dynamic-import behavior not directly tested in this session]

---

## Pattern 2: WeakMap Storage for New Decorators

**What:** `@Render`, `@Redirect`, `@Location` follow the same WeakMap-as-pure-registrar pattern established in Phase 1 D-07. New module-private WeakMaps in `storage.ts`.

**When to use:** Any new method decorator that attaches route-level metadata.

```typescript
// Pattern from storage.ts (Phase 1-3 established) [VERIFIED: codebase read]
// New entries in src/metadata/storage.ts:

interface RenderMeta { template: string }
interface RedirectMeta { template: string; status?: number }
interface LocationMeta { template: string }

const renderMap = new WeakMap<object, Map<string | symbol, RenderMeta>>();
const redirectMap = new WeakMap<object, Map<string | symbol, RedirectMeta>>();
const locationMap = new WeakMap<object, Map<string | symbol, LocationMeta>>();

// Decorator factory (pure registrar):
export function Render(template: string): MethodDecorator {
  return (target: object, propertyKey: string | symbol): void => {
    let inner = renderMap.get(target);
    if (!inner) { inner = new Map(); renderMap.set(target, inner); }
    inner.set(propertyKey, { template });
  };
}
```

**Subclass behavior:** The `mergeMethodChain` walk in `builder.ts` will pick up the decorator from whichever level in the chain sets it last (subclass wins) — matching Phase 1 D-06 semantics automatically. No special merge logic needed.

---

## Pattern 3: ActionMetadata Extension for Response Shapers

**What:** Add `render?`, `redirect?`, `location?` optional fields to `ActionMetadata` and `MethodArgs`. Builder reads from WeakMaps in `mergeMethodChain`.

```typescript
// src/types/resolved.ts additions [VERIFIED: codebase read]
export interface ActionMetadata {
  // ... existing fields ...
  render?: { template: string };
  redirect?: { template: string; status?: number };
  location?: { template: string };
}

// src/metadata/types.ts additions
export interface MethodArgs {
  // ... existing fields ...
  render?: { template: string };
  redirect?: { template: string; status?: number };
  location?: { template: string };
}
```

**In builder.ts `mergeMethodChain`:** After merging verb/responseHandlers, read the new storage maps and set the fields. Subclass wins (last-write in the chain sets it).

---

## Pattern 4: UploadedFile / UploadedFiles Factory Markers

**What:** Plain factory functions (not decorators) that return a discriminated marker object. The registration-time validator reads the marker and throws if required fields are absent.

```typescript
// src/adapter/uploads.ts (new file)
const UPLOAD_KIND = Symbol('UploadedFile');

export interface UploadLimits {
  fileSize?: number;
  files?: number;
  [key: string]: unknown;
}

export type FileFilter = (
  req: import('express').Request,
  file: Express.Multer.File,
  callback: (error: Error | null, acceptFile: boolean) => void
) => void;

export interface UploadOptions {
  limits: UploadLimits;         // REQUIRED
  fileFilter: FileFilter;       // REQUIRED
  storage?: unknown;            // optional multer storage engine
}

export interface UploadedFileMarker {
  [UPLOAD_KIND]: 'single';
  field: string;
  options: UploadOptions;
}

export interface UploadedFilesMarker {
  [UPLOAD_KIND]: 'array';
  field: string;
  options: UploadOptions;
}

export function UploadedFile(field: string, options: UploadOptions): UploadedFileMarker {
  return { [UPLOAD_KIND]: 'single', field, options };
}

export function UploadedFiles(field: string, options: UploadOptions): UploadedFilesMarker {
  return { [UPLOAD_KIND]: 'array', field, options };
}

export function isUploadMarker(x: unknown): x is UploadedFileMarker | UploadedFilesMarker {
  return !!x && typeof x === 'object' && UPLOAD_KIND in (x as object);
}
```

**Registration-time guard (in router-build.ts or uploads.ts):**
```typescript
// Called when building the controller router, before route registration
function validateUploadMarker(
  marker: UploadedFileMarker | UploadedFilesMarker,
  controllerName: string,
  methodName: string,
  fieldKey: string
): void {
  if (!marker.options.limits) {
    throw new Error(
      `[${controllerName}.${methodName}] UploadedFile field "${fieldKey}" requires explicit limits. ` +
      `Set limits: { fileSize: N } to prevent unbounded uploads.`
    );
  }
  if (!marker.options.fileFilter) {
    throw new Error(
      `[${controllerName}.${methodName}] UploadedFile field "${fieldKey}" requires explicit fileFilter. ` +
      `Set fileFilter to validate accepted file types.`
    );
  }
}
```

---

## Pattern 5: Multer Middleware Composition

**What:** Multer middleware mounts as an additional handler BEFORE the `invokeHandler` in the route's handler array, AFTER auth but positioned so `req.file`/`req.files` are available to the validation arms.

**Multer API used:** `.fields([{ name, maxCount }])` even for single-file declarations — simplifies the `req.files` access shape to a consistent `Record<string, Express.Multer.File[]>`.

```typescript
// In router-build.ts, for routes with files in their input declaration:
import { isUploadMarker } from './uploads.js';

async function buildMulterMiddleware(
  action: ActionMetadata,
  controllerName: string,
  methodName: string
): Promise<RequestHandler | null> {
  const files = action.input?.files;
  if (!files) return null;

  const fields: Array<{ name: string; maxCount: number }> = [];
  let sharedLimits: Record<string, unknown> | undefined;
  let sharedFileFilter: Function | undefined;

  for (const [fieldKey, marker] of Object.entries(files)) {
    if (!isUploadMarker(marker)) continue;
    validateUploadMarker(marker, controllerName, methodName, fieldKey);
    fields.push({
      name: marker.field,
      maxCount: marker[UPLOAD_KIND] === 'single' ? 1 : (marker.options.limits.files ?? 10),
    });
    // Use the first marker's limits/fileFilter for the multer instance
    // (all markers on a route should share the same options — document this)
    sharedLimits = marker.options.limits as Record<string, unknown>;
    sharedFileFilter = marker.options.fileFilter as Function;
  }

  if (fields.length === 0) return null;

  const multerModule = await import('multer').catch(() => {
    throw new Error('File upload requires multer as a peer dependency. Install it with: pnpm add multer');
  });
  const multer = (multerModule as { default: Function }).default;
  const upload = multer({ limits: sharedLimits, fileFilter: sharedFileFilter });
  return upload.fields(fields) as RequestHandler;
}
```

**Handler array position** (in `buildControllerRouter`):
```typescript
// D-04: multer runs BEFORE invokeHandler so req.files is populated before validation arms
const multerMw = await buildMulterMiddleware(action, controllerName, String(action.method));

const handlers: RequestHandler[] = [
  ...ctrlBeforeHandlers,
  ...methodBeforeHandlers,
  ...(authGate ? [authGate] : []),
  ...(multerMw ? [multerMw] : []),    // ← NEW: multer before invoke
  invokeHandler,
  ...methodAfterHandlers,
  ...ctrlAfterHandlers,
];
```

---

## Pattern 6: Cookie Slot Resolution

**What:** Lazy-load `cookie` package; parse `req.headers.cookie`; validate each declared key against its schema (or pass through if `true`).

```typescript
// src/adapter/cookies.ts (new file)
import type { StandardSchemaV1 } from '../types/standard-schema.js';

export type CookiesDeclaration = Record<string, true | StandardSchemaV1>;

export async function resolveCookies(
  cookieHeader: string | undefined,
  declaration: CookiesDeclaration | undefined
): Promise<{ value?: Record<string, unknown>; issues?: Array<{ slot: 'cookies'; path: string; message: string }> }> {
  if (!declaration) return { value: undefined };

  const cookieModule = await import('cookie').catch(() => {
    throw new Error('cookies slot requires cookie as a peer dependency. Install it with: pnpm add cookie');
  });
  const parsed = (cookieModule as { default?: { parse: Function }, parse?: Function })
    .default?.parse(cookieHeader ?? '') 
    ?? (cookieModule as { parse: Function }).parse(cookieHeader ?? '');

  const result: Record<string, unknown> = {};
  const issues: Array<{ slot: 'cookies'; path: string; message: string }> = [];

  for (const [key, schemaOrTrue] of Object.entries(declaration)) {
    const raw = parsed[key];
    if (schemaOrTrue === true) {
      result[key] = raw;
    } else {
      // Standard Schema validation
      const out = await Promise.resolve(schemaOrTrue['~standard'].validate(raw));
      if (out.issues) {
        issues.push(...out.issues.map((iss: { path?: unknown[]; message: string }) => ({
          slot: 'cookies' as const,
          path: key + (iss.path?.length ? `.${iss.path.join('.')}` : ''),
          message: iss.message,
        })));
      } else {
        result[key] = out.value;
      }
    }
  }

  if (issues.length > 0) return { issues };
  return { value: result };
}
```

**NOTE on `cookie` v1.x CJS/ESM interop:** The `cookie` package does not declare `"type": "module"` and has no `exports` field — it is a CJS package. When dynamically imported in ESM, the module default IS the `parse`/`serialize` export object. Pattern: `(await import('cookie')).default` in ESM, `require('cookie')` equivalent in CJS. TypeScript's `esModuleInterop` handles this correctly. [VERIFIED: npm view cookie@1.1.1 — no `exports` field, no `type` field]

---

## Pattern 7: Response Shapers (@Render / @Redirect / @Location)

**What:** Before calling `writeResponse`, the handler pipeline checks `action.render`, `action.redirect`, or `action.location` metadata and calls the appropriate Express response method.

**Template interpolation:** `:name` placeholder substitution from a plain object. Uses a simple regex replace.

```typescript
// src/adapter/render.ts (new file)

/**
 * Interpolate `:name` placeholders in a template URL from an object.
 * - String value from object → substitute verbatim
 * - Missing key → throw actionable error
 * - Non-string/number value → toString()
 */
export function interpolateTemplate(
  template: string,
  data: Record<string, unknown>,
  source: string
): string {
  return template.replace(/:([A-Za-z_$][A-Za-z0-9_$]*)/g, (match, key: string) => {
    if (!(key in data)) {
      throw new Error(
        `[${source}] @Redirect/@Location template "${template}" references ":${key}" ` +
        `but handler return value has no "${key}" property.`
      );
    }
    return String(data[key]);
  });
}

/**
 * Apply @Redirect shaper (D-05):
 * - handler returned object → interpolate template
 * - handler returned string → use verbatim (override template entirely)
 * - handler returned undefined → use bare template
 */
export function applyRedirect(
  res: import('express').Response,
  template: string,
  status: number,
  value: unknown,
  source: string
): void {
  let url: string;
  if (typeof value === 'string') {
    url = value;
  } else if (value === undefined || value === null) {
    url = template;
  } else if (typeof value === 'object' && value !== null) {
    url = interpolateTemplate(template, value as Record<string, unknown>, source);
  } else {
    url = template;
  }
  res.redirect(status, url);
}

/**
 * Apply @Render shaper (D-06):
 * - undefined → res.render(template) with no locals
 * - object → res.render(template, locals)
 * - anything else → throw actionable error
 */
export function applyRender(
  res: import('express').Response,
  template: string,
  value: unknown,
  source: string
): void {
  if (value === undefined || value === null) {
    res.render(template);
    return;
  }
  if (typeof value !== 'object') {
    throw new Error(
      `[${source}] @Render expects an object or undefined; got ${typeof value} from handler return.`
    );
  }
  res.render(template, value as Record<string, unknown>);
}
```

**Integration into handler pipeline (boot.ts `makeHandlerFactory`):**
```typescript
// After runInterceptors, before writeResponse:
if (action.redirect) {
  const status = action.redirect.status ?? 302;
  applyRedirect(res, action.redirect.template, status, final, source);
  next();
  return;
}
if (action.location) {
  const url = typeof final === 'string'
    ? final
    : final && typeof final === 'object'
      ? interpolateTemplate(action.location.template, final as Record<string, unknown>, source)
      : action.location.template;
  res.location(url);
  // Fall through to writeResponse for the body (D-07: location doesn't stop body writing)
  writeResponse(res, next, final, controllerMeta, action);
  return;
}
if (action.render) {
  applyRender(res, action.render.template, final, source);
  next();
  return;
}
writeResponse(res, next, final, controllerMeta, action);
```

**Note on `@Location` + body:** D-07 says Location sets the header without changing status and then "the handler's return value is passed through the standard response writer." This means `writeResponse` still runs after `res.location(url)`. For `@JsonController`, the return value is serialized as JSON with the Location header set. This is intentional — correct per D-07 and Express's `res.location()` behavior which only sets the header. [VERIFIED: Express v5 `res.location()` docs — sets `Location` header only]

---

## Pattern 8: AsyncLocalStorage Request Context

**What:** Module-scoped `AsyncLocalStorage` instance; `als.run()` wraps each request handler at the outermost middleware position. `getRequestContext()` reads `als.getStore()` and throws if outside a request.

```typescript
// src/adapter/request-context.ts (new file)
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';

export interface RequestContext {
  req: Request;
  res: Response;
  requestId: string;
}

// Module-scoped singleton — one per process, not per app. Multi-app scenarios
// are safe because als.run() scopes stores per request, not per ALS instance.
const als = new AsyncLocalStorage<RequestContext>();

/**
 * Express middleware that initializes the ALS context for each request.
 * Must be the outermost app.use() call (D-11).
 */
export function createAlsMiddleware() {
  return function alsMiddleware(
    req: Request,
    res: Response,
    next: import('express').NextFunction
  ): void {
    const requestId = (req.headers['x-request-id'] as string | undefined)?.trim() || randomUUID();
    als.run({ req, res, requestId }, next);
  };
}

/**
 * Returns the current request context.
 * Throws when called outside an active request scope (D-14).
 */
export function getRequestContext(): RequestContext {
  const store = als.getStore();
  if (!store) {
    throw new Error(
      'getRequestContext() called outside an active request scope — ensure ' +
      'useExpressControllers() is mounted on the app before this code runs.'
    );
  }
  return store;
}
```

**`crypto.randomUUID()` import path:** The `node:crypto` module path (`import { randomUUID } from 'node:crypto'`) is the correct form for both ESM and CJS in Node 20+ with TypeScript `moduleResolution: NodeNext`. The global `crypto.randomUUID()` is also available in Node 19+ but the explicit import is more portable and clear. [VERIFIED: Node 20 docs — `node:crypto` module export confirmed by `node -e` test]

---

## Pattern 9: Glob Controller Loading

**What:** Expand string patterns in the `controllers` array using `tinyglobby`, dynamically import each matched file, extract all exported classes.

```typescript
// src/adapter/glob-loader.ts (new file)
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const DEFAULT_EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '.cjs'];

export async function resolveControllers(
  entries: ReadonlyArray<Function | string>
): Promise<Function[]> {
  const result: Function[] = [];

  for (const entry of entries) {
    if (typeof entry === 'function') {
      result.push(entry);
      continue;
    }

    // Lazy-load tinyglobby
    const { glob } = await import('tinyglobby').catch(() => {
      throw new Error(
        'Glob patterns in controllers require tinyglobby as a peer dependency. ' +
        'Install it with: pnpm add tinyglobby'
      );
    });

    const matchedPaths = await glob(entry, {
      cwd: process.cwd(),
      absolute: true,
    });

    for (const filePath of matchedPaths) {
      // Extension filter (D-16 default extensions)
      const ext = filePath.slice(filePath.lastIndexOf('.'));
      if (!DEFAULT_EXTENSIONS.includes(ext)) continue;

      // ESM-first: import() with file:// URL for cross-platform paths
      const fileUrl = pathToFileURL(filePath).href;
      const mod = await import(fileUrl);

      // Extract all exported class constructors (D-16: non-class exports silently skipped)
      for (const exported of Object.values(mod)) {
        if (typeof exported === 'function' && exported.prototype) {
          result.push(exported as Function);
        }
      }
    }
  }

  return result;
}
```

**`.ts` extension in globs — critical caveat:** Consumers who pass `controllers: ['src/controllers/**/*.ts']` are running in one of:
1. `tsx`-loader or `ts-node` — `.ts` files are importable directly.
2. Compiled output (`dist/`) — glob should be `dist/controllers/**/*.js`.
3. Native Node with experimental strip-types (Node 22.6+ / 23+).

The library cannot know which environment it's in. Documentation must note: "If you compile to `dist/`, use compiled file paths (`.js`) in your glob patterns. If using a TypeScript loader like `tsx`, `.ts` patterns work directly." [ASSUMED — the exact behavior of `import()` on `.ts` files depends on the consumer's loader; cannot be verified without running in each environment]

---

## Pattern 10: Route Table (printRoutes)

**What:** Walk controller metadata (already built before this runs) and format a table. No Express internals introspection needed.

```typescript
// src/adapter/print-routes.ts (new file)
import type { ControllerMetadata } from '../types/resolved.js';
import { composePath } from './router-build.js';

interface RouteRow {
  method: string;
  path: string;
  handler: string;
}

export function buildRouteTable(
  controllers: ControllerMetadata[],
  routePrefix: string
): RouteRow[] {
  const rows: RouteRow[] = [];
  for (const ctrl of controllers) {
    for (const action of ctrl.actions) {
      rows.push({
        method: action.verb.toUpperCase(),
        path: composePath(routePrefix, ctrl.basePath, action.path),
        handler: `${(ctrl.target as { name: string }).name}.${String(action.method)}`,
      });
    }
  }
  return rows;
}

export function printRouteTable(rows: RouteRow[]): void {
  const methodW = Math.max(6, ...rows.map(r => r.method.length));
  const pathW = Math.max(4, ...rows.map(r => r.path.length));
  const header = `${'METHOD'.padEnd(methodW)}  ${'PATH'.padEnd(pathW)}  CONTROLLER.METHOD`;
  console.log(header);
  for (const row of rows) {
    console.log(`${row.method.padEnd(methodW)}  ${row.path.padEnd(pathW)}  ${row.handler}`);
  }
}
```

---

## Pattern 11: InputDeclaration Extension

**What:** Extend `InputDeclaration` in `metadata/types.ts` with cookies/session/files slots. Additive merge with Phase 3's `currentUser` field.

```typescript
// src/metadata/types.ts additions
import type { StandardSchemaV1 } from '../types/standard-schema.js';
import type { UploadedFileMarker, UploadedFilesMarker } from '../adapter/uploads.js';

export interface InputDeclaration {
  params?: unknown;
  query?: unknown;
  body?: unknown;
  headers?: unknown;
  currentUser?: true | StandardSchemaV1;     // Phase 3 (existing)
  cookies?: Record<string, true | StandardSchemaV1>;  // Phase 4 D-01
  session?: true | StandardSchemaV1;          // Phase 4 D-02
  files?: Record<string, UploadedFileMarker | UploadedFilesMarker>; // Phase 4 D-03
}
```

**Circular dependency risk:** `metadata/types.ts` imports from `adapter/uploads.ts` for the marker types. To avoid circular imports (adapter modules import from metadata modules), move the marker types to `types/uploads.ts` or keep them in a dedicated `src/types/uploads.ts` that neither `metadata/` nor `adapter/` imports back from. The planner should prefer: marker types in `src/types/uploads.ts`; `src/adapter/uploads.ts` imports from there; `src/metadata/types.ts` imports type-only from there.

---

## Pattern 12: validation.ts Arms Extension

**What:** Extend `resolveInputs` to add three more arms to the `Promise.all`. Cookies and session arms are straightforward; the files arm is trivially reading already-populated `req.file`/`req.files`.

```typescript
// Extensions to src/adapter/validation.ts

export interface ResolvedArgs {
  params: unknown;
  query: unknown;
  body: unknown;
  headers: unknown;
  currentUser?: unknown;
  cookies?: Record<string, unknown>;  // Phase 4
  session?: unknown;                   // Phase 4
  files?: Record<string, unknown>;     // Phase 4
}

// In resolveInputs, additional Promise.all arm:
const [results, currentUserResult, cookiesResult, sessionResult, filesResult] = await Promise.all([
  Promise.all(SLOTS.map((s) => validateSlot(s, decl[s], req[s]))),
  validateCurrentUser(decl.currentUser, currentUserResolver),
  resolveCookiesArm(req, decl.cookies),
  resolveSessionArm(req, decl.session),
  resolveFilesArm(req, decl.files),
]);
```

The `req.file`/`req.files` population by multer middleware happens BEFORE this runs (multer is in the handler array before `invokeHandler`), so `resolveFilesArm` simply reads the already-present data:

```typescript
async function resolveFilesArm(
  req: Request,
  files: Record<string, UploadedFileMarker | UploadedFilesMarker> | undefined
): Promise<{ value?: Record<string, unknown> }> {
  if (!files) return { value: undefined };
  // req.files is populated by multer middleware, already typed as Express.Multer.File[]
  const result: Record<string, unknown> = {};
  for (const [key, marker] of Object.entries(files)) {
    const multerFiles = (req as Request & { files?: Record<string, unknown[]> }).files;
    const fieldName = marker.field;
    if (marker[UPLOAD_KIND] === 'single') {
      result[key] = multerFiles?.[fieldName]?.[0];
    } else {
      result[key] = multerFiles?.[fieldName] ?? [];
    }
  }
  return { value: result };
}
```

---

## Anti-Patterns to Avoid

- **Top-level `import multer from 'multer'` in any src file.** Breaks lazy-loading contract; increases bundle for non-upload users.
- **Using `cookie-parser` middleware instead of the `cookie` package directly.** `cookie-parser` installs itself globally as middleware and populates `req.cookies` — this leaks global state and requires users to also install/configure it. Using `cookie.parse()` directly on the header is lighter and aligns with D-15.
- **Putting `requestId` on `req` (e.g., `req.requestId`).** Violates Phase 3's no-namespace-pollution rule and D-13. ALS is the sole accessor.
- **Creating a new ALS instance per request.** ALS instance is module-scoped; only `als.run()` is per-request.
- **Mounting the ALS wrapper after `app.use(express.json())`** in `createExpressServer`. D-11 requires ALS to be outermost — must be mounted BEFORE body parsers. Update `createExpressServer` sequence accordingly.
- **Using `multer.single()` or `multer.array()` separately per field.** A route with multiple upload fields needs ONE multer instance with `.fields([...])`. Two separate multer middlewares would each try to parse the multipart body and conflict.
- **Using `app._router` introspection for printRoutes.** Internal Express API; not stable across v5 patch versions. Walk library metadata instead.
- **Interpolating `:name` placeholders without checking for missing keys.** Silent URL corruption. Throw an actionable error naming the missing key.
- **`@Render` on a method that can return `null`.** The null/undefined short-circuit (Phase 3 D-08 step 2, `@OnNull(204)`) fires BEFORE the render shaper check — this is correct behavior per D-09 but must be documented. If a handler returns null with `@Render`, the null branch wins (204 response, no render call).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Multipart form parsing | Custom stream parser | `multer` v2.1.1 | Handles boundary detection, part parsing, memory vs disk storage, field limits, concurrent uploads — extreme edge-case complexity |
| CORS preflight handling | Custom `OPTIONS` handler + header logic | `cors` v2.8.6 | Handles `Access-Control-Allow-Origin` preflight, credentials, method allow-lists, vary headers per RFC 6454 |
| Cookie string parsing | Custom `; name=value` splitter | `cookie` v1.1.1 | Handles quoted strings, encoded values, empty values, multiple same-name cookies — the RFC 6265 edge cases are non-trivial |
| File system glob expansion | Custom `readdir` + pattern matching | `tinyglobby` v0.2.16 | Handles negation, brace expansion, symlinks, `**` semantics across OSes |
| UUID generation | Custom random hex string | `crypto.randomUUID()` (Node built-in) | Cryptographically secure, RFC 4122-compliant UUID v4; no dependency needed |

**Key insight:** Every problem in this phase has a well-maintained Expressjs-org or Node-built-in solution. The library's value is orchestrating these pieces, not reimplementing them.

---

## Runtime State Inventory

This is a greenfield phase (no rename/refactor). Step 2.5 is NOT applicable.

---

## Common Pitfalls

### Pitfall 1: ALS Context Missing for User Middleware Mounted Before `useExpressControllers`

**What goes wrong:** `getRequestContext()` throws "called outside active request scope" in user middleware that was mounted with `app.use()` before calling `useExpressControllers(app, options)`.

**Why it happens:** D-11 installs the ALS wrapper as the first `app.use()` call INSIDE `useExpressControllers`. Any `app.use()` calls the user makes BEFORE `useExpressControllers` runs outside the ALS context.

**How to avoid:** Document in README loudly: "All middleware that needs `getRequestContext()` must be added after `await useExpressControllers(app, options)` is called, or passed via `BootOptions.middlewares` so the library mounts them inside the ALS wrapper." Alternatively, expose a `createAlsMiddleware()` helper so users can install it manually at any position.

**Warning signs:** Tests pass but production code sees the error in logging middleware.

---

### Pitfall 2: Two Multer Instances on One Route

**What goes wrong:** If two separate `UploadedFile` fields produce two separate multer middlewares, the second multer instance will fail to parse the body because the first already consumed the stream.

**Why it happens:** Node.js `IncomingMessage` body is a one-read stream. Once a multipart parser reads it, the next one gets an empty stream.

**How to avoid:** The `buildMulterMiddleware` function MUST collect ALL file fields from the input declaration's `files` record and create ONE multer instance with `.fields([...])`. One multer per route, always.

**Warning signs:** `req.files` missing fields that should be present; multer throwing unexpected end-of-stream errors.

---

### Pitfall 3: multer Middleware Ordering vs Body Parsing

**What goes wrong:** `express.json()` is installed by `createExpressServer` before the controller routers. A `POST /upload` route that uses multer also gets hit by `express.json()` which will attempt to parse the body.

**Why it happens:** Express middleware runs in mount order for all matching routes. `express.json()` will see the `multipart/form-data` content type and skip (it only handles `application/json`), so in practice there's no conflict — `express.json()` bails early for multipart. But multer still needs to run BEFORE the validation arm.

**How to avoid:** No action needed for `express.json()` — it short-circuits on wrong Content-Type. Multer just needs to be before `invokeHandler` in the per-route handler array. Document that consumers should NOT additionally install `busboy` or other multipart parsers globally.

---

### Pitfall 4: `cookie` Package CJS/ESM Default Export

**What goes wrong:** `(await import('cookie')).parse` throws "parse is not a function" in ESM contexts.

**Why it happens:** `cookie` is a CJS package with no `exports` field. Dynamic `import()` of a CJS package in ESM wraps it as `{ default: <module.exports> }`. So `parse` lives at `.default.parse`, not at top-level `.parse`.

**How to avoid:** Always use `(await import('cookie')).default.parse(...)` in the lazy-load path. TypeScript with `esModuleInterop: true` handles this correctly when using static imports, but dynamic import requires explicit `.default` access. Add a unit test that mocks the module and verifies the accessor.

---

### Pitfall 5: tinyglobby `.ts` Files Without a TS Loader

**What goes wrong:** `import('./src/controllers/users.controller.ts')` throws `ERR_UNKNOWN_FILE_EXTENSION` in standard Node (without `tsx`, `ts-node`, or `--experimental-strip-types`).

**Why it happens:** Node doesn't natively understand TypeScript files. Glob patterns matching `.ts` files only work if the consumer runs under a TypeScript loader.

**How to avoid:** Document that glob patterns with `.ts` extensions require a TypeScript runtime loader. When running compiled output, globs should target `.js` files in `dist/`. The library should NOT throw a misleading error — let Node's import error surface naturally, but the documentation must make this clear.

---

### Pitfall 6: `@Render` Return Value Type Mismatch

**What goes wrong:** Handler inadvertently returns a non-object (e.g., a number from a guard/interceptor shortcut), triggering the actionable error thrown by `applyRender`.

**Why it happens:** Interceptors run BEFORE the shaper (D-09). If an interceptor transforms the value to a non-object, the render shaper sees the transformed value.

**How to avoid:** Document D-09 clearly. The render shaper error message should include the interceptor context hint: "If using @UseInterceptor, ensure the interceptor returns an object for @Render methods."

---

### Pitfall 7: ALS and Worker Threads

**What goes wrong:** `getRequestContext()` returns `undefined` (then throws) when called from a worker thread that wasn't in the ALS run context.

**Why it happens:** `AsyncLocalStorage` propagates through async continuations on the same thread. Worker threads are separate V8 isolates — ALS context does NOT cross thread boundaries.

**How to avoid:** Document: "getRequestContext() is not available in Worker threads. Pass the context explicitly to any code running in a worker." This is a known ALS limitation, not a library bug. [VERIFIED: Node.js ALS docs — ALS does not propagate to Worker threads]

---

### Pitfall 8: `@Redirect` with Phase 3 `@OnNull` / `@OnUndefined`

**What goes wrong:** A handler returning `null` on a `@Redirect`-decorated method gets a 204 instead of a redirect — confusing behavior.

**Why it happens:** The null/undefined short-circuit in `writeResponse` (Phase 2 D-13) fires in `invokeHandler` before the redirect check. D-09 confirms this is intentional: "Null/undefined short-circuit still applies."

**How to avoid:** Document this explicitly in `@Redirect` documentation: "If the handler returns null or undefined, the @OnNull/@OnUndefined status code takes effect (default 204 with empty body). The redirect only fires for non-null returns."

---

## Code Examples

### ALS Middleware (boot.ts integration)
```typescript
// In useExpressControllers, BEFORE everything else [VERIFIED: Node ALS docs + codebase pattern]
import { createAlsMiddleware } from './request-context.js';

export async function useExpressControllers(app: Express, options: BootOptions): Promise<Express> {
  // Step 0 (new): ALS wrapper — outermost, D-11
  app.use(createAlsMiddleware());

  // Step 0.5 (new): CORS — if option set, D-15 lazy import
  if (options.cors) {
    const corsModule = await import('cors').catch(() => {
      throw new Error('cors option requires cors as a peer. Install: pnpm add cors');
    });
    const corsMiddleware = (corsModule as { default: Function }).default;
    const corsOpts = options.cors === true ? {} : options.cors;
    app.use(corsMiddleware(corsOpts) as RequestHandler);
  }

  // ... rest of existing boot.ts ...
}
```

### Glob expansion (boot.ts integration)
```typescript
// In useExpressControllers, BEFORE buildMetadata [VERIFIED: tinyglobby exports + codebase pattern]
import { resolveControllers } from './glob-loader.js';

export async function useExpressControllers(app: Express, options: BootOptions): Promise<Express> {
  // Widen to accept strings; resolve globs first
  const resolvedControllers = await resolveControllers(
    options.controllers as ReadonlyArray<Function | string>
  );
  const controllers = buildMetadata(resolvedControllers);
  // ...
}
```

### printRoutes (boot.ts integration, after all routers mounted)
```typescript
// At end of useExpressControllers, after all app.use() calls [VERIFIED: codebase pattern]
import { buildRouteTable, printRouteTable } from './print-routes.js';

if (options.printRoutes) {
  const rows = buildRouteTable(controllers, routePrefix);
  printRouteTable(rows);
}
return app;
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `express-session` auto-augments `req` for session | Library reads `req.session` only; user wires session middleware | Always (our design) | Zero library coupling to session store |
| `glob` npm package for file discovery | `tinyglobby` | ~2023 (glob became ESM-only, then tinyglobby emerged as lighter alternative) | ESM-native, dual CJS/ESM, faster, smaller |
| `uuid` npm package for UUID generation | `crypto.randomUUID()` (Node built-in) | Node 14.17 stable; Node 15.6 global | Zero dependency |
| AsyncLocalStorage via `cls-hooked` / zone.js | `node:async_hooks` `AsyncLocalStorage` | Node 12 (experimental), 16 (stable) | Native, no monkey-patching |
| `multer` v1.x (Express 4 era) | `multer` v2.1.1 | 2024; v2 cleaned up deprecated deps | Fewer transitive deps; `mkdirp`/`xtend`/`object-assign` removed in 2.1.0 |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `import('cors').default` is the correct accessor for CJS-in-ESM dynamic import | Pattern 1, Pattern 7 | Runtime TypeError; fix: add explicit `.default` fallback check |
| A2 | `tinyglobby`'s `glob()` returns absolute paths when `absolute: true` is passed | Pattern 9 | Import paths would be relative and break `pathToFileURL`; fix: confirm from tinyglobby README |
| A3 | `.ts` extension glob patterns only work under TypeScript loaders (tsx, ts-node) | Pattern 9, Pitfall 5 | If Node adds native `.ts` support for a specific consumer config, behavior may differ; documentation risk only |
| A4 | `tshy`-built CJS output handles `import('cors')` dynamic import correctly (via `createRequire` or interop) | Pattern 1 | Would require Phase 5 verification via `attw`; if wrong, the CJS build fails at runtime on lazy-load |
| A5 | Multer v2.1.1 is compatible with Express v5.x (no `peerDependencies` restriction on multer's side) | Standard Stack | Confirmed no peerDeps in multer@2.1.1 npm metadata; functional compatibility assumed |

---

## Open Questions

1. **BootOptions.controllers type widening**
   - What we know: Current type is `ReadonlyArray<ClassConstructor<unknown>>`. Phase 4 needs `ReadonlyArray<ClassConstructor<unknown> | string>`.
   - What's unclear: Whether widening this type is a breaking change for TypeScript consumers who have `as const` arrays of controller classes (TS will complain if the element type doesn't include `string`). In practice, adding `| string` to the element type is additive (accepts more, not less) — not breaking.
   - Recommendation: Widen to `ReadonlyArray<ClassConstructor<unknown> | string>` directly in `boot-options.ts`. No breaking change.

2. **`cors` CorsOptions type — using `@types/cors` in the public API**
   - What we know: `BootOptions.cors` currently typed as `boolean | Record<string, unknown>`. The better type is `boolean | CorsOptions` from `@types/cors`.
   - What's unclear: Whether importing from `@types/cors` in `boot-options.ts` creates a hard dev-dep requirement on `@types/cors` for users of the type.
   - Recommendation: Keep `boolean | Record<string, unknown>` as the public type OR use a local `CorsOptions` interface that mirrors the `cors` package's shape. Avoids leaking a devDep type into the public API.

3. **Session TypeScript types**
   - What we know: `express-session` adds `session` to `Request` via module augmentation. Users who install `@types/express-session` get the augmentation. Users who don't get `req.session` typed as `any`.
   - What's unclear: Whether the library should ship a type-augmentation snippet in docs or export a helper type.
   - Recommendation: Docs-only. The library never calls `express-session` itself; the typing is the consumer's concern.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `node:async_hooks` | NEW-01, NEW-02 | ✓ | Node 20 built-in | — |
| `node:crypto` randomUUID | NEW-02 | ✓ | Node 20 built-in | — |
| `node:url` pathToFileURL | UTIL-04 glob | ✓ | Node 20 built-in | — |
| `multer` | UTIL-01, UTIL-02 | optional peer — not installed | 2.1.1 available on npm | User must install; library throws actionable error |
| `cors` | UTIL-03 | optional peer — not installed | 2.8.6 available on npm | User must install; library throws actionable error |
| `tinyglobby` | UTIL-04 | ✓ installed as devDep | 0.2.16 | N/A (devDep available for testing) |
| `cookie` | INPUT-04 | optional peer — not installed | 1.1.1 available on npm | User must install; library throws actionable error |
| `express-session` | INPUT-05 | never installed (read only) | 1.19.0 available on npm | User installs and wires; library never imports |

**Missing dependencies with no fallback:** None — all optional peers have actionable install instructions.

**Missing dependencies with fallback:** N/A — all optional, feature gates prevent usage without installation.

---

## Validation Architecture

> `nyquist_validation: false` in `.planning/config.json` — Validation Architecture section skipped per configuration.

---

## Security Domain

Phase 4 introduces file upload, cookie handling, and CORS. These have direct security surface.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | yes (INPUT-05) | `express-session` (consumer-wired); library reads only |
| V4 Access Control | no | Handled by Phase 3 auth |
| V5 Input Validation | yes (INPUT-04, UTIL-01/02) | Standard Schema for cookies; explicit `limits`/`fileFilter` for uploads |
| V6 Cryptography | no | `crypto.randomUUID()` is CSPRNG — no hand-rolling |
| V12 File Storage | yes (UTIL-01/02) | multer `limits.fileSize` + `fileFilter` REQUIRED; registration throws if absent |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unbounded file upload (DoS) | Denial of Service | `limits.fileSize` REQUIRED; registration throws if absent (D-03) |
| Unrestricted file type upload | Elevation of Privilege | `fileFilter` REQUIRED; registration throws if absent (D-03) |
| Cookie injection via `Set-Cookie` header manipulation | Tampering | `cookie.parse()` reads `Cookie` request header only; no `Set-Cookie` emission by the library |
| CORS misconfiguration (`Access-Control-Allow-Origin: *` with credentials) | Tampering | `cors` package handles this; document that `cors({ origin: '*', credentials: true }` is invalid per spec |
| ALS context exfiltration across requests | Information Disclosure | Each request creates a new ALS store via `als.run()`; stores are isolated per async context; no cross-request leakage |
| `X-Request-Id` header injection (untrusted proxy) | Spoofing | Per D-12, the header is passed verbatim — document that consumers behind untrusted proxies should not trust the header; no sanitization by design |

---

## Sources

### Primary (HIGH confidence)
- Node.js `AsyncLocalStorage` docs (https://nodejs.org/api/async_context.html) — `run()`, `getStore()`, worker thread limitation
- Node.js `crypto.randomUUID()` docs (https://nodejs.org/api/crypto.html#cryptorandomuuid) — CSPRNG UUID v4
- multer README from npm view (https://github.com/expressjs/multer) — `.fields()` API, `limits`, `fileFilter` shapes, `req.files` structure
- tinyglobby exports confirmed via `node -e` on installed package — `glob`, `globSync`, `convertPathToPattern`
- cookie npm registry (https://www.npmjs.com/package/cookie) v1.1.1 — no `exports` field, CJS package
- cors npm registry (https://www.npmjs.com/package/cors) v2.8.6 — `CorsOptions` shape
- express-session npm registry v1.19.0 — store-agnostic, `req.session` API
- Codebase reads: `src/adapter/validation.ts`, `src/adapter/boot.ts`, `src/adapter/response.ts`, `src/adapter/router-build.ts`, `src/metadata/storage.ts`, `src/metadata/types.ts`, `src/types/resolved.ts`, `src/metadata/builder.ts`

### Secondary (MEDIUM confidence)
- multer v2.1.1 Express v5 compatibility — confirmed via npm metadata (no `peerDependencies` restriction); functional compatibility ASSUMED (no test run)
- `import('cors').default` accessor pattern for CJS-in-ESM — standard Node.js behavior; confirmed by general ESM/CJS interop documentation

### Tertiary (LOW confidence)
- tshy CJS dynamic-import behavior for lazy-loaded optional peers — ASSUMED based on tshy's `tsc` foundation; needs Phase 5 verification via `attw`/`publint`

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — all package versions verified against npm registry
- Architecture: HIGH — patterns derived from existing codebase + Node/Express official docs
- Pitfalls: HIGH — derived from known Node.js/Express/multer documented behaviors
- Glob-loader `.ts` interop: MEDIUM — depends on consumer runtime environment (documented as assumption)
- tshy CJS lazy-import: MEDIUM — deferred to Phase 5 verification

**Research date:** 2026-05-10
**Valid until:** 2026-08-10 (90 days; all packages are stable; Node 20 EOL April 2026 — confirm consumers have migrated to 22 before this date)

---

## RESEARCH COMPLETE
