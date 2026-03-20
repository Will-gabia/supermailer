import { afterAll, beforeAll } from 'vitest';
import { Client } from 'pg';

import { loadEnv, type SupermailerEnv } from '@supermailer/config';
import { startPostgresContainer, waitFor } from '@supermailer/testing';

import type { ManagementConsoleAppContext } from './app-context';
import { createManagementConsoleApp } from './app';
import { ensureSeededAdminUser } from './bootstrap';
import { createDatabasePool, createManagementConsoleDatabase, runMigrations } from './db';
import { createInMemorySendDispatchEnqueuer } from './queue/send-dispatch';
import { createRepositories } from './repositories';

export type ManagementConsoleTestHarness = {
  connectionString: string;
  env: SupermailerEnv;
  appContext: ManagementConsoleAppContext;
  app: ReturnType<typeof createManagementConsoleApp>;
  cleanup: () => Promise<void>;
};

export const createIntegrationTestHarness = async (): Promise<ManagementConsoleTestHarness> => {
  const postgres = await startPostgresContainer();

  await waitFor(async () => {
    const client = new Client({ connectionString: postgres.connectionString });
    await client.connect();
    await client.end();
  });

  const env = loadEnv({
    DATABASE_URL: postgres.connectionString,
    AUTH_TOKEN_SECRET: 'integration-auth-secret',
    ADMIN_EMAIL: 'admin@supermailer.local',
    ADMIN_PASSWORD: 'supermailer-admin',
    NODE_ENV: 'test',
  });

  const pool = createDatabasePool(postgres.connectionString);
  await runMigrations(pool);

  const db = createManagementConsoleDatabase(pool);
  const repositories = createRepositories(db);
  const appContext: ManagementConsoleAppContext = {
    env,
    db,
    repositories,
    sendDispatchEnqueuer: createInMemorySendDispatchEnqueuer(),
  };

  await ensureSeededAdminUser(appContext);

  return {
    connectionString: postgres.connectionString,
    env,
    appContext,
    app: createManagementConsoleApp(appContext),
    cleanup: async () => {
      await pool.end();
      await postgres.container.stop();
    },
  };
};

export const registerIntegrationTestHarness = (callbacks: {
  setHarness: (harness: ManagementConsoleTestHarness) => void;
  getHarness: () => ManagementConsoleTestHarness;
}): void => {
  beforeAll(async () => {
    callbacks.setHarness(await createIntegrationTestHarness());
  });

  afterAll(async () => {
    await callbacks.getHarness().cleanup();
  });
};
