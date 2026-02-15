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
    include: ['tests/security/**/*.test.ts'],
    testTimeout: 15000,
  },
});
