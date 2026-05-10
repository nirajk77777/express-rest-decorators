---
phase: 04-uploads-cookies-sessions-render-request-context
plan: 04
type: execute
wave: 4
depends_on: [04-01, 04-03]
files_modified:
  - src/metadata/storage.ts
  - src/decorators/response.ts
  - src/decorators/index.ts
  - src/types/resolved.ts
  - src/metadata/types.ts
  - src/metadata/builder.ts
  - src/adapter/render.ts
  - src/adapter/response.ts
  - src/index.ts
  - test/render-redirect-location.test.ts
autonomous: true
requirements: [RES-04, RES-05, RES-06]

must_haves:
  truths:
    - "@Redirect(template) issues a 3xx redirect (default 302). String return overrides; object return interpolates :name placeholders; undefined uses bare template (D-05)."
    - "@Render(template) calls res.render(template, locals). Object return = locals. undefined = no locals. Non-object/non-undefined return throws actionable error (D-06)."
    - "@Location(template) sets the Location response header (D-07). Status defaults to 200 (D-10). Body still flows through writeResponse."
    - "@Render/@Redirect/@Location override @JsonController JSON serialization for the decorated method (D-08)."
    - "Phase 3 interceptors run BEFORE the shaper consumes the value (D-09)."
    - "Null/undefined short-circuit (Phase 2 D-13 / Phase 3 D-08 step 2) still applies — @OnNull/@OnUndefined runs before the shaper (D-09 + Pitfall 8)."
    - "Missing :name placeholder in interpolated template throws actionable error naming the missing key."
    - "Decorators are pure registrars — no prototype walking inside decorators (Phase 1 D-07)."
  artifacts:
    - path: "src/decorators/response.ts"
      provides: "@Render, @Redirect, @Location method decorators (extending the existing @HttpCode/@OnNull/etc. file)"
      exports: ["Render", "Redirect", "Location"]
    - path: "src/adapter/render.ts"
      provides: "interpolateTemplate + applyRedirect + applyRender + applyLocation shaper helpers"
      exports: ["interpolateTemplate", "applyRedirect", "applyRender", "applyLocation"]
  key_links:
    - from: "src/adapter/response.ts"
      to: "src/adapter/render.ts"
      via: "shaper detection block before writeResponse"
      pattern: "applyRedirect|applyRender|applyLocation"
    - from: "src/metadata/builder.ts"
      to: "src/metadata/storage.ts"
      via: "renderMap/redirectMap/locationMap reads in mergeMethodChain"
      pattern: "renderMap|redirectMap|locationMap"
---

<objective>
Add the three response-shaper decorators @Render, @Redirect, @Location with the semantics from D-05..D-10. Decorators are pure registrars (Phase 1 D-07 invariant). Metadata flows through the existing MetadataBuilder; shaper application happens in the Phase 2 response writer path, AFTER Phase 3's interceptor chain (D-09).

Purpose: RES-04, RES-05, RES-06.
Output: WeakMaps + decorators + ActionMetadata extension + builder integration + shaper helper module + response.ts dispatch + public exports + tests.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/phases/04-uploads-cookies-sessions-render-request-context/04-CONTEXT.md
@.planning/phases/04-uploads-cookies-sessions-render-request-context/04-RESEARCH.md
@src/decorators/response.ts
@src/metadata/storage.ts
@src/metadata/builder.ts
@src/types/resolved.ts
@src/adapter/response.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: WeakMap storage + @Render/@Redirect/@Location decorators + ActionMetadata extension + builder fold</name>
  <files>src/metadata/storage.ts, src/decorators/response.ts, src/decorators/index.ts, src/types/resolved.ts, src/metadata/types.ts, src/metadata/builder.ts</files>
  <read_first>
    - src/metadata/storage.ts (existing WeakMap pattern — match it exactly per Phase 1 D-07)
    - src/decorators/response.ts (existing @HttpCode/@OnNull/@OnUndefined/@Header/@ContentType decorators — append the three new ones in the same file using the same registrar pattern)
    - src/types/resolved.ts (current ActionMetadata shape — add render/redirect/location fields)
    - src/metadata/builder.ts (mergeMethodChain — fold the three new maps with subclass-wins semantics like the existing decorator metadata)
    - .planning/phases/04-uploads-cookies-sessions-render-request-context/04-RESEARCH.md (Pattern 2, Pattern 3)
    - .planning/phases/04-uploads-cookies-sessions-render-request-context/04-CONTEXT.md (D-05..D-10)
  </read_first>
  <behavior>
    - Decorators register into module-private WeakMaps and return; no side effects, no prototype walks.
    - Subclass override of any of the three decorators on the same method replaces the base's entry (mergeMethodChain walks base→derived; last write wins). Mirrors Phase 1 D-06.
    - Builder emits action.render / action.redirect / action.location ONLY when present (undefined when not decorated, so downstream consumers can branch).
    - @Redirect(template) optional second arg is the status code (defaults to 302). @Redirect('/x', 301) → metadata { template: '/x', status: 301 }.
    - @HttpCode override semantics: when @HttpCode is also present, it wins for redirect status (RESEARCH D-10).
  </behavior>
  <action>
    Step 1. src/metadata/storage.ts — add three new module-private WeakMaps and their getter/setter helpers, mirroring the existing pattern (e.g., the same shape as the Phase 3 hook maps):
    ```
    interface RenderMeta { template: string }
    interface RedirectMeta { template: string; status?: number }
    interface LocationMeta { template: string }
    const renderMap = new WeakMap<object, Map<string | symbol, RenderMeta>>();
    const redirectMap = new WeakMap<object, Map<string | symbol, RedirectMeta>>();
    const locationMap = new WeakMap<object, Map<string | symbol, LocationMeta>>();
    export function setRenderMeta(target: object, key: string | symbol, m: RenderMeta): void;
    export function getRenderMeta(target: object, key: string | symbol): RenderMeta | undefined;
    // ... and matching for redirect / location
    ```
    Match the EXACT helper-naming convention used by existing decorators (look at how @HttpCode metadata is stored).

    Step 2. src/decorators/response.ts — append three pure-registrar decorators:
    ```
    export function Render(template: string): MethodDecorator {
      return (target, propertyKey) => setRenderMeta(target, propertyKey, { template });
    }
    export function Redirect(template: string, status?: number): MethodDecorator {
      return (target, propertyKey) => setRedirectMeta(target, propertyKey, { template, status });
    }
    export function Location(template: string): MethodDecorator {
      return (target, propertyKey) => setLocationMeta(target, propertyKey, { template });
    }
    ```
    Match the existing decorator file's `MethodDecorator` typing and import discipline (no Reflect.defineMetadata per Phase 1 D-07).

    Step 3. src/decorators/index.ts — re-export the three new decorators.

    Step 4. src/types/resolved.ts — extend ActionMetadata:
    ```
    render?: { template: string };
    redirect?: { template: string; status?: number };
    location?: { template: string };
    ```

    Step 5. src/metadata/types.ts — also extend MethodArgs (the storage layer's per-method arg record) with the same three optional fields if it exists; if not, skip.

    Step 6. src/metadata/builder.ts — in `mergeMethodChain`, after the existing fold for verb/responseHandlers/hooks/authorized, read the three new maps for each level of the inheritance chain and apply subclass-wins semantics. The existing inheritance walk gives this for free if you write `if (...) merged.render = ...` per level (last write wins because the loop walks base→derived).

    Step 7. Public types (ControllerMetadata/ActionMetadata) are already type-only re-exported from src/index.ts — no barrel change needed for types.
  </action>
  <verify>
    <automated>npx tsc --noEmit &amp;&amp; grep -q "renderMap" src/metadata/storage.ts &amp;&amp; grep -q "redirectMap" src/metadata/storage.ts &amp;&amp; grep -q "locationMap" src/metadata/storage.ts &amp;&amp; grep -q "export function Render" src/decorators/response.ts &amp;&amp; grep -q "export function Redirect" src/decorators/response.ts &amp;&amp; grep -q "export function Location" src/decorators/response.ts &amp;&amp; grep -q "render?: { template: string }" src/types/resolved.ts &amp;&amp; ! grep -E "Reflect\.defineMetadata" src/decorators/response.ts</automated>
  </verify>
  <acceptance_criteria>
    - Three new WeakMaps + their helpers exist in src/metadata/storage.ts.
    - @Render/@Redirect/@Location exported from src/decorators/response.ts and re-exported from src/decorators/index.ts.
    - ActionMetadata in src/types/resolved.ts has render/redirect/location optional fields.
    - Builder folds the three maps in mergeMethodChain (grep for the field assignments).
    - No Reflect.defineMetadata anywhere in src/decorators/response.ts (Phase 1 D-07 invariant).
    - npx tsc --noEmit exits 0.
    - Existing test suite still green.
  </acceptance_criteria>
  <done>Decorators register metadata; builder surfaces it on ActionMetadata; subclass-wins semantics work via existing mergeMethodChain.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: applyRedirect/applyRender/applyLocation helpers + dispatch in response.ts before writeResponse</name>
  <files>src/adapter/render.ts, src/adapter/response.ts</files>
  <read_first>
    - src/adapter/response.ts (CURRENT full file — find writeResponse and the JSON/string/Buffer/stream branches; the shaper dispatch goes BEFORE these)
    - .planning/phases/04-uploads-cookies-sessions-render-request-context/04-RESEARCH.md (Pattern 7 — verbatim implementations of interpolateTemplate / applyRedirect / applyRender)
    - .planning/phases/04-uploads-cookies-sessions-render-request-context/04-CONTEXT.md (D-05/D-06/D-07/D-08/D-09/D-10)
    - src/adapter/interceptor.ts (verify the shape passed to writeResponse — the post-interceptor value — Phase 3 D-08)
  </read_first>
  <behavior>
    interpolateTemplate(template, data, source):
    - Replace `:name` placeholders (regex `/:([A-Za-z_$][A-Za-z0-9_$]*)/g`).
    - Missing key → throw Error: `[<source>] @Redirect/@Location template "<template>" references ":<key>" but handler return value has no "<key>" property.`
    - Value coerced via String(...).
    - DO NOT URL-encode (callers responsible).

    applyRedirect(res, template, status, value, source):
    - typeof value === 'string' → res.redirect(status, value).
    - value === undefined || null → res.redirect(status, template).
    - typeof value === 'object' → res.redirect(status, interpolateTemplate(template, value, source)).
    - other → res.redirect(status, template).

    applyRender(res, template, value, source):
    - undefined/null → res.render(template).
    - typeof value === 'object' → res.render(template, value).
    - else → throw Error: `[<source>] @Render expects an object or undefined; got <typeof value> from handler return.`

    applyLocation(res, template, value, source):
    - Compute url same way as applyRedirect (string overrides, object interpolates, undefined uses template).
    - res.location(url). Does NOT call res.redirect.

    Dispatch site (in response.ts or wherever the post-interceptor write happens — find the existing `writeResponse(res, next, value, controllerMeta, action)` call):
    - BEFORE writeResponse, if action.redirect → applyRedirect, then call next() and return.
    - Else if action.render → applyRender, then call next() and return.
    - Else if action.location → applyLocation, then fall through to writeResponse (D-07: header set + body still written).
    - Else → existing behavior (writeResponse).
    - Null/undefined short-circuit (Phase 2 D-13 / Phase 3 D-08 step 2) MUST run BEFORE the shaper check (D-09 + Pitfall 8). Verify by reading the existing code path — the @OnNull/@OnUndefined branch should already be ahead of writeResponse; just ensure the new shaper dispatch is positioned AFTER the null short-circuit.
    - For @Redirect.status: the resolved status is `action.httpCode ?? action.redirect.status ?? 302` per D-10 (HttpCode wins, then explicit Redirect status, then default 302).
  </behavior>
  <action>
    Step 1. Create src/adapter/render.ts with interpolateTemplate, applyRedirect, applyRender, applyLocation per Pattern 7 + the behavior block above. Use the EXACT error messages.

    Step 2. Edit src/adapter/response.ts (or whichever file currently calls writeResponse for the post-handler value — find via grep):
    - Import the three apply helpers + interpolateTemplate.
    - Insert the dispatch block BEFORE writeResponse and AFTER the null/undefined short-circuit.
    - Use the existing `source` string convention for error context (probably `<ControllerName>.<methodName>`).
    - For @Location, after applyLocation, fall through to writeResponse so the body is written normally.
    - For @Redirect / @Render, after the apply call, do NOT call writeResponse — the response is complete (res.redirect/res.render flush). Then call next() to allow @UseAfter middleware to run (Phase 3 D-04 ordering: register res.on('finish', () => next()) BEFORE the apply if your existing pattern uses that — match the existing pattern in stream/async-iterable branches per Phase 3 P04 decisions).
  </action>
  <verify>
    <automated>npx tsc --noEmit &amp;&amp; grep -q "applyRedirect" src/adapter/render.ts &amp;&amp; grep -q "applyRender" src/adapter/render.ts &amp;&amp; grep -q "applyLocation" src/adapter/render.ts &amp;&amp; grep -q "interpolateTemplate" src/adapter/render.ts &amp;&amp; grep -qE "applyRedirect|applyRender|applyLocation" src/adapter/response.ts</automated>
  </verify>
  <acceptance_criteria>
    - src/adapter/render.ts exports the four functions.
    - src/adapter/response.ts (or the equivalent dispatch site) imports and calls the three apply functions.
    - The exact error message templates from Pattern 7 are present (greppable).
    - npx tsc --noEmit exits 0.
    - Existing test suite still green: npx vitest run exits 0.
  </acceptance_criteria>
  <done>Shaper dispatch is wired and existing tests have not regressed.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Public exports + integration tests for @Render/@Redirect/@Location</name>
  <files>src/index.ts, test/render-redirect-location.test.ts</files>
  <read_first>
    - src/index.ts (existing barrel — append the three new decorators)
    - test/ existing tests (boot+supertest pattern; Phase 3 has the closest analog with multi-decorator integration)
    - src/decorators/response.ts (the new decorators)
  </read_first>
  <behavior>
    Public exports: append `Render`, `Redirect`, `Location` to src/index.ts (these flow through `export * from './decorators/index.js'` if the existing barrel pattern uses star exports — verify).

    Tests in test/render-redirect-location.test.ts — boot a small Express app per test:

    1. @Redirect default 302 — handler returns `{ id: 42 }`, decorator @Redirect('/users/:id') → response is 302 Location: /users/42.
    2. @Redirect string override — handler returns `'https://elsewhere.com'` → 302 Location: https://elsewhere.com.
    3. @Redirect bare template — handler returns undefined → 302 Location: /users/:id (literal because no data to interpolate; this matches D-05 "undefined uses bare template").
    4. @Redirect with @HttpCode(301) — permanent redirect.
    5. @Redirect with explicit status — @Redirect('/x', 308) → 308.
    6. @Render — set up Express view engine (use a tiny inline engine via `app.engine('html', (file, opts, cb) => cb(null, JSON.stringify(opts)))` and `app.set('view engine', 'html')`). Handler returns `{ name: 'Ada' }` → response body contains the locals JSON.
    7. @Render undefined locals → renders with empty/no locals.
    8. @Render with non-object return → server returns 500 (error middleware catches the throw); error message contains `@Render expects an object or undefined`.
    9. @Location — handler returns `{ id: 1 }`, @Location('/items/:id') → response Location header is /items/1, status 200, body is the JSON return value (D-07 fall-through).
    10. Missing-placeholder error — @Redirect('/x/:missing') with handler returning {} → 500 with error containing `references ":missing" but handler return value has no "missing" property`.
    11. Override @JsonController (D-08) — @JsonController + @Render('view') method returns object → response is rendered HTML, NOT JSON.
    12. Interceptor runs before shaper (D-09) — @UseInterceptor that doubles a number; method returns 21; interceptor turns it into 42; @Redirect('/n/:value') referencing { value: 42 } would require the interceptor to wrap; simpler test: @UseInterceptor that returns `{ id: 99 }`; method returns null... wait — null short-circuits. Use: method returns `{ id: 1 }`, interceptor maps to `{ id: 999 }`, expect Location: /n/999.
    13. Null short-circuit precedes shaper (Pitfall 8) — handler returns null with @Redirect AND no @OnNull → default 204. Document via test.
  </behavior>
  <action>
    Step 1. Edit src/index.ts — verify @Render/@Redirect/@Location flow through the existing decorators barrel re-export. If the existing barrel uses named re-exports rather than `export *`, append:
    ```
    export { Render, Redirect, Location } from './decorators/response.js';
    ```

    Step 2. Create test/render-redirect-location.test.ts. Use a minimal inline view engine for @Render tests (no EJS/Handlebars dependency):
    ```
    app.engine('html', (filePath, options, callback) => {
      callback(null, JSON.stringify(options));
    });
    app.set('view engine', 'html');
    app.set('views', './test/fixtures/views');
    ```
    Create a fixture file `test/fixtures/views/test.html` with arbitrary content (the engine ignores it).
  </action>
  <verify>
    <automated>npx vitest run test/render-redirect-location.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - test/render-redirect-location.test.ts exists.
    - Public barrel exports Render, Redirect, Location (verified by `grep -E "Render|Redirect|Location" src/index.ts` finding all three names).
    - npx vitest run test/render-redirect-location.test.ts exits 0 with at least 12 tests.
    - Test #11 explicitly proves @JsonController override (D-08).
    - Test #12 explicitly proves interceptor-before-shaper (D-09).
    - npx vitest run exits 0 across the whole suite.
  </acceptance_criteria>
  <done>RES-04, RES-05, RES-06 are end-to-end proven; D-08 and D-09 invariants are testably enforced.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Handler return value → response shaper | Handler returns may include user-influenced data interpolated into URLs/templates. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-04-15 | Tampering / SSRF | Open redirect via user-controlled handler return for @Redirect | accept | If a handler returns a string from user input, an open-redirect vulnerability is the consumer's bug, not the library's. Document loudly: handler return values for @Redirect should NOT be derived directly from user input without URL allowlist validation. |
| T-04-16 | Tampering | Template injection via :name placeholder substitution | mitigate | interpolateTemplate uses a strict regex (`/:([A-Za-z_$][A-Za-z0-9_$]*)/g`). Substituted values are stringified via `String(...)` — no template-engine escapes. Templates are developer-authored at decorator time (compile-time constants); only the values come from runtime data. Document that templates MUST NOT contain user input. |
| T-04-17 | Information Disclosure | XSS via @Render locals | accept | Template injection / XSS is the view engine's concern (EJS, Handlebars, Pug all auto-escape by default for the appropriate sigils). Library's responsibility ends at calling res.render(view, locals); auto-escape is the engine's. Document that consumers must use an auto-escaping view engine. |
| T-04-18 | Denial of Service | Infinite-recursion in interpolation | mitigate | The regex matches each :name once per pass; one replace() call has linear time in template length. No recursion. |
</threat_model>

<verification>
- npx tsc --noEmit clean.
- npx vitest run test/render-redirect-location.test.ts exits 0 (≥ 12 tests).
- Existing suite still green: npx vitest run exits 0.
- No Reflect.defineMetadata in any decorator file.
- Public barrel exports the three decorators.
</verification>

<success_criteria>
- ROADMAP SC #3 (@Redirect/@Location/@Render with template interpolation) proven by tests.
- D-08 (@JsonController override) and D-09 (interceptor-before-shaper) tested.
- RES-04/RES-05/RES-06 marked as implemented in plan SUMMARY.
</success_criteria>

<output>
Create .planning/phases/04-uploads-cookies-sessions-render-request-context/04-04-SUMMARY.md.
</output>
