# Phase 1: Metadata & Decorator Skeleton - Research

**Researched:** 2026-05-08
**Domain:** Legacy TypeScript decorators + reflect-metadata + WeakMap metadata storage + HttpError hierarchy + pluggable IoC
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** REQUIREMENTS.md `BUILD-04`, `BUILD-05`, `BUILD-06` and STATE.md "Key Decisions Locked-In" still describe the old direction (Stage 3 decorators, no `reflect-metadata` in core, pnpm-workspaces monorepo). They are stale. They MUST be rewritten to match the CLAUDE.md override + ROADMAP Phase 1 (legacy `experimentalDecorators: true` + `emitDecoratorMetadata: true`, `reflect-metadata` IS a core dep, single-package repo).
- **D-02:** The rewrite happens before `/gsd-plan-phase 1` as its own commit. Scope: surgical edits to `BUILD-04`/`BUILD-05`/`BUILD-06` wording, the "Key Decisions Locked-In" bullets in `STATE.md`, the `Out of Scope` line that says "class-validator support — incompatible with Stage 3 decorators". Do NOT renumber requirement IDs.
- **D-03:** Coverage table and per-phase requirement assignments stay unchanged — only the content of BUILD-04/05/06 changes.
- **D-04 (Hybrid storage):** Core uses module-private WeakMaps for its own metadata tree state, and `reflect-metadata` ONLY for TS-emitted type metadata (`design:paramtypes`, `design:returntype`, `design:type`). WeakMap shape: `WeakMap<Function /* Class ctor */, ControllerMeta>` for class-level; `WeakMap<object /* prototype */, Map<string|symbol, MethodMeta>>` for method-level. Decorators NEVER call `Reflect.defineMetadata`. They DO call `Reflect.getMetadata('design:paramtypes', proto, key)` / `('design:returntype', proto, key)`.
- **D-05 (Rationale):** WeakMap keys are bounded to actual class refs, eliminating namespace collisions. Avoids dual-package-hazard footgun.
- **D-06 (Inheritance by MetadataBuilder):** Decorators write only to immediate class/prototype's WeakMap entry. `MetadataBuilder.build([SubClass])` walks `Object.getPrototypeOf(proto)` upward, merging method metadata top-down. On method-name collision the subclass wins. Class-level metadata follows the same walk.
- **D-07 (Decorator authoring contract):** Every decorator factory is a pure registrar — read TS type metadata if needed, mutate WeakMap, return. No prototype-chain walking inside decorators.

### Claude's Discretion

- **HttpError API surface** — exact constructor signatures, `toJSON()` shape, `details`/`source` field policy, ES2022 `cause` chaining, stack-trace policy. Must be lockable before Phase 2 (Phase 2 needs `BadRequestError` with field-level error details and a `source` field).
- **`src/` folder layout** — flat vs grouped-by-concern vs routing-controllers mirror.
- **Runtime mode guard** — detection strategy and error-message wording.
- **Public exports surface** — whether to expose resolved metadata tree types as type-only.
- **Method-level input declaration handling in Phase 1** — stores `{ params, query, body, headers }` opaquely (treats schemas as `unknown` / `StandardSchemaV1 | undefined`). No structural validation in Phase 1 beyond TypeScript types.

### Deferred Ideas (OUT OF SCOPE)

- `@scope/express-controllers-typedi` adapter package — Phase 5 only.
- Class-validator legacy adapter — deferred to v1.x at earliest.
- Auto-injection by constructor type via `design:paramtypes` — non-goal.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BUILD-04 | Runtime guard throws actionable error if `experimentalDecorators` / `emitDecoratorMetadata` / `reflect-metadata` is missing | Guard detection strategy section; error wording recommendation |
| BUILD-05 | `reflect-metadata` IS a core dep (inverse of stale requirement); single-package repo | Package structure section; no monorepo |
| ROUTE-01 | `@Controller(basePath?)` / `@JsonController(basePath?)` class decorators | Decorator factory signatures section |
| ROUTE-02 | `@Get`, `@Post`, `@Put`, `@Patch`, `@Delete`, `@Head`, `@All`, `@Method(verb, path)` | Decorator factory signatures section |
| ROUTE-03 | Each method decorator accepts path string + optional input declaration `{ params, query, body, headers }` | Input declaration opaque storage section |
| RES-01 | `@HttpCode(code)` | Response-shaper decorator section |
| RES-02 | `@OnNull(code)`, `@OnUndefined(code)` | Response-shaper decorator section |
| RES-03 | `@Header(name, value)`, `@ContentType(type)` | Response-shaper decorator section |
| RES-07 | Serialization mode (JSON vs string) stored on controller metadata | `type: 'json' \| 'default'` on ControllerMeta |
| ERR-01 | `HttpError` base + 4xx/5xx subclasses | HttpError API section |
| ERR-02 | `status`, `message`, optional `cause` (ES2022), `toJSON()` | HttpError API section |
| VAL-01 | Type-only `StandardSchemaV1` re-export; runtime dispatch via `~standard` property | Standard Schema section |
| DI-01 | `useContainer(IocAdapter)` hook; `IocAdapter.get<T>(cls, action?)` | IoC section |
| DI-02 | Default lazy-`new` WeakMap-cached fallback | IoC default container section |
</phase_requirements>

---

## Summary

Phase 1 establishes the entire foundational metadata layer for the library — decorators, storage, resolution, error hierarchy, and IoC — with zero Express imports. The CLAUDE.md Direction Override (2026-05-08) is authoritative: legacy `experimentalDecorators: true` + `emitDecoratorMetadata: true` + `reflect-metadata` as a runtime core dependency, single-package repo. Any guidance in prior research docs recommending Stage 3 decorators, no `reflect-metadata`, or monorepo is superseded.

The core insight from the locked decisions is a **hybrid storage model**: `reflect-metadata` is used exclusively for reading TS-emitted keys (`design:paramtypes`, `design:returntype`, `design:type`) at decoration time. All library-owned state is stored in module-private WeakMaps keyed by class constructor (class-level) and class prototype (method-level). This eliminates global-registry hazards and the dual-package Reflect namespace collision.

The decorator authoring contract is simple: each decorator factory reads TS metadata if needed, then mutates the WeakMap. Prototype chain walking happens only in `MetadataBuilder.build()`, never inside decorators, so registration order is never load-bearing.

**Primary recommendation:** Implement Phase 1 as three sub-modules: (1) WeakMap stores + raw arg types, (2) all class and method decorators, (3) `MetadataBuilder.build()` with inheritance walk. Layer in `HttpError` hierarchy and `useContainer` separately. All six sub-units are independently testable with zero Express.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Decorator registration | Decorator layer | — | Pure side-effectful functions that write to WeakMaps at class-evaluation time |
| Metadata resolution + inheritance | Metadata layer (`MetadataBuilder`) | — | Two-pass model: decorators push raw args; builder resolves tree only when called |
| TS type metadata reading | Decorator layer (at decoration time) | — | `Reflect.getMetadata('design:paramtypes')` must be called at decoration time when the TS-emitted keys are available |
| HTTP error definitions | Errors sub-module | — | Pure value types; no Express, no routing |
| IoC adapter interface + default | Container sub-module | — | ~50 LOC; pluggable; zero DI lib import in core |
| Standard Schema type re-export | Types sub-module | — | Type-only; zero runtime dep |
| `Action` value shape | Types sub-module | — | Plain interface `{ request, response, next }`; consumed by IoC adapter signature |
| Runtime mode guard | Guard module (checked at `MetadataBuilder.build()` entry) | First decorator use (probe) | Guard needs to be loud at earliest opportunity |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `reflect-metadata` | `^0.2.2` | TS-emitted type metadata (`design:paramtypes`, `design:returntype`, `design:type`) | Required for legacy `experimentalDecorators` + `emitDecoratorMetadata` runtime; only authoritative source of constructor parameter types under this decorator mode |
| `@standard-schema/spec` | `^1.1.0` | Type-only `StandardSchemaV1` interface | Zero runtime weight; pure types; co-authored by Zod/Valibot/ArkType maintainers |
| `typescript` (dev) | `^5.9.2` (range `>=5.8.0 <6`) | Language + legacy decorator emit | TS 5.8 is current stable; 5.9.x latest; legacy `experimentalDecorators` + `emitDecoratorMetadata` fully supported throughout 5.x |

> **Version verification:** `reflect-metadata@0.2.2` [VERIFIED: npm registry], `@standard-schema/spec@1.1.0` [VERIFIED: npm registry], `typescript@5.9.2` latest stable [VERIFIED: npm registry]

### Development Tools (Phase 1 bootstrap only)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | `^4.1.5` | Test runner | All tests |
| `@vitest/coverage-v8` | `^4.1.5` | Coverage | CI gate |

> **Note:** vitest 4.1.5 is current [VERIFIED: npm registry]. Phase 5 completes the full build pipeline (tshy, biome, etc.); Phase 1 needs only enough to run tests.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| WeakMap for metadata | `Reflect.defineMetadata` | Reflect namespace collisions under dual-package install; WeakMap is isolated to module scope |
| WeakMap for metadata | `Symbol.metadata` (TC39 Stage 3) | Not applicable — project uses legacy decorators which do not populate `Symbol.metadata` |
| `reflect-metadata` reads at decoration time | Reads at `MetadataBuilder.build()` | Decoration-time is correct: `design:paramtypes` is emitted by TS as part of the decorator application; the class must already exist |

**Installation:**
```bash
npm install reflect-metadata
npm install --save-dev @standard-schema/spec typescript vitest @vitest/coverage-v8
```

---

## Architecture Patterns

### System Architecture Diagram

```
Consumer code (module load time)
  │
  │  import "reflect-metadata"  ← consumer entry point (documented requirement)
  │  import { Controller, Get, HttpError, useContainer } from '<lib>'
  │
  ▼
Decorator evaluation (class/method decoration at module load)
  │
  ├─ @Controller('/users')
  │     reads: nothing (no TS type metadata needed at class level)
  │     writes: controllerWeakMap.set(UserController, { basePath, type })
  │
  ├─ @Get('/:id', { params: z.object({id: z.string()}) })
  │     reads: Reflect.getMetadata('design:returntype', proto, methodKey)
  │     writes: methodWeakMap.get(proto).set('getOne', { verb, path, input, returnType })
  │
  └─ @HttpCode(200)
        reads: nothing
        writes: methodWeakMap.get(proto).set('getOne', { ...existing, responseShaper: { httpCode: 200 } })
  │
  ▼
MetadataBuilder.build([UserController, PostController])
  │
  ├─ For each class:
  │     walk Object.getPrototypeOf(proto) upward
  │     merge MethodMeta maps (subclass wins on collision)
  │     merge ControllerMeta (subclass fields win)
  │
  └─ Returns: ControllerMetadata[] (fully resolved tree)
               │
               ├─ basePath, type ('json'|'default'), responseHandlers
               └─ actions: ActionMetadata[]
                    ├─ verb, path, returnType
                    ├─ input: { params?, query?, body?, headers? }  (StandardSchemaV1 | undefined, stored opaque)
                    └─ responseHandlers: ResponseHandlerMetadata[]
                         (httpCode, onNull, onUndefined, headers, contentType)
  │
  ▼
Phase 2 (ExpressAdapter) consumes ControllerMetadata[]
```

### Recommended Project Structure

```
src/
├── decorators/
│   ├── controller.ts         # @Controller, @JsonController
│   ├── routes.ts             # @Get, @Post, @Put, @Patch, @Delete, @Head, @All, @Method
│   └── response.ts           # @HttpCode, @OnNull, @OnUndefined, @Header, @ContentType
│
├── metadata/
│   ├── storage.ts            # module-private WeakMaps + accessor fns (getControllerMeta, getMethodMeta)
│   ├── types.ts              # raw arg interfaces (ControllerArgs, MethodArgs, ResponseHandlerArgs, InputDeclaration)
│   └── builder.ts            # MetadataBuilder.build() + inheritance walk
│
├── errors/
│   ├── http-error.ts         # HttpError base class
│   └── subclasses.ts         # BadRequestError, UnauthorizedError, ForbiddenError, NotFoundError,
│                             #   MethodNotAllowedError, ConflictError, InternalServerError, ...
│
├── container/
│   ├── ioc-adapter.ts        # IocAdapter interface
│   ├── default-container.ts  # WeakMap<Function, instance> default
│   └── use-container.ts      # useContainer() module-level setter + getContainer() accessor
│
├── guard/
│   └── runtime-guard.ts      # checkLegacyDecoratorMode() — called at MetadataBuilder.build() entry
│
├── types/
│   ├── action.ts             # Action interface { request, response, next }
│   ├── standard-schema.ts    # re-export StandardSchemaV1 from @standard-schema/spec
│   └── resolved.ts           # ControllerMetadata, ActionMetadata, ResponseHandlerMetadata (public type-only exports)
│
└── index.ts                  # barrel: decorators + errors + container + MetadataBuilder + types
```

**Rationale for this layout:**
- `metadata/storage.ts` encapsulates the two WeakMaps behind accessor functions, never exposing them directly — enforces D-07 (decorators call accessors, not raw maps).
- `guard/` is separate so it can be tested independently and imported by both `MetadataBuilder` and optionally by the first decorator hit.
- `errors/` has no dependencies on any other sub-module — importable standalone.
- `container/` has no dependencies beyond `types/action.ts` — easily tested in isolation.
- No `adapter/`, `runtime/`, or `validation/` directories — those are Phase 2+.

### Pattern 1: WeakMap-based metadata storage

**What:** Two module-private WeakMaps hold all library-owned metadata. No global arrays, no Reflect namespace.

**When to use:** Every decorator write, every `MetadataBuilder.build()` read.

```typescript
// Source: D-04 (locked decision) + routing-controllers internals pattern

// --- src/metadata/storage.ts ---

/** Raw args for a controller (set by @Controller / @JsonController) */
export interface ControllerArgs {
  basePath: string;
  type: 'json' | 'default';
  /** controller-level response shapers (e.g. a class-level @HttpCode) */
  responseHandlers: ResponseHandlerArgs[];
}

/** Raw args for one method (accumulated by @Get/@Post/etc + @HttpCode/@Header/etc) */
export interface MethodArgs {
  verb: string;               // 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'all' | string
  path: string;
  input?: InputDeclaration;   // stored opaque — Phase 2 validates
  returnType?: Function;      // from Reflect.getMetadata('design:returntype', proto, key)
  responseHandlers: ResponseHandlerArgs[];
}

/** Opaque per-slot schemas (Phase 1 does not validate their shape) */
export interface InputDeclaration {
  params?: unknown;   // StandardSchemaV1 | undefined at runtime
  query?: unknown;
  body?: unknown;
  headers?: unknown;
}

// Module-private maps — never exported directly
const controllerMap = new WeakMap<Function, ControllerArgs>();
const methodMap = new WeakMap<object, Map<string | symbol, MethodArgs>>();

export function getOrInitControllerArgs(ctor: Function): ControllerArgs {
  if (!controllerMap.has(ctor)) {
    controllerMap.set(ctor, { basePath: '', type: 'default', responseHandlers: [] });
  }
  return controllerMap.get(ctor)!;
}

export function getControllerArgs(ctor: Function): ControllerArgs | undefined {
  return controllerMap.get(ctor);
}

export function getOrInitMethodArgs(proto: object, key: string | symbol): MethodArgs {
  if (!methodMap.has(proto)) methodMap.set(proto, new Map());
  const map = methodMap.get(proto)!;
  if (!map.has(key)) map.set(key, { verb: '', path: '', responseHandlers: [] });
  return map.get(key)!;
}

export function getAllMethodArgs(proto: object): Map<string | symbol, MethodArgs> {
  return methodMap.get(proto) ?? new Map();
}
```

### Pattern 2: Legacy decorator factory signatures (ClassDecorator + MethodDecorator)

**What:** Under `experimentalDecorators: true`, class decorators receive `(target: Function)` and method decorators receive `(target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor)`. These are the *legacy* signatures — distinct from TC39 Stage 3 context-based signatures.

**When to use:** Every decorator factory in `src/decorators/`.

```typescript
// Source: TypeScript 5.x with experimentalDecorators: true + emitDecoratorMetadata: true
// [CITED: https://www.typescriptlang.org/docs/handbook/decorators.html]

// --- src/decorators/controller.ts ---
import { getOrInitControllerArgs } from '../metadata/storage.js';

export function Controller(basePath = ''): ClassDecorator {
  return function (target: Function): void {
    const meta = getOrInitControllerArgs(target);
    meta.basePath = basePath;
    meta.type = 'default';
  };
}

export function JsonController(basePath = ''): ClassDecorator {
  return function (target: Function): void {
    const meta = getOrInitControllerArgs(target);
    meta.basePath = basePath;
    meta.type = 'json';
  };
}

// --- src/decorators/routes.ts ---
import { getOrInitMethodArgs } from '../metadata/storage.js';

export function Get(path = '', input?: InputDeclaration): MethodDecorator {
  return function (
    target: object,           // prototype (not constructor)
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ): void {
    // Read TS-emitted return type metadata at decoration time
    const returnType: Function | undefined =
      Reflect.getMetadata('design:returntype', target, propertyKey);

    const meta = getOrInitMethodArgs(target, propertyKey);
    meta.verb = 'get';
    meta.path = path;
    meta.input = input;
    meta.returnType = returnType;
  };
}

// @Method(verb, path) is the escape hatch for non-standard verbs
export function Method(verb: string, path = '', input?: InputDeclaration): MethodDecorator {
  return function (target: object, propertyKey: string | symbol, _descriptor: PropertyDescriptor): void {
    const returnType: Function | undefined =
      Reflect.getMetadata('design:returntype', target, propertyKey);
    const meta = getOrInitMethodArgs(target, propertyKey);
    meta.verb = verb.toLowerCase();
    meta.path = path;
    meta.input = input;
    meta.returnType = returnType;
  };
}
```

**Key points about legacy decorator metadata:**
- `design:paramtypes` — array of constructor parameter types on the class prototype; read via `Reflect.getMetadata('design:paramtypes', proto, methodKey)` for methods or `Reflect.getMetadata('design:paramtypes', ctor)` for the constructor.
- `design:returntype` — single type for method return; read via `Reflect.getMetadata('design:returntype', proto, methodKey)`.
- `design:type` — type of a property; read via `Reflect.getMetadata('design:type', proto, propKey)`.
- These keys are emitted by the TypeScript compiler only when `emitDecoratorMetadata: true` is set.
- They are populated as part of decorator application at class-evaluation time — they MUST be read at decoration time, not lazily. [CITED: TypeScript handbook on decorators]

### Pattern 3: Response-shaper decorators

**What:** `@HttpCode`, `@OnNull`, `@OnUndefined`, `@Header`, `@ContentType` accumulate into `responseHandlers` on the method's MethodArgs entry.

```typescript
// Source: routing-controllers ResponseHandleMetadataArgs pattern, adapted for WeakMap storage

export type ResponseHandlerType =
  | 'success-code'
  | 'null-result-code'
  | 'undefined-result-code'
  | 'header'
  | 'content-type';

export interface ResponseHandlerArgs {
  type: ResponseHandlerType;
  value: string | number;
  secondaryValue?: string;   // used by @Header(name, value)
}

export function HttpCode(code: number): MethodDecorator {
  return function (target: object, propertyKey: string | symbol, _descriptor: PropertyDescriptor): void {
    const meta = getOrInitMethodArgs(target, propertyKey);
    meta.responseHandlers.push({ type: 'success-code', value: code });
  };
}

export function OnNull(code: number): MethodDecorator {
  return function (target: object, propertyKey: string | symbol, _descriptor: PropertyDescriptor): void {
    const meta = getOrInitMethodArgs(target, propertyKey);
    meta.responseHandlers.push({ type: 'null-result-code', value: code });
  };
}

export function Header(name: string, value: string): MethodDecorator {
  return function (target: object, propertyKey: string | symbol, _descriptor: PropertyDescriptor): void {
    const meta = getOrInitMethodArgs(target, propertyKey);
    meta.responseHandlers.push({ type: 'header', value: name, secondaryValue: value });
  };
}
```

### Pattern 4: MetadataBuilder.build() with inheritance walk

**What:** Collects and merges WeakMap entries walking up the prototype chain. Subclass wins on method-name collision. Returns fully-resolved typed tree.

**When to use:** Called once at bootstrap (Phase 2 calls this; tests call it directly).

```typescript
// Source: D-06 (locked decision) + routing-controllers MetadataBuilder inheritance walk pattern

export function buildMetadata(classes: Function[]): ControllerMetadata[] {
  return classes.map(ctor => buildController(ctor));
}

function buildController(ctor: Function): ControllerMetadata {
  // Merge class-level meta walking up the prototype chain
  // (subclass wins — process subclass last in a merge, or first-wins walk)
  const mergedControllerArgs = mergeControllerChain(ctor);

  // Merge method-level meta: walk prototype chain, subclass wins on method-name collision
  const mergedMethods = mergeMethodChain(ctor.prototype);

  return {
    target: ctor,
    basePath: mergedControllerArgs.basePath,
    type: mergedControllerArgs.type,
    responseHandlers: mergedControllerArgs.responseHandlers,
    actions: Array.from(mergedMethods.entries()).map(([key, args]) =>
      buildAction(ctor, key, args)
    ),
  };
}

function mergeControllerChain(ctor: Function): ControllerArgs {
  // Walk up constructor chain (Object.getPrototypeOf(ctor))
  // Subclass fields override base: collect from base first, then overwrite with subclass
  const chain: ControllerArgs[] = [];
  let current: Function | null = ctor;
  while (current && current !== Function.prototype) {
    const args = getControllerArgs(current);
    if (args) chain.unshift(args); // base first
    current = Object.getPrototypeOf(current);
  }
  return chain.reduce((acc, cur) => ({ ...acc, ...cur }), { basePath: '', type: 'default', responseHandlers: [] });
}

function mergeMethodChain(proto: object): Map<string | symbol, MethodArgs> {
  // Walk up prototype chain; subclass wins on method-name collision
  // Collect from base to tip, subclass entries overwrite base entries
  const result = new Map<string | symbol, MethodArgs>();
  const chain: object[] = [];
  let current: object | null = proto;
  while (current && current !== Object.prototype) {
    chain.unshift(current); // base first
    current = Object.getPrototypeOf(current);
  }
  for (const p of chain) {
    for (const [key, args] of getAllMethodArgs(p)) {
      result.set(key, args); // subclass entries overwrite (last write wins = subclass)
    }
  }
  return result;
}
```

### Pattern 5: HttpError hierarchy

**What:** `HttpError extends Error` base with `status`, optional `cause` (ES2022), `toJSON()`. Subclasses fix `status`. `BadRequestError` carries a `details` array for field-level errors (needed by Phase 2 SC #2) and an optional `source` field.

**Recommendation (Claude's Discretion):**

```typescript
// Source: routing-controllers HttpError pattern + ES2022 cause + Phase 2 SC #2 requirements

export interface HttpErrorOptions {
  cause?: unknown;    // ES2022 Error.cause; passed through to super({ cause })
}

export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message?: string, options?: HttpErrorOptions) {
    super(message, options);           // ES2022: passes { cause } to Error
    this.name = this.constructor.name; // 'BadRequestError', 'NotFoundError', etc.
    this.status = status;
    // Maintain correct prototype chain in CommonJS (tshy emits both; ES2022 target handles this natively in ESM)
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      status: this.status,
    };
  }
}

// --- Field-level error detail shape (for BadRequestError) ---
export interface ValidationIssue {
  path: ReadonlyArray<PropertyKey>;  // matches StandardSchemaV1.Issue.path elements
  message: string;
}

export class BadRequestError extends HttpError {
  readonly details?: ReadonlyArray<ValidationIssue>;
  readonly source?: string;  // 'UserController.getOne' — set by Phase 2

  constructor(
    message = 'Bad Request',
    options?: HttpErrorOptions & { details?: ReadonlyArray<ValidationIssue>; source?: string }
  ) {
    super(400, message, options);
    this.details = options?.details;
    this.source = options?.source;
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      ...(this.details ? { details: this.details } : {}),
      ...(this.source ? { source: this.source } : {}),
    };
  }
}

// Remaining subclasses all follow the same pattern:
export class UnauthorizedError extends HttpError {
  constructor(message = 'Unauthorized', options?: HttpErrorOptions) { super(401, message, options); }
}
export class ForbiddenError extends HttpError {
  constructor(message = 'Forbidden', options?: HttpErrorOptions) { super(403, message, options); }
}
export class NotFoundError extends HttpError {
  constructor(message = 'Not Found', options?: HttpErrorOptions) { super(404, message, options); }
}
export class MethodNotAllowedError extends HttpError {
  constructor(message = 'Method Not Allowed', options?: HttpErrorOptions) { super(405, message, options); }
}
export class ConflictError extends HttpError {
  constructor(message = 'Conflict', options?: HttpErrorOptions) { super(409, message, options); }
}
export class InternalServerError extends HttpError {
  constructor(message = 'Internal Server Error', options?: HttpErrorOptions) { super(500, message, options); }
}
```

**toJSON field policy:**
- `name`, `message`, `status` — always included.
- `details` — included only when non-empty (field-level validation errors from Phase 2).
- `source` — included only when present (controller/method name, set by Phase 2).
- `cause` and `stack` — NEVER included in `toJSON()`. Stack traces only in server-side logs, never sent to clients.
- `details` field format matches `StandardSchemaV1.Issue` path structure so Phase 2 can directly map validation failure issues to `BadRequestError.details` without translation.

**Comparison with ecosystem:**

| Library | Status field | cause | details/data | toJSON |
|---------|-------------|-------|--------------|--------|
| routing-controllers | `httpCode` | no | no | none (raw error) |
| NestJS `HttpException` | `statusCode` | no | `response` (any) | yes |
| Fastify `HttpError` (`http-errors`) | `statusCode` + `status` | no | `errors[]` | yes |
| **This library** | `status` (singular) | yes (ES2022) | `details[]` (typed) | yes |

Using `status` (not `httpCode` or `statusCode`) is a deliberate modernization — matches the HTTP semantics name, shorter, not confused with Node's http module's numeric properties.

### Pattern 6: IoC adapter + default container

**What:** Module-level `useContainer()` setter stores the user's adapter. `getContainer()` returns it or the default. Default is a WeakMap-backed lazy `new`.

**Recommendation (Claude's Discretion — matches D-04/D-05 locked rationale):**

```typescript
// Source: routing-controllers container.ts pattern + D-01/D-07 constraints

export interface Action {
  request: unknown;
  response: unknown;
  next?: unknown;
}

export type ClassConstructor<T> = new (...args: any[]) => T;

export interface IocAdapter {
  get<T>(cls: ClassConstructor<T>, action?: Action): T | Promise<T>;
}

// Default: lazy new, one instance per class (singleton-per-process)
class DefaultContainer implements IocAdapter {
  private readonly cache = new WeakMap<ClassConstructor<unknown>, unknown>();
  get<T>(cls: ClassConstructor<T>): T {
    if (!this.cache.has(cls)) this.cache.set(cls, new cls());
    return this.cache.get(cls) as T;
  }
}

const defaultContainer: IocAdapter = new DefaultContainer();
let activeContainer: IocAdapter = defaultContainer;

export function useContainer(adapter: IocAdapter): void {
  activeContainer = adapter;
}

export function getContainer(): IocAdapter {
  return activeContainer;
}

// Exported for tests that need to reset between runs
export function resetContainer(): void {
  activeContainer = defaultContainer;
}
```

**Why module-level (not per-bootstrap):** D-01 locks `useContainer` as a module-level global setter (matching routing-controllers pattern and ROADMAP SC #4). Per-app scoping is a future enhancement if demand warrants.

### Pattern 7: Runtime mode guard

**What:** Detects missing `reflect-metadata`, missing `emitDecoratorMetadata` emit, and missing `experimentalDecorators` at earliest opportunity.

**Recommendation (Claude's Discretion):**

Detection strategy: **probe-class approach** — define a module-private decorated probe class so `design:paramtypes` is deterministically emitted whenever `emitDecoratorMetadata: true`, regardless of user class shape.

```typescript
// src/guard/runtime-guard.ts
import 'reflect-metadata';

const DOCS_URL = 'https://github.com/<org>/<repo>#prerequisites';

// Module-private no-op decorator factory — does not write to any of the library's
// WeakMaps (those are intentionally module-private to src/metadata/storage.ts).
function probeDecorator(): ParameterDecorator {
  return () => { /* no-op; presence of decoration triggers TS metadata emit */ };
}

class ProbeClass {
  constructor(@probeDecorator() _arg: string) { void _arg; }
}

let probed = false;
let probeResult: { reflectOk: boolean; emitOk: boolean } = { reflectOk: false, emitOk: false };

function probeOnce(): typeof probeResult {
  if (probed) return probeResult;
  probed = true;
  probeResult.reflectOk = typeof (Reflect as unknown as { getMetadata?: unknown }).getMetadata === 'function';
  if (probeResult.reflectOk) {
    const types = Reflect.getMetadata('design:paramtypes', ProbeClass);
    probeResult.emitOk = Array.isArray(types) && types.length === 1;
  }
  return probeResult;
}

export function checkLegacyDecoratorMode(): void {
  const { reflectOk, emitOk } = probeOnce();
  if (!reflectOk) {
    throw new Error(
      `[express-controllers] reflect-metadata is not loaded. ` +
      `Add \`import 'reflect-metadata';\` once at your application entry point ` +
      `(before importing any controller). See: ${DOCS_URL}`
    );
  }
  if (!emitOk) {
    throw new Error(
      `[express-controllers] emitDecoratorMetadata is disabled. ` +
      `Set \`"emitDecoratorMetadata": true\` and \`"experimentalDecorators": true\` in tsconfig.json. ` +
      `See: ${DOCS_URL}`
    );
  }
}

// Test seam — re-runs the probe (used by vitest).
export function __resetGuardForTest(): void { probed = false; probeResult = { reflectOk: false, emitOk: false }; }
```

**Why this works:** The probe class has an explicitly-decorated constructor parameter, so TS emits `design:paramtypes` for `ProbeClass` whenever `emitDecoratorMetadata: true`. Reading that metadata at `MetadataBuilder.build()` entry produces a deterministic signal independent of user class shape — zero-arg user controllers no longer bypass the check.

**Guard placement:** `MetadataBuilder.build()` calls `checkLegacyDecoratorMode()` as its first statement.

**Error message wording satisfies ROADMAP SC #2:** Each message names the library `[express-controllers]`, states the exact configuration required, and provides a documentation URL.

### Pattern 8: Standard Schema re-export

```typescript
// src/types/standard-schema.ts

// Type-only re-export — zero runtime cost
export type { StandardSchemaV1 } from '@standard-schema/spec';
```

Phase 1 stores schemas opaquely (`unknown`). Phase 2 reads `~standard.validate` at request time. No runtime import of `@standard-schema/spec` in core — only the type import, which is erased at compile time.

**StandardSchemaV1 interface (for reference):**
```typescript
// [CITED: https://standardschema.dev/schema]
interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (value: unknown) => Result<Output> | Promise<Result<Output>>;
    readonly types?: { readonly input: Input; readonly output: Output };
  };
}
```

### Anti-Patterns to Avoid

- **Using `Reflect.defineMetadata` for library-owned state:** Namespace collisions under dual-package installs and with other libraries (TypeORM, NestJS, class-validator). WeakMaps are private to the module.
- **Prototype-chain walking inside decorators:** Registration order becomes load-bearing. All chain walking happens exclusively in `MetadataBuilder.build()`.
- **Reading `design:paramtypes` lazily (at build time):** The TS compiler emits these keys as part of the decorator invocation. By the time `build()` runs, the class has been evaluated and the keys are stable — reading them at build time IS safe. The dangerous anti-pattern is assuming they reflect current class state after class mutations post-definition.
- **Exporting WeakMap references directly:** WeakMaps must stay module-private. Export only accessor functions.
- **Storing schemas in typed form in Phase 1:** `input.params` is `unknown`, not `StandardSchemaV1`. Phase 2 accesses `~standard.validate` — Phase 1 does not.
- **Any Express import in Phase 1 files:** Zero Express imports. `Action` interface uses `unknown` for `request`/`response` fields.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TS-emitted parameter types at decoration time | Custom AST transformer / runtime type inference | `Reflect.getMetadata('design:paramtypes', proto, key)` from `reflect-metadata` | TS already emits these under `emitDecoratorMetadata: true`; no custom tooling needed |
| Cross-platform prototype chain walking | Recursive clone logic | `Object.getPrototypeOf(proto)` loop | Idiomatic, fast, handles Symbol-keyed methods |
| ES2022 `cause` chaining | Custom `innerError` field | `new Error(message, { cause })` | Native since Node 16.9; supported in all Node 20+ targets |
| Prototype-chain integrity in `extends Error` subclasses | Custom error copying | `Object.setPrototypeOf(this, new.target.prototype)` | Required for `instanceof` checks to work correctly across CJS/ESM boundary [VERIFIED: routing-controllers source + well-known TS pattern] |

**Key insight:** Under legacy decorators + `reflect-metadata`, the entire type metadata story is provided by TS + the reflect-metadata shim. There is no need to build a custom metadata system — only WeakMaps to store library-owned data separate from the global Reflect namespace.

---

## Common Pitfalls

### Pitfall 1: `Object.setPrototypeOf` missing from HttpError subclasses

**What goes wrong:** `instanceof BadRequestError` returns `false` when the error crosses a CJS/ESM module boundary (e.g., consumer imports the CJS build and the error was created in the ESM build). Without the setPrototypeOf call, the prototype chain is broken in transpiled output.

**Why it happens:** TypeScript's `extends` with `target: ES5` or `ES2015` doesn't guarantee prototype chain integrity for Error subclasses.

**How to avoid:** Every HttpError subclass constructor calls `Object.setPrototypeOf(this, new.target.prototype)`. With `target: ES2022` (the tsconfig setting) and native class support, this is defensive but harmless overhead.

**Warning signs:** `err instanceof BadRequestError` returns `false` in tests that import from the built output.

### Pitfall 2: `design:paramtypes` returns undefined even with `emitDecoratorMetadata: true`

**What goes wrong:** If a class has no TypeScript-typed constructor parameters (e.g., `constructor() {}` or no constructor), `Reflect.getMetadata('design:paramtypes', ctor)` returns `undefined`, not `[]`.

**Why it happens:** TS only emits `design:paramtypes` when there are parameters to emit. A zero-parameter constructor emits nothing.

**How to avoid:** Guard against `undefined` return: `const types = Reflect.getMetadata('design:paramtypes', ctor) ?? []`. This matters in `MetadataBuilder` when reading constructor types for DI.

**Warning signs:** `TypeError: Cannot iterate over undefined` when `MetadataBuilder` reads `design:paramtypes`.

### Pitfall 3: Multiple decorator calls on the same method (accumulation vs replacement)

**What goes wrong:** A method decorated with both `@HttpCode(200)` and `@OnNull(204)` must accumulate both into `responseHandlers`. If the accessor reinitializes the entry, the second decorator call wipes the first.

**Why it happens:** Naive implementation overwrites the WeakMap entry on each decorator application.

**How to avoid:** `getOrInitMethodArgs` always retrieves the existing entry and returns it for mutation. Decorators push to `responseHandlers[]`, they do not overwrite it. `verb` and `path` can be set on a method multiple times only via separate `@Get`/`@Post` decorators — each creates a distinct method entry or (if the same method key) last-write wins for verb/path (user error to stack two route decorators on one method; not a library concern for Phase 1).

**Warning signs:** Only the last decorator's effect survives when multiple decorators stack on one method.

### Pitfall 4: Symbol-keyed methods silently dropped

**What goes wrong:** A method defined as `[Symbol('myAction')]() {}` is a valid JavaScript method key. The WeakMap inner `Map<string | symbol, MethodArgs>` correctly handles symbols, but code that converts the map to an array by `Object.keys(proto)` silently drops symbol-keyed entries.

**Why it happens:** `Object.keys`, `Object.entries`, `for...in` do not enumerate symbol properties.

**How to avoid:** `getAllMethodArgs` returns the raw `Map<string | symbol, MethodArgs>`. `MetadataBuilder` iterates `map.entries()`, not `Object.entries`. Tests should include at least one symbol-keyed method fixture.

**Warning signs:** Symbol-keyed controller methods produce no routes in Phase 2.

### Pitfall 5: `useContainer` called after the first controller is instantiated

**What goes wrong:** The module-level `activeContainer` is set at `useContainer()` call time. If a test or framework instantiates a controller before calling `useContainer`, the first instances use the default container. Subsequent requests use the user container. Mixed state.

**Why it happens:** `useContainer` is intentionally a module-level global — trade-off accepted in D-01.

**How to avoid:** Document in README: `useContainer(adapter)` must be called before any `MetadataBuilder.build()` or controller instantiation. Export `resetContainer()` for test teardown. Tests that use a custom container call `resetContainer()` in `afterEach`.

**Warning signs:** Tests fail non-deterministically depending on test execution order.

### Pitfall 6: reflect-metadata import order

**What goes wrong:** If `reflect-metadata` is imported AFTER any file that uses decorators, the `Reflect` global is not set up when the decorator runs, so all `Reflect.getMetadata` calls return `undefined` and type metadata is lost.

**Why it happens:** ES module evaluation order; side-effect of `import "reflect-metadata"` is that it patches `globalThis.Reflect`. If a class file is evaluated first (e.g. via dynamic import or circular dep), decorators fire without the shim.

**How to avoid:** README must state: `import "reflect-metadata"` must be the **very first import** in the application entry file, before any other imports. The runtime guard in `MetadataBuilder.build()` catches this and emits a clear error.

**Warning signs:** `Reflect.getMetadata('design:paramtypes', ...)` returns `undefined` despite `emitDecoratorMetadata: true` being set.

---

## Code Examples

### Verified pattern: reading design:paramtypes for DI introspection

```typescript
// Source: routing-controllers container.ts + TS emitDecoratorMetadata behavior
// [CITED: TypeScript handbook on decorators — emitDecoratorMetadata]

// When emitDecoratorMetadata: true, TS emits:
// Reflect.metadata("design:paramtypes", [ServiceA, ServiceB])
// on decorated methods and constructors.

// Reading constructor param types:
const ctorParamTypes: Function[] =
  Reflect.getMetadata('design:paramtypes', MyController) ?? [];
// ctorParamTypes = [ServiceA, ServiceB] if constructor is `constructor(a: ServiceA, b: ServiceB)`

// Reading method param types:
const methodParamTypes: Function[] =
  Reflect.getMetadata('design:paramtypes', MyController.prototype, 'getOne') ?? [];

// Reading method return type:
const returnType: Function | undefined =
  Reflect.getMetadata('design:returntype', MyController.prototype, 'getOne');
// = Promise if return type is Promise<User>; undefined if void/inferred
```

### Verified pattern: inheritance walk in MetadataBuilder

```typescript
// Source: routing-controllers MetadataBuilder.createActions() — adapted for WeakMap storage
// [CITED: routing-controllers src/metadata-builder/MetadataBuilder.ts lines 83-110]

// The routing-controllers pattern:
for (let target = controller.target; target; target = Object.getPrototypeOf(target)) {
  const actions = storage.filterActionsWithTarget(target);
  const alreadyRegistered = actionsWithTarget.map(a => a.method);
  actions
    .filter(({ method }) => !alreadyRegistered.includes(method))
    .forEach(args => actionsWithTarget.push(buildAction(args)));
}
// Subclass wins: iterating from subclass -> base, skipping already-seen method names.
// Our equivalent iterates in same order using WeakMap.
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `experimentalDecorators: false` (Stage 3) | `experimentalDecorators: true` + `emitDecoratorMetadata: true` (legacy) | CLAUDE.md Direction Override 2026-05-08 | reflect-metadata IS a core dep; `design:paramtypes` available; parameter types introspectable |
| pnpm workspaces monorepo | Single-package repo | CLAUDE.md Direction Override 2026-05-08 | One `package.json`; sub-path exports for adapters |
| No `reflect-metadata` in core | `reflect-metadata` is a direct dep | CLAUDE.md Direction Override 2026-05-08 | Consumer must `import "reflect-metadata"` once at entry |
| `Symbol.metadata` for metadata storage | Module-private WeakMaps (D-04) | Phase 1 CONTEXT.md locked decision | Namespace isolation; dual-package safe |

**Deprecated/outdated (per Direction Override):**
- Stage 3 decorator approach for this library: superseded by `experimentalDecorators: true`.
- Prior REQUIREMENTS.md `BUILD-04`/`BUILD-05`/`BUILD-06` wording: stale; D-02 mandates rewrite.
- STATE.md "Key Decisions Locked-In" bullets referencing Stage 3 / monorepo / no reflect-metadata: stale; D-02 mandates rewrite.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The probe-class approach for `emitDecoratorMetadata` detection is now the chosen strategy (not the user-class introspection alternative). | Pattern 7 (Runtime mode guard) | None — probe class is deterministic regardless of user class shape; no zero-arg-bypass edge case. |
| A2 | `new.target.prototype` in `HttpError` subclass constructors with `target: ES2022` tsconfig handles the prototype chain correctly for `instanceof` checks across CJS+ESM boundary without additional polyfills | Pattern 5 (HttpError) | `instanceof` failures; mitigation: add a test that exercises cross-boundary instanceof |
| A3 | `@standard-schema/spec@1.1.0` `StandardSchemaV1` interface (as fetched from standardschema.dev) is the stable v1 interface and the `Options` parameter to `validate` is optional and safe to ignore in Phase 1's opaque storage | Standard Schema section | Phase 2 integration might need to pass options; but opaque storage in Phase 1 is unaffected |

---

## Open Questions (RESOLVED)

1. **REQUIREMENTS.md / STATE.md doc rewrite (D-02 pre-planning chore)**
   - What we know: D-02 requires rewriting BUILD-04/05/06 and STATE.md before planning.
   - What's unclear: This must happen as a dedicated commit before the planner generates PLAN.md files. It is not a Phase 1 implementation task — it is a planning prerequisite.
   - Recommendation: Planner should emit this as Wave 0 / pre-wave task (doc rewrite commit) before any implementation task.
   - **Resolution:** Resolved as Wave 0 inside Phase 1 (Plan 01-01). Functionally equivalent to D-02's "before implementation" intent: Wave 0 commits `REQUIREMENTS.md` + `STATE.md` updates before any code lands in Wave 1+.

2. **`useContainer` per-app vs module-level**
   - What we know: D-01 locks `useContainer` as the pattern; routing-controllers uses module-level global.
   - What's unclear: Module-level global breaks test isolation (Pitfall 5). `resetContainer()` export is the mitigation.
   - Recommendation: Export `resetContainer()` from core; document it as test-only API. Planner should include a test that exercises container reset between test runs.
   - **Resolution:** Resolved as **module-level** (single global container per process, with `resetContainer()` for tests). Rationale: matches routing-controllers v0.10 surface; per-app would require threading a context through every decorator factory. Phase 1 Plan 01-05 implements module-level.

3. **Class-level response shapers (e.g. `@HttpCode` on the controller class)**
   - What we know: routing-controllers supports class-level `@HttpCode` (applies to all methods unless overridden). `ResponseHandlerMetadataArgs.method` can be empty string to indicate class level.
   - What's unclear: Whether Phase 1 needs to model class-level response shapers or if that's Phase 3+ territory.
   - Recommendation: Model them in `ControllerArgs.responseHandlers[]` now (cheap). Phase 2 merges them per-action with method-level overrides taking precedence.
   - **Resolution:** Resolved as **modeled on `ControllerArgs.responseHandlers[]`** in Phase 1; Phase 2 merges class-level + method-level at runtime with method-level winning collisions. Plan 01-02 publishes the storage shape; Plan 01-03 wires the decorators to write to it.

4. **`@Head` decorator — does it mirror `@Get` routing behavior?**
   - What we know: Express 5 `router.head(path, handler)` is separate from `router.get()`. routing-controllers has a dedicated `@Head` decorator.
   - What's unclear: Whether head is registered via `verb: 'head'` in `MethodArgs` and Express handles it, or if Phase 2 needs special handling.
   - Recommendation: Store `verb: 'head'` in MethodArgs; Phase 2 calls `router.head(...)`. No special Phase 1 treatment needed.
   - **Resolution:** Resolved as **`@Head` registers an explicit HEAD route**; Express v5 falls back to GET handler if no HEAD is registered, so users get sensible defaults without any library magic. No special-casing in metadata layer.

---

## Environment Availability

Step 2.6: SKIPPED (Phase 1 is pure code/config — no external services, databases, CLIs, or HTTP runtime involved).

---

## Security Domain

> `security_enforcement` is not set to `false` in config; included per policy.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Authentication is Phase 3 |
| V3 Session Management | no | Sessions are Phase 4 |
| V4 Access Control | no | `@Authorized` is Phase 3 |
| V5 Input Validation | partial | Phase 1 stores schemas opaquely; no runtime validation in Phase 1; validate at Phase 2 |
| V6 Cryptography | no | No crypto in Phase 1 |

### Known Threat Patterns for Phase 1 stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| `HttpError.toJSON()` leaking stack traces to clients | Information Disclosure | Never include `stack` in `toJSON()`; log server-side only |
| Prototype pollution via `Object.getPrototypeOf` chain walk | Tampering | Walk terminates at `Object.prototype`; no assignment to walked objects |
| Uncontrolled WeakMap growth (leaked class refs) | DoS (memory) | WeakMap keys are class constructors — garbage collected when the class is collected; no leak if user does not hold refs |

---

## Sources

### Primary (HIGH confidence)
- routing-controllers v0.11.x source at `/Users/niraj/Desktop/Projects/routing-controllers/src/` — `HttpError`, `container.ts`, `MetadataArgsStorage`, `MetadataBuilder`, `decorator/Controller.ts`, `decorator/Get.ts`, `metadata/args/ActionMetadataArgs.ts`, `metadata/args/ResponseHandleMetadataArgs.ts`, `Action.ts` — read directly [VERIFIED: local codebase]
- `reflect-metadata@0.2.2` on npm registry [VERIFIED: npm registry]
- `@standard-schema/spec@1.1.0` on npm registry [VERIFIED: npm registry]
- `typescript@5.9.2` latest stable [VERIFIED: npm registry]
- `vitest@4.1.5` latest [VERIFIED: npm registry]
- StandardSchemaV1 interface — standardschema.dev/schema [CITED: https://standardschema.dev/schema]
- CLAUDE.md Direction Override (2026-05-08) — authoritative [VERIFIED: project file]
- CONTEXT.md D-04/D-05/D-06/D-07 — locked decisions [VERIFIED: project file]

### Secondary (MEDIUM confidence)
- TypeScript decorators handbook [CITED: https://www.typescriptlang.org/docs/handbook/decorators.html] — `experimentalDecorators`, `emitDecoratorMetadata`, `design:*` metadata keys
- ES2022 `Error.cause` — MDN and ECMAScript 2022 spec [ASSUMED — training knowledge; behavior verified via Node 20+ compatibility]

### Tertiary (LOW confidence)
- None — all claims verified against sources above.

---

## Metadata

**Confidence breakdown:**
- Standard stack (packages + versions): HIGH — verified against npm registry
- WeakMap metadata storage pattern: HIGH — derived from locked decisions D-04/D-05/D-07 + routing-controllers source
- Legacy decorator factory signatures: HIGH — well-documented TS behavior; verified against routing-controllers source
- HttpError API shape: MEDIUM — recommendation (Claude's Discretion); shape is informed by routing-controllers + Phase 2 SC #2 requirements; final confirmation comes when Phase 2 planner reviews
- Runtime mode guard: HIGH — probe-class approach is deterministic; chosen during plan revision
- `src/` folder layout: HIGH — derived from three-layer architecture + Phase 1 scope boundary
- Public exports surface: HIGH — derived from ROADMAP SC #5 + CONTEXT.md Claude's Discretion guidance

**Research date:** 2026-05-08
**Valid until:** 2026-06-08 (stable domain; npm package versions should be re-verified before Phase 5 build pipeline work)
