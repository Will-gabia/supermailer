import { createServer } from 'node:http';

import { afterEach, describe, expect, it } from 'vitest';

import { createUlid } from '@supermailer/contracts';

import type { ManagementConsoleTestHarness } from './test-helpers';
import { registerIntegrationTestHarness } from './test-helpers';
import { ingestDeliveryEvent } from './services/delivery-events';
import { signOutboundResultWebhookPayload } from './services/delivery-event-signing';

describe('outbound-result-webhooks integration', () => {
  let harness = {} as ManagementConsoleTestHarness;
  let stopServer: (() => Promise<void>) | null = null;

  registerIntegrationTestHarness({
    setHarness: (value) => {
      harness = value;
    },
    getHarness: () => harness,
  });

  afterEach(async () => {
    await stopServer?.();
    stopServer = null;
  });

  const createAcceptedSend = async (kind: 'individual' | 'campaign') => {
    const node = await harness.appContext.repositories.sendSmtpNodes.create({
      id: createUlid(),
      name: `node-${createUlid()}`,
      host: 'relay.internal',
      port: 2525,
      priority: 1,
    });

    const send = await harness.appContext.repositories.sends.create({
      id: createUlid(),
      kind,
      recipientEmail:
        kind === 'individual' ? 'person@example.com' : 'campaign@example.com',
      subjectSnapshot: 'Subject',
      htmlSnapshot: '<p>Body</p>',
      status: 'accepted_by_mta',
      sendSmtpNodeId: node.id,
    });
    const queueId = `QID-${send.id}`;

    await harness.appContext.repositories.sends.markDispatchAccepted(send.id, {
      attemptId: createUlid(),
      relayNodeId: node.id,
      queueId,
      response: '250 queued',
    });

    return { send, queueId };
  };

  const startWebhookServer = async (options: {
    statusCode: number;
    capture: Array<{ headers: Record<string, string>; body: string }>;
  }): Promise<string> =>
    await new Promise((resolve) => {
      const server = createServer(async (request, response) => {
        const chunks: Buffer[] = [];

        for await (const chunk of request) {
          chunks.push(Buffer.from(chunk));
        }

        options.capture.push({
          headers: Object.fromEntries(
            Object.entries(request.headers).map(([key, value]) => [
              key,
              Array.isArray(value) ? value.join(',') : (value ?? ''),
            ]),
          ),
          body: Buffer.concat(chunks).toString('utf8'),
        });

        response.statusCode = options.statusCode;
        response.end('ok');
      });

      server.listen(0, '127.0.0.1', () => {
        const address = server.address();

        if (!address || typeof address === 'string') {
          throw new Error('Failed to start test webhook server');
        }

        stopServer = async () => {
          await new Promise<void>((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }

              closeResolve();
            });
          });
        };

        resolve(`http://127.0.0.1:${address.port}/result-webhook`);
      });
    });

  it('delivers individual result webhooks with signing and updates retry ledger on success', async () => {
    const { send, queueId } = await createAcceptedSend('individual');
    const received: Array<{ headers: Record<string, string>; body: string }> =
      [];
    const targetUrl = await startWebhookServer({
      statusCode: 202,
      capture: received,
    });

    await harness.appContext.repositories.outboundWebhookDeliveries.create({
      id: createUlid(),
      sendId: send.id,
      targetUrl,
      signingSecret: 'outbound-secret-123',
      status: 'pending',
      payload: { sendId: send.id },
    });

    const result = await ingestDeliveryEvent(harness.appContext, {
      format: 'normalized',
      event: {
        eventId: 'evt-result-001',
        eventType: 'delivered',
        sendId: send.id,
        queueId,
        occurredAt: '2026-03-20T01:00:00.000Z',
        smtpCode: '250',
        enhancedCode: '2.0.0',
        reason: 'Delivered',
        relayNode: 'relay.internal',
        provenance: 'normalized/internal',
        payload: { delivery: true },
      },
    });

    expect(result.outcome).toBe('applied');
    expect(received).toHaveLength(1);

    const [request] = received;
    const expectedSignature = signOutboundResultWebhookPayload(
      'outbound-secret-123',
      request.body,
    );
    expect(request.headers['x-supermailer-signature']).toBe(expectedSignature);

    const payload = JSON.parse(request.body) as {
      sendId: string;
      sendKind: string;
      status: string;
      resultCode: string;
      event: { providerEventId: string; postfixQueueId: string | null };
    };

    expect(payload).toMatchObject({
      sendId: send.id,
      sendKind: 'individual',
      status: 'delivered',
      resultCode: 'delivered',
      event: {
        providerEventId: 'evt-result-001',
        postfixQueueId: queueId,
      },
    });

    await expect(
      harness.appContext.repositories.outboundWebhookDeliveries.findBySendId(
        send.id,
      ),
    ).resolves.toMatchObject({
      status: 'delivered',
      attemptCount: 1,
      nextAttemptAt: null,
    });
  });

  it('does not emit campaign result webhooks and schedules retry on failed individual delivery', async () => {
    const individual = await createAcceptedSend('individual');
    const campaign = await createAcceptedSend('campaign');
    const received: Array<{ headers: Record<string, string>; body: string }> =
      [];
    const targetUrl = await startWebhookServer({
      statusCode: 500,
      capture: received,
    });

    await harness.appContext.repositories.outboundWebhookDeliveries.create({
      id: createUlid(),
      sendId: individual.send.id,
      targetUrl,
      signingSecret: 'retry-secret',
      status: 'pending',
      payload: { sendId: individual.send.id },
    });
    await harness.appContext.repositories.outboundWebhookDeliveries.create({
      id: createUlid(),
      sendId: campaign.send.id,
      targetUrl,
      signingSecret: 'campaign-should-not-send',
      status: 'pending',
      payload: { sendId: campaign.send.id },
    });

    await ingestDeliveryEvent(harness.appContext, {
      format: 'normalized',
      event: {
        eventId: 'evt-individual-bounce-001',
        eventType: 'bounced',
        sendId: individual.send.id,
        queueId: individual.queueId,
        occurredAt: '2026-03-20T02:00:00.000Z',
        smtpCode: '550',
        enhancedCode: '5.1.1',
        reason: 'Mailbox unavailable',
        relayNode: 'relay.internal',
        provenance: 'normalized/internal',
        payload: { bounced: true },
      },
    });
    await ingestDeliveryEvent(harness.appContext, {
      format: 'normalized',
      event: {
        eventId: 'evt-campaign-delivered-001',
        eventType: 'delivered',
        sendId: campaign.send.id,
        queueId: campaign.queueId,
        occurredAt: '2026-03-20T02:01:00.000Z',
        smtpCode: '250',
        enhancedCode: '2.0.0',
        reason: 'Delivered',
        relayNode: 'relay.internal',
        provenance: 'normalized/internal',
        payload: { delivered: true },
      },
    });

    expect(received).toHaveLength(1);
    await expect(
      harness.appContext.repositories.outboundWebhookDeliveries.findBySendId(
        individual.send.id,
      ),
    ).resolves.toMatchObject({
      status: 'retry_scheduled',
      attemptCount: 1,
      lastAttemptAt: expect.any(Date),
      nextAttemptAt: expect.any(Date),
    });
    await expect(
      harness.appContext.repositories.outboundWebhookDeliveries.findBySendId(
        campaign.send.id,
      ),
    ).resolves.toMatchObject({
      status: 'pending',
      attemptCount: 0,
      lastAttemptAt: null,
    });
  });
});
