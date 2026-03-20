import { defineConfig } from 'drizzle-kit';

import { loadEnv } from '@supermailer/config';

const env = loadEnv();

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/db/schema.ts',
  out: './src/server/db/migrations',
  dbCredentials: {
    url: env.databaseUrl,
  },
  strict: true,
});
