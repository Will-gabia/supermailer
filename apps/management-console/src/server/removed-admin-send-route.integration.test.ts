import { describe, expect, it } from 'vitest';

import type { ManagementConsoleTestHarness } from './test-helpers';
import { registerIntegrationTestHarness } from './test-helpers';

describe('removed-admin-send-route integration', () => {
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

  it('does not expose the legacy admin individual send route', async () => {
    const adminCookie = await loginAsAdmin();

    const response = await harness.app.request('/api/admin/individual-sends', {
      method: 'POST',
      headers: {
        cookie: adminCookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        to: 'legacy-route@example.com',
        subject: 'Legacy route should be removed',
        html: '<p>Legacy route should be removed</p>',
      }),
    });

    expect(response.status).toBe(404);
  });
});
