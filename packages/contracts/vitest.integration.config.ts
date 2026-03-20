import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const configDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@supermailer/config': path.resolve(
        configDirectory,
        '../config/src/index.ts',
      ),
      '@supermailer/contracts': path.resolve(configDirectory, './src/index.ts'),
      '@supermailer/domain': path.resolve(
        configDirectory,
        '../domain/src/index.ts',
      ),
      '@supermailer/testing': path.resolve(
        configDirectory,
        '../testing/src/index.ts',
      ),
    },
  },
  test: {
    include: ['src/**/*.integration.test.ts'],
    environment: 'node',
  },
});
