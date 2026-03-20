import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'NODE_ENV=test pnpm --filter @supermailer/management-console dev:server',
      url: 'http://localhost:3000/api/health',
      reuseExistingServer: false,
      timeout: 120000,
    },
    {
      command: 'pnpm --filter @supermailer/management-console dev',
      url: 'http://localhost:4173',
      reuseExistingServer: false,
      timeout: 120000,
    },
  ],
});
