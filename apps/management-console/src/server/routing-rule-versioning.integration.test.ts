import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, Pool } from 'pg';

import { startPostgresContainer, waitFor } from '@supermailer/testing';

import { createDatabasePool, createManagementConsoleDatabase, runMigrations } from './db';
import { createRepositories } from './repositories';

describe('routing-rule-versioning', () => {
  let connectionString = '';
  let stopContainer: (() => Promise<void>) | undefined;
  let pool: Pool;

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

    pool = createDatabasePool(connectionString);
    await runMigrations(pool);
  });

  afterAll(async () => {
    await pool.end();
    await stopContainer?.();
  });

  it('stores the routing-rule version used', async () => {
    const db = createManagementConsoleDatabase(pool);
    const repositories = createRepositories(db);

    const defaultNode = await repositories.sendSmtpNodes.create({
      id: 'node_default',
      name: 'smtp-default-2',
      host: 'default.relay.internal',
      port: 2526,
      priority: 10,
    });

    const version = await repositories.routingRules.createRuleset([
      {
        id: 'rule_default_2',
        matchType: 'default',
        sendSmtpNodeId: defaultNode.id,
        priority: 100,
      },
    ]);

    const route = await repositories.routingRules.findRouteForRecipient('bob@gmail.com');
    expect(route?.rule.version).toBe(version);

    await repositories.sends.create({
      id: 'send_route_version_01',
      kind: 'individual',
      recipientEmail: 'bob@gmail.com',
      subjectSnapshot: 'Routing Version Test',
      htmlSnapshot: '<p>Routing Version Test</p>',
      status: 'queued',
      routingRuleVersion: route?.rule.version ?? null,
      sendSmtpNodeId: route?.node.id ?? null,
    });

    await expect(repositories.sends.findById('send_route_version_01')).resolves.toMatchObject({
      routingRuleVersion: version,
      sendSmtpNodeId: defaultNode.id,
      status: 'queued',
    });
  });
});
