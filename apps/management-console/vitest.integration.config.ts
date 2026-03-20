import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const configDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@supermailer/config': path.resolve(
        configDirectory,
        '../../packages/config/src/index.ts',
      ),
      '@supermailer/contracts': path.resolve(
        configDirectory,
        '../../packages/contracts/src/index.ts',
      ),
      '@supermailer/domain': path.resolve(
        configDirectory,
        '../../packages/domain/src/index.ts',
      ),
      '@supermailer/testing': path.resolve(
        configDirectory,
        '../../packages/testing/src/index.ts',
      ),
    },
  },
  test: {
    include: ['src/**/*.integration.test.ts', 'src/**/*.integration.test.tsx'],
    environment: 'node',
    hookTimeout: 30000,
    testTimeout: 30000,
  },
});
