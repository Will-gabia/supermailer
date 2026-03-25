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
        label: 'Individual Send Integration',
        scopes: ['individual-send'],
      }),
    });

    expect(createResponse.status).toBe(201);
    const payload = (await createResponse.json()) as {
      data: { id: string; rawKey: string; keyPrefix: string; scopes: string[] };
    };

    expect(payload.data.rawKey).toContain(payload.data.keyPrefix);
    expect(payload.data.scopes).toEqual(['individual-send']);

    const storedKey =
      await harness.appContext.repositories.apiKeys.findByKeyPrefix(
        payload.data.keyPrefix,
      );
    expect(storedKey).not.toBeNull();
    expect(storedKey?.keyHash).not.toBe(payload.data.rawKey);
    expect(storedKey?.lastUsedAt).toBeNull();

    const allowedResponse = await harness.app.request('/api/individual-sends', {
      method: 'POST',
      headers: {
        'x-api-key': payload.data.rawKey,
        'content-type': 'application/json',
        'user-agent': 'vitest-api-key-allowed',
      },
      body: JSON.stringify({
        to: 'alice@example.com',
        subject: 'Hello',
        html: '<p>Hello</p>',
      }),
    });

    const allowedBody = await allowedResponse.json();
    expect(allowedResponse.status).toBe(202);
    expect(allowedBody).toMatchObject({
      status: 'queued',
      scope: 'individual-send',
    });

    const updatedKey =
      await harness.appContext.repositories.apiKeys.findByKeyPrefix(
        payload.data.keyPrefix,
      );
    expect(updatedKey?.lastUsedAt).instanceOf(Date);

    const usageLogs =
      await harness.appContext.repositories.auditLogs.listByEventType(
        'api_key_used',
      );
    expect(usageLogs).toHaveLength(1);
    expect(usageLogs[0]).toMatchObject({
      actorIdentifier: payload.data.keyPrefix,
    });
  });

  it('rejects invalid keys and records auth failure', async () => {
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

    expect(payload.data.rawKey).toContain(payload.data.keyPrefix);

    const invalidResponse = await harness.app.request('/api/individual-sends', {
      method: 'POST',
      headers: {
        'x-api-key': 'invalid',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ to: 'alice@example.com' }),
    });

    expect(invalidResponse.status).toBe(401);
    await expect(invalidResponse.json()).resolves.toMatchObject({
      code: 'api_key_invalid',
    });

    const failureLogs =
      await harness.appContext.repositories.auditLogs.listByEventType(
        'api_key_auth_failure',
      );
    expect(failureLogs).toHaveLength(1);
  });

  it('lists api keys and revokes them for future authentication', async () => {
    const adminCookie = await loginAsAdmin();
    const createResponse = await harness.app.request('/api/api-keys', {
      method: 'POST',
      headers: {
        cookie: adminCookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        label: 'Revocable Integration Key',
        scopes: ['individual-send'],
      }),
    });

    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as {
      data: { id: string; rawKey: string; keyPrefix: string };
    };

    const listResponse = await harness.app.request('/api/api-keys', {
      headers: {
        cookie: adminCookie,
      },
    });

    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toMatchObject({
      data: expect.arrayContaining([
        expect.objectContaining({
          id: created.data.id,
          keyPrefix: created.data.keyPrefix,
          revokedAt: null,
        }),
      ]),
    });

    const revokeResponse = await harness.app.request(
      `/api/api-keys/${created.data.id}/revoke`,
      {
        method: 'POST',
        headers: {
          cookie: adminCookie,
        },
      },
    );

    expect(revokeResponse.status).toBe(200);
    await expect(revokeResponse.json()).resolves.toMatchObject({
      data: expect.objectContaining({
        id: created.data.id,
        revokedAt: expect.any(String),
      }),
    });

    const deniedResponse = await harness.app.request('/api/sends', {
      method: 'POST',
      headers: {
        'x-api-key': created.data.rawKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        eml: [
          'From: sender@example.com',
          'To: revoked@example.com',
          'Subject: Revoked',
          'MIME-Version: 1.0',
          'Content-Type: text/plain; charset=utf-8',
          '',
          'Revoked key should fail',
        ].join('\r\n'),
      }),
    });

    expect(deniedResponse.status).toBe(401);
    await expect(deniedResponse.json()).resolves.toMatchObject({
      code: 'api_key_invalid',
    });
  });

  it('deletes api keys and removes them from subsequent admin lists and auth', async () => {
    const adminCookie = await loginAsAdmin();
    const createResponse = await harness.app.request('/api/api-keys', {
      method: 'POST',
      headers: {
        cookie: adminCookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        label: 'Deletable Integration Key',
        scopes: ['individual-send'],
      }),
    });

    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as {
      data: { id: string; rawKey: string; keyPrefix: string };
    };

    const deleteResponse = await harness.app.request(
      `/api/api-keys/${created.data.id}`,
      {
        method: 'DELETE',
        headers: {
          cookie: adminCookie,
        },
      },
    );

    expect(deleteResponse.status).toBe(204);
    await expect(
      harness.appContext.repositories.apiKeys.findByKeyPrefix(
        created.data.keyPrefix,
      ),
    ).resolves.toBeNull();

    const listResponse = await harness.app.request('/api/api-keys', {
      headers: {
        cookie: adminCookie,
      },
    });
    await expect(listResponse.json()).resolves.toMatchObject({
      data: expect.not.arrayContaining([
        expect.objectContaining({ id: created.data.id }),
      ]),
    });

    const deniedResponse = await harness.app.request('/api/sends', {
      method: 'POST',
      headers: {
        'x-api-key': created.data.rawKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        eml: [
          'From: sender@example.com',
          'To: deleted@example.com',
          'Subject: Deleted',
          'MIME-Version: 1.0',
          'Content-Type: text/plain; charset=utf-8',
          '',
          'Deleted key should fail',
        ].join('\r\n'),
      }),
    });

    expect(deniedResponse.status).toBe(401);
    await expect(deniedResponse.json()).resolves.toMatchObject({
      code: 'api_key_invalid',
    });
  });
});
