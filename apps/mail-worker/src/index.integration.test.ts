import { afterEach, describe, expect, it } from 'vitest';

import {
  startMailWorkerHealthServer,
  stopMailWorkerHealthServer,
} from './index';

const activeServers: Array<
  Awaited<ReturnType<typeof startMailWorkerHealthServer>>
> = [];

afterEach(async () => {
  while (activeServers.length > 0) {
    const server = activeServers.pop();

    if (server) {
      await stopMailWorkerHealthServer(server);
    }
  }
});

describe('mail worker integration scaffold', () => {
  it('serves /health over HTTP', async () => {
    const server = await startMailWorkerHealthServer(0);
    activeServers.push(server);

    const address = server.address();

    expect(address).not.toBeNull();
    expect(typeof address).toBe('object');

    const port = typeof address === 'object' && address ? address.port : 0;
    const response = await fetch(`http://127.0.0.1:${port}/health`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      service: 'mail-worker',
      status: 'healthy',
      port: 3001,
      queueAdapter: 'bullmq-ready',
    });
  });

  it('returns not_found for unknown routes', async () => {
    const server = await startMailWorkerHealthServer(0);
    activeServers.push(server);

    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const response = await fetch(`http://127.0.0.1:${port}/missing`);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'not_found' });
  });

  it('shuts the health endpoint down cleanly', async () => {
    const server = await startMailWorkerHealthServer(0);

    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    await stopMailWorkerHealthServer(server);

    await expect(fetch(`http://127.0.0.1:${port}/health`)).rejects.toThrow();
  });
});
