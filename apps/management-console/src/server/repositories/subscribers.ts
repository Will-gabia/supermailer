import { desc, eq, or, and } from 'drizzle-orm';

import { normalizeEmailAddress } from '@supermailer/contracts';

import type { ManagementConsoleDatabase } from '../db';
import { subscribers } from '../db/schema';

export const createSubscribersRepository = (db: ManagementConsoleDatabase) => ({
  create: async (input: {
    id: string;
    email: string;
    sourceKey?: string | null;
    externalId?: string | null;
    displayName?: string | null;
    metadata?: Record<string, unknown>;
    unsubscribedAt?: Date | null;
    lastSyncedAt?: Date | null;
  }) => {
    const [record] = await db
      .insert(subscribers)
      .values({
        id: input.id,
        email: normalizeEmailAddress(input.email),
        sourceKey: input.sourceKey ?? null,
        externalId: input.externalId ?? null,
        displayName: input.displayName ?? null,
        status: input.unsubscribedAt ? 'unsubscribed' : 'active',
        metadata: input.metadata ?? null,
        unsubscribedAt: input.unsubscribedAt ?? null,
        lastSyncedAt: input.lastSyncedAt ?? null,
      })
      .returning();

    return record;
  },
  update: async (
    id: string,
    input: {
      email?: string;
      sourceKey?: string | null;
      externalId?: string | null;
      displayName?: string | null;
      metadata?: Record<string, unknown> | null;
      unsubscribedAt?: Date | null;
      lastSyncedAt?: Date | null;
    },
  ) => {
    const [record] = await db
      .update(subscribers)
      .set({
        email: input.email ? normalizeEmailAddress(input.email) : undefined,
        sourceKey: input.sourceKey,
        externalId: input.externalId,
        displayName: input.displayName,
        metadata: input.metadata,
        unsubscribedAt: input.unsubscribedAt,
        lastSyncedAt: input.lastSyncedAt,
        status:
          input.unsubscribedAt === undefined
            ? undefined
            : input.unsubscribedAt
              ? 'unsubscribed'
              : 'active',
        updatedAt: new Date(),
      })
      .where(eq(subscribers.id, id))
      .returning();

    return record ?? null;
  },
  findById: async (id: string) => {
    const [record] = await db
      .select()
      .from(subscribers)
      .where(eq(subscribers.id, id))
      .limit(1);

    return record ?? null;
  },
  findByEmail: async (email: string) => {
    const [record] = await db
      .select()
      .from(subscribers)
      .where(eq(subscribers.email, normalizeEmailAddress(email)))
      .limit(1);

    return record ?? null;
  },
  findBySourceAndExternalId: async (sourceKey: string, externalId: string) => {
    const [record] = await db
      .select()
      .from(subscribers)
      .where(
        and(
          eq(subscribers.sourceKey, sourceKey),
          eq(subscribers.externalId, externalId),
        ),
      )
      .limit(1);

    return record ?? null;
  },
  upsertFromSync: async (input: {
    id: string;
    email: string;
    sourceKey: string;
    externalId?: string | null;
    displayName?: string | null;
    metadata?: Record<string, unknown>;
    unsubscribedAt?: Date | null;
    lastSyncedAt: Date;
  }) => {
    const normalizedEmail = normalizeEmailAddress(input.email);
    const existing = input.externalId
      ? await db
          .select()
          .from(subscribers)
          .where(
            or(
              and(
                eq(subscribers.sourceKey, input.sourceKey),
                eq(subscribers.externalId, input.externalId),
              ),
              eq(subscribers.email, normalizedEmail),
            ),
          )
          .limit(1)
      : await db
          .select()
          .from(subscribers)
          .where(eq(subscribers.email, normalizedEmail))
          .limit(1);

    const current = existing[0];

    if (!current) {
      const created = await db
        .insert(subscribers)
        .values({
          id: input.id,
          email: normalizedEmail,
          sourceKey: input.sourceKey,
          externalId: input.externalId ?? null,
          displayName: input.displayName ?? null,
          status: input.unsubscribedAt ? 'unsubscribed' : 'active',
          metadata: input.metadata ?? null,
          unsubscribedAt: input.unsubscribedAt ?? null,
          lastSyncedAt: input.lastSyncedAt,
        })
        .returning();

      return { record: created[0], operation: 'created' as const };
    }

    const [updated] = await db
      .update(subscribers)
      .set({
        email: normalizedEmail,
        sourceKey: input.sourceKey,
        externalId: input.externalId ?? null,
        displayName: input.displayName ?? null,
        metadata: input.metadata ?? null,
        unsubscribedAt: input.unsubscribedAt ?? null,
        lastSyncedAt: input.lastSyncedAt,
        status: input.unsubscribedAt ? 'unsubscribed' : 'active',
        updatedAt: new Date(),
      })
      .where(eq(subscribers.id, current.id))
      .returning();

    return { record: updated, operation: 'updated' as const };
  },
  list: async () =>
    db.select().from(subscribers).orderBy(desc(subscribers.createdAt)),
  delete: async (id: string) => {
    const [record] = await db
      .delete(subscribers)
      .where(eq(subscribers.id, id))
      .returning();

    return record ?? null;
  },
});
