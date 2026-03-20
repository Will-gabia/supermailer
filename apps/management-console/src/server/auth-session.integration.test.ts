import { beforeAll, describe, expect, it } from 'vitest';

import type { ManagementConsoleTestHarness } from './test-helpers';
import { registerIntegrationTestHarness } from './test-helpers';

describe('auth-session integration', () => {
  let harness = {} as ManagementConsoleTestHarness;

  registerIntegrationTestHarness({
    setHarness: (value) => {
      harness = value;
    },
    getHarness: () => harness,
  });

  beforeAll(async () => {
    await harness.appContext.repositories.subscribers.create({
      id: 'subscribers_auth_01',
      email: 'alice@example.com',
      displayName: 'Alice',
    });
  });

  it('creates secure admin sessions for valid credentials', async () => {
    const loginResponse = await harness.app.request('/api/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'vitest-auth-session',
        'x-forwarded-for': '203.0.113.10',
      },
      body: JSON.stringify({
        email: harness.env.adminEmail,
        password: harness.env.adminPassword,
      }),
    });

    expect(loginResponse.status).toBe(200);
    const sessionCookie = loginResponse.headers.get('set-cookie');
    expect(sessionCookie).toContain(`${harness.env.sessionCookieName}=`);
    expect(sessionCookie).toContain('HttpOnly');
    expect(sessionCookie).toContain('Secure');
    expect(sessionCookie).toContain('SameSite=Lax');

    const protectedResponse = await harness.app.request('/api/subscribers', {
      headers: {
        cookie: sessionCookie ?? '',
      },
    });

    expect(protectedResponse.status).toBe(200);
    await expect(protectedResponse.json()).resolves.toMatchObject({
      data: [{ email: 'alice@example.com' }],
    });

    const successLogs = await harness.appContext.repositories.auditLogs.listByEventType('admin_login_success');
    expect(successLogs).toHaveLength(1);
    expect(successLogs[0]).toMatchObject({
      actorIdentifier: harness.env.adminEmail,
      actorType: 'admin_user',
    });
  });

  it('rejects invalid admin credentials and records audit failure', async () => {
    const loginResponse = await harness.app.request('/api/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'vitest-auth-session-invalid',
        'x-forwarded-for': '203.0.113.11',
      },
      body: JSON.stringify({
        email: harness.env.adminEmail,
        password: 'wrong-password',
      }),
    });

    expect(loginResponse.status).toBe(401);
    await expect(loginResponse.json()).resolves.toMatchObject({ code: 'invalid_credentials' });

    const protectedResponse = await harness.app.request('/api/subscribers');
    expect(protectedResponse.status).toBe(401);

    const sessionResponse = await harness.app.request('/api/auth/session');
    expect(sessionResponse.status).toBe(200);
    await expect(sessionResponse.json()).resolves.toMatchObject({ authenticated: false });

    const failureLogs = await harness.appContext.repositories.auditLogs.listByEventType('admin_login_failure');
    expect(failureLogs).toHaveLength(1);
    expect(failureLogs[0]).toMatchObject({ actorIdentifier: harness.env.adminEmail });
  });
});
