import { eq } from 'drizzle-orm';

import type { ManagementConsoleDatabase } from '../db';
import { templates } from '../db/schema';

export const createTemplatesRepository = (db: ManagementConsoleDatabase) => ({
  create: async (input: {
    id: string;
    name: string;
    subject: string;
    html: string;
    textContent?: string | null;
    variables?: string[];
  }) => {
    const [record] = await db
      .insert(templates)
      .values({
        id: input.id,
        name: input.name,
        subject: input.subject,
        html: input.html,
        textContent: input.textContent ?? null,
        variables: input.variables ?? null,
      })
      .returning();

    return record;
  },
  findById: async (id: string) => {
    const [record] = await db.select().from(templates).where(eq(templates.id, id)).limit(1);

    return record ?? null;
  },
  list: async () => db.select().from(templates),
  update: async (
    id: string,
    input: {
      name?: string;
      subject?: string;
      html?: string;
      textContent?: string | null;
      variables?: string[];
    },
  ) => {
    const [record] = await db
      .update(templates)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(templates.id, id))
      .returning();

    return record ?? null;
  },
  delete: async (id: string) => {
    await db.delete(templates).where(eq(templates.id, id));
  },
});
