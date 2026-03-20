import { createUlid } from '@supermailer/contracts';
import { Hono } from 'hono';

import type { ManagementConsoleAppContext } from '../app-context';
import type { AppVariables } from '../app-types';
import {
  auditLoginFailure,
  auditLoginSuccess,
  authenticateAdminCredentials,
  clearSessionCookie,
  createAdminSession,
  resolveAuthenticatedAdmin,
  setSessionCookie,
} from '../auth';

export const createAuthRouter = (appContext: ManagementConsoleAppContext) => {
  const router = new Hono<{ Variables: AppVariables }>();

  router.post('/login', async (context) => {
    const body = (await context.req.json().catch(() => null)) as { email?: unknown; password?: unknown } | null;
    const email = typeof body?.email === 'string' ? body.email : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    const authenticated = await authenticateAdminCredentials(appContext, { email, password });

    if (!authenticated) {
      await auditLoginFailure(appContext, context, email);
      return context.json({ code: 'invalid_credentials', message: 'Invalid email or password' }, 401);
    }

    await appContext.repositories.adminUsers.touchLastLogin(authenticated.adminUserId);
    const { sessionToken, expiresAt } = await createAdminSession(appContext, authenticated.adminUserId);
    setSessionCookie(context, appContext, sessionToken, expiresAt);
    await auditLoginSuccess(appContext, context, authenticated);

    return context.json({
      authenticated: true,
      admin: {
        id: authenticated.adminUserId,
        email: authenticated.adminEmail,
      },
    });
  });

  router.get('/session', async (context) => {
    const adminUser = await resolveAuthenticatedAdmin(context, appContext);

    if (!adminUser) {
      clearSessionCookie(context, appContext);
      return context.json({ authenticated: false });
    }

    return context.json({ authenticated: true, admin: { id: adminUser.id, email: adminUser.email } });
  });

  router.post('/logout', async (context) => {
    const adminUser = await resolveAuthenticatedAdmin(context, appContext);

    if (adminUser) {
      await appContext.repositories.adminSessions.revoke(adminUser.sessionId);
      await appContext.repositories.auditLogs.append({
        id: createUlid(),
        eventType: 'admin_logout',
        actorType: 'admin_user',
        actorId: adminUser.id,
        actorIdentifier: adminUser.email,
      });
    }

    clearSessionCookie(context, appContext);
    return context.json({ authenticated: false });
  });

  return router;
};
