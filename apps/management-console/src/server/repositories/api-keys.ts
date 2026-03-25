import { eq } from 'drizzle-orm';

import type { ManagementConsoleDatabase } from '../db';
import { apiKeys } from '../db/schema';

export const createApiKeysRepository = (db: ManagementConsoleDatabase) => ({
  create: async (input: {
    id: string;
    label: string;
    keyPrefix: string;
    keyHash: string;
    scopes: string[];
  }) => {
    const [record] = await db
      .insert(apiKeys)
      .values({
        id: input.id,
        label: input.label,
        keyPrefix: input.keyPrefix,
        keyHash: input.keyHash,
        scopes: input.scopes,
      })
      .returning();

    return record;
  },
  findByKeyHash: async (keyHash: string) => {
    const [record] = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.keyHash, keyHash))
      .limit(1);

    return record ?? null;
  },
  findByKeyPrefix: async (keyPrefix: string) => {
    const [record] = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.keyPrefix, keyPrefix))
      .limit(1);

    return record ?? null;
  },
  list: async () => db.select().from(apiKeys),
  markUsed: async (id: string, lastUsedAt = new Date()) => {
    const [record] = await db
      .update(apiKeys)
      .set({ lastUsedAt })
      .where(eq(apiKeys.id, id))
      .returning();

    return record ?? null;
  },
  revoke: async (id: string, revokedAt = new Date()) => {
    const [record] = await db
      .update(apiKeys)
      .set({ revokedAt })
      .where(eq(apiKeys.id, id))
      .returning();

    return record ?? null;
  },
  deleteById: async (id: string) => {
    const [record] = await db
      .delete(apiKeys)
      .where(eq(apiKeys.id, id))
      .returning({ id: apiKeys.id });

    return Boolean(record);
  },
});
