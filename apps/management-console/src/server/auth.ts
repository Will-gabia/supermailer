import { createUlid } from '@supermailer/contracts';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Context, MiddlewareHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import type { ManagementConsoleAppContext } from './app-context';
import type { AppVariables, AuthenticatedAdmin, AuthenticatedApiKey } from './app-types';
import { getSessionExpiry } from './bootstrap';
import { getRequestMetadata } from './request-metadata';
import { createApiKeyValue, createSessionToken, hashSecretValue, parseApiKeyPrefix, verifyPassword } from './security';

const jsonError = (context: Context, status: ContentfulStatusCode, code: string, message: string) => {
  context.status(status);
  return context.json({ code, message });
};

const hasScope = (scopes: string[] | null, requiredScope: string): boolean => (scopes ?? []).includes(requiredScope);

const getSessionHash = (appContext: ManagementConsoleAppContext, token: string): string =>
  hashSecretValue(appContext.env.authTokenSecret, token, 'admin-session');

const getApiKeyHash = (appContext: ManagementConsoleAppContext, rawKey: string): string =>
  hashSecretValue(appContext.env.authTokenSecret, rawKey, 'external-api-key');

export const clearSessionCookie = (context: Context, appContext: ManagementConsoleAppContext): void => {
  deleteCookie(context, appContext.env.sessionCookieName, {
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'Lax',
  });
};

export const createAdminSession = async (
  appContext: ManagementConsoleAppContext,
  adminUserId: string,
): Promise<{ sessionToken: string; expiresAt: Date }> => {
  const sessionToken = createSessionToken();
  const expiresAt = getSessionExpiry(appContext.env);

  await appContext.repositories.adminSessions.create({
    id: createUlid(),
    adminUserId,
    sessionHash: getSessionHash(appContext, sessionToken),
    expiresAt,
  });

  return { sessionToken, expiresAt };
};

export const setSessionCookie = (
  context: Context,
  appContext: ManagementConsoleAppContext,
  sessionToken: string,
  expiresAt: Date,
): void => {
  setCookie(context, appContext.env.sessionCookieName, sessionToken, {
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'Lax',
    expires: expiresAt,
    maxAge: appContext.env.sessionTtlHours * 60 * 60,
  });
};

export const authenticateAdminCredentials = async (
  appContext: ManagementConsoleAppContext,
  input: { email: string; password: string },
): Promise<{ adminUserId: string; adminEmail: string } | null> => {
  const adminUser = await appContext.repositories.adminUsers.findByEmail(input.email);

  if (!adminUser) {
    return null;
  }

  const isValid = await verifyPassword(input.password, adminUser.passwordHash);

  if (!isValid) {
    return null;
  }

  return {
    adminUserId: adminUser.id,
    adminEmail: adminUser.email,
  };
};

export const requireAdminSession = (appContext: ManagementConsoleAppContext): MiddlewareHandler<{ Variables: AppVariables }> => async (
  context,
  next,
) => {
  const sessionToken = getCookie(context, appContext.env.sessionCookieName);

  if (!sessionToken) {
    clearSessionCookie(context, appContext);
    return jsonError(context, 401, 'auth_required', 'Admin session required');
  }

  const session = await appContext.repositories.adminSessions.findActiveByHash(getSessionHash(appContext, sessionToken));

  if (!session) {
    clearSessionCookie(context, appContext);
    return jsonError(context, 401, 'auth_required', 'Admin session required');
  }

  await appContext.repositories.adminSessions.touchLastSeen(session.session.id);

  const authenticatedAdmin: AuthenticatedAdmin = {
    id: session.adminUser.id,
    email: session.adminUser.email,
    sessionId: session.session.id,
  };

  context.set('adminUser', authenticatedAdmin);
  await next();
};

export const requireApiKey = (
  appContext: ManagementConsoleAppContext,
  requiredScope: string,
): MiddlewareHandler<{ Variables: AppVariables }> => async (context, next) => {
  const rawKey = context.req.header('x-api-key');
  const { ipAddress, userAgent } = getRequestMetadata(context);

  if (!rawKey) {
    await appContext.repositories.auditLogs.append({
      id: createUlid(),
      eventType: 'api_key_auth_failure',
      actorType: 'api_key',
      actorIdentifier: 'missing',
      ipAddress,
      userAgent,
      metadata: {
        path: context.req.path,
        requiredScope,
        reason: 'missing',
      },
    });

    return jsonError(context, 401, 'api_key_invalid', 'Valid API key required');
  }

  const keyPrefix = parseApiKeyPrefix(rawKey);

  if (!keyPrefix) {
    await appContext.repositories.auditLogs.append({
      id: createUlid(),
      eventType: 'api_key_auth_failure',
      actorType: 'api_key',
      actorIdentifier: 'malformed',
      ipAddress,
      userAgent,
      metadata: {
        path: context.req.path,
        requiredScope,
        reason: 'malformed',
      },
    });

    return jsonError(context, 401, 'api_key_invalid', 'Valid API key required');
  }

  const apiKey = await appContext.repositories.apiKeys.findByKeyPrefix(keyPrefix);
  const keyHash = getApiKeyHash(appContext, rawKey);

  if (!apiKey || apiKey.keyHash !== keyHash || apiKey.revokedAt) {
    await appContext.repositories.auditLogs.append({
      id: createUlid(),
      eventType: 'api_key_auth_failure',
      actorType: 'api_key',
      actorId: apiKey?.id ?? null,
      actorIdentifier: keyPrefix,
      ipAddress,
      userAgent,
      metadata: {
        path: context.req.path,
        requiredScope,
        reason: 'invalid',
      },
    });

    return jsonError(context, 401, 'api_key_invalid', 'Valid API key required');
  }

  if (!hasScope(apiKey.scopes, requiredScope)) {
    await appContext.repositories.auditLogs.append({
      id: createUlid(),
      eventType: 'api_key_scope_denied',
      actorType: 'api_key',
      actorId: apiKey.id,
      actorIdentifier: apiKey.keyPrefix,
      ipAddress,
      userAgent,
      metadata: {
        path: context.req.path,
        requiredScope,
        grantedScopes: apiKey.scopes ?? [],
      },
    });

    return jsonError(context, 403, 'api_key_scope_denied', `API key lacks ${requiredScope} scope`);
  }

  await appContext.repositories.apiKeys.markUsed(apiKey.id);
  await appContext.repositories.auditLogs.append({
    id: createUlid(),
    eventType: 'api_key_used',
    actorType: 'api_key',
    actorId: apiKey.id,
    actorIdentifier: apiKey.keyPrefix,
    ipAddress,
    userAgent,
    metadata: {
      path: context.req.path,
      method: context.req.method,
      requiredScope,
    },
  });

  const authenticatedApiKey: AuthenticatedApiKey = {
    id: apiKey.id,
    keyPrefix: apiKey.keyPrefix,
    scopes: apiKey.scopes ?? [],
  };

  context.set('apiKey', authenticatedApiKey);
  await next();
};

export const resolveAuthenticatedAdmin = async (
  context: Context,
  appContext: ManagementConsoleAppContext,
): Promise<AuthenticatedAdmin | null> => {
  const sessionToken = getCookie(context, appContext.env.sessionCookieName);

  if (!sessionToken) {
    return null;
  }

  const session = await appContext.repositories.adminSessions.findActiveByHash(getSessionHash(appContext, sessionToken));

  if (!session) {
    return null;
  }

  return {
    id: session.adminUser.id,
    email: session.adminUser.email,
    sessionId: session.session.id,
  };
};

export const createApiKeyRecord = async (
  appContext: ManagementConsoleAppContext,
  input: { label: string; scopes: string[] },
): Promise<{ id: string; label: string; scopes: string[]; keyPrefix: string; rawKey: string }> => {
  const { rawKey, keyPrefix } = createApiKeyValue();
  const id = createUlid();

  await appContext.repositories.apiKeys.create({
    id,
    label: input.label,
    keyPrefix,
    keyHash: getApiKeyHash(appContext, rawKey),
    scopes: input.scopes,
  });

  return {
    id,
    label: input.label,
    scopes: input.scopes,
    keyPrefix,
    rawKey,
  };
};

export const auditLoginFailure = async (appContext: ManagementConsoleAppContext, context: Context, email: string): Promise<void> => {
  const { ipAddress, userAgent } = getRequestMetadata(context);

  await appContext.repositories.auditLogs.append({
    id: createUlid(),
    eventType: 'admin_login_failure',
    actorType: 'admin_user',
    actorIdentifier: email.trim().toLowerCase(),
    ipAddress,
    userAgent,
    metadata: {
      path: context.req.path,
    },
  });
};

export const auditLoginSuccess = async (
  appContext: ManagementConsoleAppContext,
  context: Context,
  input: { adminUserId: string; adminEmail: string },
): Promise<void> => {
  const { ipAddress, userAgent } = getRequestMetadata(context);

  await appContext.repositories.auditLogs.append({
    id: createUlid(),
    eventType: 'admin_login_success',
    actorType: 'admin_user',
    actorId: input.adminUserId,
    actorIdentifier: input.adminEmail,
    ipAddress,
    userAgent,
    metadata: {
      path: context.req.path,
    },
  });
};
