import { defineConfig } from '@playwright/test';

const remoteUrl = process.env.TMA_BASE_URL;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  retries: 1,
  use: {
    baseURL: remoteUrl || 'http://127.0.0.1:4173',
    headless: true,
  },
  ...(remoteUrl
    ? {}
    : {
        webServer: {
          command: 'pnpm --filter @sop/tma-web dev --host 127.0.0.1 --port 4173',
          url: 'http://127.0.0.1:4173',
          reuseExistingServer: true,
          timeout: 120000,
        },
      }),
});
