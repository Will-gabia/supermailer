import { Hono } from 'hono';

import type { ManagementConsoleAppContext } from '../app-context';
import type { AppVariables } from '../app-types';
import { requireApiKey } from '../auth';
import { enqueueCampaignSend, enqueueIndividualSend } from '../services/send-enqueue';
import { getSubscriberEligibility } from '../services/subscriber-eligibility';
import { runSubscriberSync } from '../services/subscriber-sync';

const toStringRecord = (value: unknown): Record<string, string> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(([, entryValue]) => typeof entryValue === 'string'),
  ) as Record<string, string>;
};

export const createExternalApiRouter = (appContext: ManagementConsoleAppContext) => {
  const router = new Hono<{ Variables: AppVariables }>();

  router.post('/subscriber-syncs', requireApiKey(appContext, 'subscriber-sync'), async (context) => {
    const body = (await context.req.json().catch(() => null)) as {
      source?: unknown;
      sourceKey?: unknown;
      endpointUrl?: unknown;
      headers?: unknown;
    } | null;

    const sourceKey =
      typeof body?.sourceKey === 'string'
        ? body.sourceKey
        : typeof body?.source === 'string'
          ? body.source
          : '';
    const endpointUrl = typeof body?.endpointUrl === 'string' ? body.endpointUrl : '';

    if (!endpointUrl.trim()) {
      return context.json({ status: 'accepted', scope: 'subscriber-sync', sourceKey }, 202);
    }

    const result = await runSubscriberSync(appContext, {
      sourceKey,
      endpointUrl,
      headers: toStringRecord(body?.headers),
    });

    return context.json({ status: 'completed', scope: 'subscriber-sync', data: result }, 201);
  });

  router.get('/subscriber-eligibility', requireApiKey(appContext, 'subscriber-sync'), async (context) => {
    const email = context.req.query('email') ?? '';

    if (!email.trim()) {
      return context.json({ code: 'validation_error', message: 'email is required' }, 400);
    }

    return context.json({ data: { email, ...(await getSubscriberEligibility(appContext, email)) } });
  });

  router.post('/individual-sends', requireApiKey(appContext, 'individual-send'), async (context) => {
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

      return context.json(
        {
          status: result.status,
          scope: 'individual-send',
          sendId: result.sendId,
          queueJobId: result.queueJobId,
          recipient: result.recipient,
          skippedReason: result.skippedReason,
          webhook: result.webhook,
        },
        202,
      );
    } catch (error) {
      return context.json({ code: 'validation_error', message: error instanceof Error ? error.message : 'Invalid request' }, 400);
    }
  });

  router.post('/campaign-sends', requireApiKey(appContext, 'campaign-send'), async (context) => {
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

      return context.json({ status: result.status, scope: 'campaign-send', data: result }, 202);
    } catch (error) {
      return context.json({ code: 'validation_error', message: error instanceof Error ? error.message : 'Invalid request' }, 400);
    }
  });

  return router;
};
