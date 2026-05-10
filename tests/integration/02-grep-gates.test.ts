/**
 * Phase 2 grep gates — FS-based structural invariants.
 *
 * Mirrors the Phase 1 pattern (tests/integration/grep-gates.test.ts): walk the
 * source tree with Node fs, strip comments, run JS RegExp against the remaining
 * lines. No tooling-coupled lint rules — these are deliberately tooling-agnostic.
 *
 * Gates:
 *   1. Express imported only inside src/adapter/.
 *   2. Express imports in src/adapter/ are confined to the expected file set
 *      (boot-options.ts must remain pure-type-only — no Express import).
 *   3. No try/catch around handler calls outside handler-wrapper.ts.
 *   4. libraryErrorMiddleware mounted exactly once per useExpressControllers.
 *   5. body-parser usage gated to createExpressServer (D-02 asymmetry).
 *   6. buildMetadata called exactly once per useExpressControllers.
 *   7. No reflect-metadata import added by Phase 2 (Phase 1 D-02 reserves it
 *      for the consumer entry).
 *   8. Public barrel exposes only the documented Phase-2 surfaces from adapter/.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// ---------------------------------------------------------------------------
// FS helpers
// ---------------------------------------------------------------------------

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...listTsFiles(p));
    else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

function readWithoutComments(file: string): string {
  const raw = readFileSync(file, 'utf8');
  // strip /* ... */ blocks (incl. JSDoc)
  const noBlock = raw.replace(/\/\*[\s\S]*?\*\//g, '');
  // strip // line comments
  return noBlock
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n');
}

function rel(p: string): string {
  return relative(process.cwd(), p).replace(/\\/g, '/');
}

// ---------------------------------------------------------------------------

describe('Phase 2 grep gates — structural invariants', () => {
  it('Gate 1 — zero Express imports outside src/adapter/ (src/interfaces/ excluded — type-only imports for interface contracts)', () => {
    const offending: string[] = [];
    for (const file of listTsFiles('src')) {
      const r = rel(file);
      if (r.startsWith('src/adapter/')) continue;
      if (r.startsWith('src/interfaces/')) continue;
      const stripped = readWithoutComments(file);
      if (
        /from ['"]express['"]/.test(stripped) ||
        /from ['"]express\//.test(stripped) ||
        /require\(['"]express['"]\)/.test(stripped)
      ) {
        offending.push(r);
      }
    }
    expect(offending, `Express imports leaked outside src/adapter/: ${offending.join(', ')}`).toEqual([]);
  });

  it('Gate 2 — Express imports inside src/adapter/ only in expected files', () => {
    // Files that may legitimately import Express (value or type-only).
    const allowed = new Set([
      'src/adapter/router-build.ts',
      'src/adapter/boot.ts',
      'src/adapter/handler-wrapper.ts',
      'src/adapter/error-middleware.ts',
      'src/adapter/response.ts',
      'src/adapter/validation.ts',
      // Phase 3 adapter helpers that use Express types
      'src/adapter/middleware.ts',
      'src/adapter/auth.ts',
      // Phase 4 adapter helpers that use Express types
      'src/adapter/request-context.ts',
    ]);

    const importers: string[] = [];
    for (const file of listTsFiles('src/adapter')) {
      const stripped = readWithoutComments(file);
      if (/from ['"]express['"]/.test(stripped)) {
        importers.push(rel(file));
      }
    }
    // Non-empty: at least one adapter file imports Express.
    expect(importers.length).toBeGreaterThan(0);
    // Every importer is in the allow-list. boot-options.ts MUST NOT appear.
    for (const f of importers) {
      expect(allowed.has(f), `Unexpected Express importer in src/adapter/: ${f}`).toBe(true);
    }
    // Boot-options must be pure-type-only.
    expect(importers).not.toContain('src/adapter/boot-options.ts');
  });

  it('Gate 3 — no try/catch in src/adapter/ except handler-wrapper.ts and auth.ts', () => {
    const offenders: { file: string; count: number }[] = [];
    for (const file of listTsFiles('src/adapter')) {
      const r = rel(file);
      // handler-wrapper.ts: source-attribution wrapper (Phase 2 D-16)
      // auth.ts: D-12 escape hatch — user-thrown HttpErrors from checkers must propagate via next(err)
      if (r === 'src/adapter/handler-wrapper.ts') continue;
      if (r === 'src/adapter/auth.ts') continue;
      const stripped = readWithoutComments(file);
      const matches = stripped.match(/\btry\s*\{/g);
      if (matches && matches.length > 0) {
        offenders.push({ file: r, count: matches.length });
      }
    }
    expect(
      offenders,
      `Pitfall A violation — unexpected try/catch in src/adapter/: ${JSON.stringify(offenders)}`,
    ).toEqual([]);
  });

  it('Gate 4 — libraryErrorMiddleware mounted exactly once in src/adapter/boot.ts', () => {
    const stripped = readWithoutComments('src/adapter/boot.ts');
    // Match the literal mount call. Use a fixed string match (escaped for
    // RegExp) to avoid wildcard slop.
    const re = /app\.use\(libraryErrorMiddleware\)/g;
    const matches = stripped.match(re) ?? [];
    expect(matches.length).toBe(1);
  });

  it('Gate 5 — body-parser only inside createExpressServer (D-02)', () => {
    const stripped = readWithoutComments('src/adapter/boot.ts');

    // Locate function bodies by name. We don't need to parse — split on the
    // function declarations and inspect the slice belonging to each.
    // Phase 3 breaking change: these functions are now async, so search for
    // both 'export function' and 'export async function'.
    const useIdx = Math.max(
      stripped.indexOf('export function useExpressControllers'),
      stripped.indexOf('export async function useExpressControllers'),
    );
    const createIdx = Math.max(
      stripped.indexOf('export function createExpressServer'),
      stripped.indexOf('export async function createExpressServer'),
    );
    expect(useIdx, 'useExpressControllers not found in boot.ts').toBeGreaterThan(-1);
    expect(createIdx, 'createExpressServer not found in boot.ts').toBeGreaterThan(-1);

    // useExpressControllers body = [useIdx, createIdx)
    // createExpressServer body  = [createIdx, EOF)
    const useBody =
      useIdx < createIdx
        ? stripped.slice(useIdx, createIdx)
        : stripped.slice(useIdx);
    const createBody =
      createIdx < useIdx
        ? stripped.slice(createIdx, useIdx)
        : stripped.slice(createIdx);

    // Within useExpressControllers: NO body-parser refs.
    expect(/express\.json\b/.test(useBody)).toBe(false);
    expect(/express\.urlencoded\b/.test(useBody)).toBe(false);

    // Within createExpressServer: BOTH refs appear at least once.
    expect(/express\.json\b/.test(createBody)).toBe(true);
    expect(/express\.urlencoded\b/.test(createBody)).toBe(true);
  });

  it('Gate 6 — buildMetadata called exactly once per useExpressControllers', () => {
    const stripped = readWithoutComments('src/adapter/boot.ts');
    // Phase 3 breaking change: functions are now async
    const useIdx = Math.max(
      stripped.indexOf('export function useExpressControllers'),
      stripped.indexOf('export async function useExpressControllers'),
    );
    const createIdx = Math.max(
      stripped.indexOf('export function createExpressServer'),
      stripped.indexOf('export async function createExpressServer'),
    );
    expect(useIdx).toBeGreaterThan(-1);
    const useBody =
      useIdx < createIdx && createIdx > -1
        ? stripped.slice(useIdx, createIdx)
        : stripped.slice(useIdx);
    const matches = useBody.match(/\bbuildMetadata\s*\(/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it('Gate 7 — Phase 2 does not import reflect-metadata', () => {
    const offenders: string[] = [];
    for (const file of listTsFiles('src/adapter')) {
      const stripped = readWithoutComments(file);
      if (/from ['"]reflect-metadata['"]/.test(stripped)) {
        offenders.push(rel(file));
      }
    }
    expect(
      offenders,
      `Phase 2 should not import reflect-metadata directly: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('Gate 8 — public barrel exposes only documented Phase-2 surfaces from adapter/', () => {
    const stripped = readWithoutComments('src/index.ts');

    // Collect every line that re-exports from './adapter/...'.
    const adapterReexports = stripped
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /from ['"]\.\/adapter\//.test(l));
    expect(adapterReexports.length).toBeGreaterThan(0);

    // Allowed Phase-2 public surfaces (extended by Phase 4 additive exports).
    const allowedSymbols = new Set([
      'useExpressControllers',
      'createExpressServer',
      'BootOptions',
      'AuthorizationChecker',
      'CurrentUserChecker',
      // Phase 4 — request context (AsyncLocalStorage)
      'getRequestContext',
      'RequestContext',
    ]);

    // Internals that must NEVER leak.
    const forbidden = [
      'buildControllerRouter',
      'resolveInputs',
      'writeResponse',
      'wrapAction',
      'libraryErrorMiddleware',
      'composePath',
      'detectV4Pattern',
      'applyResponseHandlers',
      'isStandardSchema',
      'renderPath',
      'makeHandlerFactory',
    ];

    // Parse re-exported symbols from each line. Supports:
    //   export { A, B } from './adapter/x.js';
    //   export type { A, B } from './adapter/x.js';
    const exportedSymbols = new Set<string>();
    for (const line of adapterReexports) {
      const m = line.match(/\{([^}]+)\}/);
      if (!m) continue;
      const names = m[1]!
        .split(',')
        .map((s) => s.trim().replace(/^type\s+/, ''))
        .filter(Boolean);
      for (const n of names) exportedSymbols.add(n);
    }
    expect(exportedSymbols.size).toBeGreaterThan(0);

    // Every exported symbol must be in the allowed set.
    for (const s of exportedSymbols) {
      expect(allowedSymbols.has(s), `Unexpected adapter symbol leaked from public barrel: ${s}`).toBe(true);
    }
    // None of the forbidden internals leaked.
    for (const f of forbidden) {
      expect(exportedSymbols.has(f), `Adapter internal leaked from public barrel: ${f}`).toBe(false);
    }
  });
});
