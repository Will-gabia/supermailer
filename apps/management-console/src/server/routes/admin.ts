import { createUlid } from '@supermailer/contracts';
import { Hono } from 'hono';

import type { ManagementConsoleAppContext } from '../app-context';
import type { AppVariables } from '../app-types';
import { createApiKeyRecord, requireAdminSession } from '../auth';
import { probeSmtpNode } from '../services/smtp-node-probe';

const ALLOWED_API_KEY_SCOPES = ['individual-send'] as const;

const isAllowedScope = (
  scope: string,
): scope is (typeof ALLOWED_API_KEY_SCOPES)[number] =>
  ALLOWED_API_KEY_SCOPES.includes(
    scope as (typeof ALLOWED_API_KEY_SCOPES)[number],
  );

const parseNumericField = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const isPgUniqueViolation = (
  error: unknown,
): error is Error & { code: string } =>
  error instanceof Error && 'code' in error && error.code === '23505';

export const createAdminRouter = (appContext: ManagementConsoleAppContext) => {
  const router = new Hono<{ Variables: AppVariables }>();

  router.get('/api-keys', requireAdminSession(appContext), async (context) => {
    const apiKeys = await appContext.repositories.apiKeys.list();

    return context.json({
      data: apiKeys.map((apiKey) => ({
        id: apiKey.id,
        label: apiKey.label,
        keyPrefix: apiKey.keyPrefix,
        scopes: apiKey.scopes ?? [],
        lastUsedAt: apiKey.lastUsedAt,
        revokedAt: apiKey.revokedAt,
        createdAt: apiKey.createdAt,
      })),
    });
  });

  router.post(
    '/api-keys/:apiKeyId/revoke',
    requireAdminSession(appContext),
    async (context) => {
      const apiKeyId = context.req.param('apiKeyId');
      const existing = await appContext.repositories.apiKeys.list();
      const target = existing.find((apiKey) => apiKey.id === apiKeyId) ?? null;

      if (!target) {
        return context.json(
          { code: 'not_found', message: 'API key not found' },
          404,
        );
      }

      if (target.revokedAt) {
        return context.json({
          data: {
            id: target.id,
            label: target.label,
            keyPrefix: target.keyPrefix,
            scopes: target.scopes ?? [],
            lastUsedAt: target.lastUsedAt,
            revokedAt: target.revokedAt,
            createdAt: target.createdAt,
          },
        });
      }

      const revoked = await appContext.repositories.apiKeys.revoke(apiKeyId);
      const adminUser = context.get('adminUser');

      await appContext.repositories.auditLogs.append({
        id: createUlid(),
        eventType: 'api_key_revoked',
        actorType: 'admin_user',
        actorId: adminUser.id,
        actorIdentifier: adminUser.email,
        metadata: {
          apiKeyId: target.id,
          keyPrefix: target.keyPrefix,
        },
      });

      return context.json({
        data: {
          id: revoked?.id ?? target.id,
          label: revoked?.label ?? target.label,
          keyPrefix: revoked?.keyPrefix ?? target.keyPrefix,
          scopes: revoked?.scopes ?? target.scopes ?? [],
          lastUsedAt: revoked?.lastUsedAt ?? target.lastUsedAt,
          revokedAt: revoked?.revokedAt ?? target.revokedAt,
          createdAt: revoked?.createdAt ?? target.createdAt,
        },
      });
    },
  );

  router.delete(
    '/api-keys/:apiKeyId',
    requireAdminSession(appContext),
    async (context) => {
      const apiKeyId = context.req.param('apiKeyId');
      const existing = await appContext.repositories.apiKeys.list();
      const target = existing.find((apiKey) => apiKey.id === apiKeyId) ?? null;

      if (!target) {
        return context.json(
          { code: 'not_found', message: 'API key not found' },
          404,
        );
      }

      await appContext.repositories.apiKeys.deleteById(apiKeyId);
      const adminUser = context.get('adminUser');

      await appContext.repositories.auditLogs.append({
        id: createUlid(),
        eventType: 'api_key_deleted',
        actorType: 'admin_user',
        actorId: adminUser.id,
        actorIdentifier: adminUser.email,
        metadata: {
          apiKeyId: target.id,
          keyPrefix: target.keyPrefix,
        },
      });

      return context.body(null, 204);
    },
  );

  router.post('/api-keys', requireAdminSession(appContext), async (context) => {
    const body = (await context.req.json().catch(() => null)) as {
      label?: unknown;
      scopes?: unknown;
    } | null;
    const label = typeof body?.label === 'string' ? body.label.trim() : '';
    const scopeValues = Array.isArray(body?.scopes)
      ? body?.scopes.filter(
          (value): value is string => typeof value === 'string',
        )
      : [];
    const scopes = Array.from(new Set(scopeValues.filter(isAllowedScope)));

    if (!label) {
      return context.json(
        { code: 'validation_error', message: 'Label is required' },
        400,
      );
    }

    if (scopes.length === 0) {
      return context.json(
        {
          code: 'validation_error',
          message: 'At least one supported scope is required',
        },
        400,
      );
    }

    const apiKey = await createApiKeyRecord(appContext, { label, scopes });
    const adminUser = context.get('adminUser');

    await appContext.repositories.auditLogs.append({
      id: createUlid(),
      eventType: 'api_key_created',
      actorType: 'admin_user',
      actorId: adminUser.id,
      actorIdentifier: adminUser.email,
      metadata: {
        apiKeyId: apiKey.id,
        keyPrefix: apiKey.keyPrefix,
        scopes,
      },
    });

    return context.json(
      {
        data: {
          id: apiKey.id,
          label: apiKey.label,
          keyPrefix: apiKey.keyPrefix,
          scopes: apiKey.scopes,
          rawKey: apiKey.rawKey,
        },
      },
      201,
    );
  });

  router.get(
    '/send-smtp-nodes',
    requireAdminSession(appContext),
    async (context) => {
      const nodes = await appContext.repositories.sendSmtpNodes.list();
      return context.json({ data: nodes });
    },
  );

  router.post(
    '/send-smtp-nodes',
    requireAdminSession(appContext),
    async (context) => {
      const body = (await context.req.json().catch(() => null)) as {
        name?: unknown;
        host?: unknown;
        port?: unknown;
        username?: unknown;
        priority?: unknown;
      } | null;

      const port = parseNumericField(body?.port);
      const priority = parseNumericField(body?.priority);

      const name = typeof body?.name === 'string' ? body.name.trim() : '';
      const host = typeof body?.host === 'string' ? body.host.trim() : '';
      const username =
        typeof body?.username === 'string' ? body.username.trim() : undefined;

      if (!name || !host || port === null) {
        return context.json(
          {
            code: 'validation_error',
            message: 'name, host, and port are required',
          },
          400,
        );
      }

      try {
        const node = await appContext.repositories.sendSmtpNodes.create({
          id: createUlid(),
          name,
          host,
          port,
          username,
          priority: priority ?? 100,
        });
        return context.json({ data: node }, 201);
      } catch (err: unknown) {
        if (isPgUniqueViolation(err)) {
          return context.json(
            { code: 'conflict', message: 'Node name already exists' },
            409,
          );
        }
        throw err;
      }
    },
  );

  router.patch(
    '/send-smtp-nodes/:nodeId',
    requireAdminSession(appContext),
    async (context) => {
      const nodeId = context.req.param('nodeId');
      const existing =
        await appContext.repositories.sendSmtpNodes.findById(nodeId);

      if (!existing) {
        return context.json(
          { code: 'not_found', message: 'SendSMTP node not found' },
          404,
        );
      }

      const body = (await context.req.json().catch(() => null)) as {
        name?: unknown;
        host?: unknown;
        port?: unknown;
        username?: unknown;
        priority?: unknown;
        isActive?: unknown;
      } | null;

      const port =
        body?.port === undefined ? undefined : parseNumericField(body.port);
      const priority =
        body?.priority === undefined
          ? undefined
          : parseNumericField(body.priority);
      const name =
        typeof body?.name === 'string' ? body.name.trim() : undefined;
      const host =
        typeof body?.host === 'string' ? body.host.trim() : undefined;
      const username =
        typeof body?.username === 'string' ? body.username.trim() : undefined;

      if (name !== undefined && !name) {
        return context.json(
          { code: 'validation_error', message: 'name is required' },
          400,
        );
      }

      if (host !== undefined && !host) {
        return context.json(
          { code: 'validation_error', message: 'host is required' },
          400,
        );
      }

      if (body?.port !== undefined && port === null) {
        return context.json(
          { code: 'validation_error', message: 'port must be a number' },
          400,
        );
      }

      if (body?.priority !== undefined && priority === null) {
        return context.json(
          { code: 'validation_error', message: 'priority must be a number' },
          400,
        );
      }

      try {
        const updated = await appContext.repositories.sendSmtpNodes.update(
          nodeId,
          {
            name,
            host,
            port: port === null ? undefined : port,
            username,
            priority: priority === null ? undefined : priority,
            isActive:
              typeof body?.isActive === 'boolean' ? body.isActive : undefined,
          },
        );

        return context.json({ data: updated });
      } catch (err: unknown) {
        if (isPgUniqueViolation(err)) {
          return context.json(
            { code: 'conflict', message: 'Node name already exists' },
            409,
          );
        }

        throw err;
      }
    },
  );

  router.post(
    '/send-smtp-nodes/:nodeId/test',
    requireAdminSession(appContext),
    async (context) => {
      const nodeId = context.req.param('nodeId');
      const node = await appContext.repositories.sendSmtpNodes.findById(nodeId);

      if (!node) {
        return context.json(
          { code: 'not_found', message: 'SendSMTP node not found' },
          404,
        );
      }

      const result = await probeSmtpNode({
        host: node.host,
        port: node.port,
      });

      return context.json({ data: result });
    },
  );

  router.delete(
    '/send-smtp-nodes/:nodeId',
    requireAdminSession(appContext),
    async (context) => {
      const nodeId = context.req.param('nodeId');
      const node = await appContext.repositories.sendSmtpNodes.findById(nodeId);

      if (!node) {
        return context.json(
          { code: 'not_found', message: 'SendSMTP node not found' },
          404,
        );
      }

      const referencedByRouting =
        await appContext.repositories.routingRules.isNodeReferencedByLatestVersion(
          nodeId,
        );

      if (referencedByRouting) {
        return context.json(
          {
            code: 'conflict',
            message: 'Node is referenced by the latest routing rules',
          },
          409,
        );
      }

      await appContext.repositories.sendSmtpNodes.tombstoneById(nodeId);
      return context.body(null, 204);
    },
  );

  router.get(
    '/routing-rules',
    requireAdminSession(appContext),
    async (context) => {
      const version =
        await appContext.repositories.routingRules.getLatestVersion();
      if (!version) return context.json({ data: [] });
      const rules =
        await appContext.repositories.routingRules.listRulesByVersion(version);
      return context.json({ data: rules, version });
    },
  );

  router.post(
    '/routing-rules',
    requireAdminSession(appContext),
    async (context) => {
      const body = (await context.req.json().catch(() => ({ rules: [] }))) as {
        rules?: unknown;
      };
      if (!Array.isArray(body.rules) || body.rules.length === 0) {
        return context.json(
          { code: 'validation_error', message: 'rules array is required' },
          400,
        );
      }

      try {
        const version =
          await appContext.repositories.routingRules.createRuleset(
            body.rules.map((rule) => {
              const input =
                typeof rule === 'object' && rule !== null
                  ? (rule as Record<string, unknown>)
                  : {};
              const parsedPriority = parseNumericField(input.priority);

              return {
                id: createUlid(),
                matchType: input.matchType === 'default' ? 'default' : 'exact',
                domain:
                  typeof input.domain === 'string' ? input.domain : undefined,
                sendSmtpNodeId:
                  typeof input.sendSmtpNodeId === 'string'
                    ? input.sendSmtpNodeId
                    : '',
                failoverNodeIds: Array.isArray(input.failoverNodeIds)
                  ? input.failoverNodeIds.filter(
                      (nodeId): nodeId is string => typeof nodeId === 'string',
                    )
                  : undefined,
                priority: parsedPriority ?? undefined,
                isActive:
                  typeof input.isActive === 'boolean'
                    ? input.isActive
                    : undefined,
              };
            }),
          );
        return context.json({ data: { version } }, 201);
      } catch (err: unknown) {
        return context.json(
          {
            code: 'validation_error',
            message: err instanceof Error ? err.message : 'Validation error',
          },
          400,
        );
      }
    },
  );

  router.post(
    '/routing-rules/preview',
    requireAdminSession(appContext),
    async (context) => {
      const body = await context.req
        .json()
        .catch(() => ({ recipientEmail: '' }));
      if (!body.recipientEmail || typeof body.recipientEmail !== 'string') {
        return context.json(
          { code: 'validation_error', message: 'recipientEmail is required' },
          400,
        );
      }

      const route =
        await appContext.repositories.routingRules.findRouteForRecipient(
          body.recipientEmail,
        );
      return context.json({ data: route });
    },
  );

  router.get('/sends', requireAdminSession(appContext), async (context) => {
    const search = (context.req.query('search') ?? '').trim();
    const cursor = (context.req.query('cursor') ?? '').trim() || null;
    const limitRaw = context.req.query('limit');
    const pageRaw = context.req.query('page');
    const limit =
      typeof limitRaw === 'string' && limitRaw.trim()
        ? Math.max(1, Math.min(Number.parseInt(limitRaw, 10) || 20, 100))
        : 20;
    const page =
      typeof pageRaw === 'string' && pageRaw.trim()
        ? Math.max(1, Number.parseInt(pageRaw, 10) || 1)
        : 1;

    if (cursor) {
      const result = await appContext.repositories.sends.listAdminHistory({
        search,
        limit,
        cursor,
      });

      return context.json({
        ...result,
        pageInfo: {
          ...result.pageInfo,
          page,
        },
      });
    }

    let currentCursor: string | null = null;
    let result = await appContext.repositories.sends.listAdminHistory({
      search,
      limit,
      cursor: currentCursor,
    });

    for (let currentPage = 1; currentPage < page; currentPage += 1) {
      if (!result.pageInfo.hasMore || !result.pageInfo.nextCursor) {
        break;
      }

      currentCursor = result.pageInfo.nextCursor;
      result = await appContext.repositories.sends.listAdminHistory({
        search,
        limit,
        cursor: currentCursor,
      });
    }

    return context.json({
      ...result,
      pageInfo: {
        ...result.pageInfo,
        page,
      },
    });
  });

  return router;
};
