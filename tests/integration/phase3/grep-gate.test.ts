/**
 * Structural invariants for Phase 3 enforced as runtime grep tests.
 *
 * These tests read source files via fs.readFileSync and assert on the absence or
 * presence of specific patterns — locking in the architectural invariants from
 * CONTEXT.md that cannot be enforced by the TypeScript compiler alone.
 *
 * Comment lines are stripped before counting to avoid false positives from inline
 * documentation.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SRC = join(__dirname, '../../../src');

function readSrc(relPath: string): string {
  return readFileSync(join(SRC, relPath), 'utf8');
}

/**
 * Strip comment lines before counting. Removes lines that start with `//` or `*`
 * (JSDoc / block comment lines) so that pattern mentions in documentation don't
 * trigger false positives.
 */
const stripComments = (s: string): string =>
  s
    .split('\n')
    .filter(
      (line) =>
        !line.trim().startsWith('//') && !line.trim().startsWith('*'),
    )
    .join('\n');

describe('Grep gates — structural invariants (CONTEXT.md)', () => {
  // src/decorators/middleware.ts must NOT import from 'express'
  it('src/decorators/middleware.ts: no Express import (decorators are Express-free)', () => {
    const content = stripComments(readSrc('decorators/middleware.ts'));
    const expressImports = content.match(/from ['"]express['"]/g) ?? [];
    expect(expressImports.length).toBe(0);
  });

  // src/decorators/middleware.ts must NOT use Reflect.defineMetadata
  it('src/decorators/middleware.ts: no Reflect.defineMetadata (uses WeakMap storage only)', () => {
    const content = stripComments(readSrc('decorators/middleware.ts'));
    const reflectDefine = content.match(/Reflect\.defineMetadata/g) ?? [];
    expect(reflectDefine.length).toBe(0);
  });

  // src/metadata/types.ts must NOT import from 'express'
  it('src/metadata/types.ts: no Express import (metadata layer is Express-free)', () => {
    const content = stripComments(readSrc('metadata/types.ts'));
    const expressImports = content.match(/from ['"]express['"]/g) ?? [];
    expect(expressImports.length).toBe(0);
  });

  // src/metadata/storage.ts must NOT import from 'express'
  it('src/metadata/storage.ts: no Express import (metadata layer is Express-free)', () => {
    const content = stripComments(readSrc('metadata/storage.ts'));
    const expressImports = content.match(/from ['"]express['"]/g) ?? [];
    expect(expressImports.length).toBe(0);
  });

  // src/adapter/middleware.ts must NOT have try/catch wrappers (D-04: native v5 forwarding)
  it('src/adapter/middleware.ts: no try/catch wrapping (native v5 async error propagation)', () => {
    const content = stripComments(readSrc('adapter/middleware.ts'));
    const tryCatches = content.match(/^\s*try\s*\{/m) ?? [];
    expect(tryCatches.length).toBe(0);
  });

  // src/adapter/interceptor.ts must NOT have try/catch wrappers
  it('src/adapter/interceptor.ts: no try/catch wrapping (native v5 forwarding)', () => {
    const content = stripComments(readSrc('adapter/interceptor.ts'));
    const tryCatches = content.match(/^\s*try\s*\{/m) ?? [];
    expect(tryCatches.length).toBe(0);
  });

  // The Phase 3 public API must be reachable from the barrel (src/index.ts re-exports).
  // The barrel uses `export * from './decorators/index.js'` — the decorator names live in
  // the sub-barrel (decorators/middleware.ts). Interface names live in interfaces/index.ts.
  // Strategy: check that the transitive source files export each name so the barrel exposes them.
  it('Phase 3 decorators and interface types are defined and exported in their source files', () => {
    // Decorator names must appear in src/decorators/middleware.ts (exported functions/classes)
    const decoratorContent = readSrc('decorators/middleware.ts');
    const decoratorNames = ['UseBefore', 'UseAfter', 'Middleware', 'Interceptor', 'UseInterceptor', 'Authorized'];
    for (const name of decoratorNames) {
      expect(decoratorContent, `Expected src/decorators/middleware.ts to export '${name}'`).toContain(name);
    }

    // Interface names must appear in src/interfaces/index.ts (re-exported from sub-files)
    const interfaceContent = readSrc('interfaces/index.ts');
    const interfaceNames = ['ExpressMiddlewareInterface', 'ExpressErrorMiddlewareInterface', 'InterceptorInterface'];
    for (const name of interfaceNames) {
      expect(interfaceContent, `Expected src/interfaces/index.ts to re-export '${name}'`).toContain(name);
    }

    // src/index.ts barrel must re-export from the decorator and interface barrels
    const indexContent = readSrc('index.ts');
    expect(indexContent).toContain('./decorators/index.js');
    expect(indexContent).toContain('./interfaces/index.js');
  });

  // src/adapter/response.ts must call next() at least 6 times (one per success branch)
  it('src/adapter/response.ts: next() called at least 6 times (one per success branch)', () => {
    const content = stripComments(readSrc('adapter/response.ts'));
    const nextCalls = content.match(/next\(\)/g) ?? [];
    expect(nextCalls.length).toBeGreaterThanOrEqual(6);
  });
});
