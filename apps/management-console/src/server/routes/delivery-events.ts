import { Hono } from 'hono';

import type { ManagementConsoleAppContext } from '../app-context';
import type { AppVariables } from '../app-types';
import { requireAdminSession } from '../auth';
import {
  getDeliveryReporting,
  getSendEventHistory,
  ingestDeliveryEvent,
} from '../services/delivery-events';
import { verifyInboundDeliveryCallbackSignature } from '../services/delivery-event-signing';

const parseInboundBody = async (
  request: Request,
): Promise<{ rawBody: string; body: unknown }> => {
  const rawBody = await request.text();

  if (!rawBody.trim()) {
    throw new Error('Request body is required');
  }

  const body = JSON.parse(rawBody) as unknown;
  return { rawBody, body };
};

export const createDeliveryEventsRouter = (
  appContext: ManagementConsoleAppContext,
) => {
  const router = new Hono<{ Variables: AppVariables }>();

  router.post('/internal/delivery-events', async (context) => {
    let parsedBody: { rawBody: string; body: unknown };

    try {
      parsedBody = await parseInboundBody(context.req.raw);
    } catch {
      return context.json(
        { code: 'validation_error', message: 'Malformed JSON body' },
        400,
      );
    }

    if (
      !verifyInboundDeliveryCallbackSignature(
        appContext,
        parsedBody.rawBody,
        context.req.header('x-supermailer-signature'),
      )
    ) {
      return context.json(
        {
          code: 'signature_invalid',
          message: 'Valid callback signature required',
        },
        401,
      );
    }

    const body =
      parsedBody.body &&
      typeof parsedBody.body === 'object' &&
      !Array.isArray(parsedBody.body)
        ? (parsedBody.body as Record<string, unknown>)
        : null;

    if (!body) {
      return context.json(
        { code: 'validation_error', message: 'Object request body required' },
        400,
      );
    }

    const format =
      body.format === 'sendsmtp_log'
        ? 'sendsmtp_log'
        : body.format === 'normalized'
          ? 'normalized'
          : null;
    const event = body.event;

    if (
      !format ||
      !event ||
      typeof event !== 'object' ||
      Array.isArray(event)
    ) {
      return context.json(
        { code: 'validation_error', message: 'format and event are required' },
        400,
      );
    }

    try {
      const result = await ingestDeliveryEvent(appContext, {
        format,
        event: event as Record<string, unknown>,
      } as never);

      return context.json(
        { data: result },
        result.outcome === 'applied' ? 202 : 200,
      );
    } catch (error) {
      return context.json(
        {
          code: 'validation_error',
          message:
            error instanceof Error
              ? error.message
              : 'Delivery event ingestion failed',
        },
        400,
      );
    }
  });

  router.get(
    '/admin/reporting/delivery-events',
    requireAdminSession(appContext),
    async (context) => {
      const report = await getDeliveryReporting(appContext);
      return context.json({ data: report });
    },
  );

  router.get(
    '/admin/sends/:sendId/delivery-events',
    requireAdminSession(appContext),
    async (context) => {
      const sendId = context.req.param('sendId');
      const send = await appContext.repositories.sends.findById(sendId);

      if (!send) {
        return context.json(
          { code: 'not_found', message: 'Send not found' },
          404,
        );
      }

      const events = await getSendEventHistory(appContext, sendId);
      const webhookDelivery = await appContext.repositories.outboundWebhookDeliveries.findBySendId(sendId);

      return context.json({
        data: events,
        webhookDelivery: webhookDelivery ? {
          status: webhookDelivery.status,
          targetUrl: webhookDelivery.targetUrl,
          attemptCount: webhookDelivery.attemptCount,
          lastAttemptAt: webhookDelivery.lastAttemptAt,
          nextAttemptAt: webhookDelivery.nextAttemptAt,
        } : null,
      });
    },
  );

  return router;
};
