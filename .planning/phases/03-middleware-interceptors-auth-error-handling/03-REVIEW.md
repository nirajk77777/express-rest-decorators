---
phase: 03-middleware-interceptors-auth-error-handling
reviewed: 2026-05-10T00:00:00Z
depth: standard
files_reviewed: 16
files_reviewed_list:
  - src/decorators/middleware.ts
  - src/decorators/index.ts
  - src/metadata/types.ts
  - src/metadata/storage.ts
  - src/metadata/builder.ts
  - src/types/resolved.ts
  - src/interfaces/middleware.ts
  - src/interfaces/interceptor.ts
  - src/interfaces/index.ts
  - src/adapter/middleware.ts
  - src/adapter/interceptor.ts
  - src/adapter/auth.ts
  - src/adapter/validation.ts
  - src/adapter/response.ts
  - src/adapter/error-middleware.ts
  - src/adapter/router-build.ts
  - src/adapter/boot.ts
  - src/errors/http-error.ts
  - src/index.ts
findings:
  blocker: 3
  warning: 8
  total: 11
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-05-10
**Depth:** standard
**Files Reviewed:** 17 source files (Phase 3 surface)
**Status:** issues_found

## Summary

Phase 3 wires middleware, interceptors, authorization, and user error
middleware on top of Phase 2's pipeline. The architecture follows the
documented decisions (D-01..D-18) faithfully, and tests pass at 416. However,
adversarial review surfaces three correctness defects — most importantly a
form-detection heuristic (`isClassForm`) that misclassifies typical Express
function-form middleware (`function mw(req,res,next){}`) as class-form,
because every non-arrow function in JS has a defined `prototype`. This is
encoded in CONTEXT D-06 by spec, but the spec itself is broken. It will
produce incorrect runtime errors for the most common middleware shape users
will paste from Express docs.

The remaining warnings concern code/comment drift in the metadata builder,
unenforced contracts (`@Interceptor()` is purely advisory), and use of
TypeScript `Function` and `as never` casts that hide type errors at
container boundaries.

## Blocker Issues

### BL-01: `isClassForm` misclassifies regular function middleware as class-form

**File:** `src/adapter/middleware.ts:5-9`
**Severity:** BLOCKER

**Issue:**
```ts
export function isClassForm(arg: unknown): boolean {
  if (typeof arg !== 'function') return false;
  const proto = (arg as { prototype?: unknown }).prototype;
  return proto !== undefined && proto !== null;
}
```

In JavaScript, **every** non-arrow, non-bound function has a `.prototype`
property defined automatically — including ordinary `function`-declared
Express middleware:

```ts
function loggerMw(req, res, next) { next(); }
loggerMw.prototype // { constructor: f } — defined, NOT undefined
isClassForm(loggerMw) // returns true (WRONG — this is function-form)
```

Consequences in `toRequestHandlers` (line 36–43): the function gets routed
through `resolveMiddlewareClass`, which calls `getContainer().get(loggerMw)`.
The default container will `new loggerMw()` (calling a non-constructor as a
constructor), then look for `instance.use` (none) and **throw** the
"must implement a use() method" error at boot time.

The same bug fires for global middleware classification in
`boot.ts:121` — function declarations get bucketed as class-form and
then explode in `toRequestHandlers`. The team already hit this with `vi.fn()`
in tests (per 03-03 SUMMARY deviation #1) and worked around it by using
arrow functions in the tests, but the **production code accepts whatever
the user passes**, and the `RequestHandler` type from Express is satisfied
by ordinary function declarations.

This makes the most natural translation of the routing-controllers /
Express docs idiom blow up:
```ts
@UseBefore(function authCheck(req, res, next) { /* ... */ next(); })
// → boot fails: "[authCheck] Class-form middleware must implement a use() method"
```

**Fix:** The form-detection heuristic must distinguish "intends to be a
constructor" from "is a callable function". Two viable approaches:

1. **Whitelist class-form via marker decorator only** — require that
   class-form middleware be decorated with `@Middleware({type:...})` and
   look up `getMiddlewareType(arg)` to decide. Anything not registered is
   function-form. Rejects the heuristic entirely.

2. **Stronger structural probe** — check whether the prototype has a `use`
   method:
   ```ts
   export function isClassForm(arg: unknown): boolean {
     if (typeof arg !== 'function') return false;
     const proto = (arg as { prototype?: unknown }).prototype;
     if (proto === undefined || proto === null) return false;
     return typeof (proto as { use?: unknown }).use === 'function';
   }
   ```
   This still misfires if a user names a regular function's parameters
   `use`, but in practice middleware classes have a prototype `use` and
   plain functions don't.

Either way, CONTEXT D-06's literal spec ("`arg.prototype === undefined` ⇒
function-form") needs to be updated, because nearly every JS function
violates the precondition.

---

### BL-02: `@Interceptor()` decorator is unenforced — silently allows any class with `intercept()`

**File:** `src/decorators/middleware.ts:93-97` + `src/adapter/interceptor.ts:11-22`
**Severity:** BLOCKER (security/correctness — bypasses opt-in contract)

**Issue:** `@Interceptor()` is documented as the marker that opts a class
into the interceptor lifecycle, and `markAsInterceptor` registers it in a
module-private `Set`. But **nowhere** in the runtime does the code consult
`isMarkedAsInterceptor`. `resolveInterceptorClasses` (interceptor.ts:11-22)
duck-types on `typeof instance.intercept === 'function'` and accepts any
class with that method.

Concrete consequence: a user can pass `@UseInterceptor(SomeRandomClass)`
where `SomeRandomClass` happens to have an `intercept(action, content)`
method but was never decorated with `@Interceptor()`. The pipeline accepts
it. This:

1. Defeats the documented contract (D-07 says "@Interceptor classes").
2. Is a foot-gun — typos like `@UseInterceptor(MyController)` (where the
   controller exposes an `intercept` action method) silently wire the
   controller as an interceptor. The damage scales with the size of the
   controller's `intercept` method.
3. Diverges from `@Middleware({type})`, which IS consulted (only for global
   bucketing), creating an inconsistent contract between the two
   decorators that look symmetric in the public API.

**Fix:** In `resolveInterceptorClasses`, validate that each class is
registered:
```ts
import { isMarkedAsInterceptor } from '../metadata/storage.js';
// ...
for (const cls of classes) {
  if (!isMarkedAsInterceptor(cls)) {
    throw new Error(
      `[${cls.name || 'AnonymousClass'}] is not decorated with @Interceptor() ` +
      `but was passed to BootOptions.interceptors or @UseInterceptor.`
    );
  }
  // existing intercept-method check ...
}
```

Alternative: drop the `@Interceptor()` decorator entirely and document
duck-typing on `intercept` as the contract. But shipping the decorator
without enforcing it is the worst of both worlds.

---

### BL-03: `mergeMethodChain` re-decoration branch concatenates `responseHandlers` instead of replacing — comment claims "replaced"

**File:** `src/metadata/builder.ts:111-122`
**Severity:** BLOCKER (correctness — duplicate header/status emission)

**Issue:**
```ts
// Line 113:
// Subclass re-applied a route decorator — verb/path/input/responseHandlers replaced.
if (args.verb) {
  existing.verb = args.verb;
  existing.path = args.path;
  if (args.input !== undefined) existing.input = args.input;
  // ...
  existing.responseHandlers = [...existing.responseHandlers, ...args.responseHandlers]; // CONCAT, not replace
} else if (args.responseHandlers.length) {
  existing.responseHandlers = [...existing.responseHandlers, ...args.responseHandlers];
}
```

The comment says `responseHandlers replaced`, but the code concatenates
exactly the same way as the non-re-decoration branch. The two branches are
functionally identical for `responseHandlers`. This produces incorrect
behavior when:

- Base method has `@HttpCode(200)` + `@Get('/foo')`.
- Subclass re-decorates `@Get('/bar')` + `@HttpCode(201)`.

Expected per comment: subclass wins → `[{success-code, 201}]`.
Actual: `[{success-code, 200}, {success-code, 201}]`.

In `applyResponseHandlers` (response.ts:23-41), both fire in order; Express
`res.status` is last-write-wins so the visible status is 201, **but** for
`@Header('X-Foo','a')` followed by base `@Header('X-Foo','b')` the
ordering is reversed and the wrong header value wins. For repeated
`set` calls Express overwrites scalar headers, so the surface symptom
depends on header type and order.

Additionally, `args.input` is only overwritten if defined — meaning a
subclass that re-decorates without specifying `input` keeps the base
class's input. The comment says "input ... replaced" but the code says
"merged". Pick one and align.

**Fix:** decide the actual semantics, then make code and comment match.
If subclass re-decoration truly means "replace verb+path+input+
responseHandlers":
```ts
if (args.verb) {
  existing.verb = args.verb;
  existing.path = args.path;
  existing.input = args.input;       // unconditional replace
  existing.returnType = args.returnType;
  existing.paramTypes = args.paramTypes;
  existing.responseHandlers = [...args.responseHandlers]; // replace
}
```

If the actual desired semantics is "concat responseHandlers but replace
verb/path", update the comment.

## Warnings

### WR-01: Empty `string[]` from `@Authorized([])` is not normalized to `null`

**File:** `src/decorators/middleware.ts:114-119`
**Issue:** `@Authorized([])` produces `authorized = []` (empty array). At
the gate (`auth.ts:43`), `authorized ?? undefined` only handles the
null→undefined collapse, so authChecker receives `[]`. Most users will
write authChecker as `(action, roles) => roles?.includes(...)` and an
empty array silently denies. CONTEXT D-11 says the three accepted shapes
are `()`, `('admin')`, and `(['a','b'])`; empty array is undefined
behavior. Consider normalizing `[]` to `null` (any-user) or throwing at
decoration time.

**Fix:**
```ts
const normalized: string[] | null =
  roleOrRoles === undefined ? null
  : Array.isArray(roleOrRoles) ? (roleOrRoles.length === 0 ? null : [...roleOrRoles])
  : [roleOrRoles];
```

### WR-02: Async user error middleware wrapper shape — verify promise propagation

**File:** `src/adapter/boot.ts:188-191`
**Issue:**
```ts
app.use(((err: unknown, req, res, next) =>
  (instance.use as (...))(err, req, res, next)
) as ErrorRequestHandler);
```
The implicit-return arrow does forward the promise (good), but for **non-error**
class-form middleware on the global after-non-error path
(`afterNonErrorHandlers`, line 180–183), the chain goes through
`toRequestHandlers` (middleware.ts:38-42), where the wrapper IS:
```ts
const handler: RequestHandler = (req, res, next) => {
  return (instance.use as (...))(req, res, next);
};
```
This one returns. OK. But verify all wrapper paths are consistent — the
inline arrow in boot.ts is fine, but a future refactor that changes
implicit-return to a block body would silently drop async rejections to
unhandled-rejection territory. Add a short comment explaining why the
implicit return matters.

### WR-03: `console.error` in `libraryErrorMiddleware` cannot be silenced

**File:** `src/adapter/error-middleware.ts:38`
**Issue:** Library hardcodes `console.error('[express-controllers] error after headers sent:', err)`. Quiet logging environments (lambda, structured-log
daemons) can't redirect or suppress. Library code should not write to
stdio without an opt-out. Consider exposing a `BootOptions.onLogError?:
(err) => void` or routing to `process.emitWarning`.

### WR-04: `Function` type used pervasively for hook entries

**File:** `src/metadata/types.ts:3`, `src/metadata/storage.ts:7-8,24`,
`src/decorators/middleware.ts:15,35,55`, `src/adapter/middleware.ts:33`
**Issue:** `type HookEntry = Function`. The `Function` type is a known
TypeScript foot-gun — it accepts any callable and provides no type
information. The project's CLAUDE.md leans toward type-safe APIs; the
storage layer leaks `Function` into `getRegisteredMiddlewareClasses(): ReadonlySet<Function>` and downstream `as never` casts hide it.
Consider:
```ts
type HookEntry = ((...args: unknown[]) => unknown) | (new (...args: never[]) => { use: (...a: unknown[]) => unknown });
```
or at minimum a branded `Callable` alias and a comment justifying the
breadth at each site.

### WR-05: `getContainer().get(cls as never)` casts at every call site

**File:** `src/adapter/middleware.ts:17`, `src/adapter/interceptor.ts:12`,
`src/adapter/boot.ts:59`
**Issue:** The `as never` is a type-system bypass. If the `IocAdapter.get`
generic signature is wrong for the call shape, fix it at the source — see
03-05 SUMMARY deviation #3 where `<T>(cls: new (...args: unknown[]) => T): T` was needed in tests. The same shape should make `as never` unnecessary in
the adapter.

### WR-06: `mergeControllerChain` `init.type = c.type` is unconditional

**File:** `src/metadata/builder.ts:73`
**Issue:** Inside the loop over `chain` (base-first), `init.type = c.type`
overwrites on every iteration. If the base class declared
`@JsonController()` and a subclass extends without a controller decorator
(no `getControllerArgs(subclass)`), the loop never visits the subclass
entry — but if subclass has its own `@Controller()` (resetting type to
'default'), the subclass wins. That's actually correct ("subclass wins"),
but the unconditional write also means a subclass without an explicit type
decision gets its `c.type` (default `'default'` from `getOrInitControllerArgs`) writing over the base's `'json'`. Verify
`getOrInitControllerArgs` is only called via decorators (not unconditionally
during merge); a quick scan suggests yes, but document the invariant or guard:
```ts
if (c.type !== 'default' || c === chain[0]) init.type = c.type;
```

### WR-07: `applyResponseHandlers` ignores unknown handler types silently

**File:** `src/adapter/response.ts:37-38`
**Issue:** Default branch silently drops unknown handler `type` values. If
a future Phase adds a new `ResponseHandlerType` (e.g., `cache-control`)
without updating this switch, it fires zero times and produces no warning.
Consider `console.warn` in dev mode or an exhaustiveness check via the TS
`never` pattern:
```ts
default: {
  const _exhaust: never = h as never;
  void _exhaust;
}
```

### WR-08: Global interceptors typed as `ClassConstructor<unknown>` but accepted as raw `Function`

**File:** `src/adapter/boot.ts:161-163`
**Issue:** `(options.interceptors ?? []) as unknown as Function[]` — the
public type in `boot-options.ts` is
`ReadonlyArray<ClassConstructor<unknown>>`. Force-casting through `unknown`
discards the contract. If a user passes a non-class function here, it goes
to `resolveInterceptorClasses` → `getContainer().get(fn)` → default
container `new fn()` → bizarre instance without `intercept` → "must
implement an intercept" error. Validate at the top of boot:
```ts
for (const i of options.interceptors ?? []) {
  if (!isClassForm(i)) {
    throw new TypeError(`BootOptions.interceptors[${idx}] must be a class.`);
  }
}
```
(Note: this validation will also expose BL-01 — see `isClassForm` issue.)

---

_Reviewed: 2026-05-10_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
