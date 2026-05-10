---
phase: 04-uploads-cookies-sessions-render-request-context
plan: 06
type: execute
wave: 6
depends_on: [04-02, 04-03, 04-04, 04-05]
files_modified:
  - test/phase-04-integration.test.ts
  - test/phase-04-grep-gates.test.ts
autonomous: true
requirements: [INPUT-04, INPUT-05, RES-04, RES-05, RES-06, UTIL-01, UTIL-02, UTIL-03, UTIL-04, NEW-01, NEW-02, API-04]

must_haves:
  truths:
    - "All five ROADMAP Phase 4 success criteria are proven end-to-end by a single integration suite running against a real Express 5 app."
    - "Boot-order invariants from D-18 hold under integration: ALS first, CORS second, lib globals third, controller routers fourth."
    - "Cross-cutting structural invariants (no top-level optional-peer imports, no req.requestId, no Express internals introspection) are locked by a separate grep-gate test."
  artifacts:
    - path: "test/phase-04-integration.test.ts"
      provides: "End-to-end integration coverage for SC#1..#5"
    - path: "test/phase-04-grep-gates.test.ts"
      provides: "Structural invariant lock via fs+regex assertions"
  key_links:
    - from: "test/phase-04-integration.test.ts"
      to: "src/index.ts"
      via: "uses ONLY public exports"
      pattern: "from '\\.\\./src/index"
---

<objective>
Lock Phase 4's behavior with a single integration test suite hitting a real Express 5 app, plus a grep-gate test enforcing the structural invariants the per-feature plans declared (no top-level optional-peer imports, no namespace pollution on req, no Express internals introspection in printRoutes).

Purpose: Single-source-of-truth verification of all five ROADMAP SC, mirroring the Phase 2 P07 / Phase 3 P05 pattern.
Output: Two test files. No production code changes.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/ROADMAP.md
@.planning/phases/04-uploads-cookies-sessions-render-request-context/04-CONTEXT.md
@.planning/phases/04-uploads-cookies-sessions-render-request-context/04-RESEARCH.md
@src/index.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: End-to-end integration test for ROADMAP SC#1..#5</name>
  <files>test/phase-04-integration.test.ts</files>
  <read_first>
    - .planning/ROADMAP.md (Phase 4 success criteria block — verbatim wording)
    - test/phase-03-integration.test.ts or whatever the existing Phase 3 SC integration suite is named (mirror its structure)
    - src/index.ts (final public API surface — Render/Redirect/Location/UploadedFile/UploadedFiles/getRequestContext should all be exported here by Wave 2 plans)
  </read_first>
  <behavior>
    Each describe block maps 1:1 to a ROADMAP success criterion:

    describe SC#1 (cookies + session input):
    - Single test: boot one app with cookies and session slots; supertest GET with Cookie + a fake session middleware; handler asserts both arrived parsed.

    describe SC#2 (UploadedFile/UploadedFiles + mandatory limits/fileFilter):
    - Test A: single UploadedFile with valid limits + fileFilter; multipart POST → handler receives file.
    - Test B: register-time throw when limits absent — error matches `/UploadedFile field "[^"]+" requires explicit limits/`.
    - Test C: register-time throw when fileFilter absent.
    - Test D: missing multer peer (vi.doMock) → exact error string.
    - Test E: multi-field UploadedFile + UploadedFiles on one route — single multer instance handles both.

    describe SC#3 (@Redirect / @Location / @Render):
    - Test A: @Redirect('/users/:id') with object return → 302 Location: /users/42.
    - Test B: @Location('/items/:id') → header set, body still flows.
    - Test C: @Render('view') with inline view engine → response body matches locals.

    describe SC#4 (cors + glob loading + printRoutes):
    - Test A: cors: { origin: 'https://x.com' } → preflight OPTIONS returns Allow-Origin matching.
    - Test B: controllers: ['test/fixtures/glob-controllers/*.ts'] → both Alpha + Beta register and respond.
    - Test C: printRoutes: true → console.log spy called with header + one line per route in fixed METHOD/PATH/CONTROLLER.METHOD format.

    describe SC#5 (getRequestContext + ALS):
    - Test A: requestId from X-Request-Id header verbatim.
    - Test B: requestId fallback to randomUUID matching UUID v4 regex.
    - Test C: cross-await — handler awaits then a separate async helper calls getRequestContext() and observes the same context.
    - Test D: getRequestContext() throws outside an active request scope.

    describe Boot-order invariants (D-18):
    - One test boots an app with custom middleware that runs `getRequestContext()` and reads the CORS preflight side-effects. Verify by request flow that ALS context is available to CORS middleware (i.e., CORS runs INSIDE als.run scope), and that user @UseBefore middleware also sees ALS context.

    All tests use ONLY public imports from `../src/index.js`. No reaching into internal adapter modules.
  </behavior>
  <action>
    Create test/phase-04-integration.test.ts mirroring the structure of the existing Phase 3 integration suite. Each describe block has its own beforeEach setup of a fresh Express app (no shared state).

    Use the Phase 3 / 04-01 / 04-04 / 04-05 fixtures and view-engine pattern from earlier plans. For the upload tests, use multer.memoryStorage() in fileFilter contexts.

    Total test count: at least 15 tests (5 SC blocks × ~3 tests each).
  </action>
  <verify>
    <automated>npx vitest run test/phase-04-integration.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - test/phase-04-integration.test.ts exists.
    - npx vitest run test/phase-04-integration.test.ts exits 0 with at least 15 tests.
    - File imports ONLY from `../src/index.js` (or analogous public barrel path) — verified by `! grep -E "from ['\"]\\.\\./src/(adapter|metadata|decorators|errors|guard|container|interfaces|types)/" test/phase-04-integration.test.ts`.
    - Each ROADMAP SC#1..#5 has a labeled describe block whose name contains 'SC#1' (or 'SC1') through 'SC#5'.
  </acceptance_criteria>
  <done>All five ROADMAP Phase 4 SC are testably proven via the public API.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Grep-gate structural invariants test</name>
  <files>test/phase-04-grep-gates.test.ts</files>
  <read_first>
    - test/phase-03-grep-gates.test.ts or analogous Phase 3 grep-gate file (mirror its FS+regex pattern — use fs.readFileSync and JS RegExp; do not shell out per Phase 1 P06 decision)
    - all six 04-NN-PLAN.md verification blocks (this test consolidates their grep gates into one fail-fast assertion)
  </read_first>
  <behavior>
    Each test asserts a single structural invariant by reading source files and applying a JS regex. Tests fail with a clear message naming the violated invariant.

    Gates (one test each):
    1. NO top-level multer import in src/ — `! /^import .* from ['"]multer['"]/m` against the concatenated content of src/**/*.ts (or per-file with a forEach).
    2. NO top-level cors import in src/.
    3. NO top-level cookie import in src/.
    4. NO top-level tinyglobby import in src/.
    5. NO express-session reference (any kind) in src/ — full grep, including comments.
    6. NO `req.requestId =` assignment in src/ (D-13 invariant).
    7. NO `Reflect.defineMetadata` call in src/decorators/ (Phase 1 D-07 invariant — also covers Phase 4 decorators).
    8. NO `app._router` or `_router` access in src/adapter/print-routes.ts (route table walks library metadata only).
    9. Public barrel src/index.ts exports getRequestContext, Render, Redirect, Location, UploadedFile, UploadedFiles.
    10. Public barrel src/index.ts does NOT export buildMulterMiddleware, resolveFilesArm, isUploadMarker, UPLOAD_KIND, createAlsMiddleware (internal helpers stay internal).
    11. The exact "requires <pkg> as a peer dependency. Install it with: pnpm add <pkg>" error strings are present for cookie, cors, multer, tinyglobby in their respective adapter files.
    12. The error messages for missing limits and missing fileFilter contain `requires explicit limits` and `requires explicit fileFilter` respectively.

    Use Phase 1's FS-based grep helper pattern (per STATE.md: "FS-based grep helper over execSync: Node fs.readFileSync + JS RegExp"). Do NOT shell out via execSync.
  </behavior>
  <action>
    Implement using fs.readFileSync + JS RegExp. Helper:
    ```typescript
    import { readFileSync, readdirSync, statSync } from 'node:fs';
    import { join } from 'node:path';
    function* walk(dir: string): Generator<string> {
      for (const e of readdirSync(dir)) {
        const p = join(dir, e);
        if (statSync(p).isDirectory()) yield* walk(p);
        else if (p.endsWith('.ts')) yield p;
      }
    }
    function grepSrc(pattern: RegExp): Array<{ file: string; line: number; text: string }> {
      const hits: Array<{ file: string; line: number; text: string }> = [];
      for (const file of walk('src')) {
        const lines = readFileSync(file, 'utf8').split('\n');
        lines.forEach((text, idx) => {
          if (pattern.test(text)) hits.push({ file, line: idx + 1, text });
        });
      }
      return hits;
    }
    ```

    Each test uses grepSrc with the negated assertion `expect(grepSrc(/^import .* from ['\"]multer['\"]/m)).toEqual([])` etc.
  </action>
  <verify>
    <automated>npx vitest run test/phase-04-grep-gates.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - test/phase-04-grep-gates.test.ts exists.
    - npx vitest run test/phase-04-grep-gates.test.ts exits 0 with all 12 gates green.
    - Test file does NOT use execSync or any shell call.
    - Each failing assertion's error message names the invariant being violated (developer-friendly diagnostics).
  </acceptance_criteria>
  <done>All Phase 4 structural invariants are locked; future regressions fail-fast at test time.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

(No new boundaries — this plan is test-only and re-verifies the threat model from plans 04-01..04-05.)

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-04-23 | Tampering | Tests fail to detect a regression in invariants from 04-01..04-05 | mitigate | Grep-gate test runs every CI build; structural invariants are checked deterministically. The integration test exercises the public API end-to-end against a real Express 5 instance. |
</threat_model>

<verification>
- npx tsc --noEmit clean.
- npx vitest run test/phase-04-integration.test.ts test/phase-04-grep-gates.test.ts exits 0.
- npx vitest run exits 0 across the entire suite.
- Total test count after Phase 4: previous 416 + (Phase 4 plans 01..05) + this plan's tests; expect 470+.
</verification>

<success_criteria>
- All five ROADMAP Phase 4 SC verified by executable tests.
- All 12 structural grep gates green.
- Phase 4 complete; ready for Phase 5 (publish pipeline).
</success_criteria>

<output>
Create .planning/phases/04-uploads-cookies-sessions-render-request-context/04-06-SUMMARY.md documenting:
- Total Phase 4 test count (delta from 416 baseline).
- Each ROADMAP SC mapped to its test name(s).
- Each grep-gate's pattern and pass status.
- Total Phase 4 file delta (production + test).
</output>
