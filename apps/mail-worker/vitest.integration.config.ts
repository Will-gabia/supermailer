import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.integration.test.ts'],
    environment: 'node',
    testTimeout: 120000,
    hookTimeout: 120000,
    fileParallelism: false,
    maxConcurrency: 1,
  },
});
