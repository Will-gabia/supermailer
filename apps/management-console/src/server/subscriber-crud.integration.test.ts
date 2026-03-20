import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';

import type { ManagementConsoleTestHarness } from './test-helpers';
import { registerIntegrationTestHarness } from './test-helpers';

describe('subscriber-crud integration', () => {
  let harness = {} as ManagementConsoleTestHarness;
  let syncServer: ReturnType<typeof createServer> | null = null;
  let syncServerUrl = '';

  registerIntegrationTestHarness({
    setHarness: (value) => {
      harness = value;
    },
    getHarness: () => harness,
  });

  beforeAll(async () => {
    syncServer = createServer((_request, response) => {
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify({
          subscribers: [
            {
              externalId: 'ext-alice',
              email: 'Alice@Example.com',
              displayName: 'Alice Synced',
              unsubscribed: false,
              metadata: { source: 'crm' },
            },
          ],
        }),
      );
    });

    await new Promise<void>((resolve) => {
      syncServer?.listen(0, '127.0.0.1', () => {
        const address = syncServer?.address();

        if (address && typeof address !== 'string') {
          syncServerUrl = `http://127.0.0.1:${address.port}/subscribers`;
        }

        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      syncServer?.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
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

  it('supports create, unsubscribe, hard-bounce suppression, and eligibility enforcement', async () => {
    const adminCookie = await loginAsAdmin();

    const createResponse = await harness.app.request('/api/subscribers', {
      method: 'POST',
      headers: {
        cookie: adminCookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email: 'suppression-test@example.com',
        displayName: 'Suppression Test',
      }),
    });

    expect(createResponse.status).toBe(201);
    const createdPayload = (await createResponse.json()) as {
      data: { id: string; email: string };
    };
    expect(createdPayload.data.email).toBe('suppression-test@example.com');

    const unsubscribeResponse = await harness.app.request(`/api/subscribers/${createdPayload.data.id}`, {
      method: 'PATCH',
      headers: {
        cookie: adminCookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ unsubscribed: true }),
    });
    expect(unsubscribeResponse.status).toBe(200);

    const unsubscribedEligibilityResponse = await harness.app.request('/api/admin/subscriber-eligibility?email=suppression-test@example.com', {
      headers: {
        cookie: adminCookie,
      },
    });
    expect(unsubscribedEligibilityResponse.status).toBe(200);
    await expect(unsubscribedEligibilityResponse.json()).resolves.toMatchObject({
      data: {
        eligible: false,
        reason: 'unsubscribed',
      },
    });

    const suppressionResponse = await harness.app.request(`/api/subscribers/${createdPayload.data.id}/suppressions`, {
      method: 'POST',
      headers: {
        cookie: adminCookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ reason: 'hard_bounce' }),
    });
    expect(suppressionResponse.status).toBe(201);

    const suppressedEligibilityResponse = await harness.app.request('/api/admin/subscriber-eligibility?email=suppression-test@example.com', {
      headers: {
        cookie: adminCookie,
      },
    });
    await expect(suppressedEligibilityResponse.json()).resolves.toMatchObject({
      data: {
        eligible: false,
        reason: 'hard_bounce_suppression',
      },
    });

    const listResponse = await harness.app.request('/api/subscribers', {
      headers: {
        cookie: adminCookie,
      },
    });
    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toMatchObject({
      data: expect.arrayContaining([
        expect.objectContaining({
          email: 'suppression-test@example.com',
          isUnsubscribed: true,
          eligible: false,
          suppressionReasons: ['hard_bounce'],
        }),
      ]),
    });
  });

  it('stores sync-created subscribers with normalized email and last sync visibility', async () => {
    const adminCookie = await loginAsAdmin();
    const syncResponse = await harness.app.request('/api/admin/subscriber-sync-runs', {
      method: 'POST',
      headers: {
        cookie: adminCookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sourceKey: 'crm',
        endpointUrl: syncServerUrl,
      }),
    });

    expect(syncResponse.status).toBe(201);
    const syncRunsResponse = await harness.app.request('/api/sync-runs', {
      headers: {
        cookie: adminCookie,
      },
    });

    expect(syncRunsResponse.status).toBe(200);
    await expect(syncRunsResponse.json()).resolves.toMatchObject({
      data: expect.arrayContaining([
        expect.objectContaining({
          sourceKey: 'crm',
          status: 'completed',
          stats: expect.objectContaining({
            processed: 1,
            created: 1,
          }),
          records: expect.arrayContaining([
            expect.objectContaining({
              normalizedEmail: 'alice@example.com',
              status: 'created',
            }),
          ]),
        }),
      ]),
    });

    const syncedSubscriber = await harness.appContext.repositories.subscribers.findByEmail('alice@example.com');
    expect(syncedSubscriber).toMatchObject({
      email: 'alice@example.com',
      sourceKey: 'crm',
      externalId: 'ext-alice',
    });
    expect(syncedSubscriber?.lastSyncedAt).instanceOf(Date);
  });
});
