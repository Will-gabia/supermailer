import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';

import { startPostgresContainer, waitFor } from '@supermailer/testing';

import {
  createDatabasePool,
  createManagementConsoleDatabase,
  runMigrations,
} from '../db';
import { createRepositories } from './index';

const waitForTick = async () => {
  await new Promise((resolve) => setTimeout(resolve, 10));
};

describe('repositories integration', () => {
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

  it('persists send/routing/api-key entities in Postgres', async () => {
    const pool = createDatabasePool(connectionString);

    try {
      await runMigrations(pool);

      const repositories = createRepositories(
        createManagementConsoleDatabase(pool),
      );

      const smtpNode = await repositories.sendSmtpNodes.create({
        id: 'node_01',
        name: 'smtp-default-1',
        host: 'smtp.internal',
        port: 2525,
        priority: 10,
      });
      const rulesVersion = await repositories.routingRules.createRuleset([
        {
          id: 'rule_default_01',
          matchType: 'default',
          sendSmtpNodeId: smtpNode.id,
        },
      ]);
      const send = await repositories.sends.create({
        id: 'send_01',
        kind: 'individual',
        recipientEmail: 'alice@example.com',
        subjectSnapshot: 'Hello',
        htmlSnapshot: '<p>Hello</p>',
        status: 'queued',
        templateId: null,
        routingRuleVersion: rulesVersion,
        sendSmtpNodeId: smtpNode.id,
      });
      await repositories.sends.setQueueJobId(send.id, 'send-send_01');
      await repositories.deliveryEvents.append({
        id: 'evt_01',
        sendId: send.id,
        eventKey: 'evt-key-01',
        eventType: 'queued',
        provenance: 'application',
        rawPayload: { accepted: true },
        occurredAt: new Date('2026-03-20T00:00:00.000Z'),
      });
      const dispatchAttempt =
        await repositories.sendDispatchAttempts.createStarted({
          id: 'attempt_01',
          sendId: send.id,
          attemptNumber: 1,
          sendSmtpNodeId: smtpNode.id,
          relayIdentity: smtpNode.host,
        });
      await repositories.sendDispatchAttempts.finish(dispatchAttempt.id, {
        status: 'accepted',
        smtpCode: '250',
        enhancedSmtpCode: '2.0.0',
        reason: 'queued as 1234ABCD',
        queueId: '1234ABCD',
        relayIdentity: smtpNode.host,
      });
      await repositories.sends.markDispatchAccepted(send.id, {
        attemptId: dispatchAttempt.id,
        relayNodeId: smtpNode.id,
        queueId: '1234ABCD',
        response: '250 2.0.0 Ok: queued as 1234ABCD',
      });
      const apiKey = await repositories.apiKeys.create({
        id: 'key_01',
        label: 'integration',
        keyPrefix: 'sm_integration',
        keyHash: 'hash_01',
        scopes: ['individual-send'],
      });
      await repositories.apiKeys.markUsed(
        apiKey.id,
        new Date('2026-03-20T00:01:00.000Z'),
      );
      await repositories.outboundWebhookDeliveries.create({
        id: 'wh_01',
        sendId: send.id,
        targetUrl: 'https://example.com/webhooks/send-result',
        signingSecret: 'secret_01',
        status: 'pending',
        payload: { sendId: send.id },
      });

      await expect(repositories.sends.findById(send.id)).resolves.toMatchObject(
        {
          id: send.id,
          queueJobId: 'send-send_01',
          routingRuleVersion: rulesVersion,
          status: 'accepted_by_mta',
          dispatchAcceptedAttemptId: 'attempt_01',
          dispatchAcceptedPostfixQueueId: '1234ABCD',
        },
      );
      await expect(
        repositories.deliveryEvents.listForSend(send.id),
      ).resolves.toHaveLength(1);
      await expect(
        repositories.sendDispatchAttempts.listForSend(send.id),
      ).resolves.toHaveLength(1);
      await expect(
        repositories.sendSmtpNodes.listActive(),
      ).resolves.toHaveLength(1);
      await expect(repositories.sendSmtpNodes.list()).resolves.toHaveLength(1);
      await expect(
        repositories.apiKeys.findByKeyHash('hash_01'),
      ).resolves.toMatchObject({
        lastUsedAt: new Date('2026-03-20T00:01:00.000Z'),
      });
      await expect(
        repositories.apiKeys.findByKeyPrefix('sm_integration'),
      ).resolves.toMatchObject({ id: apiKey.id });
      await expect(
        repositories.apiKeys.revoke(apiKey.id),
      ).resolves.toMatchObject({
        id: apiKey.id,
        revokedAt: expect.any(Date),
      });
      await expect(
        repositories.outboundWebhookDeliveries.listForSend(send.id),
      ).resolves.toHaveLength(1);
    } finally {
      await pool.end();
    }
  });

  it('supports paginated searchable admin send history queries', async () => {
    const pool = createDatabasePool(connectionString);

    try {
      await runMigrations(pool);

      const repositories = createRepositories(
        createManagementConsoleDatabase(pool),
      );

      await repositories.sends.create({
        id: 'send_hist_repo_001',
        kind: 'individual',
        recipientEmail: 'history-alice@example.com',
        subjectSnapshot: 'Hello Alice 1',
        htmlSnapshot: '<p>Hello Alice 1</p>',
        status: 'queued',
        templateId: null,
      });
      await waitForTick();
      await repositories.sends.create({
        id: 'send_hist_repo_002',
        kind: 'individual',
        recipientEmail: 'bob@example.com',
        subjectSnapshot: 'Hello Bob',
        htmlSnapshot: '<p>Hello Bob</p>',
        status: 'queued',
        templateId: null,
      });
      await waitForTick();
      await repositories.sends.create({
        id: 'send_hist_repo_003',
        kind: 'individual',
        recipientEmail: 'history-alice-latest@example.com',
        subjectSnapshot: 'Hello Alice 2',
        htmlSnapshot: '<p>Hello Alice 2</p>',
        status: 'accepted_by_mta',
        templateId: null,
      });

      const listAdminHistory = Reflect.get(
        repositories.sends,
        'listAdminHistory',
      );
      expect(listAdminHistory).toBeTypeOf('function');

      if (typeof listAdminHistory !== 'function') {
        return;
      }

      const firstPage = (await listAdminHistory({
        search: 'history-alice',
        limit: 1,
        cursor: null,
      })) as {
        data: Array<{ id: string; recipientEmail: string }>;
        pageInfo: {
          limit: number;
          hasMore: boolean;
          nextCursor: string | null;
        };
      };

      expect(firstPage.data).toEqual([
        expect.objectContaining({
          id: 'send_hist_repo_003',
          recipientEmail: 'history-alice-latest@example.com',
        }),
      ]);
      expect(firstPage.pageInfo).toMatchObject({
        limit: 1,
        hasMore: true,
      });
      expect(firstPage.pageInfo.nextCursor).toBeTruthy();

      const secondPage = (await listAdminHistory({
        search: 'history-alice',
        limit: 1,
        cursor: firstPage.pageInfo.nextCursor,
      })) as {
        data: Array<{ id: string; recipientEmail: string }>;
        pageInfo: {
          limit: number;
          hasMore: boolean;
          nextCursor: string | null;
        };
      };

      expect(secondPage.data).toEqual([
        expect.objectContaining({
          id: 'send_hist_repo_001',
          recipientEmail: 'history-alice@example.com',
        }),
      ]);
      expect(secondPage.pageInfo).toMatchObject({
        limit: 1,
        hasMore: false,
        nextCursor: null,
      });
    } finally {
      await pool.end();
    }
  });
});
