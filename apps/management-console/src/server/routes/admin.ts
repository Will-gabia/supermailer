import { createUlid } from '@supermailer/contracts';
import { Hono } from 'hono';

import type { ManagementConsoleAppContext } from '../app-context';
import type { AppVariables } from '../app-types';
import { createApiKeyRecord, requireAdminSession } from '../auth';
import { enqueueCampaignSend, enqueueIndividualSend } from '../services/send-enqueue';
import { getSubscriberEligibility } from '../services/subscriber-eligibility';
import { runSubscriberSync } from '../services/subscriber-sync';

const ALLOWED_API_KEY_SCOPES = ['subscriber-sync', 'individual-send', 'campaign-send'] as const;

const isAllowedScope = (scope: string): scope is (typeof ALLOWED_API_KEY_SCOPES)[number] =>
  ALLOWED_API_KEY_SCOPES.includes(scope as (typeof ALLOWED_API_KEY_SCOPES)[number]);

const toStringRecord = (value: unknown): Record<string, string> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(([, entryValue]) => typeof entryValue === 'string'),
  ) as Record<string, string>;
};

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

const isPgUniqueViolation = (error: unknown): error is Error & { code: string } =>
  error instanceof Error && 'code' in error && error.code === '23505';

export const createAdminRouter = (appContext: ManagementConsoleAppContext) => {
  const router = new Hono<{ Variables: AppVariables }>();

  router.get('/subscribers', requireAdminSession(appContext), async (context) => {
    const subscribers = await appContext.repositories.subscribers.list();
    const suppressionRecords = await appContext.repositories.suppressions.listByEmails(subscribers.map((subscriber) => subscriber.email));
    const suppressionMap = new Map<string, string[]>();

    for (const suppression of suppressionRecords) {
      suppressionMap.set(suppression.email, [...(suppressionMap.get(suppression.email) ?? []), suppression.reason]);
    }

    return context.json({
      data: subscribers.map((subscriber) => ({
        id: subscriber.id,
        email: subscriber.email,
        displayName: subscriber.displayName,
        status: subscriber.status,
        sourceKey: subscriber.sourceKey,
        externalId: subscriber.externalId,
        isUnsubscribed: subscriber.unsubscribedAt !== null,
        unsubscribedAt: subscriber.unsubscribedAt,
        lastSyncedAt: subscriber.lastSyncedAt,
        eligible: subscriber.unsubscribedAt === null && !(suppressionMap.get(subscriber.email) ?? []).includes('hard_bounce'),
        eligibilityReason: subscriber.unsubscribedAt ? 'unsubscribed' : (suppressionMap.get(subscriber.email) ?? []).includes('hard_bounce') ? 'hard_bounce_suppression' : null,
        suppressionReasons: suppressionMap.get(subscriber.email) ?? [],
      })),
    });
  });

  router.post('/subscribers', requireAdminSession(appContext), async (context) => {
    const body = (await context.req.json().catch(() => null)) as { email?: unknown; displayName?: unknown } | null;
    const email = typeof body?.email === 'string' ? body.email : '';
    const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : null;

    if (!email.trim()) {
      return context.json({ code: 'validation_error', message: 'Email is required' }, 400);
    }

    const subscriber = await appContext.repositories.subscribers.create({
      id: createUlid(),
      email,
      displayName,
    });

    return context.json({ data: subscriber }, 201);
  });

  router.patch('/subscribers/:subscriberId', requireAdminSession(appContext), async (context) => {
    const subscriber = await appContext.repositories.subscribers.findById(context.req.param('subscriberId'));

    if (!subscriber) {
      return context.json({ code: 'not_found', message: 'Subscriber not found' }, 404);
    }

    const body = (await context.req.json().catch(() => null)) as {
      email?: unknown;
      displayName?: unknown;
      unsubscribed?: unknown;
    } | null;

    const updated = await appContext.repositories.subscribers.update(subscriber.id, {
      email: typeof body?.email === 'string' ? body.email : undefined,
      displayName: typeof body?.displayName === 'string' ? body.displayName.trim() : undefined,
      unsubscribedAt:
        typeof body?.unsubscribed === 'boolean'
          ? body.unsubscribed
            ? new Date()
            : null
          : undefined,
    });

    return context.json({ data: updated });
  });

  router.post('/subscribers/:subscriberId/suppressions', requireAdminSession(appContext), async (context) => {
    const subscriber = await appContext.repositories.subscribers.findById(context.req.param('subscriberId'));

    if (!subscriber) {
      return context.json({ code: 'not_found', message: 'Subscriber not found' }, 404);
    }

    const body = (await context.req.json().catch(() => null)) as { reason?: unknown; sourceEventId?: unknown } | null;
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';

    if (reason !== 'hard_bounce') {
      return context.json({ code: 'validation_error', message: 'Only hard_bounce suppression is supported' }, 400);
    }

    const suppression = await appContext.repositories.suppressions.create({
      id: createUlid(),
      email: subscriber.email,
      reason,
      sourceEventId: typeof body?.sourceEventId === 'string' ? body.sourceEventId : null,
    });

    return context.json({ data: suppression }, 201);
  });

  router.get('/admin/subscriber-eligibility', requireAdminSession(appContext), async (context) => {
    const email = context.req.query('email') ?? '';

    if (!email.trim()) {
      return context.json({ code: 'validation_error', message: 'email is required' }, 400);
    }

    const eligibility = await getSubscriberEligibility(appContext, email);

    return context.json({ data: { email, ...eligibility } });
  });

  router.get('/sync-runs', requireAdminSession(appContext), async (context) => {
    const syncRuns = await appContext.repositories.syncRuns.list();
    const data = await Promise.all(
      syncRuns.map(async (syncRun) => ({
        ...syncRun,
        records: await appContext.repositories.syncRunRecords.listForRun(syncRun.id),
      })),
    );

    return context.json({ data });
  });

  router.post('/admin/subscriber-sync-runs', requireAdminSession(appContext), async (context) => {
    const body = (await context.req.json().catch(() => null)) as {
      sourceKey?: unknown;
      endpointUrl?: unknown;
      headers?: unknown;
    } | null;

    try {
      const result = await runSubscriberSync(appContext, {
        sourceKey: typeof body?.sourceKey === 'string' ? body.sourceKey : '',
        endpointUrl: typeof body?.endpointUrl === 'string' ? body.endpointUrl : '',
        headers: toStringRecord(body?.headers),
      });

      return context.json({ data: result }, 201);
    } catch (error) {
      return context.json(
        {
          code: 'validation_error',
          message: error instanceof Error ? error.message : 'Subscriber sync failed',
        },
        400,
      );
    }
  });

  router.get('/api-keys', requireAdminSession(appContext), async (context) => {
    const apiKeys = await appContext.repositories.apiKeys.list();

    return context.json({
      data: apiKeys.map((apiKey) => ({
        id: apiKey.id,
        label: apiKey.label,
        keyPrefix: apiKey.keyPrefix,
        scopes: apiKey.scopes ?? [],
        lastUsedAt: apiKey.lastUsedAt,
        createdAt: apiKey.createdAt,
      })),
    });
  });

  router.post('/api-keys', requireAdminSession(appContext), async (context) => {
    const body = (await context.req.json().catch(() => null)) as { label?: unknown; scopes?: unknown } | null;
    const label = typeof body?.label === 'string' ? body.label.trim() : '';
    const scopeValues = Array.isArray(body?.scopes) ? body?.scopes.filter((value): value is string => typeof value === 'string') : [];
    const scopes = Array.from(new Set(scopeValues.filter(isAllowedScope)));

    if (!label) {
      return context.json({ code: 'validation_error', message: 'Label is required' }, 400);
    }

    if (scopes.length === 0) {
      return context.json({ code: 'validation_error', message: 'At least one supported scope is required' }, 400);
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

    return context.json({
      data: {
        id: apiKey.id,
        label: apiKey.label,
        keyPrefix: apiKey.keyPrefix,
        scopes: apiKey.scopes,
        rawKey: apiKey.rawKey,
      },
    }, 201);
  });

  router.get('/templates', requireAdminSession(appContext), async (context) => {
    const templates = await appContext.repositories.templates.list();
    return context.json({ data: templates });
  });

  router.get('/templates/:templateId', requireAdminSession(appContext), async (context) => {
    const template = await appContext.repositories.templates.findById(context.req.param('templateId'));
    if (!template) {
      return context.json({ code: 'not_found', message: 'Template not found' }, 404);
    }
    return context.json({ data: template });
  });

  router.post('/templates', requireAdminSession(appContext), async (context) => {
    const body = (await context.req.json().catch(() => null)) as {
      name?: unknown;
      subject?: unknown;
      html?: unknown;
      textContent?: unknown;
    } | null;

    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const subject = typeof body?.subject === 'string' ? body.subject.trim() : '';
    const html = typeof body?.html === 'string' ? body.html.trim() : '';
    const textContent = typeof body?.textContent === 'string' ? body.textContent.trim() : null;

    if (!name || !subject || !html) {
      return context.json({ code: 'validation_error', message: 'Name, subject, and html are required' }, 400);
    }

    const { extractVariables } = await import('../services/template-preview');
    
    const subjectVars = extractVariables(subject);
    const htmlVars = extractVariables(html);
    const textVars = textContent ? extractVariables(textContent) : [];
    
    const variables = Array.from(new Set([...subjectVars, ...htmlVars, ...textVars]));

    try {
      const template = await appContext.repositories.templates.create({
        id: createUlid(),
        name,
        subject,
        html,
        textContent,
        variables,
      });

      return context.json({ data: template }, 201);
    } catch (err: unknown) {
      if (err instanceof Error && "code" in err && err.code === "23505") { // unique constraint violation in pg
        return context.json({ code: 'conflict', message: 'Template name already exists' }, 409);
      }
      throw err;
    }
  });

  router.patch('/templates/:templateId', requireAdminSession(appContext), async (context) => {
    const template = await appContext.repositories.templates.findById(context.req.param('templateId'));
    if (!template) {
      return context.json({ code: 'not_found', message: 'Template not found' }, 404);
    }

    const body = (await context.req.json().catch(() => null)) as {
      name?: unknown;
      subject?: unknown;
      html?: unknown;
      textContent?: unknown;
    } | null;

    const name = typeof body?.name === 'string' ? body.name.trim() : undefined;
    const subject = typeof body?.subject === 'string' ? body.subject.trim() : undefined;
    const html = typeof body?.html === 'string' ? body.html.trim() : undefined;
    const textContent = typeof body?.textContent === 'string' ? body.textContent.trim() : undefined;

    const newSubject = subject ?? template.subject;
    const newHtml = html ?? template.html;
    const newTextContent = textContent !== undefined ? textContent : template.textContent;

    const { extractVariables } = await import('../services/template-preview');
    
    const subjectVars = extractVariables(newSubject);
    const htmlVars = extractVariables(newHtml);
    const textVars = newTextContent ? extractVariables(newTextContent) : [];
    
    const variables = Array.from(new Set([...subjectVars, ...htmlVars, ...textVars]));

    try {
      const updated = await appContext.repositories.templates.update(template.id, {
        name,
        subject,
        html,
        textContent,
        variables,
      });

      return context.json({ data: updated });
    } catch (err: unknown) {
      if (err instanceof Error && "code" in err && err.code === "23505") {
        return context.json({ code: 'conflict', message: 'Template name already exists' }, 409);
      }
      throw err;
    }
  });

  router.post('/templates/preview', requireAdminSession(appContext), async (context) => {
    const body = (await context.req.json().catch(() => null)) as {
      subject?: unknown;
      html?: unknown;
      previewData?: unknown;
    } | null;

    const subject = typeof body?.subject === 'string' ? body.subject : '';
    const html = typeof body?.html === 'string' ? body.html : '';
    const previewData = typeof body?.previewData === 'object' && body?.previewData !== null 
      ? (body.previewData as Record<string, string>) 
      : {};

    const { renderTemplate } = await import('../services/template-preview');

    return context.json({
      data: {
        subject: renderTemplate(subject, previewData),
        html: renderTemplate(html, previewData),
      }
    });
  });

  router.get('/send-smtp-nodes', requireAdminSession(appContext), async (context) => {
    const nodes = await appContext.repositories.sendSmtpNodes.list();
    return context.json({ data: nodes });
  });

  router.post('/send-smtp-nodes', requireAdminSession(appContext), async (context) => {
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
    const username = typeof body?.username === 'string' ? body.username.trim() : undefined;

    if (!name || !host || port === null) {
      return context.json({ code: 'validation_error', message: 'name, host, and port are required' }, 400);
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
        return context.json({ code: 'conflict', message: 'Node name already exists' }, 409);
      }
      throw err;
    }
  });

  router.patch('/send-smtp-nodes/:nodeId', requireAdminSession(appContext), async (context) => {
    const nodeId = context.req.param('nodeId');
    const existing = await appContext.repositories.sendSmtpNodes.findById(nodeId);

    if (!existing) {
      return context.json({ code: 'not_found', message: 'SendSMTP node not found' }, 404);
    }

    const body = (await context.req.json().catch(() => null)) as {
      name?: unknown;
      host?: unknown;
      port?: unknown;
      username?: unknown;
      priority?: unknown;
      isActive?: unknown;
    } | null;

    const port = body?.port === undefined ? undefined : parseNumericField(body.port);
    const priority = body?.priority === undefined ? undefined : parseNumericField(body.priority);
    const name = typeof body?.name === 'string' ? body.name.trim() : undefined;
    const host = typeof body?.host === 'string' ? body.host.trim() : undefined;
    const username = typeof body?.username === 'string' ? body.username.trim() : undefined;

    if (name !== undefined && !name) {
      return context.json({ code: 'validation_error', message: 'name is required' }, 400);
    }

    if (host !== undefined && !host) {
      return context.json({ code: 'validation_error', message: 'host is required' }, 400);
    }

    if (body?.port !== undefined && port === null) {
      return context.json({ code: 'validation_error', message: 'port must be a number' }, 400);
    }

    if (body?.priority !== undefined && priority === null) {
      return context.json({ code: 'validation_error', message: 'priority must be a number' }, 400);
    }

    try {
      const updated = await appContext.repositories.sendSmtpNodes.update(nodeId, {
        name,
        host,
        port: port === null ? undefined : port,
        username,
        priority: priority === null ? undefined : priority,
        isActive: typeof body?.isActive === 'boolean' ? body.isActive : undefined,
      });

      return context.json({ data: updated });
    } catch (err: unknown) {
      if (isPgUniqueViolation(err)) {
        return context.json({ code: 'conflict', message: 'Node name already exists' }, 409);
      }

      throw err;
    }
  });

  router.get('/routing-rules', requireAdminSession(appContext), async (context) => {
    const version = await appContext.repositories.routingRules.getLatestVersion();
    if (!version) return context.json({ data: [] });
    const rules = await appContext.repositories.routingRules.listRulesByVersion(version);
    return context.json({ data: rules, version });
  });

  router.post('/routing-rules', requireAdminSession(appContext), async (context) => {
    const body = (await context.req.json().catch(() => ({ rules: [] }))) as { rules?: unknown };
    if (!Array.isArray(body.rules) || body.rules.length === 0) {
      return context.json({ code: 'validation_error', message: 'rules array is required' }, 400);
    }

    try {
      const version = await appContext.repositories.routingRules.createRuleset(
        body.rules.map((rule) => {
          const input = typeof rule === 'object' && rule !== null ? (rule as Record<string, unknown>) : {};
          const parsedPriority = parseNumericField(input.priority);

          return {
            id: createUlid(),
            matchType: input.matchType === 'default' ? 'default' : 'exact',
            domain: typeof input.domain === 'string' ? input.domain : undefined,
            sendSmtpNodeId: typeof input.sendSmtpNodeId === 'string' ? input.sendSmtpNodeId : '',
            priority: parsedPriority ?? undefined,
            isActive: typeof input.isActive === 'boolean' ? input.isActive : undefined,
          };
        })
      );
      return context.json({ data: { version } }, 201);
    } catch (err: unknown) {
      return context.json({ code: 'validation_error', message: err instanceof Error ? err.message : "Validation error" }, 400);
    }
  });

  router.post('/routing-rules/preview', requireAdminSession(appContext), async (context) => {
    const body = await context.req.json().catch(() => ({ recipientEmail: '' }));
    if (!body.recipientEmail || typeof body.recipientEmail !== 'string') {
      return context.json({ code: 'validation_error', message: 'recipientEmail is required' }, 400);
    }

    const route = await appContext.repositories.routingRules.findRouteForRecipient(body.recipientEmail);
    return context.json({ data: route });
  });

  router.get('/sends', requireAdminSession(appContext), async (context) => {
    const records = await appContext.repositories.sends.list();
    return context.json({ data: records });
  });

  router.post('/admin/individual-sends', requireAdminSession(appContext), async (context) => {
    const body = (await context.req.json().catch(() => null)) as {
      to?: unknown;
      templateId?: unknown;
      subject?: unknown;
      html?: unknown;
      text?: unknown;
      variables?: unknown;
      webhookUrl?: unknown;
      webhookSigningSecret?: unknown;
    } | null;

    const to = typeof body?.to === 'string' ? body.to : '';

    if (!to.trim()) {
      return context.json({ code: 'validation_error', message: 'to is required' }, 400);
    }

    try {
      const result = await enqueueIndividualSend(
        appContext,
        {
          enqueueSend: appContext.sendDispatchEnqueuer.enqueueSend,
        },
        {
          to,
          templateId: typeof body?.templateId === 'string' ? body.templateId : undefined,
          subject: typeof body?.subject === 'string' ? body.subject : undefined,
          html: typeof body?.html === 'string' ? body.html : undefined,
          text: typeof body?.text === 'string' ? body.text : undefined,
          variables: toStringRecord(body?.variables),
          webhookUrl: typeof body?.webhookUrl === 'string' ? body.webhookUrl : undefined,
          webhookSigningSecret: typeof body?.webhookSigningSecret === 'string' ? body.webhookSigningSecret : undefined,
        },
      );

      return context.json({ data: result }, 202);
    } catch (error) {
      return context.json({ code: 'validation_error', message: error instanceof Error ? error.message : 'Invalid request' }, 400);
    }
  });

  router.post('/admin/campaign-sends', requireAdminSession(appContext), async (context) => {
    const body = (await context.req.json().catch(() => null)) as {
      campaignId?: unknown;
      templateId?: unknown;
      subject?: unknown;
      html?: unknown;
      text?: unknown;
      variables?: unknown;
      recipients?: unknown;
    } | null;

    try {
      const result = await enqueueCampaignSend(
        appContext,
        {
          enqueueSend: appContext.sendDispatchEnqueuer.enqueueSend,
        },
        {
          campaignId: typeof body?.campaignId === 'string' ? body.campaignId : undefined,
          templateId: typeof body?.templateId === 'string' ? body.templateId : undefined,
          subject: typeof body?.subject === 'string' ? body.subject : undefined,
          html: typeof body?.html === 'string' ? body.html : undefined,
          text: typeof body?.text === 'string' ? body.text : undefined,
          variables: toStringRecord(body?.variables),
          recipients: Array.isArray(body?.recipients) ? body.recipients.filter((value): value is string => typeof value === 'string') : [],
        },
      );

      return context.json({ data: result }, 202);
    } catch (error) {
      return context.json({ code: 'validation_error', message: error instanceof Error ? error.message : 'Invalid request' }, 400);
    }
  });

  return router;
};
