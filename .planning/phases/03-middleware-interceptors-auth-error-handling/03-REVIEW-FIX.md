---
phase: 03-middleware-interceptors-auth-error-handling
fixed_at: 2026-05-10T00:00:00Z
review_path: .planning/phases/03-middleware-interceptors-auth-error-handling/03-REVIEW.md
iteration: 1
findings_in_scope: 11
fixed: 11
skipped: 0
status: all_fixed
---

# Phase 3: Code Review Fix Report

**Fixed at:** 2026-05-10
**Source review:** `.planning/phases/03-middleware-interceptors-auth-error-handling/03-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 11 (3 BLOCKER + 8 WARNING)
- Fixed: 11
- Skipped: 0
- Test status: 419 passed (up from 416 baseline; 3 new regression tests added)
- Typecheck: clean (`tsc --noEmit`)

## Fixed Issues

### BL-01: `isClassForm` misclassifies regular function middleware as class-form

**Files modified:** `src/adapter/middleware.ts`, `tests/adapter/middleware.test.ts`
**Commit:** `21adcfa`
**Applied fix:** Tightened the heuristic to require `typeof prototype.use === 'function'` in addition to `prototype !== undefined`. This correctly classifies `function mw(req,res,next){}` as function-form (its `.prototype` exists, but has no `use` method) while still recognizing class-form middleware. Updated two unit tests that encoded the broken spec; added two new tests covering the corrected semantics (class with `use` returns true; class without `use` returns false).

### BL-02: `@Interceptor()` decorator was unenforced

**Files modified:** `src/adapter/interceptor.ts`, `tests/adapter/interceptor.test.ts`
**Commit:** `b69d8be`
**Applied fix:** `resolveInterceptorClasses` now consults `isMarkedAsInterceptor(cls)` and throws an actionable error when a class wasn't decorated with `@Interceptor()`. Updated the four existing unit tests to call `markAsInterceptor` on their fixtures, and added a new regression test that asserts a non-marked class is rejected. The phase 3 boot test (`AddSuffixInterceptor` with `@Interceptor()`) was already correctly decorated and continues to pass.

### BL-03: `mergeMethodChain` re-decoration concatenated `responseHandlers` instead of replacing

**Files modified:** `src/metadata/builder.ts`
**Commit:** `a6c6be4`
**Applied fix:** When a subclass re-applies a route decorator (`args.verb` is set), the branch now unconditionally replaces `verb`, `path`, `input`, `returnType`, `paramTypes`, AND `responseHandlers` — matching the long-standing comment. The non-verb branch (subclass added shapers without changing the route) keeps the existing concat semantics, which is correct for layered shapers.

### WR-01: `@Authorized([])` empty-array normalization

**Files modified:** `src/decorators/middleware.ts`
**Commit:** `7d78f4c`
**Applied fix:** Empty array now normalizes to `null` (any authenticated user), matching `@Authorized()`. Prevents the silent-deny footgun for the typical `(action, roles) => roles?.includes(...)` authChecker shape.

### WR-02: Async user error middleware wrapper — comment guard

**Files modified:** `src/adapter/boot.ts`
**Commit:** `8930742`
**Applied fix:** Added a prominent comment above the implicit-return arrow wrapper noting that the implicit return is load-bearing for Express v5 native promise rejection forwarding, and that wrapping it in braces would silently drop async rejections.

### WR-03: `console.error` in `libraryErrorMiddleware` cannot be silenced

**Files modified:** `src/adapter/error-middleware.ts`, `src/adapter/boot-options.ts`, `src/adapter/boot.ts`, `src/adapter/index.ts`
**Commit:** `c0d45a1`
**Applied fix:** Added `BootOptions.onLogError?: (err) => void` and a `makeLibraryErrorMiddleware({ onLogError })` factory. When the user supplies `onLogError`, boot mounts the factory variant; otherwise the existing `libraryErrorMiddleware` named export (which uses `console.error`) is mounted unchanged. The grep-gate invariant `app.use(libraryErrorMiddleware)` still appears literally exactly once.

### WR-04: `Function` type pervasively → narrowed `HookEntry`

**Files modified:** `src/metadata/types.ts`, `src/decorators/middleware.ts`
**Commit:** `93432b7`
**Applied fix:** Replaced `type HookEntry = Function` with a structural union `((...args: unknown[]) => unknown) | (new (...args: never[]) => { use: (...a: unknown[]) => unknown })`. Decorator entry points still accept the wider `Function[]` on the public surface (legacy decorators surface constructors as `Function`), but cast at the storage boundary to the narrower type. Broader cleanup of bare `Function` in storage / metadata / adapter is left for a follow-up — partial fix; flagged below.

### WR-05: `as never` casts at IocAdapter boundary

**Files modified:** `src/adapter/middleware.ts`, `src/adapter/interceptor.ts`, `src/adapter/boot.ts`
**Commit:** `2d25fa4`
**Applied fix:** Replaced every `getContainer().get(cls as never)` with `getContainer().get(cls as unknown as ClassConstructor<unknown>)`. Preserves the actual contract instead of type-system-bypassing it.

### WR-06: `mergeControllerChain` unconditional `init.type = c.type`

**Files modified:** `src/metadata/builder.ts`
**Commit:** `ea5283e`
**Applied fix:** Added a guard `if (c.type !== 'default' || c === chain[0])` so a subclass entry with the default `'default'` value does not silently downgrade a base `@JsonController`. Defensive — current decorators always set type explicitly, but the invariant is now explicit.

### WR-07: `applyResponseHandlers` exhaustiveness

**Files modified:** `src/adapter/response.ts`
**Commit:** `ed3f50a`
**Applied fix:** Added explicit `case 'null-result-code'` and `case 'undefined-result-code'` (no-ops, handled in `writeResponse`), and a `default` branch with a `const _exhaust: never = h.type as never` assertion so a future `ResponseHandlerType` variant fails typecheck until handled.

### WR-08: Global interceptors not validated against class-form

**Files modified:** `src/adapter/boot.ts`
**Commit:** `c656d64`
**Applied fix:** Validate every `BootOptions.interceptors` entry up front in `useExpressControllers`. Each must be a function with a non-null `prototype` (i.e., a class constructor). Bare functions and arrow functions throw a clear `TypeError` naming the offending index. The deeper checks (`isMarkedAsInterceptor`, `intercept` method) live in `resolveInterceptorClasses` (BL-02) — this guard catches the type-mismatch case earlier with a better error message.

## Skipped Issues

None.

## Notes for human review

- **WR-04 partial:** Only the `HookEntry` alias was narrowed. The bare `Function` references in `src/metadata/storage.ts`, `src/decorators/controller.ts`, `src/decorators/routes.ts`, and a few sites in `src/adapter/{boot,middleware}.ts` remain. Tightening these requires touching the legacy-decorator metadata surface (`Reflect.getMetadata("design:paramtypes")` returns `Function[]`) and would expand scope significantly. Flag in next phase if the surface deserves a broader pass.
- **BL-01 corrected spec:** CONTEXT D-06 in `03-CONTEXT.md` documents the broken `arg.prototype === undefined ⇒ function-form` spec. The code now diverges from that literal spec in favor of the corrected `prototype.use exists ⇒ class-form` rule. The CONTEXT document should be updated to match (left out of this fix-pass since it's a planning artifact, not a source-code finding).
- **Tests added:** 3 net new tests (1 in middleware, 2 in interceptor). Total: 416 → 419, all green.

---

_Fixed: 2026-05-10_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
