import { asc, eq } from 'drizzle-orm';

import type { ManagementConsoleDatabase } from '../db';
import { subscriberGroups } from '../db/schema';

export const createSubscriberGroupsRepository = (
  db: ManagementConsoleDatabase,
) => ({
  create: async (input: { id: string; name: string }) => {
    const [record] = await db
      .insert(subscriberGroups)
      .values({
        id: input.id,
        name: input.name,
      })
      .returning();

    return record;
  },
  list: async () =>
    db
      .select()
      .from(subscriberGroups)
      .orderBy(asc(subscriberGroups.name), asc(subscriberGroups.id)),
  findById: async (id: string) => {
    const [record] = await db
      .select()
      .from(subscriberGroups)
      .where(eq(subscriberGroups.id, id))
      .limit(1);

    return record ?? null;
  },
  update: async (id: string, input: { name?: string }) => {
    const [record] = await db
      .update(subscriberGroups)
      .set({
        name: input.name,
        updatedAt: new Date(),
      })
      .where(eq(subscriberGroups.id, id))
      .returning();

    return record ?? null;
  },
  delete: async (id: string) => {
    await db.delete(subscriberGroups).where(eq(subscriberGroups.id, id));
  },
});
