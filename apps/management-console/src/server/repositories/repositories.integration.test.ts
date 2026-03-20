import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';

import { startPostgresContainer, waitFor } from '@supermailer/testing';

import {
  createDatabasePool,
  createManagementConsoleDatabase,
  runMigrations,
} from '../db';
import { createRepositories } from './index';

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

  it('persists foundation entities in Postgres', async () => {
    const pool = createDatabasePool(connectionString);

    try {
      await runMigrations(pool);

      const repositories = createRepositories(
        createManagementConsoleDatabase(pool),
      );

      const subscriber = await repositories.subscribers.create({
        id: 'sub_01',
        email: 'Alice@Example.com',
        displayName: 'Alice',
        metadata: { source: 'integration' },
      });
      const template = await repositories.templates.create({
        id: 'tpl_01',
        name: 'welcome',
        subject: 'Hello',
        html: '<p>Hello</p>',
        variables: ['firstName'],
      });
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
        recipientEmail: subscriber.email,
        subjectSnapshot: template.subject,
        htmlSnapshot: template.html,
        status: 'queued',
        templateId: template.id,
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
        scopes: ['subscriber-sync', 'individual-send'],
      });
      await repositories.apiKeys.markUsed(
        apiKey.id,
        new Date('2026-03-20T00:01:00.000Z'),
      );
      const syncRun = await repositories.syncRuns.create({
        id: 'sync_01',
        sourceKey: 'crm',
        status: 'running',
        idempotencyKey: 'sync:crm:01',
        stats: { imported: 1 },
      });
      await repositories.syncRuns.complete(syncRun.id, {
        status: 'completed',
        stats: { imported: 1, updated: 0 },
      });
      await repositories.outboundWebhookDeliveries.create({
        id: 'wh_01',
        sendId: send.id,
        targetUrl: 'https://example.com/webhooks/send-result',
        signingSecret: 'secret_01',
        status: 'pending',
        payload: { sendId: send.id },
      });

      await expect(
        repositories.subscribers.findByEmail('alice@example.com'),
      ).resolves.toMatchObject({
        id: subscriber.id,
        email: 'alice@example.com',
      });
      await expect(
        repositories.templates.findById(template.id),
      ).resolves.toMatchObject({ id: template.id, name: 'welcome' });
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
      await expect(
        repositories.apiKeys.findByKeyHash('hash_01'),
      ).resolves.toMatchObject({
        lastUsedAt: new Date('2026-03-20T00:01:00.000Z'),
      });
      await expect(
        repositories.apiKeys.findByKeyPrefix('sm_integration'),
      ).resolves.toMatchObject({ id: apiKey.id });
      await expect(
        repositories.syncRuns.findById(syncRun.id),
      ).resolves.toMatchObject({ status: 'completed' });
      await expect(
        repositories.outboundWebhookDeliveries.listForSend(send.id),
      ).resolves.toHaveLength(1);
    } finally {
      await pool.end();
    }
  });
});
