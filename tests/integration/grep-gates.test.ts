import { execSync, execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Recursively collect all .ts files under a directory.
 */
function collectTs(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTs(full));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Return all non-comment source lines from all .ts files under src/.
 * Strips // single-line comments and * block-comment continuation lines.
 *
 * Optional `excludePrefixes` skips files whose path starts with any of the
 * given prefixes (e.g. ['src/adapter/'] for the SC#1 Express-isolation gate
 * — Phase 2 introduces the Express adapter under src/adapter/, which is
 * explicitly the only place Express may be imported).
 */
function srcLines(excludePrefixes: string[] = []): string[] {
  const files = collectTs('src').filter(
    f => !excludePrefixes.some(prefix => f.startsWith(prefix)),
  );
  const lines: string[] = [];
  for (const file of files) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const trimmed = line.trim();
      // Skip blank lines, // comments, and block-comment lines (* ...)
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
      lines.push(trimmed);
    }
  }
  return lines;
}

/**
 * Count source lines matching a JS RegExp across all non-comment lines in src/.
 */
function countMatches(re: RegExp, excludePrefixes: string[] = []): number {
  return srcLines(excludePrefixes).filter(l => re.test(l)).length;
}

describe('Phase 1 grep gates', () => {
  it('SC#1: core has zero Express imports (src/adapter/ excluded — adapter is the only allowed Express boundary)', () => {
    const excludeAdapter = ['src/adapter/'];
    expect(countMatches(/from ['"]express['"]/, excludeAdapter)).toBe(0);
    expect(countMatches(/from ['"]express\//, excludeAdapter)).toBe(0);
  });

  it('SC#4: core has zero DI-library imports', () => {
    expect(
      countMatches(/from ['\"](tsyringe|typedi|awilix|inversify|inversifyjs|@nestjs\/common)['\"]/)
    ).toBe(0);
  });

  it('D-07: core does not call Reflect.defineMetadata', () => {
    expect(countMatches(/Reflect\.defineMetadata/)).toBe(0);
  });

  it('D-04: WeakMap-private storage — no exported map references', () => {
    // Module-private maps must never be exported directly.
    expect(countMatches(/^export (const|let|var) (controller|method)Map/)).toBe(0);
  });

  it('SC#5: single-package repo — no packages/ directory', () => {
    expect(existsSync('packages')).toBe(false);
  });

  it('SC#5: single-package repo — no workspaces field in package.json', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(pkg.workspaces).toBeUndefined();
  });

  it('SC#5: type-only StandardSchemaV1 — no runtime import or non-type-only re-export of @standard-schema/spec', () => {
    // Only `export type { ... } from '@standard-schema/spec'` is acceptable.
    // Catches value imports like `import ... from '@standard-schema/spec'`
    // and value re-exports like `export { X } from '@standard-schema/spec'`.
    const valueImports = srcLines().filter(l =>
      /from ['"]@standard-schema\/spec['"]/.test(l) &&
      // Must NOT start with `import type` or `export type`
      !(/^(import|export) type\b/.test(l))
    ).length;
    expect(valueImports).toBe(0);
  });

  it('SC#5: @standard-schema/spec is a devDependency only (not a runtime dep)', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(pkg.dependencies?.['@standard-schema/spec']).toBeUndefined();
    expect(pkg.devDependencies?.['@standard-schema/spec']).toBeDefined();
  });

  it('BUILD-04: tsconfig has experimentalDecorators true', () => {
    const tsconfig = readFileSync('tsconfig.json', 'utf8');
    expect(tsconfig).toMatch(/"experimentalDecorators":\s*true/);
    expect(tsconfig).toMatch(/"emitDecoratorMetadata":\s*true/);
  });

  it('BUILD-05: reflect-metadata is a runtime dependency', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(pkg.dependencies?.['reflect-metadata']).toBeDefined();
  });
});
