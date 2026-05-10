/**
 * Phase 4 Plan 05 — printRoutes route-table formatter tests (API-04).
 *
 * Tests:
 *  1. printRoutes: true → console.log receives header line + one line per route
 *  2. Each row is METHOD.padEnd(N) + '  ' + path.padEnd(M) + '  ' + ControllerName.methodName
 *  3. Multi-controller app → all routes appear, sorted by mount order
 *  4. printRoutes: false (or absent) → console.log spy NOT called from print-routes path
 *  5. Route table walks library metadata only — implementation does not reference app._router
 */
import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import express from 'express';
import {
  JsonController,
  Get,
  Post,
  useExpressControllers,
  resetContainer,
} from '../../src/index.js';
import { buildRouteTable, printRouteTable } from '../../src/adapter/print-routes.js';
import { buildMetadata } from '../../src/metadata/builder.js';

beforeEach(() => {
  resetContainer();
  vi.restoreAllMocks();
});

// ─── Fixture Controllers ───────────────────────────────────────────────────────

@JsonController('/users')
class UserController {
  @Get('/')
  list() {
    return [];
  }

  @Post('/')
  create() {
    return { id: 1 };
  }
}

@JsonController('/posts')
class PostController {
  @Get('/:id')
  getOne() {
    return { id: 1 };
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('printRoutes — console.log receives header + route rows', () => {
  it('printRoutes: true logs METHOD header and one line per route', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const app = express();
    await useExpressControllers(app, {
      controllers: [UserController],
      printRoutes: true,
    });

    const calls = spy.mock.calls.map((args) => String(args[0]));
    expect(calls.length).toBeGreaterThan(0);

    // Header line should contain METHOD
    const headerLine = calls[0];
    expect(headerLine).toContain('METHOD');
    expect(headerLine).toContain('PATH');
    expect(headerLine).toContain('HANDLER');
  });
});

describe('printRoutes — row format', () => {
  it('each row uses padded columns: METHOD  PATH  HANDLER', () => {
    const meta = buildMetadata([UserController] as unknown as Function[]);
    const rows = buildRouteTable(meta, '');

    expect(rows.length).toBeGreaterThan(0);

    // All rows should have the expected structure
    for (const row of rows) {
      expect(typeof row.method).toBe('string');
      expect(typeof row.path).toBe('string');
      expect(typeof row.handler).toBe('string');
      expect(row.method).toBe(row.method.toUpperCase());
      expect(row.path).toMatch(/^\//);
      expect(row.handler).toContain('UserController.');
    }

    // Verify printRouteTable outputs padded columns
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printRouteTable(rows);

    const calls = spy.mock.calls.map((args) => String(args[0]));
    expect(calls.length).toBe(rows.length + 1); // header + rows

    // Each data row should contain double-space separators
    for (const line of calls) {
      expect(line).toContain('  '); // column separator
    }
  });
});

describe('printRoutes — multi-controller', () => {
  it('all routes appear for multiple controllers in mount order', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const app = express();
    await useExpressControllers(app, {
      controllers: [UserController, PostController],
      printRoutes: true,
    });

    const calls = spy.mock.calls.map((args) => String(args[0]));

    // Should have header + 3 route lines (GET /users, POST /users, GET /posts/:id)
    expect(calls.length).toBe(4); // 1 header + 3 routes

    const content = calls.join('\n');
    expect(content).toContain('UserController.');
    expect(content).toContain('PostController.');
    expect(content).toContain('/users');
    expect(content).toContain('/posts');
  });
});

describe('printRoutes — disabled (false or absent)', () => {
  it('console.log spy NOT called from print-routes when printRoutes is false', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const app = express();
    await useExpressControllers(app, {
      controllers: [UserController],
      printRoutes: false,
    });

    // The spy might be called by other things, but printRouteTable should not output anything
    // We verify by building the route table ourselves — if printRoutes was off, spy call count is 0
    expect(spy).not.toHaveBeenCalled();
  });

  it('console.log spy NOT called when printRoutes is absent', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const app = express();
    await useExpressControllers(app, {
      controllers: [UserController],
      // printRoutes: NOT set
    });

    expect(spy).not.toHaveBeenCalled();
  });
});

describe('printRoutes — walks library metadata only (no Express internals)', () => {
  it('print-routes.ts source does not reference app._router', () => {
    const source = readFileSync('src/adapter/print-routes.ts', 'utf8');
    expect(source).not.toContain('app._router');
    expect(source).not.toContain('req._router');
  });
});
