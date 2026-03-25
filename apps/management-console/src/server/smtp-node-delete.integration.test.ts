import { describe, expect, it } from 'vitest';

import type { ManagementConsoleTestHarness } from './test-helpers';
import { registerIntegrationTestHarness } from './test-helpers';

describe('smtp-node-delete integration', () => {
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

  const createNode = async (input: { id: string; name: string }) =>
    harness.appContext.repositories.sendSmtpNodes.create({
      id: input.id,
      name: input.name,
      host: `${input.name}.relay.internal`,
      port: 2525,
      priority: 10,
    });

  it('blocks delete when the node is referenced by the latest routing rules', async () => {
    const adminCookie = await loginAsAdmin();
    const node = await createNode({
      id: 'smtp_delete_rule_ref',
      name: 'smtp-delete-rule-ref',
    });

    await harness.appContext.repositories.routingRules.createRuleset([
      {
        id: 'rule_delete_ref_default',
        matchType: 'default',
        sendSmtpNodeId: node.id,
      },
    ]);

    const response = await harness.app.request(
      `/api/send-smtp-nodes/${node.id}`,
      {
        method: 'DELETE',
        headers: {
          cookie: adminCookie,
        },
      },
    );

    expect(response.status).toBe(409);
  });

  it('allows delete when the node is referenced only by historical sends or attempts', async () => {
    const adminCookie = await loginAsAdmin();
    const node = await createNode({
      id: 'smtp_delete_history_ref',
      name: 'smtp-delete-history-ref',
    });

    const send = await harness.appContext.repositories.sends.create({
      id: 'send_delete_history_ref',
      kind: 'individual',
      recipientEmail: 'history-ref@example.com',
      subjectSnapshot: 'History Ref',
      htmlSnapshot: '<p>History Ref</p>',
      status: 'accepted_by_mta',
      templateId: null,
      sendSmtpNodeId: node.id,
    });

    await harness.appContext.repositories.sendDispatchAttempts.createStarted({
      id: 'attempt_delete_history_ref',
      sendId: send.id,
      attemptNumber: 1,
      sendSmtpNodeId: node.id,
      relayIdentity: `${node.host}:${node.port}`,
    });

    const response = await harness.app.request(
      `/api/send-smtp-nodes/${node.id}`,
      {
        method: 'DELETE',
        headers: {
          cookie: adminCookie,
        },
      },
    );

    expect(response.status).toBe(204);

    await expect(
      harness.appContext.repositories.sendSmtpNodes.findById(node.id),
    ).resolves.toMatchObject({
      id: node.id,
      isActive: false,
      deletedAt: expect.any(Date),
    });
  });

  it('allows delete for an unreferenced node', async () => {
    const adminCookie = await loginAsAdmin();
    const node = await createNode({
      id: 'smtp_delete_free',
      name: 'smtp-delete-free',
    });

    const response = await harness.app.request(
      `/api/send-smtp-nodes/${node.id}`,
      {
        method: 'DELETE',
        headers: {
          cookie: adminCookie,
        },
      },
    );

    expect(response.status).toBe(204);
  });
});
