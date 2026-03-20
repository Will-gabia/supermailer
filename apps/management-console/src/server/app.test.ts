import { describe, expect, it } from 'vitest';

import { createManagementConsoleApp } from './app';

describe('management console app', () => {
  it('serves the health endpoint', async () => {
    const response = await createManagementConsoleApp().request('/api/health');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      service: 'management-console',
      status: 'healthy',
    });
  });
});
