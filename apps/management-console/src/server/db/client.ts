import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { loadEnv } from '@supermailer/config';

import { schema } from './schema';

export type ManagementConsoleDatabase = NodePgDatabase<typeof schema>;

export const createDatabasePool = (connectionString = loadEnv().databaseUrl): Pool =>
  new Pool({
    connectionString,
  });

export const createManagementConsoleDatabase = (pool: Pool): ManagementConsoleDatabase => drizzle(pool, { schema });
