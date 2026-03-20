import { eq } from 'drizzle-orm';

import type { ManagementConsoleDatabase } from '../db';
import { adminUsers } from '../db/schema';

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export const createAdminUsersRepository = (db: ManagementConsoleDatabase) => ({
  create: async (input: {
    id: string;
    email: string;
    passwordHash: string;
  }) => {
    const [record] = await db
      .insert(adminUsers)
      .values({
        id: input.id,
        email: normalizeEmail(input.email),
        passwordHash: input.passwordHash,
      })
      .returning();

    return record;
  },
  findByEmail: async (email: string) => {
    const [record] = await db.select().from(adminUsers).where(eq(adminUsers.email, normalizeEmail(email))).limit(1);

    return record ?? null;
  },
  findById: async (id: string) => {
    const [record] = await db.select().from(adminUsers).where(eq(adminUsers.id, id)).limit(1);

    return record ?? null;
  },
  touchLastLogin: async (id: string, lastLoginAt = new Date()) => {
    const [record] = await db
      .update(adminUsers)
      .set({
        lastLoginAt,
        updatedAt: new Date(),
      })
      .where(eq(adminUsers.id, id))
      .returning();

    return record ?? null;
  },
});
