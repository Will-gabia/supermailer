import { and, asc, eq } from 'drizzle-orm';

import type { ManagementConsoleDatabase } from '../db';
import { sendSmtpNodes } from '../db/schema';

export const createSendSmtpNodesRepository = (db: ManagementConsoleDatabase) => ({
  create: async (input: {
    id: string;
    name: string;
    host: string;
    port: number;
    username?: string | null;
    passwordSecretRef?: string | null;
    isActive?: boolean;
    priority?: number;
  }) => {
    const [record] = await db
      .insert(sendSmtpNodes)
      .values({
        id: input.id,
        name: input.name,
        host: input.host,
        port: input.port,
        username: input.username ?? null,
        passwordSecretRef: input.passwordSecretRef ?? null,
        isActive: input.isActive ?? true,
        priority: input.priority ?? 100,
      })
      .returning();

    return record;
  },
  findActiveById: async (id: string) => {
    const [record] = await db
      .select()
      .from(sendSmtpNodes)
      .where(and(eq(sendSmtpNodes.id, id), eq(sendSmtpNodes.isActive, true)))
      .limit(1);

    return record ?? null;
  },
  findById: async (id: string) => {
    const [record] = await db.select().from(sendSmtpNodes).where(eq(sendSmtpNodes.id, id)).limit(1);

    return record ?? null;
  },
  list: async () => db.select().from(sendSmtpNodes).orderBy(asc(sendSmtpNodes.priority), asc(sendSmtpNodes.name)),
  listActive: async () =>
    db.select().from(sendSmtpNodes).where(eq(sendSmtpNodes.isActive, true)).orderBy(asc(sendSmtpNodes.priority), asc(sendSmtpNodes.name)),
  update: async (
    id: string,
    input: {
      name?: string;
      host?: string;
      port?: number;
      username?: string | null;
      passwordSecretRef?: string | null;
      isActive?: boolean;
      priority?: number;
    },
  ) => {
    const [record] = await db
      .update(sendSmtpNodes)
      .set({
        name: input.name,
        host: input.host,
        port: input.port,
        username: input.username,
        passwordSecretRef: input.passwordSecretRef,
        isActive: input.isActive,
        priority: input.priority,
        updatedAt: new Date(),
      })
      .where(eq(sendSmtpNodes.id, id))
      .returning();

    return record ?? null;
  },
});
