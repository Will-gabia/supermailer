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

    const payload = (await createResponse.json()) as { data: { rawKey: string } };
    return payload.data.rawKey;
  };

  it('enqueues individual send with canonical id and persists webhook config', async () => {
    const rawKey = await createApiKey();

    const template = await harness.appContext.repositories.templates.create({
      id: createUlid(),
      name: `individual-template-${createUlid()}`,
      subject: 'Hello {{firstName}}',
      html: '<p>Welcome {{firstName}}</p>',
    });

    const response = await harness.app.request('/api/individual-sends', {
      method: 'POST',
      headers: {
        'x-api-key': rawKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        to: 'alice@example.com',
        templateId: template.id,
        variables: { firstName: 'Alice' },
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
    expect(payload.webhook.targetUrl).toBe('http://localhost:4010/webhooks/result');
    expect(payload.webhook.signingSecret).toBeTruthy();

    const storedSend = await harness.appContext.repositories.sends.findById(payload.sendId);
    expect(storedSend).toMatchObject({
      id: payload.sendId,
      status: 'queued',
      queueJobId: payload.queueJobId,
      recipientEmail: 'alice@example.com',
      templateId: template.id,
      subjectSnapshot: 'Hello Alice',
      htmlSnapshot: '<p>Welcome Alice</p>',
    });

    const webhooks = await harness.appContext.repositories.outboundWebhookDeliveries.listForSend(payload.sendId);
    expect(webhooks).toHaveLength(1);
    expect(webhooks[0]).toMatchObject({
      targetUrl: 'http://localhost:4010/webhooks/result',
      signingSecret: payload.webhook.signingSecret,
      status: 'pending',
    });
  });

  it('skips suppressed recipient and avoids send/webhook persistence', async () => {
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
      status: 'skipped';
      queueJobId: null;
      skippedReason: 'hard_bounce_suppression';
      webhook: null;
    };

    expect(payload.status).toBe('skipped');
    expect(payload.queueJobId).toBeNull();
    expect(payload.skippedReason).toBe('hard_bounce_suppression');
    expect(payload.webhook).toBeNull();

    await expect(harness.appContext.repositories.sends.findById(payload.sendId)).resolves.toBeNull();
    await expect(harness.appContext.repositories.outboundWebhookDeliveries.listForSend(payload.sendId)).resolves.toEqual([]);
  });
});
