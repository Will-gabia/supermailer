import { desc, eq } from 'drizzle-orm';

import type { ManagementConsoleDatabase } from '../db';
import { auditLogs } from '../db/schema';

export const createAuditLogsRepository = (db: ManagementConsoleDatabase) => ({
  append: async (input: {
    id: string;
    eventType: string;
    actorType: string;
    actorId?: string | null;
    actorIdentifier?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    metadata?: Record<string, unknown> | null;
    occurredAt?: Date;
  }) => {
    const [record] = await db
      .insert(auditLogs)
      .values({
        id: input.id,
        eventType: input.eventType,
        actorType: input.actorType,
        actorId: input.actorId ?? null,
        actorIdentifier: input.actorIdentifier ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        metadata: input.metadata ?? null,
        occurredAt: input.occurredAt ?? new Date(),
      })
      .returning();

    return record;
  },
  listByEventType: async (eventType: string) =>
    db.select().from(auditLogs).where(eq(auditLogs.eventType, eventType)).orderBy(desc(auditLogs.occurredAt), desc(auditLogs.id)),
  listAll: async () => db.select().from(auditLogs).orderBy(desc(auditLogs.occurredAt), desc(auditLogs.id)),
});
