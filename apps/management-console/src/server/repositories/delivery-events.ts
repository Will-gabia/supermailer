import { asc, count, eq } from 'drizzle-orm';

import type { ManagementConsoleDatabase } from '../db';
import { deliveryEvents, sends } from '../db/schema';

export const createDeliveryEventsRepository = (
  db: ManagementConsoleDatabase,
) => ({
  append: async (input: {
    id: string;
    sendId: string;
    eventKey: string;
    eventType: string;
    smtpCode?: string | null;
    enhancedSmtpCode?: string | null;
    reason?: string | null;
    relayIdentity?: string | null;
    queueId?: string | null;
    provenance: string;
    rawPayload?: Record<string, unknown>;
    occurredAt: Date;
  }) => {
    const [record] = await db
      .insert(deliveryEvents)
      .values({
        id: input.id,
        sendId: input.sendId,
        eventKey: input.eventKey,
        eventType: input.eventType,
        smtpCode: input.smtpCode ?? null,
        enhancedSmtpCode: input.enhancedSmtpCode ?? null,
        reason: input.reason ?? null,
        relayIdentity: input.relayIdentity ?? null,
        queueId: input.queueId ?? null,
        provenance: input.provenance,
        rawPayload: input.rawPayload ?? null,
        occurredAt: input.occurredAt,
      })
      .returning();

    return record;
  },
  findByEventKey: async (eventKey: string) => {
    const [record] = await db
      .select()
      .from(deliveryEvents)
      .where(eq(deliveryEvents.eventKey, eventKey))
      .limit(1);

    return record ?? null;
  },
  listForSend: async (sendId: string) =>
    db
      .select()
      .from(deliveryEvents)
      .where(eq(deliveryEvents.sendId, sendId))
      .orderBy(asc(deliveryEvents.occurredAt), asc(deliveryEvents.id)),
  countByStatus: async () =>
    db
      .select({
        status: sends.status,
        count: count(),
      })
      .from(sends)
      .groupBy(sends.status)
      .orderBy(asc(sends.status)),
  codeHistogram: async () =>
    db
      .select({
        eventType: deliveryEvents.eventType,
        smtpCode: deliveryEvents.smtpCode,
        enhancedSmtpCode: deliveryEvents.enhancedSmtpCode,
        count: count(),
      })
      .from(deliveryEvents)
      .groupBy(
        deliveryEvents.eventType,
        deliveryEvents.smtpCode,
        deliveryEvents.enhancedSmtpCode,
      )
      .orderBy(
        asc(deliveryEvents.eventType),
        asc(deliveryEvents.smtpCode),
        asc(deliveryEvents.enhancedSmtpCode),
      ),
  nodeBreakdown: async () =>
    db
      .select({
        node: deliveryEvents.relayIdentity,
        eventType: deliveryEvents.eventType,
        count: count(),
      })
      .from(deliveryEvents)
      .groupBy(deliveryEvents.relayIdentity, deliveryEvents.eventType)
      .orderBy(
        asc(deliveryEvents.relayIdentity),
        asc(deliveryEvents.eventType),
      ),
});
