import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.integration.test.ts', 'src/**/*.integration.test.tsx'],
    environment: 'node',
    hookTimeout: 30000,
    testTimeout: 30000,
  },
});
