---
phase: 04-uploads-cookies-sessions-render-request-context
plan: 05
type: execute
wave: 5
depends_on: [04-01, 04-04]
files_modified:
  - src/adapter/boot-options.ts
  - src/adapter/cors.ts
  - src/adapter/glob-loader.ts
  - src/adapter/print-routes.ts
  - src/adapter/boot.ts
  - test/cors.test.ts
  - test/glob-loader.test.ts
  - test/print-routes.test.ts
  - test/fixtures/glob-controllers/AlphaController.ts
  - test/fixtures/glob-controllers/BetaController.ts
autonomous: true
requirements: [UTIL-03, UTIL-04, API-04]

must_haves:
  truths:
    - "BootOptions.cors: true | CorsOptions enables CORS via lazy-imported cors package; cors mounts AFTER ALS but BEFORE lib globals (D-18)."
    - "Missing cors peer throws: 'cors boot option requires cors as a peer dependency. Install it with: pnpm add cors'."
    - "BootOptions.controllers accepts (ClassConstructor | string)[]; strings are tinyglobby globs resolved relative to process.cwd() with default extensions ['.ts', '.tsx', '.js', '.mjs', '.cjs'] (D-16)."
    - "Missing tinyglobby peer throws: 'Glob patterns in controllers require tinyglobby as a peer dependency. Install it with: pnpm add tinyglobby'."
    - "Glob expansion runs BEFORE buildMetadata; classes and string entries can interleave in one array (D-16)."
    - "All exported classes from a matched module are treated as controllers; non-class exports silently skipped (D-16)."
    - "BootOptions.printRoutes: true logs a fixed-format METHOD/PATH/CONTROLLER.METHOD column table to console.log AFTER all routers mounted (D-17)."
    - "Route table walks library metadata, NOT Express internals (no app._router introspection)."
  artifacts:
    - path: "src/adapter/cors.ts"
      provides: "lazy cors loader + middleware factory"
      exports: ["loadCorsMiddleware"]
    - path: "src/adapter/glob-loader.ts"
      provides: "lazy tinyglobby loader + resolveControllers"
      exports: ["resolveControllers"]
    - path: "src/adapter/print-routes.ts"
      provides: "buildRouteTable + printRouteTable"
      exports: ["buildRouteTable", "printRouteTable"]
  key_links:
    - from: "src/adapter/boot.ts"
      to: "src/adapter/cors.ts"
      via: "options.cors triggers app.use(corsMw) AFTER ALS, BEFORE lib globals"
      pattern: "loadCorsMiddleware"
    - from: "src/adapter/boot.ts"
      to: "src/adapter/glob-loader.ts"
      via: "resolveControllers expands strings before buildMetadata"
      pattern: "resolveControllers"
    - from: "src/adapter/boot.ts"
      to: "src/adapter/print-routes.ts"
      via: "if (options.printRoutes) printRouteTable(buildRouteTable(...))"
      pattern: "printRouteTable"
---

<objective>
Add three boot-time conveniences: CORS via lazy-loaded cors (UTIL-03), controller glob loading via lazy-loaded tinyglobby (UTIL-04), and the printRoutes route-table dump walking library metadata (API-04). All three slot into the locked boot order from D-18.

Purpose: UTIL-03, UTIL-04, API-04.
Output: Three new adapter modules, BootOptions extension, boot.ts wiring, three test files.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/phases/04-uploads-cookies-sessions-render-request-context/04-CONTEXT.md
@.planning/phases/04-uploads-cookies-sessions-render-request-context/04-RESEARCH.md
@src/adapter/boot.ts
@src/adapter/boot-options.ts
@src/adapter/router-build.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: BootOptions extension + cors loader + glob loader + route-table formatter</name>
  <files>src/adapter/boot-options.ts, src/adapter/cors.ts, src/adapter/glob-loader.ts, src/adapter/print-routes.ts</files>
  <read_first>
    - src/adapter/boot-options.ts (current full file — find the BootOptions interface; add cors/printRoutes; widen controllers element type)
    - .planning/phases/04-uploads-cookies-sessions-render-request-context/04-RESEARCH.md (Pattern 9, Pattern 10, Pattern 1, Open Question #1, #2)
    - .planning/phases/04-uploads-cookies-sessions-render-request-context/04-CONTEXT.md (D-15, D-16, D-17)
    - src/types/resolved.ts (ControllerMetadata + ActionMetadata shape — printRoutes walks this)
    - src/adapter/router-build.ts (composePath function used by buildRouteTable)
  </read_first>
  <behavior>
    BootOptions:
    - controllers widened from `ReadonlyArray<ClassConstructor<unknown>>` to `ReadonlyArray<ClassConstructor<unknown> | string>` (additive, not breaking — Open Question #1).
    - cors?: boolean | CorsOptionsLike where CorsOptionsLike is a LOCAL interface mirroring `@types/cors` shape (Open Question #2 — avoid leaking devDep types). Document the shape in the interface JSDoc.
    - printRoutes?: boolean.

    cors.ts (loadCorsMiddleware):
    - Lazy `import('cors')`. CJS-in-ESM access: `(mod.default ?? mod) as ((opts?: unknown) => RequestHandler)`.
    - Returns the result of calling `corsFn(corsOptions)`.
    - Missing peer error EXACT: `cors boot option requires cors as a peer dependency. Install it with: pnpm add cors`.
    - Module-cached after first load.

    glob-loader.ts (resolveControllers):
    - Iterates the mixed array. Function entries pass through. String entries trigger lazy `import('tinyglobby')`.
    - Missing peer error EXACT: `Glob patterns in controllers require tinyglobby as a peer dependency. Install it with: pnpm add tinyglobby`.
    - For each glob, call `glob(pattern, { cwd: process.cwd(), absolute: true })`.
    - Filter matched paths to extensions in `['.ts', '.tsx', '.js', '.mjs', '.cjs']`.
    - For each matched file: `await import(pathToFileURL(filePath).href)`. Iterate exports; for each export that is `typeof === 'function'` AND has a `prototype`, push it onto the result array. Non-class exports silently skipped.
    - Returns `ClassConstructor<unknown>[]`.

    print-routes.ts:
    - buildRouteTable(controllers, routePrefix): RouteRow[] — walks library ControllerMetadata; uses composePath(routePrefix, ctrl.basePath, action.path). Each row: { method: action.verb.toUpperCase(), path, handler: `${ctrl.target.name}.${String(action.method)}` }.
    - printRouteTable(rows): pads METHOD and PATH columns to the max width of any row; prints a header line then each row via console.log.
    - DOES NOT introspect Express internals (no app._router).
  </behavior>
  <action>
    Step 1. Edit src/adapter/boot-options.ts:
    - Add a local `CorsOptionsLike` interface mirroring the cors v2.8 shape (origin, methods, allowedHeaders, exposedHeaders, credentials, maxAge, preflightContinue, optionsSuccessStatus). All fields optional. Document in JSDoc that this avoids @types/cors as a public dep.
    - Widen controllers element type to `ClassConstructor<unknown> | string`.
    - Add `cors?: boolean | CorsOptionsLike;` and `printRoutes?: boolean;`.

    Step 2. Create src/adapter/cors.ts implementing loadCorsMiddleware per Pattern 1 + the behavior above. Cache the loaded function module-scoped after first successful import.

    Step 3. Create src/adapter/glob-loader.ts implementing resolveControllers per Pattern 9 + the behavior above. Use `pathToFileURL` from `node:url` and `process.cwd()`. Cache the loaded glob function module-scoped.

    Step 4. Create src/adapter/print-routes.ts implementing buildRouteTable + printRouteTable per Pattern 10 + the behavior above. Import composePath from './router-build.js' (or wherever it lives — confirm via grep).
  </action>
  <verify>
    <automated>npx tsc --noEmit &amp;&amp; grep -q "controllers:.*string" src/adapter/boot-options.ts &amp;&amp; grep -q "cors?:" src/adapter/boot-options.ts &amp;&amp; grep -q "printRoutes?:" src/adapter/boot-options.ts &amp;&amp; grep -q "cors boot option requires cors as a peer dependency" src/adapter/cors.ts &amp;&amp; grep -q "Glob patterns in controllers require tinyglobby as a peer dependency" src/adapter/glob-loader.ts &amp;&amp; grep -q "buildRouteTable" src/adapter/print-routes.ts &amp;&amp; ! grep -E "^import .* from ['\"](cors|tinyglobby)['\"]" src/adapter/cors.ts src/adapter/glob-loader.ts &amp;&amp; ! grep -q "app._router" src/adapter/print-routes.ts</automated>
  </verify>
  <acceptance_criteria>
    - boot-options.ts has cors, printRoutes, and widened controllers type.
    - cors.ts and glob-loader.ts have NO top-level package imports (lazy only).
    - print-routes.ts does NOT touch Express internals (no app._router or req._router).
    - Both exact error messages present.
    - npx tsc --noEmit exits 0.
  </acceptance_criteria>
  <done>The three modules are implemented with strict lazy-load contracts and no Express-internals coupling.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Wire CORS, glob expansion, printRoutes into boot.ts per D-18 ordering</name>
  <files>src/adapter/boot.ts</files>
  <read_first>
    - src/adapter/boot.ts (current full file post-04-01 — has ALS wrapper as first app.use; need to add CORS after ALS but before lib globals; add glob expansion before buildMetadata; add printRoutes after all router mounting)
    - .planning/phases/04-uploads-cookies-sessions-render-request-context/04-CONTEXT.md (D-18 boot order block — VERBATIM order required)
  </read_first>
  <behavior>
    Boot order inside useExpressControllers (post-Phase 3, post-04-01, post-this-plan) MUST be:

    1. const resolvedControllers = await resolveControllers(options.controllers); // glob expansion FIRST
    2. const meta = buildMetadata(resolvedControllers); // unchanged
    3. app.use(createAlsMiddleware()); // ALS — already added in 04-01
    4. if (options.cors) { const corsMw = await loadCorsMiddleware(options.cors === true ? undefined : options.cors); app.use(corsMw); } // CORS — after ALS, before lib globals
    5. app.use(...lib globals BEFORE) // existing Phase 3 D-01
    6. for each controller: app.use(routePrefix, controllerRouter) // existing
    7. app.use(...lib globals AFTER, non-error) // existing
    8. app.use(userErrorMiddleware) // existing Phase 3
    9. app.use(libraryErrorMiddleware) // existing Phase 2
    10. if (options.printRoutes) printRouteTable(buildRouteTable(meta, routePrefix)); // printRoutes — last

    Step 4 specifically must come AFTER step 3 and BEFORE step 5. The ALS wrapper from 04-01 stays the first app.use; CORS is the second.
  </behavior>
  <action>
    Step 1. Add imports at top of src/adapter/boot.ts:
    ```
    import { loadCorsMiddleware } from './cors.js';
    import { resolveControllers } from './glob-loader.js';
    import { buildRouteTable, printRouteTable } from './print-routes.js';
    ```

    Step 2. At the start of useExpressControllers, BEFORE `buildMetadata(...)`, replace the controllers source with `await resolveControllers(options.controllers)`.

    Step 3. After `app.use(createAlsMiddleware())` and BEFORE the existing Phase 3 lib-globals BEFORE block, add:
    ```
    if (options.cors) {
      const corsMw = await loadCorsMiddleware(options.cors === true ? undefined : options.cors);
      app.use(corsMw);
    }
    ```

    Step 4. At the END of useExpressControllers, AFTER all router and middleware mounting (i.e., after the libraryErrorMiddleware install), add:
    ```
    if (options.printRoutes) {
      printRouteTable(buildRouteTable(meta, routePrefix ?? ''));
    }
    ```
    Use the actual variable name for the resolved metadata (likely `meta` or `controllers`).

    Step 5. createExpressServer: confirm it delegates to useExpressControllers so the same ordering applies. If it adds its own `app.use(express.json())` etc., ensure those calls happen AFTER the ALS wrapper and CORS — i.e., they should be inside useExpressControllers's lib-globals BEFORE block, not before useExpressControllers runs. (Per RESEARCH anti-pattern: ALS must be outermost.)
  </action>
  <verify>
    <automated>npx tsc --noEmit &amp;&amp; grep -q "loadCorsMiddleware" src/adapter/boot.ts &amp;&amp; grep -q "resolveControllers" src/adapter/boot.ts &amp;&amp; grep -q "printRouteTable" src/adapter/boot.ts &amp;&amp; grep -q "buildRouteTable" src/adapter/boot.ts</automated>
  </verify>
  <acceptance_criteria>
    - boot.ts calls all four new helpers in the order specified.
    - The first `app.use(` line in useExpressControllers is still createAlsMiddleware (verified by inspection).
    - The second app.use (when cors is set) is the cors middleware (verified by inspection).
    - npx tsc --noEmit exits 0.
    - Existing suite still green: npx vitest run exits 0.
  </acceptance_criteria>
  <done>D-18 ordering enforced; glob expansion, CORS, and printRoutes are reachable through BootOptions.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Tests — CORS lazy-load + preflight; glob loading + class extraction; printRoutes table format</name>
  <files>test/cors.test.ts, test/glob-loader.test.ts, test/print-routes.test.ts, test/fixtures/glob-controllers/AlphaController.ts, test/fixtures/glob-controllers/BetaController.ts</files>
  <read_first>
    - test/ existing tests (boot+supertest pattern)
    - src/adapter/cors.ts, src/adapter/glob-loader.ts, src/adapter/print-routes.ts
    - .planning/phases/04-uploads-cookies-sessions-render-request-context/04-RESEARCH.md (Pitfall 5)
  </read_first>
  <behavior>
    test/cors.test.ts:
    1. cors: true → preflight OPTIONS request returns 200 with Access-Control-Allow-Origin: *.
    2. cors: { origin: 'https://example.com' } → response Access-Control-Allow-Origin matches.
    3. Preflight does NOT reach controller stack — controller method is a spy that should NOT be called for OPTIONS.
    4. Missing-peer: vi.doMock('cors', () => { throw new Error('MODULE_NOT_FOUND'); }); boot with cors: true → reject with EXACT message `cors boot option requires cors as a peer dependency. Install it with: pnpm add cors`.
    5. cors NOT set in options → no Access-Control-Allow-Origin header on response (cors mw never installed).

    test/glob-loader.test.ts:
    Create fixture files test/fixtures/glob-controllers/AlphaController.ts and BetaController.ts — each exports a class with @Controller and one route. The fixture file MUST be loadable by vitest's transform (vitest already runs TS) — confirm by running.
    1. controllers: ['test/fixtures/glob-controllers/*.ts'] → both AlphaController and BetaController are registered; supertest can hit both routes.
    2. controllers: [SomeClass, 'test/fixtures/glob-controllers/Alpha*.ts'] mixed array → both work.
    3. Glob matches a non-controller file (e.g., a utility file with no class export) → that file is loaded but no class is registered (silent skip).
    4. Missing tinyglobby peer: vi.doMock('tinyglobby', () => { throw new Error('MODULE_NOT_FOUND'); }); boot with a glob string → reject with EXACT message `Glob patterns in controllers require tinyglobby as a peer dependency. Install it with: pnpm add tinyglobby`.
    5. Pure-class array (no globs) does NOT trigger import('tinyglobby') — verify via probe (similar pattern to the cookies cache probe in 04-02).

    test/print-routes.test.ts:
    1. printRoutes: true → console.log spy receives lines containing 'METHOD' header and one line per route.
    2. Each row is `${method.padEnd(N)}  ${path.padEnd(M)}  ${ControllerName}.${methodName}`.
    3. Multi-controller app → all routes appear, sorted by mount order.
    4. printRoutes: false (or absent) → console.log spy is NOT called from print-routes path.
    5. Route table walks library metadata only — verify by spying on/around app._router and asserting it was NOT accessed (or by file-grep proving the implementation does not reference app._router).
  </behavior>
  <action>
    Create the fixture controllers:
    ```
    // test/fixtures/glob-controllers/AlphaController.ts
    import { Controller, Get } from '../../../src/index.js';
    @Controller('/alpha')
    export class AlphaController {
      @Get('/')
      hi() { return { ok: 'alpha' }; }
    }
    ```
    Same for Beta with route '/beta'.

    Create the three test files. Use vi.doMock for missing-peer simulations. Use a console.log spy via `vi.spyOn(console, 'log').mockImplementation(() => {})` for printRoutes assertions, and read the recorded calls.
  </action>
  <verify>
    <automated>npx vitest run test/cors.test.ts test/glob-loader.test.ts test/print-routes.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - All three test files exist; both fixture controllers exist.
    - Each test file passes (≥ 5 tests for cors, ≥ 5 for glob, ≥ 5 for print-routes).
    - All three exact missing-peer error messages asserted.
    - npx vitest run exits 0 across the whole suite.
  </acceptance_criteria>
  <done>UTIL-03, UTIL-04, API-04 are end-to-end proven; lazy-load contracts are testably enforced.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Browser preflight → server | CORS misconfiguration can permit credentialed cross-origin requests. |
| Glob pattern → file system load | If `controllers` were ever populated from user input, arbitrary code execution. |
| Route table → operator console | Diagnostic output; not user-facing. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-04-19 | Tampering | Overpermissive CORS (`origin: '*' + credentials: true`) | accept | The `cors` package itself emits the right headers per consumer config; spec-violating combinations are the consumer's choice. README must call out the Allow-Origin: * + credentials misuse. |
| T-04-20 | Elevation of Privilege | Arbitrary file load via user-controlled glob | mitigate | D-16 invariant: `controllers` is developer-authored at boot. Document in README: "controllers patterns MUST be hard-coded in your boot code; never derived from request input or environment variables that are user-influenced." Library does no validation by design — a runtime check would be both incomplete and false-positive-prone. |
| T-04-21 | Information Disclosure | printRoutes leaks paths in production logs | accept | printRoutes is opt-in (default off); developers choose whether to enable it. Document that production deployments should keep printRoutes disabled. |
| T-04-22 | Denial of Service | Glob expansion with extreme `**` patterns | accept | tinyglobby is the consumer's peer; their pattern, their wait time. Boot blocks until expansion completes — acceptable because boot runs once. |
</threat_model>

<verification>
- npx tsc --noEmit clean.
- npx vitest run test/cors.test.ts test/glob-loader.test.ts test/print-routes.test.ts exits 0.
- Existing suite still green: npx vitest run exits 0.
- No top-level cors/tinyglobby imports anywhere in src.
- print-routes.ts does NOT touch Express internals.
- All three exact missing-peer error strings present.
</verification>

<success_criteria>
- ROADMAP SC #4 (cors lazy-load, glob loading, printRoutes route table) proven by tests.
- UTIL-03, UTIL-04, API-04 marked as implemented in plan SUMMARY.
</success_criteria>

<output>
Create .planning/phases/04-uploads-cookies-sessions-render-request-context/04-05-SUMMARY.md.
</output>

## Truths — Decision Citations

This plan implements the following CONTEXT.md decisions:

- **D-15** — All three peer dependencies (`cors`, `tinyglobby`, and multer from 04-03) use the lazy peer import pattern: `import('pkg')` at first use, module-scoped cache after success, and an actionable error message (`"X requires Y as a peer dependency. Install it with: pnpm add Y"`) on `MODULE_NOT_FOUND` — CORS and glob-loader demonstrate this pattern in this plan; the exact message strings are enforced by grep gates and integration tests.
