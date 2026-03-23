import { eq } from 'drizzle-orm';

import type { ManagementConsoleDatabase } from '../db';
import { syncRunRecords } from '../db/schema';

export const createSyncRunRecordsRepository = (
  db: ManagementConsoleDatabase,
) => ({
  create: async (input: {
    id: string;
    syncRunId: string;
    subscriberId?: string | null;
    externalId?: string | null;
    email?: string | null;
    normalizedEmail?: string | null;
    status: string;
    errorMessage?: string | null;
    payload?: Record<string, unknown> | null;
  }) => {
    const [record] = await db
      .insert(syncRunRecords)
      .values({
        id: input.id,
        syncRunId: input.syncRunId,
        subscriberId: input.subscriberId ?? null,
        externalId: input.externalId ?? null,
        email: input.email ?? null,
        normalizedEmail: input.normalizedEmail ?? null,
        status: input.status,
        errorMessage: input.errorMessage ?? null,
        payload: input.payload ?? null,
      })
      .returning();

    return record;
  },
  listForRun: async (syncRunId: string) =>
    db
      .select()
      .from(syncRunRecords)
      .where(eq(syncRunRecords.syncRunId, syncRunId)),
  detachSubscriber: async (subscriberId: string) => {
    await db
      .update(syncRunRecords)
      .set({ subscriberId: null })
      .where(eq(syncRunRecords.subscriberId, subscriberId));
  },
});
