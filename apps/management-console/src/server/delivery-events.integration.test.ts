import { describe, expect, it } from 'vitest';

import { createUlid } from '@supermailer/contracts';

import type { ManagementConsoleTestHarness } from './test-helpers';
import { registerIntegrationTestHarness } from './test-helpers';
import { signInboundDeliveryCallbackPayload } from './services/delivery-event-signing';

describe('delivery-events integration', () => {
  let harness = {} as ManagementConsoleTestHarness;

  registerIntegrationTestHarness({
    setHarness: (value) => {
      harness = value;
    },
    getHarness: () => harness,
  });

  const createAcceptedSend = async () => {
    const node = await harness.appContext.repositories.sendSmtpNodes.create({
      id: createUlid(),
      name: `node-${createUlid()}`,
      host: 'relay.internal',
      port: 2525,
      priority: 1,
    });

    const send = await harness.appContext.repositories.sends.create({
      id: createUlid(),
      kind: 'individual',
      recipientEmail: 'alice@example.com',
      subjectSnapshot: 'Hello Alice',
      htmlSnapshot: '<p>Hello Alice</p>',
      status: 'accepted_by_mta',
      sendSmtpNodeId: node.id,
    });
    const queueId = `QID-${send.id}`;

    await harness.appContext.repositories.sends.markDispatchAccepted(send.id, {
      attemptId: createUlid(),
      relayNodeId: node.id,
      queueId,
      response: `250 2.0.0 queued as ${queueId}`,
      acceptedAt: new Date('2026-03-20T00:00:00.000Z'),
    });

    return { send, node, queueId };
  };

  const createDispatchingSendWithId = async (input: {
    sendId: string;
    recipientEmail: string;
  }) => {
    const node = await harness.appContext.repositories.sendSmtpNodes.create({
      id: createUlid(),
      name: `node-${createUlid()}`,
      host: 'relay.internal',
      port: 2525,
      priority: 1,
    });

    const send = await harness.appContext.repositories.sends.create({
      id: input.sendId,
      kind: 'individual',
      recipientEmail: input.recipientEmail,
      subjectSnapshot: 'Dispatching',
      htmlSnapshot: '<p>Dispatching</p>',
      status: 'dispatching',
      sendSmtpNodeId: node.id,
    });

    return { send, node, queueId: `QID-${send.id}` };
  };

  const postSignedDeliveryEvent = async (body: Record<string, unknown>) => {
    const requestBody = JSON.stringify(body);
    const signature = signInboundDeliveryCallbackPayload(
      harness.appContext,
      requestBody,
    );

    return await harness.app.request('/api/internal/delivery-events', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-supermailer-signature': signature,
      },
      body: requestBody,
    });
  };

  it('ingests signed accepted_by_mta and deferred callbacks without treating deferred as terminal', async () => {
    const node = await harness.appContext.repositories.sendSmtpNodes.create({
      id: createUlid(),
      name: `node-${createUlid()}`,
      host: 'relay.internal',
      port: 2525,
      priority: 1,
    });

    const queuedSend = await harness.appContext.repositories.sends.create({
      id: createUlid(),
      kind: 'individual',
      recipientEmail: 'queued@example.com',
      subjectSnapshot: 'Queued',
      htmlSnapshot: '<p>Queued</p>',
      status: 'dispatching',
      sendSmtpNodeId: node.id,
    });

    const acceptedResponse = await postSignedDeliveryEvent({
      format: 'sendsmtp_log',
      event: {
        callbackId: 'cb-accepted-001',
        sendId: queuedSend.id,
        finalStatus: 'accepted_by_mta',
        smtpCode: '250',
        enhancedStatusCode: '2.0.0',
        diagnostic: 'Queued by relay',
        relayIdentity: 'relay.internal',
        occurredAt: '2026-03-20T00:01:00.000Z',
      },
    });

    expect(acceptedResponse.status).toBe(202);
    await expect(acceptedResponse.json()).resolves.toMatchObject({
      data: {
        sendId: queuedSend.id,
        eventKey: 'cb-accepted-001',
        outcome: 'applied',
        status: 'accepted_by_mta',
      },
    });
    await expect(
      harness.appContext.repositories.sends.findById(queuedSend.id),
    ).resolves.toMatchObject({ status: 'accepted_by_mta' });

    const { send, queueId } = await createDispatchingSendWithId({
      sendId: 'Q3DTN5P5A8AR0DMSYHRV6J2TVN',
      recipientEmail: 'dispatching@example.com',
    });
    const deferredResponse = await postSignedDeliveryEvent({
      format: 'sendsmtp_log',
      event: {
        callbackId: 'cb-Q3DTN5P5A8AR0DMSYHRV6J2TVN',
        sendId: send.id,
        postfixQueueId: queueId,
        finalStatus: 'deferred',
        smtpCode: '421',
        enhancedStatusCode: '4.4.1',
        diagnostic: 'Temporary network issue',
        relayIdentity: 'relay.internal',
        occurredAt: '2026-03-20T00:02:00.000Z',
      },
    });

    expect(deferredResponse.status).toBe(202);
    await expect(deferredResponse.json()).resolves.toMatchObject({
      data: {
        sendId: send.id,
        eventKey: 'cb-Q3DTN5P5A8AR0DMSYHRV6J2TVN',
        outcome: 'applied',
        status: 'deferred',
      },
    });
    await expect(
      harness.appContext.repositories.sends.findById(send.id),
    ).resolves.toMatchObject({ status: 'deferred' });
    await expect(
      harness.appContext.repositories.deliveryEvents.listForSend(send.id),
    ).resolves.toMatchObject([
      {
        eventKey: 'cb-Q3DTN5P5A8AR0DMSYHRV6J2TVN',
        eventType: 'deferred',
        smtpCode: '421',
        enhancedSmtpCode: '4.4.1',
        reason: 'Temporary network issue',
        relayIdentity: 'relay.internal',
        queueId,
      },
    ]);
  });

  it('ingests signed normalized callbacks, persists evidence, and ignores duplicates', async () => {
    const { send, queueId } = await createAcceptedSend();
    const requestBody = JSON.stringify({
      format: 'normalized',
      event: {
        eventId: 'evt-delivered-001',
        eventType: 'delivered',
        sendId: send.id,
        queueId,
        occurredAt: '2026-03-20T00:05:00.000Z',
        smtpCode: '250',
        enhancedCode: '2.0.0',
        reason: 'Delivered to mailbox',
        relayNode: 'relay.internal',
        provenance: 'normalized/internal',
        payload: {
          queueId,
          source: 'integration-test',
        },
      },
    });
    const signature = signInboundDeliveryCallbackPayload(
      harness.appContext,
      requestBody,
    );

    const response = await harness.app.request(
      '/api/internal/delivery-events',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-supermailer-signature': signature,
        },
        body: requestBody,
      },
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        sendId: send.id,
        eventKey: 'evt-delivered-001',
        outcome: 'applied',
        status: 'delivered',
      },
    });

    await expect(
      harness.appContext.repositories.sends.findById(send.id),
    ).resolves.toMatchObject({ status: 'delivered' });
    await expect(
      harness.appContext.repositories.deliveryEvents.listForSend(send.id),
    ).resolves.toMatchObject([
      {
        eventKey: 'evt-delivered-001',
        eventType: 'delivered',
        smtpCode: '250',
        enhancedSmtpCode: '2.0.0',
        reason: 'Delivered to mailbox',
        relayIdentity: 'relay.internal',
        queueId,
        provenance: 'normalized/internal',
        rawPayload: {
          queueId,
          source: 'integration-test',
        },
      },
    ]);

    const duplicateResponse = await harness.app.request(
      '/api/internal/delivery-events',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-supermailer-signature': signature,
        },
        body: requestBody,
      },
    );

    expect(duplicateResponse.status).toBe(200);
    await expect(duplicateResponse.json()).resolves.toMatchObject({
      data: {
        sendId: send.id,
        eventKey: 'evt-delivered-001',
        outcome: 'ignored_duplicate',
        status: 'delivered',
      },
    });
  });

  it('rejects unsigned callbacks and ignores stale regressive events', async () => {
    const { send, queueId } = await createAcceptedSend();

    const unsigned = await harness.app.request(
      '/api/internal/delivery-events',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          format: 'normalized',
          event: {
            eventId: 'evt-unsigned-001',
            eventType: 'delivered',
            sendId: send.id,
          },
        }),
      },
    );

    expect(unsigned.status).toBe(401);

    await harness.appContext.repositories.deliveryEvents.append({
      id: createUlid(),
      sendId: send.id,
      eventKey: 'evt-delivered-existing',
      eventType: 'delivered',
      smtpCode: '250',
      enhancedSmtpCode: '2.0.0',
      reason: 'Already delivered',
      relayIdentity: 'relay.internal',
      queueId,
      provenance: 'bootstrap',
      rawPayload: { seeded: true },
      occurredAt: new Date('2026-03-20T00:05:00.000Z'),
    });
    await harness.appContext.repositories.sends.setStatus(send.id, 'delivered');

    const staleBody = JSON.stringify({
      format: 'sendsmtp_log',
      event: {
        callbackId: 'cb-stale-001',
        sendId: send.id,
        postfixQueueId: queueId,
        finalStatus: 'deferred',
        smtpCode: '421',
        enhancedStatusCode: '4.4.1',
        diagnostic: 'Temporary network issue',
        relayIdentity: 'relay.internal',
        occurredAt: '2026-03-20T00:04:00.000Z',
      },
    });
    const staleSignature = signInboundDeliveryCallbackPayload(
      harness.appContext,
      staleBody,
    );

    const staleResponse = await harness.app.request(
      '/api/internal/delivery-events',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-supermailer-signature': staleSignature,
        },
        body: staleBody,
      },
    );

    expect(staleResponse.status).toBe(200);
    await expect(staleResponse.json()).resolves.toMatchObject({
      data: {
        sendId: send.id,
        eventKey: 'cb-stale-001',
        outcome: 'ignored_stale',
        status: 'delivered',
      },
    });
    await expect(
      harness.appContext.repositories.deliveryEvents.listForSend(send.id),
    ).resolves.toHaveLength(1);
    await expect(
      harness.appContext.repositories.sends.findById(send.id),
    ).resolves.toMatchObject({ status: 'delivered' });
  });

  it('ingests bounced callbacks as terminal failures distinct from deferred', async () => {
    const { send, queueId } = await createAcceptedSend();

    const bouncedResponse = await postSignedDeliveryEvent({
      format: 'sendsmtp_log',
      event: {
        callbackId: 'cb-bounced-001',
        sendId: send.id,
        postfixQueueId: queueId,
        finalStatus: 'bounced',
        smtpCode: '550',
        enhancedStatusCode: '5.1.1',
        diagnostic: 'Mailbox unavailable',
        relayIdentity: 'relay.internal',
        occurredAt: '2026-03-20T00:03:00.000Z',
      },
    });

    expect(bouncedResponse.status).toBe(202);
    await expect(bouncedResponse.json()).resolves.toMatchObject({
      data: {
        sendId: send.id,
        eventKey: 'cb-bounced-001',
        outcome: 'applied',
        status: 'bounced',
      },
    });
    await expect(
      harness.appContext.repositories.sends.findById(send.id),
    ).resolves.toMatchObject({ status: 'bounced' });
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

  it('exposes outbound webhook delivery status alongside delivery events for individual sends', async () => {
    const { send, queueId } = await createAcceptedSend();

    // Add a delivery event
    await harness.appContext.repositories.deliveryEvents.append({
      id: createUlid(),
      sendId: send.id,
      eventKey: 'evt-test-001',
      eventType: 'delivered',
      smtpCode: '250',
      enhancedSmtpCode: '2.0.0',
      reason: 'Delivered',
      relayIdentity: 'relay.internal',
      queueId,
      provenance: 'test',
      rawPayload: {},
      occurredAt: new Date('2026-03-20T00:05:00.000Z'),
    });

    // Add a webhook delivery record
    await harness.appContext.repositories.outboundWebhookDeliveries.create({
      id: createUlid(),
      sendId: send.id,
      targetUrl: 'https://webhook.example.com/callback',
      signingSecret: 'test-secret',
      status: 'pending',
      payload: { sendId: send.id, status: 'delivered' },
    });

    const adminCookie = await loginAsAdmin();
    const response = await harness.app.request(
      `/api/admin/sends/${send.id}/delivery-events`,
      {
        headers: {
          cookie: adminCookie,
        },
      },
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      type: 'delivered',
    });

    expect(body.webhookDelivery).toBeDefined();
    expect(body.webhookDelivery).toMatchObject({
      status: 'pending',
      targetUrl: 'https://webhook.example.com/callback',
      attemptCount: 0,
    });
    expect(body.audienceProvenance).toBeNull();
  });

  it('exposes campaign audience provenance alongside delivery events', async () => {
    const node = await harness.appContext.repositories.sendSmtpNodes.create({
      id: createUlid(),
      name: `node-${createUlid()}`,
      host: 'relay.internal',
      port: 2525,
      priority: 1,
    });
    const send = await harness.appContext.repositories.sends.create({
      id: createUlid(),
      kind: 'campaign',
      recipientEmail: 'grouped@example.com',
      subjectSnapshot: 'Grouped',
      htmlSnapshot: '<p>Grouped</p>',
      status: 'queued',
      sendSmtpNodeId: node.id,
      audienceProvenance: {
        manual: false,
        groups: [{ id: 'group_123', name: 'VIP 고객' }],
      },
    });

    await harness.appContext.repositories.deliveryEvents.append({
      id: createUlid(),
      sendId: send.id,
      eventKey: 'evt-grouped-001',
      eventType: 'delivered',
      smtpCode: '250',
      enhancedSmtpCode: '2.0.0',
      reason: 'Delivered',
      relayIdentity: 'relay.internal',
      queueId: `QID-${send.id}`,
      provenance: 'test',
      rawPayload: {},
      occurredAt: new Date('2026-03-20T00:05:00.000Z'),
    });

    const adminCookie = await loginAsAdmin();
    const response = await harness.app.request(
      `/api/admin/sends/${send.id}/delivery-events`,
      {
        headers: {
          cookie: adminCookie,
        },
      },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.audienceProvenance).toEqual({
      manual: false,
      groups: [{ id: 'group_123', name: 'VIP 고객' }],
    });
  });
});
