import { describe, expect, it } from 'vitest';

import { createUlid } from '@supermailer/contracts';

import type { ManagementConsoleTestHarness } from './test-helpers';
import { registerIntegrationTestHarness } from './test-helpers';

describe('reporting integration', () => {
  let harness = {} as ManagementConsoleTestHarness;

  registerIntegrationTestHarness({
    setHarness: (value) => {
      harness = value;
    },
    getHarness: () => harness,
  });

  const loginAsAdmin = async (): Promise<string> => {
    const response = await harness.app.request('/api/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email: harness.env.adminEmail,
        password: harness.env.adminPassword,
      }),
    });

    return response.headers.get('set-cookie') ?? '';
  };

  it('returns status counts, code histograms, node breakdowns, and per-send event history', async () => {
    const node = await harness.appContext.repositories.sendSmtpNodes.create({
      id: createUlid(),
      name: `node-${createUlid()}`,
      host: 'relay.internal',
      port: 2525,
      priority: 1,
    });

    const deliveredSend = await harness.appContext.repositories.sends.create({
      id: createUlid(),
      kind: 'individual',
      recipientEmail: 'delivered@example.com',
      subjectSnapshot: 'Delivered',
      htmlSnapshot: '<p>Delivered</p>',
      status: 'delivered',
      sendSmtpNodeId: node.id,
    });
    const bouncedSend = await harness.appContext.repositories.sends.create({
      id: createUlid(),
      kind: 'individual',
      recipientEmail: 'bounced@example.com',
      subjectSnapshot: 'Bounced',
      htmlSnapshot: '<p>Bounced</p>',
      status: 'bounced',
      sendSmtpNodeId: node.id,
    });

    await harness.appContext.repositories.deliveryEvents.append({
      id: createUlid(),
      sendId: deliveredSend.id,
      eventKey: 'evt-report-001',
      eventType: 'delivered',
      smtpCode: '250',
      enhancedSmtpCode: '2.0.0',
      reason: 'Delivered to inbox',
      relayIdentity: 'relay.internal',
      queueId: 'QID-REPORT-001',
      provenance: 'normalized/internal',
      rawPayload: { report: 1 },
      occurredAt: new Date('2026-03-20T03:00:00.000Z'),
    });
    await harness.appContext.repositories.deliveryEvents.append({
      id: createUlid(),
      sendId: bouncedSend.id,
      eventKey: 'evt-report-002',
      eventType: 'bounced',
      smtpCode: '550',
      enhancedSmtpCode: '5.1.1',
      reason: 'Mailbox not found',
      relayIdentity: 'relay.internal',
      queueId: 'QID-REPORT-002',
      provenance: 'sendsmtp/log-callback',
      rawPayload: { report: 2 },
      occurredAt: new Date('2026-03-20T03:10:00.000Z'),
    });

    const adminCookie = await loginAsAdmin();
    const reportingResponse = await harness.app.request(
      '/api/admin/reporting/delivery-events',
      {
        headers: {
          cookie: adminCookie,
        },
      },
    );

    expect(reportingResponse.status).toBe(200);
    await expect(reportingResponse.json()).resolves.toMatchObject({
      data: {
        statusCounts: expect.arrayContaining([
          { status: 'bounced', count: 1 },
          { status: 'delivered', count: 1 },
        ]),
        codeHistogram: expect.arrayContaining([
          {
            eventType: 'bounced',
            smtpReplyCode: '550',
            smtpEnhancedCode: '5.1.1',
            count: 1,
          },
          {
            eventType: 'delivered',
            smtpReplyCode: '250',
            smtpEnhancedCode: '2.0.0',
            count: 1,
          },
        ]),
        nodeBreakdown: expect.arrayContaining([
          {
            node: 'relay.internal',
            eventType: 'bounced',
            count: 1,
          },
          {
            node: 'relay.internal',
            eventType: 'delivered',
            count: 1,
          },
        ]),
      },
    });

    const historyResponse = await harness.app.request(
      `/api/admin/sends/${deliveredSend.id}/delivery-events`,
      {
        headers: {
          cookie: adminCookie,
        },
      },
    );

    expect(historyResponse.status).toBe(200);
    await expect(historyResponse.json()).resolves.toMatchObject({
      data: [
        {
          sendId: deliveredSend.id,
          type: 'delivered',
          providerEventId: 'evt-report-001',
          smtpReplyCode: '250',
          smtpEnhancedCode: '2.0.0',
          relay: 'relay.internal',
          postfixQueueId: 'QID-REPORT-001',
          provenance: 'normalized/internal',
          payload: { report: 1 },
          receivedAt: expect.any(String),
        },
      ],
    });
  });
});
