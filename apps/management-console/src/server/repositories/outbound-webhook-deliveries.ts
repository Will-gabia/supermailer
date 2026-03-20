import { asc, eq } from 'drizzle-orm';

import type { ManagementConsoleDatabase } from '../db';
import { outboundWebhookDeliveries } from '../db/schema';

export const createOutboundWebhookDeliveriesRepository = (
  db: ManagementConsoleDatabase,
) => ({
  create: async (input: {
    id: string;
    sendId: string;
    targetUrl: string;
    signingSecret: string;
    status: string;
    payload?: Record<string, unknown>;
  }) => {
    const [record] = await db
      .insert(outboundWebhookDeliveries)
      .values({
        id: input.id,
        sendId: input.sendId,
        targetUrl: input.targetUrl,
        signingSecret: input.signingSecret,
        status: input.status,
        payload: input.payload ?? null,
      })
      .returning();

    return record;
  },
  listForSend: async (sendId: string) =>
    db
      .select()
      .from(outboundWebhookDeliveries)
      .where(eq(outboundWebhookDeliveries.sendId, sendId))
      .orderBy(
        asc(outboundWebhookDeliveries.createdAt),
        asc(outboundWebhookDeliveries.id),
      ),
  findBySendId: async (sendId: string) => {
    const [record] = await db
      .select()
      .from(outboundWebhookDeliveries)
      .where(eq(outboundWebhookDeliveries.sendId, sendId))
      .orderBy(
        asc(outboundWebhookDeliveries.createdAt),
        asc(outboundWebhookDeliveries.id),
      )
      .limit(1);

    return record ?? null;
  },
  markAttempt: async (
    id: string,
    input: {
      status: string;
      attemptCount: number;
      lastAttemptAt?: Date | null;
      nextAttemptAt?: Date | null;
      payload?: Record<string, unknown> | null;
    },
  ) => {
    const [record] = await db
      .update(outboundWebhookDeliveries)
      .set({
        status: input.status,
        attemptCount: input.attemptCount,
        lastAttemptAt: input.lastAttemptAt ?? null,
        nextAttemptAt: input.nextAttemptAt ?? null,
        payload: input.payload === undefined ? undefined : input.payload,
        updatedAt: new Date(),
      })
      .where(eq(outboundWebhookDeliveries.id, id))
      .returning();

    return record ?? null;
  },
});
