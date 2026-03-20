import { and, eq, gt, isNull } from 'drizzle-orm';

import type { ManagementConsoleDatabase } from '../db';
import { adminSessions, adminUsers } from '../db/schema';

export const createAdminSessionsRepository = (db: ManagementConsoleDatabase) => ({
  create: async (input: {
    id: string;
    adminUserId: string;
    sessionHash: string;
    expiresAt: Date;
  }) => {
    const [record] = await db
      .insert(adminSessions)
      .values({
        id: input.id,
        adminUserId: input.adminUserId,
        sessionHash: input.sessionHash,
        expiresAt: input.expiresAt,
      })
      .returning();

    return record;
  },
  findActiveByHash: async (sessionHash: string, now = new Date()) => {
    const [record] = await db
      .select({
        session: adminSessions,
        adminUser: adminUsers,
      })
      .from(adminSessions)
      .innerJoin(adminUsers, eq(adminSessions.adminUserId, adminUsers.id))
      .where(and(eq(adminSessions.sessionHash, sessionHash), isNull(adminSessions.revokedAt), gt(adminSessions.expiresAt, now)))
      .limit(1);

    return record ?? null;
  },
  touchLastSeen: async (id: string, lastSeenAt = new Date()) => {
    const [record] = await db.update(adminSessions).set({ lastSeenAt }).where(eq(adminSessions.id, id)).returning();

    return record ?? null;
  },
  revoke: async (id: string, revokedAt = new Date()) => {
    const [record] = await db.update(adminSessions).set({ revokedAt }).where(eq(adminSessions.id, id)).returning();

    return record ?? null;
  },
});
