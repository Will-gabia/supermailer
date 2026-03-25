import { and, asc, desc, eq, gt, ilike, lt, or } from 'drizzle-orm';

import type { ManagementConsoleDatabase } from '../db';
import { sends } from '../db/schema';

const encodeAdminHistoryCursor = (input: { createdAt: Date; id: string }) =>
  Buffer.from(
    JSON.stringify({ createdAt: input.createdAt.toISOString(), id: input.id }),
    'utf8',
  ).toString('base64url');

const decodeAdminHistoryCursor = (
  cursor: string | null,
): { createdAt: Date; id: string } | null => {
  if (!cursor) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as { createdAt?: unknown; id?: unknown };

    if (typeof parsed.createdAt !== 'string' || typeof parsed.id !== 'string') {
      return null;
    }

    const createdAt = new Date(parsed.createdAt);

    if (Number.isNaN(createdAt.getTime())) {
      return null;
    }

    return {
      createdAt,
      id: parsed.id,
    };
  } catch {
    return null;
  }
};

export const createSendsRepository = (db: ManagementConsoleDatabase) => ({
  create: async (input: {
    id: string;
    kind: string;
    recipientEmail: string;
    subjectSnapshot: string;
    htmlSnapshot: string;
    textSnapshot?: string | null;
    emlSnapshot?: string | null;
    audienceProvenance?: {
      manual: boolean;
      groups: Array<{ id: string; name: string }>;
    } | null;
    status: string;
    apiKeyId?: string | null;
    templateId?: string | null;
    callbackEndpointId?: string | null;
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
        emlSnapshot: input.emlSnapshot ?? null,
        audienceProvenance: input.audienceProvenance ?? null,
        status: input.status,
        apiKeyId: input.apiKeyId ?? null,
        templateId: input.templateId ?? null,
        callbackEndpointId: input.callbackEndpointId ?? null,
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
  listAdminHistory: async (input: {
    search: string;
    limit: number;
    cursor: string | null;
  }) => {
    const normalizedLimit = Math.max(1, Math.min(input.limit, 100));
    const normalizedSearch = input.search.trim();
    const cursor = decodeAdminHistoryCursor(input.cursor);

    const filters = [
      normalizedSearch
        ? ilike(sends.recipientEmail, `%${normalizedSearch}%`)
        : undefined,
      cursor
        ? or(
            lt(sends.createdAt, cursor.createdAt),
            and(eq(sends.createdAt, cursor.createdAt), lt(sends.id, cursor.id)),
          )
        : undefined,
    ].filter((value): value is NonNullable<typeof value> => Boolean(value));

    const records = await db
      .select()
      .from(sends)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(sends.createdAt), desc(sends.id))
      .limit(normalizedLimit + 1);

    const hasMore = records.length > normalizedLimit;
    const data = hasMore ? records.slice(0, normalizedLimit) : records;
    const lastRecord = data.at(-1) ?? null;

    return {
      data,
      pageInfo: {
        limit: normalizedLimit,
        hasMore,
        nextCursor:
          hasMore && lastRecord
            ? encodeAdminHistoryCursor({
                createdAt: lastRecord.createdAt,
                id: lastRecord.id,
              })
            : null,
      },
    };
  },
  listResultsUpdatedSince: async (input: {
    updatedSince: Date;
    limit: number;
    apiKeyId: string;
  }) =>
    db
      .select({
        id: sends.id,
        kind: sends.kind,
        recipientEmail: sends.recipientEmail,
        status: sends.status,
        updatedAt: sends.updatedAt,
        callbackEndpointId: sends.callbackEndpointId,
      })
      .from(sends)
      .where(
        and(
          eq(sends.apiKeyId, input.apiKeyId),
          gt(sends.updatedAt, input.updatedSince),
        ),
      )
      .orderBy(asc(sends.updatedAt), asc(sends.id))
      .limit(input.limit),
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
