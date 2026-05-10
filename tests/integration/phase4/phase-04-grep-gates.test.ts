/**
 * Phase 4 structural invariant grep gates.
 *
 * Each test asserts one invariant via fs.readFileSync + JS RegExp.
 * No shell-out (execSync) — FS-based grep only, per STATE.md D-07 decision.
 *
 * Gates:
 *  1. NO top-level multer import in src/
 *  2. NO top-level cors import in src/
 *  3. NO top-level cookie import in src/
 *  4. NO top-level tinyglobby import in src/
 *  5. NO express-session reference (any kind) in src/
 *  6. NO `req.requestId =` assignment in src/ (D-13)
 *  7. NO `Reflect.defineMetadata` in src/decorators/ (D-07)
 *  8. NO `app._router` or `_router` access in src/adapter/print-routes.ts
 *  9. Public barrel exports getRequestContext, Render, Redirect, Location, UploadedFile, UploadedFiles
 * 10. Public barrel does NOT export internal helpers
 * 11. Exact D-15 peer error strings present in adapter files
 * 12. Exact limits/fileFilter error strings present in uploads adapter
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// FS helpers (per Phase 1 D-07: no execSync, use Node fs + JS RegExp)
// ---------------------------------------------------------------------------

function* walk(dir: string): Generator<string> {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (p.endsWith('.ts') && !p.endsWith('.d.ts')) yield p;
  }
}

interface GrepHit {
  file: string;
  line: number;
  text: string;
}

/**
 * Strip comment lines from source text.
 * Removes JSDoc block comments (/* ... *\/) and inline comments (//).
 * Also removes lines that begin with * (block comment continuation lines).
 */
function stripComments(src: string): string {
  // Remove /* ... */ block comments (including multi-line JSDoc)
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove // line comments and blank/comment-only lines
  return noBlock
    .split('\n')
    .map((line) => {
      const inlineCommentIdx = line.indexOf('//');
      return inlineCommentIdx >= 0 ? line.slice(0, inlineCommentIdx) : line;
    })
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed.length > 0 && !trimmed.startsWith('*');
    })
    .join('\n');
}

/**
 * Search all .ts files under the given directory for lines matching the pattern.
 * Returns an array of hits with file path, 1-based line number, and text.
 * Comments are stripped before matching to avoid false positives.
 */
function grepDir(dir: string, pattern: RegExp): GrepHit[] {
  const hits: GrepHit[] = [];
  for (const file of walk(dir)) {
    const raw = readFileSync(file, 'utf8');
    const stripped = stripComments(raw);
    const lines = stripped.split('\n');
    lines.forEach((text, idx) => {
      if (pattern.test(text)) hits.push({ file, line: idx + 1, text: text.trim() });
    });
  }
  return hits;
}

/** Search a single file for lines matching the pattern (comments stripped). */
function grepFile(filePath: string, pattern: RegExp): GrepHit[] {
  const raw = readFileSync(filePath, 'utf8');
  const stripped = stripComments(raw);
  const lines = stripped.split('\n');
  const hits: GrepHit[] = [];
  lines.forEach((text, idx) => {
    if (pattern.test(text)) hits.push({ file: filePath, line: idx + 1, text: text.trim() });
  });
  return hits;
}

/** Read an entire file as a string. */
function readSrc(relPath: string): string {
  return readFileSync(relPath, 'utf8');
}

// ---------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------

describe('Phase 4 grep gates — structural invariants', () => {

  // Gate 1: NO top-level multer import in src/
  it('Gate 1 — no top-level multer import in src/', () => {
    // Top-level = non-dynamic import statement (not inside a function/block)
    // Pattern: line starts with `import` and contains `from "multer"` or `from 'multer'`
    const hits = grepDir('src', /^import .+ from ['"]multer['"]/);
    expect(hits, `Gate 1 violated — top-level multer import found:\n${JSON.stringify(hits, null, 2)}`).toEqual([]);
  });

  // Gate 2: NO top-level cors import in src/
  it('Gate 2 — no top-level cors import in src/', () => {
    const hits = grepDir('src', /^import .+ from ['"]cors['"]/);
    expect(hits, `Gate 2 violated — top-level cors import found:\n${JSON.stringify(hits, null, 2)}`).toEqual([]);
  });

  // Gate 3: NO top-level cookie import in src/
  it('Gate 3 — no top-level cookie import in src/', () => {
    const hits = grepDir('src', /^import .+ from ['"]cookie['"]/);
    expect(hits, `Gate 3 violated — top-level cookie import found:\n${JSON.stringify(hits, null, 2)}`).toEqual([]);
  });

  // Gate 4: NO top-level tinyglobby import in src/
  it('Gate 4 — no top-level tinyglobby import in src/', () => {
    const hits = grepDir('src', /^import .+ from ['"]tinyglobby['"]/);
    expect(hits, `Gate 4 violated — top-level tinyglobby import found:\n${JSON.stringify(hits, null, 2)}`).toEqual([]);
  });

  // Gate 5: NO express-session import or require in src/ (code references only — comments excluded)
  // The session.ts adapter documents the invariant in a comment ("NEVER imports express-session"),
  // which is expected. The gate checks that no actual import/require of express-session exists.
  it('Gate 5 — no express-session import/require in src/ (D-04: session.ts reads req.session only, never imports the peer)', () => {
    const importHits = grepDir('src', /from ['"]express-session['"]/);
    const requireHits = grepDir('src', /require\(['"]express-session['"]\)/);
    const allHits = [...importHits, ...requireHits];
    expect(allHits, `Gate 5 violated — express-session import/require found:\n${JSON.stringify(allHits, null, 2)}`).toEqual([]);
  });

  // Gate 6: NO `req.requestId =` assignment in src/ (D-13: requestId lives ONLY in ALS store)
  it('Gate 6 — no req.requestId assignment in src/ (D-13)', () => {
    const hits = grepDir('src', /req\.requestId\s*=/);
    expect(hits, `Gate 6 violated — req.requestId assignment found (D-13 violation):\n${JSON.stringify(hits, null, 2)}`).toEqual([]);
  });

  // Gate 7: NO `Reflect.defineMetadata` in src/decorators/ (D-07: decorators use WeakMap storage)
  it('Gate 7 — no Reflect.defineMetadata in src/decorators/ (D-07)', () => {
    const hits = grepDir('src/decorators', /Reflect\.defineMetadata/);
    expect(hits, `Gate 7 violated — Reflect.defineMetadata used in decorators/ (should use WeakMap storage):\n${JSON.stringify(hits, null, 2)}`).toEqual([]);
  });

  // Gate 8: NO `app._router` or `_router` access in src/adapter/print-routes.ts
  it('Gate 8 — print-routes.ts does not access app._router or _router (walks library metadata only)', () => {
    const hits = grepFile('src/adapter/print-routes.ts', /_router/);
    expect(hits, `Gate 8 violated — print-routes.ts accesses Express internals (_router):\n${JSON.stringify(hits, null, 2)}`).toEqual([]);
  });

  // Gate 9: Public barrel exports expected Phase 4 public symbols
  it('Gate 9 — public barrel exports getRequestContext, Render, Redirect, Location, UploadedFile, UploadedFiles', () => {
    const barrel = readSrc('src/index.ts');

    // getRequestContext — directly exported from adapter/request-context.js
    expect(barrel, 'Gate 9: getRequestContext not exported from barrel').toContain("getRequestContext");

    // UploadedFile, UploadedFiles — directly exported from adapter/uploads.js
    expect(barrel, 'Gate 9: UploadedFile not exported from barrel').toContain("UploadedFile");
    expect(barrel, 'Gate 9: UploadedFiles not exported from barrel').toContain("UploadedFiles");

    // Render, Redirect, Location — re-exported via export * from './decorators/index.js'
    // which re-exports from decorators/response.ts
    const decoratorsIndex = readSrc('src/decorators/index.ts');
    expect(decoratorsIndex, 'Gate 9: decorators/index.ts does not re-export response.ts').toContain("response");

    const decoratorsResponse = readSrc('src/decorators/response.ts');
    expect(decoratorsResponse, 'Gate 9: Render not exported from decorators/response.ts').toMatch(/export function Render/);
    expect(decoratorsResponse, 'Gate 9: Redirect not exported from decorators/response.ts').toMatch(/export function Redirect/);
    expect(decoratorsResponse, 'Gate 9: Location not exported from decorators/response.ts').toMatch(/export function Location/);
  });

  // Gate 10: Public barrel does NOT export internal helpers
  it('Gate 10 — public barrel does not export internal helpers (buildMulterMiddleware, resolveFilesArm, isUploadMarker, UPLOAD_KIND, createAlsMiddleware)', () => {
    const barrel = readSrc('src/index.ts');

    const internals = [
      'buildMulterMiddleware',
      'resolveFilesArm',
      'isUploadMarker',
      'createAlsMiddleware',
    ];

    for (const internal of internals) {
      // Check if the barrel has a non-type export of this symbol.
      // It's OK for it to appear in a comment or type export but not as a value export.
      // Simple heuristic: look for `export { <internal>` or `export * from` paths that expose it.
      const valueExportRe = new RegExp(`\\bexport\\s+\\{[^}]*\\b${internal}\\b[^}]*\\}`);
      expect(valueExportRe.test(barrel), `Gate 10 violated: internal helper "${internal}" leaked from barrel`).toBe(false);
    }

    // UPLOAD_KIND is a Symbol — also must not be re-exported as a value
    // It IS re-exported from uploads.ts internal but NOT from the public barrel
    // (the barrel only re-exports UploadedFile, UploadedFiles, and type aliases)
    expect(barrel, 'Gate 10: UPLOAD_KIND should not appear as value export in barrel').not.toMatch(
      /^export\s+\{[^}]*UPLOAD_KIND[^}]*\}/m,
    );
  });

  // Gate 11: Exact D-15 peer error strings present in adapter files
  it('Gate 11A — exact cookie peer error message present in cookies.ts', () => {
    const src = readSrc('src/adapter/cookies.ts');
    expect(src).toContain('cookies slot requires cookie as a peer dependency. Install it with: pnpm add cookie');
  });

  it('Gate 11B — exact cors peer error message present in cors.ts', () => {
    const src = readSrc('src/adapter/cors.ts');
    expect(src).toContain('cors boot option requires cors as a peer dependency. Install it with: pnpm add cors');
  });

  it('Gate 11C — exact multer peer error message present in uploads.ts', () => {
    const src = readSrc('src/adapter/uploads.ts');
    expect(src).toContain('File upload requires multer as a peer dependency. Install it with: pnpm add multer');
  });

  it('Gate 11D — exact tinyglobby peer error message present in glob-loader.ts', () => {
    const src = readSrc('src/adapter/glob-loader.ts');
    expect(src).toContain('Glob patterns in controllers require tinyglobby as a peer dependency. Install it with: pnpm add tinyglobby');
  });

  // Gate 12: limits/fileFilter error strings present in uploads.ts
  it('Gate 12A — "requires explicit limits" error string present in uploads.ts', () => {
    const src = readSrc('src/adapter/uploads.ts');
    expect(src).toContain('requires explicit limits');
  });

  it('Gate 12B — "requires explicit fileFilter" error string present in uploads.ts', () => {
    const src = readSrc('src/adapter/uploads.ts');
    expect(src).toContain('requires explicit fileFilter');
  });
});
