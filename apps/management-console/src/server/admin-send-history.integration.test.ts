import { describe, expect, it } from 'vitest';

import type { ManagementConsoleTestHarness } from './test-helpers';
import { registerIntegrationTestHarness } from './test-helpers';

const waitForTick = async () => {
  await new Promise((resolve) => setTimeout(resolve, 10));
};

describe('admin-send-history integration', () => {
  let harness = {} as ManagementConsoleTestHarness;

  registerIntegrationTestHarness({
    setHarness: (value) => {
      harness = value;
    },
    getHarness: () => harness,
  });

  const loginAsAdmin = async (): Promise<string> => {
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

    expect(loginResponse.status).toBe(200);
    return loginResponse.headers.get('set-cookie') ?? '';
  };

  const createSeedSend = async (input: {
    id: string;
    recipientEmail: string;
  }) =>
    harness.appContext.repositories.sends.create({
      id: input.id,
      kind: 'individual',
      recipientEmail: input.recipientEmail,
      subjectSnapshot: `Subject ${input.id}`,
      htmlSnapshot: `<p>${input.id}</p>`,
      status: 'queued',
      templateId: null,
    });

  it('returns paginated searched sends with continuation metadata and compatible detail lookup', async () => {
    const adminCookie = await loginAsAdmin();

    await createSeedSend({
      id: 'send_hist_001',
      recipientEmail: 'alice@example.com',
    });
    await waitForTick();
    await createSeedSend({
      id: 'send_hist_002',
      recipientEmail: 'bob@example.com',
    });
    await waitForTick();
    await createSeedSend({
      id: 'send_hist_003',
      recipientEmail: 'alice+latest@example.com',
    });

    const firstPageResponse = await harness.app.request(
      '/api/sends?search=alice&limit=1',
      {
        headers: {
          cookie: adminCookie,
        },
      },
    );

    expect(firstPageResponse.status).toBe(200);
    const firstPage = (await firstPageResponse.json()) as {
      data: Array<{ id: string; recipientEmail: string }>;
      pageInfo: {
        limit: number;
        hasMore: boolean;
        nextCursor: string | null;
      };
    };

    expect(firstPage.data).toHaveLength(1);
    expect(firstPage.data[0]).toMatchObject({
      id: 'send_hist_003',
      recipientEmail: 'alice+latest@example.com',
    });
    expect(firstPage.pageInfo).toMatchObject({
      limit: 1,
      hasMore: true,
    });
    expect(firstPage.pageInfo.nextCursor).toBeTruthy();

    const secondPageResponse = await harness.app.request(
      `/api/sends?search=alice&limit=1&cursor=${encodeURIComponent(firstPage.pageInfo.nextCursor ?? '')}`,
      {
        headers: {
          cookie: adminCookie,
        },
      },
    );

    expect(secondPageResponse.status).toBe(200);
    const secondPage = (await secondPageResponse.json()) as {
      data: Array<{ id: string; recipientEmail: string }>;
      pageInfo: {
        limit: number;
        hasMore: boolean;
        nextCursor: string | null;
      };
    };

    expect(secondPage.data).toEqual([
      expect.objectContaining({
        id: 'send_hist_001',
        recipientEmail: 'alice@example.com',
      }),
    ]);
    expect(secondPage.pageInfo).toMatchObject({
      limit: 1,
      hasMore: false,
      nextCursor: null,
    });

    const detailResponse = await harness.app.request(
      `/api/admin/sends/${secondPage.data[0].id}/delivery-events`,
      {
        headers: {
          cookie: adminCookie,
        },
      },
    );

    expect(detailResponse.status).toBe(200);
    await expect(detailResponse.json()).resolves.toMatchObject({
      data: expect.any(Array),
      webhookDelivery: null,
    });
  });
});
