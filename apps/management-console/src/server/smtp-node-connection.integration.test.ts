import { createServer, type Server } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import type { ManagementConsoleTestHarness } from './test-helpers';
import { registerIntegrationTestHarness } from './test-helpers';

describe('smtp-node-connection integration', () => {
  let harness = {} as ManagementConsoleTestHarness;
  const servers = new Set<Server>();

  registerIntegrationTestHarness({
    setHarness: (value) => {
      harness = value;
    },
    getHarness: () => harness,
  });

  afterEach(async () => {
    await Promise.all(
      [...servers].map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => resolve());
          }),
      ),
    );
    servers.clear();
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

  const startSmtpProbeServer = async (): Promise<{
    host: string;
    port: number;
  }> => {
    const server = createServer((socket) => {
      socket.write('220 smtp-probe.local ESMTP\r\n');
      socket.on('data', (chunk) => {
        const command = chunk.toString('utf8');

        if (command.includes('EHLO')) {
          socket.write('250 smtp-probe.local\r\n');
          socket.end();
        }
      });
    });

    servers.add(server);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });

    const address = server.address();

    if (!address || typeof address === 'string') {
      throw new Error('Expected TCP server address');
    }

    return {
      host: '127.0.0.1',
      port: address.port,
    };
  };

  const createNode = async (input: {
    id: string;
    name: string;
    host: string;
    port: number;
  }) =>
    harness.appContext.repositories.sendSmtpNodes.create({
      id: input.id,
      name: input.name,
      host: input.host,
      port: input.port,
      priority: 10,
    });

  it('returns a structured success result for a reachable SMTP node', async () => {
    const adminCookie = await loginAsAdmin();
    const probeTarget = await startSmtpProbeServer();

    const node = await createNode({
      id: 'smtp_probe_ok',
      name: 'smtp-probe-ok',
      host: probeTarget.host,
      port: probeTarget.port,
    });

    const response = await harness.app.request(
      `/api/send-smtp-nodes/${node.id}/test`,
      {
        method: 'POST',
        headers: {
          cookie: adminCookie,
        },
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        ok: true,
        host: probeTarget.host,
        port: probeTarget.port,
      },
    });
  });

  it('returns a structured failure result for an unreachable SMTP node', async () => {
    const adminCookie = await loginAsAdmin();
    const probeTarget = await startSmtpProbeServer();
    const unreachablePort = probeTarget.port;

    await Promise.all(
      [...servers].map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => resolve());
          }),
      ),
    );
    servers.clear();

    const node = await createNode({
      id: 'smtp_probe_fail',
      name: 'smtp-probe-fail',
      host: '127.0.0.1',
      port: unreachablePort,
    });

    const response = await harness.app.request(
      `/api/send-smtp-nodes/${node.id}/test`,
      {
        method: 'POST',
        headers: {
          cookie: adminCookie,
        },
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        ok: false,
        host: '127.0.0.1',
        port: unreachablePort,
        error: expect.any(String),
      },
    });
  });
});
