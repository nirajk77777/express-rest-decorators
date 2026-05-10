---
phase: 04-uploads-cookies-sessions-render-request-context
plan: 03
type: execute
wave: 3
depends_on: [04-01, 04-02]
files_modified:
  - src/types/uploads.ts
  - src/adapter/uploads.ts
  - src/metadata/types.ts
  - src/adapter/router-build.ts
  - src/adapter/validation.ts
  - src/index.ts
  - test/uploads.test.ts
autonomous: true
requirements: [INPUT-04, UTIL-01, UTIL-02]

must_haves:
  truths:
    - "UploadedFile(field, options) and UploadedFiles(field, options) are factory functions (NOT decorators) returning marker objects."
    - "Registration THROWS at boot when a marker's options.limits or options.fileFilter is absent — error names the controller, method, and field key."
    - "multer is lazy-imported via import('multer') only when at least one route declares files; missing peer throws actionable message."
    - "Routes with multiple file fields use ONE multer instance with .fields([...]) (Pitfall 2)."
    - "After multer middleware runs, the validation arm resolveFilesArm reads req.files[fieldName] and exposes it on the destructured handler arg as files.<key>."
    - "UploadedFile returns a single file marker; handler receives files.<key> as Express.Multer.File or undefined. UploadedFiles returns an array marker; handler receives Express.Multer.File[]."
  artifacts:
    - path: "src/types/uploads.ts"
      provides: "marker types (no runtime — broken out to avoid metadata-adapter circular import per RESEARCH Pattern 11)"
      exports: ["UploadedFileMarker", "UploadedFilesMarker", "UploadOptions", "FileFilter", "UPLOAD_KIND"]
    - path: "src/adapter/uploads.ts"
      provides: "factory functions + lazy multer loader + buildMulterMiddleware + validateUploadMarker"
      exports: ["UploadedFile", "UploadedFiles", "buildMulterMiddleware", "resolveFilesArm", "isUploadMarker"]
  key_links:
    - from: "src/adapter/router-build.ts"
      to: "src/adapter/uploads.ts"
      via: "buildMulterMiddleware called per-action; result inserted before invokeHandler in handlers array"
      pattern: "buildMulterMiddleware"
    - from: "src/adapter/validation.ts"
      to: "src/adapter/uploads.ts"
      via: "resolveFilesArm as new Promise.all arm"
      pattern: "resolveFilesArm"
    - from: "src/index.ts"
      to: "src/adapter/uploads.ts"
      via: "public re-export of UploadedFile / UploadedFiles"
      pattern: "export .* UploadedFile"
---

<objective>
Add file upload support via slot-based factory markers (D-03). UploadedFile and UploadedFiles are plain functions that return discriminated markers; the registration phase reads markers, validates that limits and fileFilter are present (throwing a controller/method/field-named error if absent), and mounts ONE multer instance per route via .fields([...]). multer is a lazy peer.

Purpose: UTIL-01, UTIL-02. Plus the files slot on InputDeclaration referenced by INPUT-04 success criterion #1.
Output: New types module, new adapter module, InputDeclaration extension, router-build wiring, validation arm, public exports, and tests.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/phases/04-uploads-cookies-sessions-render-request-context/04-CONTEXT.md
@.planning/phases/04-uploads-cookies-sessions-render-request-context/04-RESEARCH.md
@src/adapter/router-build.ts
@src/adapter/validation.ts
@src/metadata/types.ts
@src/index.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Marker types + factory functions + lazy multer loader + validation guards</name>
  <files>src/types/uploads.ts, src/adapter/uploads.ts, src/metadata/types.ts</files>
  <read_first>
    - .planning/phases/04-uploads-cookies-sessions-render-request-context/04-RESEARCH.md (Pattern 4, Pattern 5, Pattern 12, Pitfall 2)
    - .planning/phases/04-uploads-cookies-sessions-render-request-context/04-CONTEXT.md (D-03, D-04, D-15)
    - src/metadata/types.ts (existing InputDeclaration including the cookies/session fields added in 04-02; do additive merge)
  </read_first>
  <behavior>
    - UploadedFile('avatar', { limits, fileFilter }) returns { [UPLOAD_KIND]: 'single', field: 'avatar', options }.
    - UploadedFiles('photos', { limits, fileFilter }) returns { [UPLOAD_KIND]: 'array', field: 'photos', options }.
    - validateUploadMarker(marker, controllerName, methodName, fieldKey) throws when options.limits is missing/null OR options.fileFilter is missing/non-function. The fieldKey is the InputDeclaration map key, NOT the multer field name.
    - loadMulter() lazy-imports multer; on failure throws the EXACT message: File upload requires multer as a peer dependency. Install it with: pnpm add multer. Cached after first successful load.
    - buildMulterMiddleware(action, controllerName, methodName) returns a single Express RequestHandler from multer({ limits, fileFilter }).fields([...]) aggregating ALL upload fields on the action; returns null when action has no files slot. Throws if any marker is invalid.
    - resolveFilesArm(req, declaration) reads req.files (Record string to Express.Multer.File[] after .fields() runs). For each declaration entry, single-marker returns req.files?.[marker.field]?.[0]; array-marker returns req.files?.[marker.field] ?? []. Returns { value: Record<string, unknown> } or { value: undefined } when no declaration.
    - When two markers on the same route declare DIFFERENT limits or fileFilter, throw at registration with an actionable error explaining the conflict (use reference equality on fileFilter; deep-equal via JSON.stringify on limits).
  </behavior>
  <action>
    Step 1. Create src/types/uploads.ts (no adapter imports — keeps the dependency cycle clean per RESEARCH Pattern 11). Export UPLOAD_KIND symbol, UploadLimits, FileFilter, UploadOptions, UploadedFileMarker, UploadedFilesMarker, AnyUploadMarker.

    Step 2. Create src/adapter/uploads.ts implementing per RESEARCH §5 verbatim. Use these EXACT error message templates:

      Missing limits — `[${controllerName}.${methodName}] UploadedFile field "${fieldKey}" requires explicit limits. Set limits: { fileSize: N } to prevent unbounded uploads.`

      Missing fileFilter — `[${controllerName}.${methodName}] UploadedFile field "${fieldKey}" requires explicit fileFilter. Set fileFilter to validate accepted file types.`

      Missing multer peer — `File upload requires multer as a peer dependency. Install it with: pnpm add multer`

      Conflicting markers — `[${controllerName}.${methodName}] Multiple UploadedFile/UploadedFiles markers on this route declare different limits or fileFilter. All markers on a single route must share identical options.`

    Use a module-scoped cached multer factory. Use multer.fields([{ name, maxCount }]) per Pattern 5 (single field still uses .fields with maxCount: 1).

    Step 3. Edit src/metadata/types.ts — add to InputDeclaration:

      `files?: Record<string, import('../types/uploads.js').AnyUploadMarker>;`

    Preserve all other fields including the cookies/session fields added in plan 04-02.
  </action>
  <verify>
    <automated>npx tsc --noEmit &amp;&amp; grep -q "UPLOAD_KIND" src/types/uploads.ts &amp;&amp; grep -q "buildMulterMiddleware" src/adapter/uploads.ts &amp;&amp; grep -q "files?:" src/metadata/types.ts &amp;&amp; ! grep -E "^import .* from ['\"]multer['\"]" src/adapter/uploads.ts &amp;&amp; grep -q "requires explicit limits" src/adapter/uploads.ts &amp;&amp; grep -q "requires explicit fileFilter" src/adapter/uploads.ts &amp;&amp; grep -q "File upload requires multer as a peer dependency" src/adapter/uploads.ts</automated>
  </verify>
  <acceptance_criteria>
    - src/types/uploads.ts exists and exports UPLOAD_KIND, UploadedFileMarker, UploadedFilesMarker, AnyUploadMarker, UploadOptions.
    - src/adapter/uploads.ts exports UploadedFile, UploadedFiles, buildMulterMiddleware, resolveFilesArm, isUploadMarker.
    - No top-level multer import anywhere in src — `! grep -rE "^import .* from ['\"]multer['\"]" src/` returns empty.
    - All four exact error messages present in src/adapter/uploads.ts (verified by greps above).
    - npx tsc --noEmit exits 0.
  </acceptance_criteria>
  <done>Marker types + adapter module compile; lazy-load and validation guards observable in source.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Wire multer middleware into router-build; resolveFilesArm into validation; export factories</name>
  <files>src/adapter/router-build.ts, src/adapter/validation.ts, src/index.ts</files>
  <read_first>
    - src/adapter/router-build.ts (CURRENT full file — find where the per-action handler array is composed; multer mw goes between authGate and invokeHandler per Pattern 5)
    - src/adapter/validation.ts (post-04-02 state — has cookies/session arms; add files arm)
    - src/index.ts (public barrel)
    - .planning/phases/04-uploads-cookies-sessions-render-request-context/04-RESEARCH.md (Pattern 5 handler array snippet)
  </read_first>
  <action>
    Step 1. src/adapter/router-build.ts:
    - Import buildMulterMiddleware from ./uploads.js.
    - In the function building the per-action Express handler array (already async after Phase 3 D-04), after authGate composition and BEFORE invokeHandler, call await buildMulterMiddleware(action, controllerName, methodName). If non-null, splice it into the handler array immediately before invokeHandler.
    - Use the controller class name (controllerMeta.target.name or the existing convention) and the method name string (existing String(action.method) pattern) for error attribution.

    Step 2. src/adapter/validation.ts:
    - Import resolveFilesArm from ./uploads.js.
    - Add files?: Record<string, unknown> to ResolvedArgs (next to cookies/session fields).
    - Add a third new arm resolveFilesArm(req, decl.files) to the existing Promise.all.
    - The files arm cannot fail validation in v1 — multer rejects bad uploads at the middleware layer with a 400/413 emitted via Express's native error path. So no issues aggregation needed; only value propagation.

    Step 3. src/index.ts — append:
    ```
    // Phase 4 — uploads
    export { UploadedFile, UploadedFiles } from './adapter/uploads.js';
    export type {
      UploadedFileMarker,
      UploadedFilesMarker,
      AnyUploadMarker,
      UploadOptions,
      UploadLimits,
      FileFilter,
    } from './types/uploads.js';
    ```
    DO NOT export buildMulterMiddleware, resolveFilesArm, isUploadMarker, or UPLOAD_KIND — internal.
  </action>
  <verify>
    <automated>npx tsc --noEmit &amp;&amp; grep -q "buildMulterMiddleware" src/adapter/router-build.ts &amp;&amp; grep -q "resolveFilesArm" src/adapter/validation.ts &amp;&amp; grep -q "export { UploadedFile, UploadedFiles }" src/index.ts &amp;&amp; ! grep -q "buildMulterMiddleware" src/index.ts &amp;&amp; ! grep -q "UPLOAD_KIND" src/index.ts</automated>
  </verify>
  <acceptance_criteria>
    - router-build.ts calls buildMulterMiddleware (grep succeeds).
    - validation.ts calls resolveFilesArm (grep succeeds).
    - Public barrel exports UploadedFile/UploadedFiles + types but NOT internal helpers (greps confirm).
    - Existing test suite still green: npx vitest run exits 0.
    - npx tsc --noEmit exits 0.
  </acceptance_criteria>
  <done>Multer mounts per-route at the correct slot; files arm populates the destructured handler argument.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Upload integration tests — limits/fileFilter mandatory, lazy-load, single+array, multi-field aggregation</name>
  <files>test/uploads.test.ts</files>
  <read_first>
    - test/ existing tests (boot+supertest pattern)
    - src/adapter/uploads.ts (the implementation)
    - .planning/phases/04-uploads-cookies-sessions-render-request-context/04-RESEARCH.md (Pattern 5 + Pitfall 2 + Pitfall 3)
  </read_first>
  <behavior>
    Tests in test/uploads.test.ts (use multer as a devDep — confirm it's installed; if not, add to devDependencies):

    1. Registration throws when limits missing — controller has UploadedFile('avatar', { fileFilter: () => {} } as any). Expect await useExpressControllers(...) to reject with an error matching `/UploadedFile field "avatar" requires explicit limits/` AND containing the controller and method name.
    2. Registration throws when fileFilter missing — analogous with limits-only options. Error matches `/requires explicit fileFilter/`.
    3. Single file upload happy path — POST multipart with an avatar field; handler receives files.avatar as an Express.Multer.File with .buffer/.originalname populated. Use multer.memoryStorage() so .buffer is set.
    4. Multiple files via UploadedFiles — POST with two photos[] files; handler receives files.photos as a 2-element array.
    5. Multi-field aggregation (Pitfall 2) — controller declares files: { avatar: UploadedFile('avatar', opts), doc: UploadedFile('doc', opts) }. POST multipart with both fields; handler receives both files.avatar and files.doc populated. Verify (via console.log spy or other observable) that ONE multer instance was created — assert by mocking the multer factory and checking call count is exactly 1 per route registration.
    6. fileFilter rejection — fileFilter: (req, file, cb) => cb(null, file.mimetype === 'image/png'). POST a non-PNG; expect Express to forward multer's error to the library error middleware → 400/500 response.
    7. limits.fileSize enforcement — limits: { fileSize: 100 }. POST a 1KB file → multer throws LIMIT_FILE_SIZE; library error middleware emits an error response.
    8. Missing peer test — at the top of one test, vi.doMock('multer', () => { throw new Error('MODULE_NOT_FOUND'); }); attempt to boot a controller with files; expect the actionable error string `File upload requires multer as a peer dependency. Install it with: pnpm add multer`.
    9. Conflicting marker options — same route declares files: { a: UploadedFile('a', { limits: { fileSize: 100 }, fileFilter: f1 }), b: UploadedFile('b', { limits: { fileSize: 200 }, fileFilter: f1 }) } — boot rejects with conflicting-options error.
    10. No-files-slot route does NOT trigger import('multer') — boot a controller WITHOUT any files slot; assert (by lazy-import probe) that multer was never loaded.
  </behavior>
  <action>
    Create test/uploads.test.ts. Use supertest + vitest. Use multer.memoryStorage() in test fixtures to keep tests hermetic. If multer isn't already a devDep, add it to package.json devDependencies and run pnpm install.
  </action>
  <verify>
    <automated>npx vitest run test/uploads.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - test/uploads.test.ts exists.
    - npx vitest run test/uploads.test.ts exits 0 with at least 10 tests passing.
    - At least one test asserts EXACT string `File upload requires multer as a peer dependency. Install it with: pnpm add multer`.
    - At least one test asserts the controller/method/field interpolation in the missing-limits error.
    - npx vitest run exits 0 across the whole suite.
  </acceptance_criteria>
  <done>UTIL-01 and UTIL-02 are end-to-end proven; mandatory-options enforcement and lazy-load contract are testably enforced.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| External client → multipart form data | Untrusted bytes; size, count, and content-type unbounded without explicit limits/fileFilter. |
| Disk / memory storage | If a consumer chooses diskStorage, filenames may contain path-traversal sequences. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-04-10 | Denial of Service | Unbounded file size / count | mitigate | D-03: limits is REQUIRED at registration. Boot fails with actionable error if absent. limits.fileSize and limits.files are the consumer's contract — the library enforces presence, not specific values. |
| T-04-11 | Elevation of Privilege | Arbitrary file-type upload (e.g., HTML to be served back) | mitigate | D-03: fileFilter is REQUIRED at registration. The consumer must opt into a content-type allowlist. |
| T-04-12 | Tampering | Path traversal in originalname (../../etc/passwd) | accept | The library never writes files to disk. Storage choice (memoryStorage vs diskStorage) is the consumer's. RESEARCH Security Domain (V12) flags this; README must recommend memoryStorage OR explicit filename sanitization in diskStorage. |
| T-04-13 | Denial of Service | Slowloris-style multipart upload | accept | Server timeout is the consumer's reverse-proxy / Express.js timeout config concern. Library does not own the request lifecycle. |
| T-04-14 | Information Disclosure | File contents in error messages | mitigate | Library error middleware (Phase 2) does NOT include req body in error responses; multer errors carry only metadata (field, filename, size). |
</threat_model>

<verification>
- npx tsc --noEmit clean.
- npx vitest run test/uploads.test.ts exits 0 (≥ 10 tests).
- Existing suite still green: npx vitest run exits 0.
- No top-level multer import: `! grep -rE "^import .* from ['\"]multer['\"]" src/`.
- Public barrel does NOT leak internal helpers.
- All four exact error strings present in src/adapter/uploads.ts.
</verification>

<success_criteria>
- ROADMAP SC #2 (UploadedFile/UploadedFiles + mandatory limits/fileFilter + lazy multer) proven.
- UTIL-01 and UTIL-02 marked as implemented in plan SUMMARY.
- No regressions in Phase 2/3 tests.
</success_criteria>

<output>
Create .planning/phases/04-uploads-cookies-sessions-render-request-context/04-03-SUMMARY.md with files modified, test counts, and grep-gate results.
</output>

## Truths — Decision Citations

This plan implements the following CONTEXT.md decisions:

- **D-03** — `UploadedFile` and `UploadedFiles` are slot-based factory functions (not decorators) returning discriminated marker objects with `UPLOAD_KIND`, `field`, and `options`; `files?:` is added to `InputDeclaration` as `Record<string, AnyUploadMarker>`.
- **D-04** — `resolveFilesArm` is added as the third new arm (arm 8 overall) in the `Promise.all` inside `validation.ts`, alongside the cookies (arm 6) and session (arm 7) arms added in plan 04-02; multer middleware is mounted before the validation arm runs, satisfying the "multer before validation" ordering requirement.
