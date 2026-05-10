import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

// Build smoke config: runs only tests/build/**, intentionally separate from the
// default vitest.config.ts (which excludes tests/build to keep the standard
// `pnpm test` run independent of dist/). Invoked via `pnpm test:build`.
export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        parser: {
          syntax: 'typescript',
          decorators: true,
        },
        transform: {
          decoratorMetadata: true,
          legacyDecorator: true,
        },
        target: 'es2022',
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['tests/build/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**'],
    setupFiles: ['reflect-metadata'],
  },
});
