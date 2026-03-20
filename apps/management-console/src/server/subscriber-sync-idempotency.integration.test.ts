import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';

import type { ManagementConsoleTestHarness } from './test-helpers';
import { registerIntegrationTestHarness } from './test-helpers';

describe('subscriber-sync-idempotency integration', () => {
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
              externalId: 'crm-alice',
              email: 'Alice@Example.com',
              displayName: 'Alice First',
              unsubscribed: false,
              metadata: { tier: 'gold' },
            },
            {
              externalId: 'crm-bob',
              email: 'bob@gmail.com',
              displayName: 'Bob',
              unsubscribed: false,
              metadata: { tier: 'silver' },
            },
            {
              externalId: 'crm-invalid',
              email: 'not-an-email',
              displayName: 'Broken',
              unsubscribed: false,
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

  const createSubscriberSyncApiKey = async (): Promise<string> => {
    const loginResponse = await harness.app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: harness.env.adminEmail, password: harness.env.adminPassword }),
    });
    const adminCookie = loginResponse.headers.get('set-cookie') ?? '';

    const createApiKeyResponse = await harness.app.request('/api/api-keys', {
      method: 'POST',
      headers: {
        cookie: adminCookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        label: 'Subscriber Sync Idempotency',
        scopes: ['subscriber-sync'],
      }),
    });

    const payload = (await createApiKeyResponse.json()) as { data: { rawKey: string } };
    return payload.data.rawKey;
  };

  it('upserts normalized subscribers idempotently across duplicate sync payloads and captures per-record failures', async () => {
    const apiKey = await createSubscriberSyncApiKey();

    for (let index = 0; index < 2; index += 1) {
      const response = await harness.app.request('/api/subscriber-syncs', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sourceKey: 'crm',
          endpointUrl: syncServerUrl,
        }),
      });

      expect(response.status).toBe(201);
    }

    const allSubscribers = await harness.appContext.repositories.subscribers.list();
    const interestingSubscribers = allSubscribers.filter((subscriber) => ['alice@example.com', 'bob@gmail.com'].includes(subscriber.email));
    expect(interestingSubscribers).toHaveLength(2);
    expect(interestingSubscribers.find((subscriber) => subscriber.email === 'alice@example.com')).toMatchObject({
      displayName: 'Alice First',
      sourceKey: 'crm',
      externalId: 'crm-alice',
    });

    const syncRuns = await harness.appContext.repositories.syncRuns.list();
    const crmRuns = syncRuns.filter((run) => run.sourceKey === 'crm');
    expect(crmRuns).toHaveLength(2);
    expect(crmRuns[0]?.stats).toMatchObject({ processed: 3, updated: 2, failed: 1 });
    expect(crmRuns[1]?.stats).toMatchObject({ processed: 3, created: 2, failed: 1 });

    const firstRunRecords = await harness.appContext.repositories.syncRunRecords.listForRun(crmRuns[0]!.id);
    const secondRunRecords = await harness.appContext.repositories.syncRunRecords.listForRun(crmRuns[1]!.id);
    expect(firstRunRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ normalizedEmail: 'alice@example.com', status: 'updated' }),
        expect.objectContaining({ normalizedEmail: 'bob@gmail.com', status: 'updated' }),
        expect.objectContaining({ status: 'failed', errorMessage: 'Email address must be valid' }),
      ]),
    );
    expect(secondRunRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ normalizedEmail: 'alice@example.com', status: 'created' }),
        expect.objectContaining({ normalizedEmail: 'bob@gmail.com', status: 'created' }),
        expect.objectContaining({ status: 'failed', errorMessage: 'Email address must be valid' }),
      ]),
    );
  });
});
