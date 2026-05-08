import 'reflect-metadata';

const DOCS_URL = 'https://github.com/express-controllers/express-controllers#prerequisites';

// Module-private no-op decorator factory — does not write to any of the library's
// WeakMaps (those are intentionally module-private to src/metadata/storage.ts).
function probeDecorator(): ParameterDecorator {
  return () => { /* no-op; presence of decoration triggers TS metadata emit */ };
}

class ProbeClass {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(@probeDecorator() _arg: string) { void _arg; }
}

let probed = false;
let probeResult: { reflectOk: boolean; emitOk: boolean } = {
  reflectOk: false,
  emitOk: false,
};

function probeOnce(): typeof probeResult {
  if (probed) return probeResult;
  probed = true;
  probeResult.reflectOk =
    typeof (Reflect as unknown as { getMetadata?: unknown }).getMetadata === 'function';
  if (probeResult.reflectOk) {
    const types = Reflect.getMetadata('design:paramtypes', ProbeClass);
    probeResult.emitOk = Array.isArray(types) && types.length === 1;
  }
  return probeResult;
}

export function checkLegacyDecoratorMode(): void {
  const { reflectOk, emitOk } = probeOnce();
  if (!reflectOk) {
    throw new Error(
      `[express-controllers] reflect-metadata is not loaded. ` +
        `Add \`import 'reflect-metadata';\` once at your application entry point ` +
        `(before importing any controller). See: ${DOCS_URL}`
    );
  }
  if (!emitOk) {
    throw new Error(
      `[express-controllers] emitDecoratorMetadata is disabled. ` +
        `Set \`"emitDecoratorMetadata": true\` and \`"experimentalDecorators": true\` in tsconfig.json. ` +
        `See: ${DOCS_URL}`
    );
  }
}

/** Test seam — re-runs the probe on next call (used by vitest). */
export function __resetGuardForTest(): void {
  probed = false;
  probeResult = { reflectOk: false, emitOk: false };
}
