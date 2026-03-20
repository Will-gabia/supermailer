import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Pool } from 'pg';

const migrationsDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

const migrationTableSql = `
  create table if not exists __supermailer_migrations (
    id text primary key,
    applied_at timestamptz not null default now()
  );
`;

const splitStatements = (sqlSource: string): string[] =>
  sqlSource
    .split(/^\s*-->\s*statement-breakpoint\s*$/m)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

export const runMigrations = async (pool: Pool): Promise<void> => {
  const client = await pool.connect();

  try {
    await client.query('begin');
    await client.query(migrationTableSql);

    const migrationFiles = (await readdir(migrationsDirectory)).filter((file) => file.endsWith('.sql')).sort();

    for (const migrationFile of migrationFiles) {
      const existing = await client.query<{ id: string }>('select id from __supermailer_migrations where id = $1', [migrationFile]);

      if (existing.rowCount && existing.rowCount > 0) {
        continue;
      }

      const migrationSql = await readFile(path.join(migrationsDirectory, migrationFile), 'utf8');

      for (const statement of splitStatements(migrationSql)) {
        await client.query(statement);
      }

      await client.query('insert into __supermailer_migrations (id) values ($1)', [migrationFile]);
    }

    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
};
