import { eq } from 'drizzle-orm';

import type { ManagementConsoleDatabase } from '../db';
import { sends } from '../db/schema';

export const createSendsRepository = (db: ManagementConsoleDatabase) => ({
  create: async (input: {
    id: string;
    kind: string;
    recipientEmail: string;
    subjectSnapshot: string;
    htmlSnapshot: string;
    textSnapshot?: string | null;
    audienceProvenance?: {
      manual: boolean;
      groups: Array<{ id: string; name: string }>;
    } | null;
    status: string;
    templateId?: string | null;
    routingRuleVersion?: number | null;
    sendSmtpNodeId?: string | null;
  }) => {
    const [record] = await db
      .insert(sends)
      .values({
        id: input.id,
        kind: input.kind,
        recipientEmail: input.recipientEmail.trim().toLowerCase(),
        subjectSnapshot: input.subjectSnapshot,
        htmlSnapshot: input.htmlSnapshot,
        textSnapshot: input.textSnapshot ?? null,
        audienceProvenance: input.audienceProvenance ?? null,
        status: input.status,
        templateId: input.templateId ?? null,
        routingRuleVersion: input.routingRuleVersion ?? null,
        sendSmtpNodeId: input.sendSmtpNodeId ?? null,
      })
      .returning();

    return record;
  },
  findById: async (id: string) => {
    const [record] = await db
      .select()
      .from(sends)
      .where(eq(sends.id, id))
      .limit(1);

    return record ?? null;
  },
  findByAcceptedQueueId: async (queueId: string) => {
    const [record] = await db
      .select()
      .from(sends)
      .where(eq(sends.dispatchAcceptedPostfixQueueId, queueId))
      .limit(1);

    return record ?? null;
  },
  findByAcceptedAttemptId: async (attemptId: string) => {
    const [record] = await db
      .select()
      .from(sends)
      .where(eq(sends.dispatchAcceptedAttemptId, attemptId))
      .limit(1);

    return record ?? null;
  },
  findByCorrelation: async (input: {
    sendId?: string | null;
    queueId?: string | null;
    attemptId?: string | null;
  }) => {
    if (input.sendId) {
      const [record] = await db
        .select()
        .from(sends)
        .where(eq(sends.id, input.sendId))
        .limit(1);

      return record ?? null;
    }

    if (input.queueId) {
      const [record] = await db
        .select()
        .from(sends)
        .where(eq(sends.dispatchAcceptedPostfixQueueId, input.queueId))
        .limit(1);

      return record ?? null;
    }

    if (input.attemptId) {
      const [record] = await db
        .select()
        .from(sends)
        .where(eq(sends.dispatchAcceptedAttemptId, input.attemptId))
        .limit(1);

      return record ?? null;
    }

    return null;
  },
  list: async () => db.select().from(sends),
  setQueueJobId: async (sendId: string, queueJobId: string) => {
    const [record] = await db
      .update(sends)
      .set({ queueJobId, updatedAt: new Date() })
      .where(eq(sends.id, sendId))
      .returning();

    return record ?? null;
  },
  setStatus: async (sendId: string, status: string) => {
    const [record] = await db
      .update(sends)
      .set({ status, updatedAt: new Date() })
      .where(eq(sends.id, sendId))
      .returning();

    return record ?? null;
  },
  markDispatchAccepted: async (
    sendId: string,
    input: {
      attemptId: string;
      relayNodeId: string;
      queueId?: string | null;
      response?: string | null;
      acceptedAt?: Date;
    },
  ) => {
    const [record] = await db
      .update(sends)
      .set({
        status: 'accepted_by_mta',
        dispatchAcceptedAttemptId: input.attemptId,
        dispatchAcceptedRelayNodeId: input.relayNodeId,
        dispatchAcceptedPostfixQueueId: input.queueId ?? null,
        dispatchAcceptedResponse: input.response ?? null,
        dispatchAcceptedAt: input.acceptedAt ?? new Date(),
        updatedAt: new Date(),
      })
      .where(eq(sends.id, sendId))
      .returning();

    return record ?? null;
  },
});
