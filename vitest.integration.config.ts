// @ts-nocheck
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@sop/shared': resolve(__dirname, 'packages/shared/src'),
      '@sop/engine': resolve(__dirname, 'packages/engine/src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    pool: 'forks',
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json'],
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 90,
      },
    },
  },
});
