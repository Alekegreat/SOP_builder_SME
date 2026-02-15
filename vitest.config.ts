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
    include: ['packages/*/src/**/*.test.ts', 'packages/*/src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['packages/*/src/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/*.d.ts',
        '**/index.ts',
        '**/types.ts',
        '**/__mocks__/**',
        '**/__fixtures__/**',
      ],
      thresholds: {
        statements: 95,
        branches: 90,
        functions: 95,
        lines: 95,
      },
    },
  },
});
