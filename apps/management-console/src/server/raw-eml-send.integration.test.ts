import { describe, expect, it } from 'vitest';

import type { ManagementConsoleTestHarness } from './test-helpers';
import { registerIntegrationTestHarness } from './test-helpers';

describe('raw-eml-send integration', () => {
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
        label: 'raw-eml-send-test',
        scopes: ['individual-send'],
      }),
    });

    const payload = (await createResponse.json()) as {
      data: { rawKey: string };
    };
    return payload.data.rawKey;
  };

  it('accepts valid raw EML, extracts metadata, and queues the send', async () => {
    const rawKey = await createApiKey();

    const response = await harness.app.request('/api/sends', {
      method: 'POST',
      headers: {
        'x-api-key': rawKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        eml: [
          'From: sender@example.com',
          'To: raw-eml@example.com',
          'Subject: Raw EML Subject',
          'MIME-Version: 1.0',
          'Content-Type: text/plain; charset=utf-8',
          '',
          'Hello from raw EML.',
        ].join('\r\n'),
      }),
    });

    expect(response.status).toBe(202);
    const payload = (await response.json()) as {
      sendId: string;
      status: string;
    };

    expect(payload.status).toBe('queued');
    await expect(
      harness.appContext.repositories.sends.findById(payload.sendId),
    ).resolves.toMatchObject({
      recipientEmail: 'raw-eml@example.com',
      subjectSnapshot: 'Raw EML Subject',
      status: 'queued',
    });
  });

  it('rejects malformed raw EML before persistence', async () => {
    const rawKey = await createApiKey();

    const response = await harness.app.request('/api/sends', {
      method: 'POST',
      headers: {
        'x-api-key': rawKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        eml: 'Subject: Missing recipient\r\n\r\nBroken raw EML',
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'validation_error',
    });
  });
});
