---
phase: 04-uploads-cookies-sessions-render-request-context
plan: 02
type: execute
wave: 2
depends_on: [04-01]
files_modified:
  - src/metadata/types.ts
  - src/adapter/cookies.ts
  - src/adapter/session.ts
  - src/adapter/validation.ts
  - test/cookies.test.ts
  - test/session.test.ts
autonomous: true
requirements: [INPUT-04, INPUT-05]

must_haves:
  truths:
    - "A handler declaring `cookies: { sid: true }` receives `cookies.sid` as the raw parsed cookie string."
    - "A handler declaring `cookies: { uid: SomeStandardSchema }` receives the validated/narrowed value; bad input → BadRequestError aggregated with other slot issues."
    - "A handler declaring `session: true` receives `req.session` passed through; `session: SomeStandardSchema` validates the whole session object."
    - "The `cookie` package is lazy-imported only when at least one route in the app uses a `cookies` slot — never at module load."
    - "express-session is NEVER imported by the library; the library only reads `req.session` (consumer wires the middleware themselves)."
    - "Missing `cookie` peer throws: 'cookies slot requires cookie as a peer dependency. Install it with: pnpm add cookie'."
  artifacts:
    - path: "src/adapter/cookies.ts"
      provides: "lazy cookie loader + per-key resolver"
      exports: ["resolveCookiesArm", "CookiesDeclaration"]
    - path: "src/adapter/session.ts"
      provides: "session resolver (no peer import — reads req.session)"
      exports: ["resolveSessionArm", "SessionDeclaration"]
    - path: "src/metadata/types.ts"
      provides: "InputDeclaration extended with cookies?, session?"
      contains: "cookies?"
  key_links:
    - from: "src/adapter/validation.ts"
      to: "src/adapter/cookies.ts"
      via: "resolveCookiesArm called as new Promise.all arm"
      pattern: "resolveCookiesArm"
    - from: "src/adapter/validation.ts"
      to: "src/adapter/session.ts"
      via: "resolveSessionArm called as new Promise.all arm"
      pattern: "resolveSessionArm"
---

<objective>
Add cookie and session slots to the InputDeclaration. Cookies use a per-key map (D-01); session uses a single flag/schema (D-02). Both slot resolvers integrate as additional arms of the existing `Promise.all` in `validation.ts` (Phase 2 D-06 + Phase 4 D-04). The `cookie` package is a lazy peer; `express-session` is never imported.

Purpose: INPUT-04 + INPUT-05. Mirror the existing params/query/body/headers slot model so users get a uniform, destructured handler argument.
Output: Type extension to `InputDeclaration`, two new adapter modules, validation.ts arm wiring, and two test files.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/phases/04-uploads-cookies-sessions-render-request-context/04-CONTEXT.md
@.planning/phases/04-uploads-cookies-sessions-render-request-context/04-RESEARCH.md
@src/metadata/types.ts
@src/adapter/validation.ts
@src/types/standard-schema.ts
@src/errors/subclasses.ts

<interfaces>
<!-- Existing types Phase 4 extends (read these in src/metadata/types.ts before editing): -->
<!-- The current InputDeclaration already has params/query/body/headers and Phase 3's currentUser. -->

Standard Schema spec (already re-exported):
```typescript
// from src/types/standard-schema.ts
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (value: unknown) => StandardResult<Output> | Promise<StandardResult<Output>>;
  };
}
```

Phase 2 validation.ts shape (new arms slot in here):
```typescript
// existing — adds three new arms after currentUser
const [results, currentUserResult] = await Promise.all([
  Promise.all(SLOTS.map((s) => validateSlot(s, decl[s], req[s]))),
  validateCurrentUser(decl.currentUser, currentUserResolver),
]);
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extend InputDeclaration with cookies + session; create resolveCookiesArm + resolveSessionArm</name>
  <files>src/metadata/types.ts, src/adapter/cookies.ts, src/adapter/session.ts</files>
  <read_first>
    - src/metadata/types.ts (current InputDeclaration shape — preserve all existing fields)
    - src/adapter/validation.ts (existing slot resolver pattern + ValidationIssue shape used by BadRequestError)
    - src/errors/subclasses.ts (BadRequestError + ValidationIssue type signature)
    - src/types/standard-schema.ts (StandardSchemaV1 + how '~standard'.validate is invoked)
    - .planning/phases/04-uploads-cookies-sessions-render-request-context/04-RESEARCH.md (Pattern 6 + Pitfall 4)
  </read_first>
  <behavior>
    - Adding `cookies?: Record<string, true | StandardSchemaV1>` to `InputDeclaration` does not break Phase 2/3 tests.
    - Adding `session?: true | StandardSchemaV1` to `InputDeclaration` does not break Phase 2/3 tests.
    - `resolveCookiesArm(req, declaration)` returns `{ value: Record<string, unknown> }` on success or `{ issues: ValidationIssue[] }` on validation failure (with each issue carrying `slot: 'cookies'` and `path: '<cookieKey>'`).
    - `resolveSessionArm(req, declaration)` returns `{ value: req.session }` when `declaration === true`, or runs Standard Schema on `req.session` and returns `{ value }` or `{ issues }` (slot: 'session'); `declaration === undefined` → `{ value: undefined }`.
    - Cookie lazy-load uses dynamic `import('cookie')`; on `MODULE_NOT_FOUND` (or any rejection), throws Error with EXACT message `"cookies slot requires cookie as a peer dependency. Install it with: pnpm add cookie"`.
    - Cookie module CJS-in-ESM access uses `mod.default?.parse ?? mod.parse` to handle both interop shapes (Pitfall 4).
    - Cookies arm caches the lazy-loaded `cookie.parse` function in module scope after first successful load — second request does NOT re-import.
  </behavior>
  <action>
    1. Edit `src/metadata/types.ts` — add to `InputDeclaration`:
       ```typescript
       /** Phase 4 D-01: per-key cookie declaration. true = pass-through; schema = validate. */
       cookies?: Record<string, true | StandardSchemaV1>;
       /** Phase 4 D-02: session pass-through (true) or validated. req.session is wired by the consumer. */
       session?: true | StandardSchemaV1;
       ```
       Add the imports if not present. DO NOT touch `currentUser` or any other existing field.

    2. Create `src/adapter/cookies.ts`:
       ```typescript
       import type { Request } from 'express';
       import type { StandardSchemaV1 } from '../types/standard-schema.js';
       import type { ValidationIssue } from '../errors/subclasses.js';  // confirm exact path/name

       export type CookiesDeclaration = Record<string, true | StandardSchemaV1>;

       type ParseFn = (header: string) => Record<string, string | undefined>;
       let cachedParse: ParseFn | null = null;

       async function loadCookieParse(): Promise<ParseFn> {
         if (cachedParse) return cachedParse;
         try {
           const mod: { default?: { parse: ParseFn }; parse?: ParseFn } = await import('cookie');
           const parse = mod.default?.parse ?? mod.parse;
           if (typeof parse !== 'function') {
             throw new Error('cookie package loaded but parse is not a function');
           }
           cachedParse = parse;
           return parse;
         } catch {
           throw new Error('cookies slot requires cookie as a peer dependency. Install it with: pnpm add cookie');
         }
       }

       export interface CookiesArmResult {
         value?: Record<string, unknown>;
         issues?: ValidationIssue[];
       }

       export async function resolveCookiesArm(
         req: Request,
         declaration: CookiesDeclaration | undefined
       ): Promise<CookiesArmResult> {
         if (!declaration) return { value: undefined };
         const parse = await loadCookieParse();
         const header = (req.headers.cookie ?? '') as string;
         const parsed = parse(header);
         const out: Record<string, unknown> = {};
         const issues: ValidationIssue[] = [];
         for (const [key, schemaOrTrue] of Object.entries(declaration)) {
           const raw = parsed[key];
           if (schemaOrTrue === true) {
             out[key] = raw;
             continue;
           }
           const result = await Promise.resolve(schemaOrTrue['~standard'].validate(raw));
           if ('issues' in result && result.issues) {
             for (const iss of result.issues) {
               issues.push({
                 slot: 'cookies',
                 path: key + (iss.path && iss.path.length ? '.' + iss.path.join('.') : ''),
                 message: iss.message,
               } as ValidationIssue);
             }
           } else if ('value' in result) {
             out[key] = result.value;
           }
         }
         if (issues.length > 0) return { issues };
         return { value: out };
       }

       /** Test-only — reset module-cached `cookie.parse` so repeated lazy-load can be verified. */
       export function __resetCookieCacheForTest(): void { cachedParse = null; }
       ```
       Confirm the `ValidationIssue` shape from `src/errors/subclasses.ts` and adjust the cast/shape exactly. If the existing slot literal type does not include `'cookies'`, widen the union there as part of this task (additive — no breaking change).

    3. Create `src/adapter/session.ts`:
       ```typescript
       import type { Request } from 'express';
       import type { StandardSchemaV1 } from '../types/standard-schema.js';
       import type { ValidationIssue } from '../errors/subclasses.js';

       export type SessionDeclaration = true | StandardSchemaV1;

       export interface SessionArmResult {
         value?: unknown;
         issues?: ValidationIssue[];
       }

       export async function resolveSessionArm(
         req: Request,
         declaration: SessionDeclaration | undefined
       ): Promise<SessionArmResult> {
         if (declaration === undefined) return { value: undefined };
         const session = (req as Request & { session?: unknown }).session;
         if (declaration === true) return { value: session };
         const result = await Promise.resolve(declaration['~standard'].validate(session));
         if ('issues' in result && result.issues) {
           return {
             issues: result.issues.map((iss) => ({
               slot: 'session',
               path: iss.path && iss.path.length ? iss.path.join('.') : '',
               message: iss.message,
             } as ValidationIssue)),
           };
         }
         return { value: 'value' in result ? result.value : undefined };
       }
       ```
       NO `import('express-session')` — ever. Reading `req.session` is the entirety of the integration.
  </action>
  <verify>
    <automated>npx tsc --noEmit && grep -q "cookies?:" src/metadata/types.ts && grep -q "session?:" src/metadata/types.ts && grep -q "resolveCookiesArm" src/adapter/cookies.ts && grep -q "resolveSessionArm" src/adapter/session.ts && ! grep -E "^import .* from ['\\\"](express-session|cookie)['\\\"]" src/adapter/cookies.ts src/adapter/session.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "cookies?: Record<string, true | StandardSchemaV1>" src/metadata/types.ts` succeeds.
    - `grep -q "session?: true | StandardSchemaV1" src/metadata/types.ts` succeeds.
    - `! grep -E "^import .* from ['\\\"]cookie['\\\"]" src/adapter/cookies.ts` (no top-level cookie import; must be dynamic).
    - `! grep -E "express-session" src/adapter/session.ts` (zero coupling to session middleware).
    - `grep -q "cookies slot requires cookie as a peer dependency. Install it with: pnpm add cookie" src/adapter/cookies.ts` (exact error string per D-15).
    - `npx tsc --noEmit` exits 0.
  </acceptance_criteria>
  <done>Types extended; both arm resolvers compile; lazy-load contract observable in source.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Wire cookies + session arms into validation.ts Promise.all</name>
  <files>src/adapter/validation.ts</files>
  <read_first>
    - src/adapter/validation.ts (CURRENT full file — find the `Promise.all([...])` site and the `ResolvedArgs` interface; add new arms there)
    - .planning/phases/04-uploads-cookies-sessions-render-request-context/04-CONTEXT.md (D-04: cookies/session/files become arms 6/7/8)
    - src/adapter/cookies.ts (the resolveCookiesArm signature)
    - src/adapter/session.ts (the resolveSessionArm signature)
  </read_first>
  <action>
    1. In `src/adapter/validation.ts`:
       - Import `resolveCookiesArm` and `resolveSessionArm` (relative `.js` import per existing convention).
       - Extend the `ResolvedArgs` (or equivalent) interface to add `cookies?: Record<string, unknown>` and `session?: unknown` fields. (`files?` is added in plan 04-03.)
       - Inside the existing `Promise.all([...])` call, append two new entries: `resolveCookiesArm(req, decl.cookies)` and `resolveSessionArm(req, decl.session)`. Maintain Phase 3's existing arm count and ordering — do not reorder existing arms.
       - After Promise.all, aggregate any `issues` from the two new results into the same BadRequestError aggregation that Phase 2 D-09 already does for params/query/body/headers/currentUser. The aggregation must list cookies/session issues with their `slot` field set ('cookies' or 'session') so the BadRequestError's `details` field exposes them per-source.
       - On success, populate `args.cookies` and `args.session` from the arm results.

    2. Verify the destructured handler argument now contains `cookies` and `session` per D-01/D-02.

    3. If `validation.ts` references a literal `slot:` union type, widen it to include `'cookies'` and `'session'` (and `'files'` — even though files is added in plan 04-03; including all three now avoids a second edit).
  </action>
  <verify>
    <automated>npx tsc --noEmit && grep -q "resolveCookiesArm" src/adapter/validation.ts && grep -q "resolveSessionArm" src/adapter/validation.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "resolveCookiesArm" src/adapter/validation.ts | grep -v 0` (function called at least once).
    - `grep -c "resolveSessionArm" src/adapter/validation.ts | grep -v 0` (function called at least once).
    - `npx tsc --noEmit` exits 0.
    - All EXISTING Phase 2/3 tests still pass: `npx vitest run` exits 0 (no regressions in the existing 416-test suite).
  </acceptance_criteria>
  <done>The validation pipeline now resolves cookies and session in parallel with the existing slots.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Cookie + session integration tests (lazy-load proof, schema validation, missing peer error)</name>
  <files>test/cookies.test.ts, test/session.test.ts</files>
  <read_first>
    - test/ existing tests (find supertest+vitest boot pattern)
    - src/adapter/cookies.ts and src/adapter/session.ts
    - .planning/phases/04-uploads-cookies-sessions-render-request-context/04-RESEARCH.md (Pattern 6, Pitfall 4)
  </read_first>
  <behavior>
    `test/cookies.test.ts`:
    1. `cookies: { sid: true }` — request with `Cookie: sid=abc123` → handler receives `cookies.sid === 'abc123'`.
    2. `cookies: { count: zNumber }` (Zod or similar Standard Schema) where `count` is sent as `"42"` → handler receives `cookies.count === 42` (validated/coerced).
    3. Bad cookie validation → BadRequestError 400 with `details` containing an issue with `slot: 'cookies'` and `path: 'count'`.
    4. **Lazy-load proof**: import `__resetCookieCacheForTest`, reset, mock `import('cookie')` to throw `MODULE_NOT_FOUND` once, hit a route with cookies slot → expect error response carrying message `"cookies slot requires cookie as a peer dependency. Install it with: pnpm add cookie"`. (Use vi.doMock or inject error path; if hard to mock dynamic import, at minimum unit-test the loader by direct import.)
    5. Route with NO cookies slot does NOT trigger `import('cookie')` — verify by checking the cached `parse` is still null after a request to a non-cookie route. (Use `__resetCookieCacheForTest` then probe state via a getter or by re-running the missing-peer test.)

    `test/session.test.ts`:
    1. `session: true` with `req.session = { uid: 7 }` (set by a fake session middleware in the test) → handler receives `session === { uid: 7 }`.
    2. `session: someSchema` requiring `uid: number` and req.session is `{ uid: 'oops' }` → BadRequestError 400 with `details` issue `slot: 'session'`.
    3. NO `import('express-session')` ever happens — verify by `expect(require.cache)` or by structural grep on source (assert via a separate test that greps `src/adapter/session.ts` for the string `express-session` and finds zero occurrences).
  </behavior>
  <action>
    Create `test/cookies.test.ts` and `test/session.test.ts`. Use the boot+supertest idiom from existing Phase 3 tests. Install Zod (or whatever Standard Schema lib the existing tests use) — check `package.json` devDependencies; do not add a new dep unnecessarily.

    For the missing-peer test, prefer `vi.mock('cookie', () => { throw new Error('MODULE_NOT_FOUND'); })` at top of one test, OR call `loadCookieParse` directly after manually deleting the package from node_modules in a beforeEach (cleaner: extract `loadCookieParse` to be exported test-only and unit-test it in isolation).
  </action>
  <verify>
    <automated>npx vitest run test/cookies.test.ts test/session.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `test/cookies.test.ts` exists and exits 0 with at least 5 tests.
    - `test/session.test.ts` exists and exits 0 with at least 3 tests.
    - The missing-peer test asserts on the EXACT error message string `"cookies slot requires cookie as a peer dependency. Install it with: pnpm add cookie"`.
    - `npx vitest run` exits 0 across the whole suite.
  </acceptance_criteria>
  <done>INPUT-04 and INPUT-05 are end-to-end proven; lazy-load contract is testably enforced.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Browser → server `Cookie` request header | Cookies arrive untrusted; per-key validation via Standard Schema is the user's mitigation. |
| Library → consumer `req.session` | Library reads only; never writes. Session integrity is the consumer's session-store contract. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-04-05 | Tampering | Unsigned cookie tampering | accept | The library does not sign cookies. Consumers wanting integrity must use signed cookies via `express-session`'s store, JWT, or their own crypto. Document loudly in README; this matches `cookie` package scope (parser only). |
| T-04-06 | Information Disclosure | Sensitive cookie contents in logs | accept | Per-key validation gates what reaches the handler; log redaction is the consumer's logger concern. |
| T-04-07 | Tampering | Cookie injection via `\r\n` in raw header | mitigate | The `cookie` package's `parse()` is RFC 6265-compliant and rejects malformed pairs. We rely on its parser correctness rather than re-implementing it. (Rationale per Don't Hand-Roll table.) |
| T-04-08 | Spoofing | Session fixation | accept | Session mw is the consumer's responsibility (`express-session`'s `genid`/`rolling` config). The library never installs session middleware; it only reads `req.session`. Document. |
| T-04-09 | Denial of Service | Unbounded `Cookie` header size | accept | Express + Node's HTTP parser caps headers at 8KB by default. No additional cap added by this library. |
</threat_model>

<verification>
- `npx tsc --noEmit` clean.
- `npx vitest run test/cookies.test.ts test/session.test.ts` exits 0.
- Existing suite still green: `npx vitest run` exits 0.
- `! grep -E "^import .* from ['\"]cookie['\"]" src/` (no top-level cookie imports anywhere in src).
- `! grep -E "express-session" src/` (zero express-session coupling).
- `grep -q "cookies?: Record<string, true | StandardSchemaV1>" src/metadata/types.ts`.
</verification>

<success_criteria>
- ROADMAP SC #1 (cookies + session via input declaration) proven by tests.
- INPUT-04 and INPUT-05 marked as implemented in plan SUMMARY.
- No regressions in Phase 2/3 tests.
</success_criteria>

<output>
Create `.planning/phases/04-uploads-cookies-sessions-render-request-context/04-02-SUMMARY.md` with files modified, test counts, and grep-gate results.
</output>

## Truths — Decision Citations

This plan implements the following CONTEXT.md decisions:

- **D-01** — Cookies are declared as a per-key map (`Record<string, true | StandardSchemaV1>`) on `InputDeclaration`; each key is resolved independently by `resolveCookiesArm`, giving handlers a typed, destructured `cookies` object rather than raw `req.cookies`.
- **D-02** — Session is declared as a single `true | StandardSchemaV1` flag on `InputDeclaration`; `resolveSessionArm` passes through `req.session` verbatim when `true`, or validates the whole session object when a schema is provided — wired into the `Promise.all` in `validation.ts`.
