import { describe, expect, it } from 'vitest';

import { createUlid } from '@supermailer/contracts';

import type { ManagementConsoleTestHarness } from './test-helpers';
import { registerIntegrationTestHarness } from './test-helpers';

describe('individual-send integration', () => {
  let harness = {} as ManagementConsoleTestHarness;

  registerIntegrationTestHarness({
    setHarness: (value) => {
      harness = value;
    },
    getHarness: () => harness,
  });

  const createApiKey = async (): Promise<string> => {
    const loginResponse = await harness.app.request('/api/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email: harness.env.adminEmail,
        password: harness.env.adminPassword,
      }),
    });

    const adminCookie = loginResponse.headers.get('set-cookie') ?? '';
    const createResponse = await harness.app.request('/api/api-keys', {
      method: 'POST',
      headers: {
        cookie: adminCookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        label: 'individual-send-test',
        scopes: ['individual-send'],
      }),
    });

    const payload = (await createResponse.json()) as {
      data: { rawKey: string };
    };
    return payload.data.rawKey;
  };

  it('enqueues individual send with canonical id and persists webhook config', async () => {
    const rawKey = await createApiKey();

    const response = await harness.app.request('/api/individual-sends', {
      method: 'POST',
      headers: {
        'x-api-key': rawKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        to: 'alice@example.com',
        subject: 'Hello Alice',
        html: '<p>Welcome Alice</p>',
        webhookUrl: 'http://localhost:4010/webhooks/result',
      }),
    });

    expect(response.status).toBe(202);
    const payload = (await response.json()) as {
      sendId: string;
      status: 'queued';
      queueJobId: string;
      webhook: { targetUrl: string; signingSecret: string };
    };

    expect(payload.sendId).toMatch(/^[0-9A-Z]{26}$/);
    expect(payload.queueJobId).toBe(`send-${payload.sendId}`);
    expect(payload.status).toBe('queued');
    expect(payload.webhook.targetUrl).toBe(
      'http://localhost:4010/webhooks/result',
    );
    expect(payload.webhook.signingSecret).toBeTruthy();

    const storedSend = await harness.appContext.repositories.sends.findById(
      payload.sendId,
    );
    expect(storedSend).toMatchObject({
      id: payload.sendId,
      status: 'queued',
      queueJobId: payload.queueJobId,
      recipientEmail: 'alice@example.com',
      templateId: null,
      subjectSnapshot: 'Hello Alice',
      htmlSnapshot: '<p>Welcome Alice</p>',
    });

    const webhooks =
      await harness.appContext.repositories.outboundWebhookDeliveries.listForSend(
        payload.sendId,
      );
    expect(webhooks).toHaveLength(1);
    expect(webhooks[0]).toMatchObject({
      targetUrl: 'http://localhost:4010/webhooks/result',
      signingSecret: payload.webhook.signingSecret,
      status: 'pending',
    });
  });

  it('persists sends for suppressed recipients in send-only mode', async () => {
    const rawKey = await createApiKey();

    await harness.appContext.repositories.suppressions.create({
      id: createUlid(),
      email: 'hardbounce@example.com',
      reason: 'hard_bounce',
      sourceEventId: null,
    });

    const response = await harness.app.request('/api/individual-sends', {
      method: 'POST',
      headers: {
        'x-api-key': rawKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        to: 'hardbounce@example.com',
        subject: 'Hello',
        html: '<p>Hello</p>',
        webhookUrl: 'http://localhost:4010/webhooks/result',
      }),
    });

    expect(response.status).toBe(202);
    const payload = (await response.json()) as {
      sendId: string;
      status: 'queued';
      queueJobId: string;
      webhook: { targetUrl: string; signingSecret: string };
    };

    expect(payload.status).toBe('queued');
    expect(payload.queueJobId).toBe(`send-${payload.sendId}`);
    expect(payload.webhook.targetUrl).toBe(
      'http://localhost:4010/webhooks/result',
    );

    await expect(
      harness.appContext.repositories.sends.findById(payload.sendId),
    ).resolves.toMatchObject({
      id: payload.sendId,
      recipientEmail: 'hardbounce@example.com',
      status: 'queued',
    });
    await expect(
      harness.appContext.repositories.outboundWebhookDeliveries.listForSend(
        payload.sendId,
      ),
    ).resolves.toHaveLength(1);
  });

  it('supports raw-eml send flow with pre-registered callback endpoints and updatedSince result pull', async () => {
    const rawKey = await createApiKey();

    const registerResponse = await harness.app.request(
      '/api/callback-endpoints',
      {
        method: 'POST',
        headers: {
          'x-api-key': rawKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          label: 'result-fanout',
          targetUrl: 'http://localhost:4010/webhooks/send-results',
        }),
      },
    );

    expect(registerResponse.status).toBe(201);
    const registered = (await registerResponse.json()) as {
      data: { id: string; targetUrl: string };
    };

    const before = new Date(Date.now() - 1_000).toISOString();

    const sendResponse = await harness.app.request('/api/sends', {
      method: 'POST',
      headers: {
        'x-api-key': rawKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        eml: [
          'From: sender@example.com',
          'To: rendered@example.com',
          'Subject: Rendered Subject',
          'MIME-Version: 1.0',
          'Content-Type: text/plain; charset=utf-8',
          '',
          'Rendered Text',
        ].join('\r\n'),
        callbackEndpointId: registered.data.id,
      }),
    });

    expect(sendResponse.status).toBe(202);
    const sendPayload = (await sendResponse.json()) as {
      sendId: string;
      status: 'queued';
      queueJobId: string;
      callbackEndpointId: string | null;
    };

    expect(sendPayload.status).toBe('queued');
    expect(sendPayload.queueJobId).toBe(`send-${sendPayload.sendId}`);
    expect(sendPayload.callbackEndpointId).toBe(registered.data.id);

    await expect(
      harness.appContext.repositories.outboundWebhookDeliveries.listForSend(
        sendPayload.sendId,
      ),
    ).resolves.toMatchObject([
      {
        targetUrl: registered.data.targetUrl,
        status: 'pending',
      },
    ]);

    const pullResponse = await harness.app.request(
      `/api/send-results?updatedSince=${encodeURIComponent(before)}`,
      {
        headers: {
          'x-api-key': rawKey,
        },
      },
    );

    expect(pullResponse.status).toBe(200);
    const pulled = (await pullResponse.json()) as {
      data: Array<{
        sendId: string;
        recipientEmail: string;
        status: string;
        callbackEndpointId: string | null;
      }>;
    };

    expect(pulled.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sendId: sendPayload.sendId,
          recipientEmail: 'rendered@example.com',
          status: 'queued',
          callbackEndpointId: registered.data.id,
        }),
      ]),
    );
  });
});
