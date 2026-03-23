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

    const unsubscribeResponse = await harness.app.request(
      `/api/subscribers/${createdPayload.data.id}`,
      {
        method: 'PATCH',
        headers: {
          cookie: adminCookie,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ unsubscribed: true }),
      },
    );
    expect(unsubscribeResponse.status).toBe(200);

    const unsubscribedEligibilityResponse = await harness.app.request(
      '/api/admin/subscriber-eligibility?email=suppression-test@example.com',
      {
        headers: {
          cookie: adminCookie,
        },
      },
    );
    expect(unsubscribedEligibilityResponse.status).toBe(200);
    await expect(unsubscribedEligibilityResponse.json()).resolves.toMatchObject(
      {
        data: {
          eligible: false,
          reason: 'unsubscribed',
        },
      },
    );

    const suppressionResponse = await harness.app.request(
      `/api/subscribers/${createdPayload.data.id}/suppressions`,
      {
        method: 'POST',
        headers: {
          cookie: adminCookie,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ reason: 'hard_bounce' }),
      },
    );
    expect(suppressionResponse.status).toBe(201);

    const suppressedEligibilityResponse = await harness.app.request(
      '/api/admin/subscriber-eligibility?email=suppression-test@example.com',
      {
        headers: {
          cookie: adminCookie,
        },
      },
    );
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
    const syncResponse = await harness.app.request(
      '/api/admin/subscriber-sync-runs',
      {
        method: 'POST',
        headers: {
          cookie: adminCookie,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sourceKey: 'crm',
          endpointUrl: syncServerUrl,
        }),
      },
    );

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

    const syncedSubscriber =
      await harness.appContext.repositories.subscribers.findByEmail(
        'alice@example.com',
      );
    expect(syncedSubscriber).toMatchObject({
      email: 'alice@example.com',
      sourceKey: 'crm',
      externalId: 'ext-alice',
    });
    expect(syncedSubscriber?.lastSyncedAt).instanceOf(Date);
  });

  it('supports group CRUD, membership replacement, enriched payloads, and safe hard deletion', async () => {
    const adminCookie = await loginAsAdmin();

    const createGroupAResponse = await harness.app.request(
      '/api/subscriber-groups',
      {
        method: 'POST',
        headers: {
          cookie: adminCookie,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ name: 'Lifecycle Group A' }),
      },
    );
    expect(createGroupAResponse.status).toBe(201);
    const createGroupAPayload = (await createGroupAResponse.json()) as {
      data: { id: string; name: string };
    };

    const createGroupBResponse = await harness.app.request(
      '/api/subscriber-groups',
      {
        method: 'POST',
        headers: {
          cookie: adminCookie,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ name: 'Lifecycle Group B' }),
      },
    );
    expect(createGroupBResponse.status).toBe(201);
    const createGroupBPayload = (await createGroupBResponse.json()) as {
      data: { id: string; name: string };
    };

    const updateGroupResponse = await harness.app.request(
      `/api/subscriber-groups/${createGroupBPayload.data.id}`,
      {
        method: 'PATCH',
        headers: {
          cookie: adminCookie,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ name: 'Lifecycle Group B Updated' }),
      },
    );
    expect(updateGroupResponse.status).toBe(200);

    const listGroupsResponse = await harness.app.request(
      '/api/subscriber-groups',
      {
        headers: {
          cookie: adminCookie,
        },
      },
    );
    expect(listGroupsResponse.status).toBe(200);
    await expect(listGroupsResponse.json()).resolves.toMatchObject({
      data: expect.arrayContaining([
        expect.objectContaining({
          id: createGroupAPayload.data.id,
          name: 'Lifecycle Group A',
        }),
        expect.objectContaining({
          id: createGroupBPayload.data.id,
          name: 'Lifecycle Group B Updated',
        }),
      ]),
    });

    const createSubscriberResponse = await harness.app.request(
      '/api/subscribers',
      {
        method: 'POST',
        headers: {
          cookie: adminCookie,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          email: 'group-delete-test@example.com',
          displayName: 'Group Delete Test',
        }),
      },
    );
    expect(createSubscriberResponse.status).toBe(201);
    const createdSubscriberPayload =
      (await createSubscriberResponse.json()) as {
        data: { id: string; email: string };
      };

    const assignBothGroupsResponse = await harness.app.request(
      `/api/subscribers/${createdSubscriberPayload.data.id}/groups`,
      {
        method: 'PUT',
        headers: {
          cookie: adminCookie,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          groupIds: [createGroupAPayload.data.id, createGroupBPayload.data.id],
        }),
      },
    );
    expect(assignBothGroupsResponse.status).toBe(200);

    const enrichedListResponse = await harness.app.request('/api/subscribers', {
      headers: {
        cookie: adminCookie,
      },
    });
    expect(enrichedListResponse.status).toBe(200);
    await expect(enrichedListResponse.json()).resolves.toMatchObject({
      data: expect.arrayContaining([
        expect.objectContaining({
          id: createdSubscriberPayload.data.id,
          email: 'group-delete-test@example.com',
          eligible: true,
          suppressionReasons: [],
          groups: expect.arrayContaining([
            expect.objectContaining({
              id: createGroupAPayload.data.id,
              name: 'Lifecycle Group A',
            }),
            expect.objectContaining({
              id: createGroupBPayload.data.id,
              name: 'Lifecycle Group B Updated',
            }),
          ]),
        }),
      ]),
    });

    const replaceMembershipResponse = await harness.app.request(
      `/api/subscribers/${createdSubscriberPayload.data.id}/groups`,
      {
        method: 'PUT',
        headers: {
          cookie: adminCookie,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          groupIds: [createGroupAPayload.data.id],
        }),
      },
    );
    expect(replaceMembershipResponse.status).toBe(200);

    const replacedMembershipPayload =
      (await replaceMembershipResponse.json()) as {
        data: Array<{ id: string; name: string }>;
      };
    expect(replacedMembershipPayload.data).toEqual([
      {
        id: createGroupAPayload.data.id,
        name: 'Lifecycle Group A',
      },
    ]);

    const suppressionResponse = await harness.app.request(
      `/api/subscribers/${createdSubscriberPayload.data.id}/suppressions`,
      {
        method: 'POST',
        headers: {
          cookie: adminCookie,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ reason: 'hard_bounce' }),
      },
    );
    expect(suppressionResponse.status).toBe(201);

    const syncRun = await harness.appContext.repositories.syncRuns.create({
      id: 'sync_for_safe_delete',
      sourceKey: 'crm',
      status: 'completed',
      idempotencyKey: 'safe-delete-idempotency-key',
      stats: { processed: 1, updated: 1 },
    });
    await harness.appContext.repositories.syncRunRecords.create({
      id: 'sync_record_for_safe_delete',
      syncRunId: syncRun.id,
      subscriberId: createdSubscriberPayload.data.id,
      status: 'updated',
      email: 'group-delete-test@example.com',
      normalizedEmail: 'group-delete-test@example.com',
      payload: { from: 'integration-test' },
    });

    const deleteSubscriberResponse = await harness.app.request(
      `/api/subscribers/${createdSubscriberPayload.data.id}`,
      {
        method: 'DELETE',
        headers: {
          cookie: adminCookie,
        },
      },
    );
    expect(deleteSubscriberResponse.status).toBe(204);

    await expect(
      harness.appContext.repositories.subscribers.findById(
        createdSubscriberPayload.data.id,
      ),
    ).resolves.toBeNull();
    await expect(
      harness.appContext.repositories.suppressions.listByEmail(
        'group-delete-test@example.com',
      ),
    ).resolves.toHaveLength(0);
    await expect(
      harness.appContext.repositories.subscriberGroupMemberships.listForSubscriberIds(
        [createdSubscriberPayload.data.id],
      ),
    ).resolves.toHaveLength(0);
    await expect(
      harness.appContext.repositories.syncRunRecords.listForRun(syncRun.id),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'sync_record_for_safe_delete',
          subscriberId: null,
        }),
      ]),
    );

    const deleteGroupBResponse = await harness.app.request(
      `/api/subscriber-groups/${createGroupBPayload.data.id}`,
      {
        method: 'DELETE',
        headers: {
          cookie: adminCookie,
        },
      },
    );
    expect(deleteGroupBResponse.status).toBe(204);
  });
});
