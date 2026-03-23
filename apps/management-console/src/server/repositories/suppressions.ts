import { and, desc, eq, inArray } from 'drizzle-orm';

import { normalizeEmailAddress } from '@supermailer/contracts';

import type { ManagementConsoleDatabase } from '../db';
import { suppressions } from '../db/schema';

export const createSuppressionsRepository = (
  db: ManagementConsoleDatabase,
) => ({
  create: async (input: {
    id: string;
    email: string;
    reason: string;
    sourceEventId?: string | null;
  }) => {
    const existing = await db
      .select()
      .from(suppressions)
      .where(
        and(
          eq(suppressions.email, normalizeEmailAddress(input.email)),
          eq(suppressions.reason, input.reason),
        ),
      )
      .limit(1);

    if (existing[0]) {
      return existing[0];
    }

    const [record] = await db
      .insert(suppressions)
      .values({
        id: input.id,
        email: normalizeEmailAddress(input.email),
        reason: input.reason,
        sourceEventId: input.sourceEventId ?? null,
      })
      .returning();

    return record;
  },
  list: async () =>
    db.select().from(suppressions).orderBy(desc(suppressions.createdAt)),
  listByEmail: async (email: string) =>
    db
      .select()
      .from(suppressions)
      .where(eq(suppressions.email, normalizeEmailAddress(email)))
      .orderBy(desc(suppressions.createdAt)),
  listByEmails: async (emails: string[]) => {
    const normalizedEmails = Array.from(
      new Set(emails.map((email) => normalizeEmailAddress(email))),
    );

    if (normalizedEmails.length === 0) {
      return [];
    }

    return db
      .select()
      .from(suppressions)
      .where(inArray(suppressions.email, normalizedEmails));
  },
  deleteByEmail: async (email: string) => {
    await db
      .delete(suppressions)
      .where(eq(suppressions.email, normalizeEmailAddress(email)));
  },
});
