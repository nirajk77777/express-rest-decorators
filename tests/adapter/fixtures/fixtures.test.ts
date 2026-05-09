import { describe, it, expect } from 'vitest';
import { buildMetadata } from '../../../src/index.js';
import {
  UsersController,
  TextController,
  BaseController,
  DerivedController,
} from './controllers.js';

describe('Phase 2 fixture controllers', () => {
  it('build a non-empty metadata tree', () => {
    const meta = buildMetadata([
      UsersController,
      TextController,
      BaseController,
      DerivedController,
    ]);
    expect(meta.length).toBe(4);
    expect(meta.every((c) => c.actions.length > 0)).toBe(true);
  });
});
