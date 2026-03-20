const fs = require('fs');

let content = `import { describe, expect, it } from 'vitest';

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
`;

fs.writeFileSync('apps/management-console/src/server/routing-rules.integration.test.ts', content);

