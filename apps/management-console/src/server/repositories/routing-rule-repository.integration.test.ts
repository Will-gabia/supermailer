import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';

import { startPostgresContainer, waitFor } from '@supermailer/testing';

import { createDatabasePool, createManagementConsoleDatabase, runMigrations } from '../db';
import { createRepositories } from './index';

describe('routing-rule-repository integration', () => {
  let connectionString = '';
  let stopContainer: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    const postgres = await startPostgresContainer();
    connectionString = postgres.connectionString;
    stopContainer = async () => {
      await postgres.container.stop();
    };

    await waitFor(async () => {
      const client = new Client({ connectionString });
      await client.connect();
      await client.end();
    });
  });

  afterAll(async () => {
    await stopContainer?.();
  });

  it('stores versioned domain routes with a deterministic default fallback', async () => {
    const pool = createDatabasePool(connectionString);

    try {
      await runMigrations(pool);

      const repositories = createRepositories(createManagementConsoleDatabase(pool));

      const gmailNode = await repositories.sendSmtpNodes.create({
        id: 'node_gmail',
        name: 'smtp-gmail-1',
        host: 'gmail.relay.internal',
        port: 2525,
        priority: 20,
      });
      const defaultNode = await repositories.sendSmtpNodes.create({
        id: 'node_default',
        name: 'smtp-default-1',
        host: 'default.relay.internal',
        port: 2526,
        priority: 10,
      });

      const version = await repositories.routingRules.createRuleset([
        {
          id: 'rule_gmail',
          matchType: 'exact',
          domain: 'gmail.com',
          sendSmtpNodeId: gmailNode.id,
          priority: 1,
        },
        {
          id: 'rule_default',
          matchType: 'default',
          sendSmtpNodeId: defaultNode.id,
          priority: 100,
        },
      ]);

      const gmailRoute = await repositories.routingRules.findRouteForRecipient('bob@gmail.com');
      const defaultRoute = await repositories.routingRules.findRouteForRecipient('alice@example.com');

      expect(version).toBe(1);
      expect(gmailRoute).toMatchObject({
        rule: { version, matchType: 'exact', domain: 'gmail.com' },
        node: { id: gmailNode.id, name: 'smtp-gmail-1' },
      });
      expect(defaultRoute).toMatchObject({
        rule: { version, matchType: 'default', domain: null },
        node: { id: defaultNode.id, name: 'smtp-default-1' },
      });
      await expect(repositories.routingRules.listRulesByVersion(version)).resolves.toHaveLength(2);
    } finally {
      await pool.end();
    }
  });
});
