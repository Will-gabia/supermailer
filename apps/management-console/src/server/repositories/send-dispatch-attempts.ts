import { and, asc, eq, sql } from 'drizzle-orm';

import type { ManagementConsoleDatabase } from '../db';
import { sendDispatchAttempts } from '../db/schema';

export const createSendDispatchAttemptsRepository = (
  db: ManagementConsoleDatabase,
) => ({
  getNextAttemptNumber: async (sendId: string): Promise<number> => {
    const [row] = await db
      .select({
        value: sql<number>`coalesce(max(${sendDispatchAttempts.attemptNumber}), 0)`,
      })
      .from(sendDispatchAttempts)
      .where(eq(sendDispatchAttempts.sendId, sendId));

    return Number(row?.value ?? 0) + 1;
  },
  createStarted: async (input: {
    id: string;
    sendId: string;
    attemptNumber: number;
    sendSmtpNodeId: string;
    relayIdentity?: string | null;
    startedAt?: Date;
  }) => {
    const [record] = await db
      .insert(sendDispatchAttempts)
      .values({
        id: input.id,
        sendId: input.sendId,
        attemptNumber: input.attemptNumber,
        sendSmtpNodeId: input.sendSmtpNodeId,
        relayIdentity: input.relayIdentity ?? null,
        status: 'started',
        startedAt: input.startedAt ?? new Date(),
      })
      .returning();

    return record;
  },
  finish: async (
    id: string,
    input: {
      status: 'accepted' | 'failed_transient' | 'failed_permanent';
      smtpCode?: string | null;
      enhancedSmtpCode?: string | null;
      reason?: string | null;
      queueId?: string | null;
      relayIdentity?: string | null;
      rawPayload?: Record<string, unknown>;
      finishedAt?: Date;
    },
  ) => {
    const [record] = await db
      .update(sendDispatchAttempts)
      .set({
        status: input.status,
        smtpCode: input.smtpCode ?? null,
        enhancedSmtpCode: input.enhancedSmtpCode ?? null,
        reason: input.reason ?? null,
        queueId: input.queueId ?? null,
        relayIdentity: input.relayIdentity ?? null,
        rawPayload: input.rawPayload ?? null,
        finishedAt: input.finishedAt ?? new Date(),
        updatedAt: new Date(),
      })
      .where(eq(sendDispatchAttempts.id, id))
      .returning();

    return record ?? null;
  },
  findBySendAndAttemptNumber: async (sendId: string, attemptNumber: number) => {
    const [record] = await db
      .select()
      .from(sendDispatchAttempts)
      .where(
        and(
          eq(sendDispatchAttempts.sendId, sendId),
          eq(sendDispatchAttempts.attemptNumber, attemptNumber),
        ),
      )
      .limit(1);

    return record ?? null;
  },
  listForSend: async (sendId: string) =>
    db
      .select()
      .from(sendDispatchAttempts)
      .where(eq(sendDispatchAttempts.sendId, sendId))
      .orderBy(asc(sendDispatchAttempts.attemptNumber)),
});
