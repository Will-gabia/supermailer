import { Hono } from 'hono';
import { createUlid } from '@supermailer/contracts';

import type { ManagementConsoleAppContext } from '../app-context';
import type { AppVariables } from '../app-types';
import { requireApiKey } from '../auth';
import {
  enqueueIndividualSend,
  enqueueRawEmlSend,
} from '../services/send-enqueue';

const parseIsoDate = (value: string): Date | null => {
  const parsed = new Date(value);

  return Number.isNaN(parsed.valueOf()) ? null : parsed;
};

export const createExternalApiRouter = (
  appContext: ManagementConsoleAppContext,
) => {
  const router = new Hono<{ Variables: AppVariables }>();

  router.post(
    '/callback-endpoints',
    requireApiKey(appContext, 'individual-send'),
    async (context) => {
      const body = (await context.req.json().catch(() => null)) as {
        label?: unknown;
        targetUrl?: unknown;
      } | null;
      const label = typeof body?.label === 'string' ? body.label.trim() : '';
      const targetUrl =
        typeof body?.targetUrl === 'string' ? body.targetUrl.trim() : '';
      const apiKey = context.get('apiKey');

      if (!label || !targetUrl) {
        return context.json(
          {
            code: 'validation_error',
            message: 'label and targetUrl are required',
          },
          400,
        );
      }

      const endpoint = await appContext.repositories.callbackEndpoints.create({
        id: createUlid(),
        apiKeyId: apiKey.id,
        label,
        targetUrl,
        signingSecret: createUlid(),
      });

      return context.json(
        {
          data: {
            id: endpoint.id,
            label: endpoint.label,
            targetUrl: endpoint.targetUrl,
            isActive: endpoint.isActive,
            createdAt: endpoint.createdAt,
            updatedAt: endpoint.updatedAt,
          },
        },
        201,
      );
    },
  );

  router.get(
    '/callback-endpoints',
    requireApiKey(appContext, 'individual-send'),
    async (context) => {
      const apiKey = context.get('apiKey');
      const endpoints =
        await appContext.repositories.callbackEndpoints.listByApiKeyId(
          apiKey.id,
        );

      return context.json({
        data: endpoints.map((endpoint) => ({
          id: endpoint.id,
          label: endpoint.label,
          targetUrl: endpoint.targetUrl,
          isActive: endpoint.isActive,
          createdAt: endpoint.createdAt,
          updatedAt: endpoint.updatedAt,
        })),
      });
    },
  );

  router.post(
    '/sends',
    requireApiKey(appContext, 'individual-send'),
    async (context) => {
      const body = (await context.req.json().catch(() => null)) as {
        eml?: unknown;
        callbackEndpointId?: unknown;
      } | null;
      const apiKey = context.get('apiKey');
      const eml = typeof body?.eml === 'string' ? body.eml : '';
      const callbackEndpointId =
        typeof body?.callbackEndpointId === 'string'
          ? body.callbackEndpointId
          : null;

      if (!eml.trim()) {
        return context.json(
          {
            code: 'validation_error',
            message: 'eml is required',
          },
          400,
        );
      }

      let callbackEndpoint: {
        id: string;
        targetUrl: string;
        signingSecret: string;
      } | null = null;

      if (callbackEndpointId) {
        const endpoint =
          await appContext.repositories.callbackEndpoints.findByIdForApiKey(
            callbackEndpointId,
            apiKey.id,
          );

        if (!endpoint || !endpoint.isActive) {
          return context.json(
            {
              code: 'validation_error',
              message: 'callbackEndpointId is invalid',
            },
            400,
          );
        }

        callbackEndpoint = {
          id: endpoint.id,
          targetUrl: endpoint.targetUrl,
          signingSecret: endpoint.signingSecret,
        };
      }

      try {
        const result = await enqueueRawEmlSend(
          appContext,
          {
            enqueueSend: appContext.sendDispatchEnqueuer.enqueueSend,
          },
          {
            eml,
            apiKeyId: apiKey.id,
            callbackEndpoint: callbackEndpoint ?? undefined,
          },
        );

        return context.json(
          {
            status: result.status,
            scope: 'send',
            sendId: result.sendId,
            queueJobId: result.queueJobId,
            recipient: result.recipient,
            callbackEndpointId: result.callbackEndpointId,
          },
          202,
        );
      } catch (error) {
        return context.json(
          {
            code: 'validation_error',
            message: error instanceof Error ? error.message : 'Invalid request',
          },
          400,
        );
      }
    },
  );

  router.get(
    '/send-results',
    requireApiKey(appContext, 'individual-send'),
    async (context) => {
      const updatedSinceRaw = context.req.query('updatedSince') ?? '';
      const parsed = parseIsoDate(updatedSinceRaw);
      const apiKey = context.get('apiKey');
      const limitRaw = context.req.query('limit');
      const limit =
        typeof limitRaw === 'string' && limitRaw.trim()
          ? Math.max(1, Math.min(Number.parseInt(limitRaw, 10) || 100, 500))
          : 100;

      if (!parsed) {
        return context.json(
          {
            code: 'validation_error',
            message: 'updatedSince must be a valid ISO date',
          },
          400,
        );
      }

      const records =
        await appContext.repositories.sends.listResultsUpdatedSince({
          updatedSince: parsed,
          limit,
          apiKeyId: apiKey.id,
        });

      return context.json({
        data: records.map((record) => ({
          sendId: record.id,
          kind: record.kind,
          recipientEmail: record.recipientEmail,
          status: record.status,
          callbackEndpointId: record.callbackEndpointId,
          updatedAt: record.updatedAt,
        })),
      });
    },
  );

  router.post(
    '/individual-sends',
    requireApiKey(appContext, 'individual-send'),
    async (context) => {
      const apiKey = context.get('apiKey');
      const body = (await context.req.json().catch(() => null)) as {
        to?: unknown;
        subject?: unknown;
        html?: unknown;
        text?: unknown;
        webhookUrl?: unknown;
        webhookSigningSecret?: unknown;
      } | null;

      const to = typeof body?.to === 'string' ? body.to : '';

      if (!to.trim()) {
        return context.json(
          { code: 'validation_error', message: 'to is required' },
          400,
        );
      }

      try {
        const result = await enqueueIndividualSend(
          appContext,
          {
            enqueueSend: appContext.sendDispatchEnqueuer.enqueueSend,
          },
          {
            to,
            apiKeyId: apiKey.id,
            subject:
              typeof body?.subject === 'string' ? body.subject : undefined,
            html: typeof body?.html === 'string' ? body.html : undefined,
            text: typeof body?.text === 'string' ? body.text : undefined,
            webhookUrl:
              typeof body?.webhookUrl === 'string'
                ? body.webhookUrl
                : undefined,
            webhookSigningSecret:
              typeof body?.webhookSigningSecret === 'string'
                ? body.webhookSigningSecret
                : undefined,
          },
        );

        return context.json(
          {
            status: result.status,
            scope: 'individual-send',
            sendId: result.sendId,
            queueJobId: result.queueJobId,
            recipient: result.recipient,
            webhook: result.webhook,
          },
          202,
        );
      } catch (error) {
        return context.json(
          {
            code: 'validation_error',
            message: error instanceof Error ? error.message : 'Invalid request',
          },
          400,
        );
      }
    },
  );

  return router;
};
