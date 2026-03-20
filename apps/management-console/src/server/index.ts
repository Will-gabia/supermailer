import { serve } from '@hono/node-server';
import { loadEnv } from '@supermailer/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createManagementConsoleApp } from './app';
import { ensureSeededAdminUser } from './bootstrap';
import {
  createDatabasePool,
  createManagementConsoleDatabase,
  runMigrations,
} from './db';
import {
  createBullMqSendDispatchEnqueuer,
  createInMemorySendDispatchEnqueuer,
} from './queue/send-dispatch';
import { createRepositories } from './repositories';

const bootstrap = async (): Promise<void> => {
  const env = loadEnv();
  const pool = createDatabasePool(env.databaseUrl);

  await runMigrations(pool);

  const db = createManagementConsoleDatabase(pool);
  const repositories = createRepositories(db);

  await ensureSeededAdminUser({ env, repositories });

  const sendDispatchEnqueuer =
    env.nodeEnv === 'test'
      ? createInMemorySendDispatchEnqueuer()
      : createBullMqSendDispatchEnqueuer(env.redisUrl);

  const serverEntryPath = fileURLToPath(import.meta.url);
  const serverDirectory = path.dirname(serverEntryPath);
  const spaDistPath = path.resolve(serverDirectory, '../..');
  const spaIndexPath = path.join(spaDistPath, 'index.html');
  const staticServingOptions =
    env.nodeEnv === 'production'
      ? { staticRoot: spaDistPath, spaIndexPath }
      : {};

  const app = createManagementConsoleApp(
    { env, db, repositories, sendDispatchEnqueuer },
    staticServingOptions,
  );

  const server = serve({
    fetch: app.fetch,
    port: env.managementConsolePort,
    hostname: env.managementConsoleHost,
  });

  const closeServer = async (): Promise<void> => {
    server.close();
    await pool.end();
  };

  process.on('SIGINT', () => {
    void closeServer().finally(() => process.exit(0));
  });

  process.on('SIGTERM', () => {
    void closeServer().finally(() => process.exit(0));
  });
};

void bootstrap();
