import { describe, expect, it } from 'vitest';

import type { ManagementConsoleTestHarness } from './test-helpers';
import { registerIntegrationTestHarness } from './test-helpers';

describe('api-keys integration', () => {
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

  it('creates hashed api keys, reveals raw key once, and tracks usage', async () => {
    const adminCookie = await loginAsAdmin();
    const createResponse = await harness.app.request('/api/api-keys', {
      method: 'POST',
      headers: {
        cookie: adminCookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        label: 'Subscriber Sync Integration',
        scopes: ['subscriber-sync'],
      }),
    });

    expect(createResponse.status).toBe(201);
    const payload = (await createResponse.json()) as {
      data: { id: string; rawKey: string; keyPrefix: string; scopes: string[] };
    };

    expect(payload.data.rawKey).toContain(payload.data.keyPrefix);
    expect(payload.data.scopes).toEqual(['subscriber-sync']);

    const storedKey = await harness.appContext.repositories.apiKeys.findByKeyPrefix(payload.data.keyPrefix);
    expect(storedKey).not.toBeNull();
    expect(storedKey?.keyHash).not.toBe(payload.data.rawKey);
    expect(storedKey?.lastUsedAt).toBeNull();

    const allowedResponse = await harness.app.request('/api/subscriber-syncs', {
      method: 'POST',
      headers: {
        'x-api-key': payload.data.rawKey,
        'content-type': 'application/json',
        'user-agent': 'vitest-api-key-allowed',
      },
      body: JSON.stringify({ source: 'crm' }),
    });

    const allowedBody = await allowedResponse.json();
    expect(allowedResponse.status).toBe(202);
    expect(allowedBody).toMatchObject({ status: 'accepted', scope: 'subscriber-sync' });

    const updatedKey = await harness.appContext.repositories.apiKeys.findByKeyPrefix(payload.data.keyPrefix);
    expect(updatedKey?.lastUsedAt).instanceOf(Date);

    const usageLogs = await harness.appContext.repositories.auditLogs.listByEventType('api_key_used');
    expect(usageLogs).toHaveLength(1);
    expect(usageLogs[0]).toMatchObject({ actorIdentifier: payload.data.keyPrefix });
  });

  it('enforces api key scopes and rejects invalid keys', async () => {
    const adminCookie = await loginAsAdmin();
    const createResponse = await harness.app.request('/api/api-keys', {
      method: 'POST',
      headers: {
        cookie: adminCookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        label: 'Individual Send Integration',
        scopes: ['individual-send'],
      }),
    });

    const payload = (await createResponse.json()) as {
      data: { rawKey: string; keyPrefix: string };
    };

    const scopeDeniedResponse = await harness.app.request('/api/campaign-sends', {
      method: 'POST',
      headers: {
        'x-api-key': payload.data.rawKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ subject: 'Hello' }),
    });

    const scopeDeniedBody = await scopeDeniedResponse.json();
    expect(scopeDeniedResponse.status).toBe(403);
    expect(scopeDeniedBody).toMatchObject({ code: 'api_key_scope_denied' });

    const invalidResponse = await harness.app.request('/api/individual-sends', {
      method: 'POST',
      headers: {
        'x-api-key': 'invalid',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ to: 'alice@example.com' }),
    });

    expect(invalidResponse.status).toBe(401);
    await expect(invalidResponse.json()).resolves.toMatchObject({ code: 'api_key_invalid' });

    const denialLogs = await harness.appContext.repositories.auditLogs.listByEventType('api_key_scope_denied');
    expect(denialLogs).toHaveLength(1);
    const failureLogs = await harness.appContext.repositories.auditLogs.listByEventType('api_key_auth_failure');
    expect(failureLogs).toHaveLength(1);
  });
});
