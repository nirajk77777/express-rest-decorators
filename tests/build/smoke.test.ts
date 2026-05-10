// BUILD-01 + BUILD-07 smoke test.
// Runs only via `pnpm test:build` (excluded from default vitest run via vitest.config.ts).
// Asserts: dist outputs exist, CJS+ESM loadable through Node's native loaders,
// emitDecoratorMetadata survived the tshy build (structural grep on emitted helpers — PRIMARY gate).
import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CJS = join(ROOT, 'dist/commonjs/index.js');
const ESM = join(ROOT, 'dist/esm/index.js');
const CJS_DTS = join(ROOT, 'dist/commonjs/index.d.ts');
const ESM_DTS = join(ROOT, 'dist/esm/index.d.ts');
const CJS_PKG = join(ROOT, 'dist/commonjs/package.json');

const METADATA_RE = /__metadata\(|Reflect\.metadata\(/;

/** Recursively walk a directory and return all .js file paths. */
function walkJs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walkJs(full));
    else if (st.isFile() && full.endsWith('.js')) out.push(full);
  }
  return out;
}

/**
 * The barrel `dist/{esm,commonjs}/index.js` is just re-exports — it does NOT
 * contain `__metadata(` calls because it has no decorator usage. The TS-emit
 * metadata helpers live in the modules where decorators are actually applied
 * (e.g. dist/commonjs/guard/runtime-guard.js). The structural grep therefore
 * scans the entire emitted dist subtree — that is the meaningful invariant
 * for "tshy honored emitDecoratorMetadata: true".
 */
function distContainsMetadataHelpers(distSubdir: 'commonjs' | 'esm'): boolean {
  const files = walkJs(join(ROOT, 'dist', distSubdir));
  return files.some(f => METADATA_RE.test(readFileSync(f, 'utf8')));
}

describe('BUILD-01: dist/ artifacts exist', () => {
  it('CJS index.js exists', () => expect(existsSync(CJS)).toBe(true));
  it('ESM index.js exists', () => expect(existsSync(ESM)).toBe(true));
  it('CJS index.d.ts exists', () => expect(existsSync(CJS_DTS)).toBe(true));
  it('ESM index.d.ts exists', () => expect(existsSync(ESM_DTS)).toBe(true));
  it('dist/commonjs/package.json declares type:commonjs', () => {
    expect(existsSync(CJS_PKG)).toBe(true);
    const pkg = JSON.parse(readFileSync(CJS_PKG, 'utf8'));
    expect(pkg.type).toBe('commonjs');
  });
});

describe('BUILD-01: bundles load through Node native loaders', () => {
  it('CJS bundle loads via require() and exports JsonController', () => {
    const out = execFileSync(
      process.execPath,
      ['-e', `const m = require(${JSON.stringify(CJS)}); process.stdout.write(typeof m.JsonController);`],
      { cwd: ROOT, encoding: 'utf8' },
    );
    expect(out).toBe('function');
  });

  it('ESM bundle loads via dynamic import and exports JsonController', () => {
    const out = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import(${JSON.stringify(ESM)}).then(m => process.stdout.write(typeof m.JsonController));`,
      ],
      { cwd: ROOT, encoding: 'utf8' },
    );
    expect(out).toBe('function');
  });
});

describe('BUILD-01: emitDecoratorMetadata survived tshy build (PRIMARY blocking gate)', () => {
  // The structural grep is the load-bearing assertion. A build that silently dropped
  // emitDecoratorMetadata: true would emit JS without TS's __metadata( / Reflect.metadata(
  // helpers — this assertion catches that failure mode end-to-end.
  //
  // We scan the entire dist/{commonjs,esm} subtree (not just index.js) because the
  // barrel index.js is re-exports only; metadata helpers live in modules that actually
  // apply decorators (e.g. guard/runtime-guard.js). Scoping the grep to index.js would
  // give a false negative regardless of emitDecoratorMetadata setting.
  it('tshy emitted __metadata() calls in CJS dist tree (proves emitDecoratorMetadata: true)', () => {
    expect(distContainsMetadataHelpers('commonjs')).toBe(true);
  });

  it('tshy emitted __metadata() calls in ESM dist tree (proves emitDecoratorMetadata: true)', () => {
    expect(distContainsMetadataHelpers('esm')).toBe(true);
  });

  it('at least one CJS file contains a /__metadata\\(|Reflect\\.metadata\\(/ match (sanity)', () => {
    const files = walkJs(join(ROOT, 'dist/commonjs'));
    const matches = files.filter(f => METADATA_RE.test(readFileSync(f, 'utf8')));
    expect(matches.length).toBeGreaterThan(0);
  });
});

describe('BUILD-01: library decorator factory is callable (secondary — does NOT cover emitDecoratorMetadata)', () => {
  // Sanity check that the published decorator function works. This does NOT prove
  // emitDecoratorMetadata fired — the manual Reflect.defineMetadata seed makes the
  // round-trip succeed regardless. Real coverage is the structural grep above.
  it('Get(...) decorator can be applied to a stub method without throwing', () => {
    const probeJs = `
      require('reflect-metadata');
      const m = require(${JSON.stringify(CJS)});
      class Probe {
        handler(a, b) { return null; }
      }
      // Manually seed design:paramtypes (simulates what TS-with-emitDecoratorMetadata would emit):
      Reflect.defineMetadata('design:paramtypes', [String, Number], Probe.prototype, 'handler');
      const dec = m.Get('/:id');
      dec(Probe.prototype, 'handler', Object.getOwnPropertyDescriptor(Probe.prototype, 'handler'));
      const types = Reflect.getMetadata('design:paramtypes', Probe.prototype, 'handler');
      process.stdout.write(JSON.stringify({
        isArray: Array.isArray(types),
        length: types ? types.length : -1,
        firstName: types && types[0] ? types[0].name : null,
      }));
    `;
    const out = execFileSync(process.execPath, ['-e', probeJs], { cwd: ROOT, encoding: 'utf8' });
    const result = JSON.parse(out);
    expect(result.isArray).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result.firstName).toBe('String');
  });
});

// Suppress unused-import warning; resolve is reserved for future absolute-path normalization.
void resolve;
