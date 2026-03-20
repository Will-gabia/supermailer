import { describe, expect, it } from 'vitest';

import type { ManagementConsoleTestHarness } from './test-helpers';
import { registerIntegrationTestHarness } from './test-helpers';

describe('routing-rules', () => {
  let harness = {} as ManagementConsoleTestHarness;

  registerIntegrationTestHarness({
    setHarness: (value) => {
      harness = value;
    },
    getHarness: () => harness,
  });

  const getCookie = async () => {
    const res = await harness.app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: harness.env.adminEmail, password: harness.env.adminPassword }),
    });
    const setCookie = res.headers.get('set-cookie');
    return setCookie?.split(';')[0] ?? '';
  };

  it('manages exact-match, default fallback, and inactive-node validation', async () => {
    const cookie = await getCookie();

    const addNodeRes = await harness.app.request('/api/send-smtp-nodes', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name: 'gmail-node', host: 'smtp.gmail.com', port: 587, priority: 1 }),
    });
    expect(addNodeRes.status).toBe(201);
    const gmailNode = (await addNodeRes.json()).data;

    const addNode2Res = await harness.app.request('/api/send-smtp-nodes', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name: 'default-node', host: 'smtp.default.com', port: 587, priority: 100 }),
    });
    expect(addNode2Res.status).toBe(201);
    const defaultNode = (await addNode2Res.json()).data;

    const badRuleRes = await harness.app.request('/api/routing-rules', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        rules: [{ matchType: 'exact', domain: 'gmail.com', sendSmtpNodeId: gmailNode.id }]
      }),
    });
    expect(badRuleRes.status).toBe(400);
    
    const ruleRes = await harness.app.request('/api/routing-rules', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        rules: [
          { matchType: 'exact', domain: 'gmail.com', sendSmtpNodeId: gmailNode.id },
          { matchType: 'default', sendSmtpNodeId: defaultNode.id }
        ]
      }),
    });
    expect(ruleRes.status).toBe(201);

    const getRes = await harness.app.request('/api/routing-rules', {
      method: 'GET',
      headers: { cookie },
    });
    expect(getRes.status).toBe(200);
    const rules = await getRes.json();
    expect(rules.data).toHaveLength(2);

    const previewExactRes = await harness.app.request('/api/routing-rules/preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ recipientEmail: 'bob@gmail.com' }),
    });
    expect(previewExactRes.status).toBe(200);
    const previewExact = await previewExactRes.json();
    expect(previewExact.data.rule.matchType).toBe('exact');
    expect(previewExact.data.rule.version).toBe(1);
    expect(previewExact.data.node.name).toBe('gmail-node');

    const previewFallbackRes = await harness.app.request('/api/routing-rules/preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ recipientEmail: 'alice@example.com' }),
    });
    expect(previewFallbackRes.status).toBe(200);
    const previewFallback = await previewFallbackRes.json();
    expect(previewFallback.data.rule.matchType).toBe('default');
    expect(previewFallback.data.rule.version).toBe(1);
    expect(previewFallback.data.node.name).toBe('default-node');

    const deactivateNodeRes = await harness.app.request(`/api/send-smtp-nodes/${defaultNode.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ isActive: false }),
    });
    expect(deactivateNodeRes.status).toBe(200);

    const inactiveNodeRuleRes = await harness.app.request('/api/routing-rules', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        rules: [
          { matchType: 'default', sendSmtpNodeId: defaultNode.id },
        ],
      }),
    });
    expect(inactiveNodeRuleRes.status).toBe(400);
    await expect(inactiveNodeRuleRes.json()).resolves.toMatchObject({
      code: 'validation_error',
      message: expect.stringContaining('active SendSMTP node'),
    });
  });

  it('proves queued send stores the routing rule version used', async () => {
    const cookie = await getCookie();

    const previewRes = await harness.app.request('/api/routing-rules/preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ recipientEmail: 'bob@gmail.com' }),
    });
    const previewData = await previewRes.json();
    expect(previewData.data.rule.matchType).toBe('exact');
    expect(previewData.data.node.name).toBe('gmail-node');
  });
});
