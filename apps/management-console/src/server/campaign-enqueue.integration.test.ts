import { describe, expect, it } from 'vitest';

import { createUlid } from '@supermailer/contracts';

import type { ManagementConsoleTestHarness } from './test-helpers';
import { registerIntegrationTestHarness } from './test-helpers';

describe('campaign-enqueue integration', () => {
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
        label: 'campaign-send-test',
        scopes: ['campaign-send'],
      }),
    });

    const payload = (await createResponse.json()) as { data: { rawKey: string } };
    return payload.data.rawKey;
  };

  it('fans out per recipient, skips suppressed recipients, and enqueues deterministic jobs', async () => {
    const rawKey = await createApiKey();
    const campaignId = createUlid();

    const template = await harness.appContext.repositories.templates.create({
      id: createUlid(),
      name: `campaign-template-${createUlid()}`,
      subject: 'Campaign for {{firstName}}',
      html: '<p>Hello {{firstName}}</p>',
    });

    await harness.appContext.repositories.suppressions.create({
      id: createUlid(),
      email: 'hardbounce@example.com',
      reason: 'hard_bounce',
      sourceEventId: null,
    });

    const response = await harness.app.request('/api/campaign-sends', {
      method: 'POST',
      headers: {
        'x-api-key': rawKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        campaignId,
        templateId: template.id,
        variables: { firstName: 'Customer' },
        recipients: ['bob@gmail.com', 'hardbounce@example.com', 'bob@gmail.com'],
      }),
    });

    expect(response.status).toBe(202);
    const payload = (await response.json()) as {
      status: 'accepted';
      data: {
        campaignId: string;
        totals: { requested: number; queued: number; skipped: number };
        queued: Array<{ email: string; sendId: string; queueJobId: string; status: 'queued' }>;
        skipped: Array<{ email: string; reason: 'hard_bounce_suppression' | 'unsubscribed' }>;
      };
    };

    expect(payload.status).toBe('accepted');
    expect(payload.data.campaignId).toBe(campaignId);
    expect(payload.data.totals).toEqual({ requested: 2, queued: 1, skipped: 1 });
    expect(payload.data.skipped).toEqual([{ email: 'hardbounce@example.com', reason: 'hard_bounce_suppression' }]);
    expect(payload.data.queued).toHaveLength(1);
    expect(payload.data.queued[0].email).toBe('bob@gmail.com');
    expect(payload.data.queued[0].queueJobId).toBe(`send-${payload.data.queued[0].sendId}`);

    const sends = await harness.appContext.repositories.sends.list();
    const campaignSends = sends.filter((send) => send.kind === 'campaign');
    expect(campaignSends).toHaveLength(1);
    expect(campaignSends[0]).toMatchObject({
      id: payload.data.queued[0].sendId,
      queueJobId: payload.data.queued[0].queueJobId,
      recipientEmail: 'bob@gmail.com',
      subjectSnapshot: 'Campaign for Customer',
      htmlSnapshot: '<p>Hello Customer</p>',
      templateId: template.id,
    });
  });
});
