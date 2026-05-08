import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkLegacyDecoratorMode, __resetGuardForTest } from '../../src/guard/runtime-guard.js';

describe('checkLegacyDecoratorMode', () => {
  beforeEach(() => {
    __resetGuardForTest();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Test G1: is a no-op when reflect-metadata is loaded and emitDecoratorMetadata is on', () => {
    // In the test environment, both conditions are satisfied (vitest.config.ts + SWC)
    expect(() => checkLegacyDecoratorMode()).not.toThrow();
  });

  it('Test G2: throws with [express-controllers] and reflect-metadata mention when Reflect.getMetadata is missing', () => {
    // Save and delete Reflect.getMetadata
    const originalGetMetadata = Reflect.getMetadata;
    try {
      // @ts-expect-error — intentionally deleting for test
      delete Reflect.getMetadata;
      expect(() => checkLegacyDecoratorMode()).toThrow(/\[express-controllers\]/);
      expect(() => {
        __resetGuardForTest();
        checkLegacyDecoratorMode();
      }).toThrow(/reflect-metadata/);
    } finally {
      // Restore
      Reflect.getMetadata = originalGetMetadata;
    }
  });

  it('Test G3: throws with emitDecoratorMetadata mention when probe returns undefined', () => {
    // Simulate missing emitDecoratorMetadata by mocking Reflect.getMetadata to return undefined
    const spy = vi.spyOn(Reflect, 'getMetadata').mockReturnValue(undefined);

    expect(() => checkLegacyDecoratorMode()).toThrow(/\[express-controllers\]/);
    expect(() => {
      __resetGuardForTest();
      checkLegacyDecoratorMode();
    }).toThrow(/emitDecoratorMetadata/);

    spy.mockRestore();
  });

  it('Test G4: probe caches across calls; __resetGuardForTest re-enables probing', () => {
    // First call — probe runs
    checkLegacyDecoratorMode();

    const spy = vi.spyOn(Reflect, 'getMetadata');
    // Second call without reset — should NOT call Reflect.getMetadata (cached)
    checkLegacyDecoratorMode();
    expect(spy).not.toHaveBeenCalled();

    // After reset, probe re-runs
    __resetGuardForTest();
    checkLegacyDecoratorMode();
    expect(spy).toHaveBeenCalled();

    spy.mockRestore();
  });
});
