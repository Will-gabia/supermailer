import { desc, eq } from 'drizzle-orm';

import type { ManagementConsoleDatabase } from '../db';
import { syncRuns } from '../db/schema';

export const createSyncRunsRepository = (db: ManagementConsoleDatabase) => ({
  create: async (input: {
    id: string;
    sourceKey: string;
    status: string;
    idempotencyKey: string;
    stats?: Record<string, unknown>;
  }) => {
    const [record] = await db
      .insert(syncRuns)
      .values({
        id: input.id,
        sourceKey: input.sourceKey,
        status: input.status,
        idempotencyKey: input.idempotencyKey,
        stats: input.stats ?? null,
      })
      .returning();

    return record;
  },
  findById: async (id: string) => {
    const [record] = await db.select().from(syncRuns).where(eq(syncRuns.id, id)).limit(1);

    return record ?? null;
  },
  list: async () => db.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)),
  complete: async (id: string, input: { status: string; errorSummary?: string | null; stats?: Record<string, unknown> }) => {
    const [record] = await db
      .update(syncRuns)
      .set({
        status: input.status,
        errorSummary: input.errorSummary ?? null,
        stats: input.stats ?? null,
        completedAt: new Date(),
      })
      .where(eq(syncRuns.id, id))
      .returning();

    return record ?? null;
  },
});
