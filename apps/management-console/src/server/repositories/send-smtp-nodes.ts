import { and, asc, eq, isNull } from 'drizzle-orm';

import type { ManagementConsoleDatabase } from '../db';
import { sendDispatchAttempts, sendSmtpNodes, sends } from '../db/schema';

export const createSendSmtpNodesRepository = (
  db: ManagementConsoleDatabase,
) => ({
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
      .where(
        and(
          eq(sendSmtpNodes.id, id),
          eq(sendSmtpNodes.isActive, true),
          isNull(sendSmtpNodes.deletedAt),
        ),
      )
      .limit(1);

    return record ?? null;
  },
  findById: async (id: string) => {
    const [record] = await db
      .select()
      .from(sendSmtpNodes)
      .where(eq(sendSmtpNodes.id, id))
      .limit(1);

    return record ?? null;
  },
  list: async () =>
    db
      .select()
      .from(sendSmtpNodes)
      .where(isNull(sendSmtpNodes.deletedAt))
      .orderBy(asc(sendSmtpNodes.priority), asc(sendSmtpNodes.name)),
  listActive: async () =>
    db
      .select()
      .from(sendSmtpNodes)
      .where(
        and(eq(sendSmtpNodes.isActive, true), isNull(sendSmtpNodes.deletedAt)),
      )
      .orderBy(asc(sendSmtpNodes.priority), asc(sendSmtpNodes.name)),
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
  hasHistoricalReferences: async (id: string) => {
    const [sendRecord] = await db
      .select({ id: sends.id })
      .from(sends)
      .where(eq(sends.sendSmtpNodeId, id))
      .limit(1);

    if (sendRecord) {
      return true;
    }

    const [attemptRecord] = await db
      .select({ id: sendDispatchAttempts.id })
      .from(sendDispatchAttempts)
      .where(eq(sendDispatchAttempts.sendSmtpNodeId, id))
      .limit(1);

    return Boolean(attemptRecord);
  },
  tombstoneById: async (id: string, deletedAt = new Date()) => {
    const [record] = await db
      .update(sendSmtpNodes)
      .set({
        isActive: false,
        deletedAt,
        updatedAt: deletedAt,
      })
      .where(eq(sendSmtpNodes.id, id))
      .returning({ id: sendSmtpNodes.id });

    return Boolean(record);
  },
  deleteById: async (id: string) => {
    const [record] = await db
      .delete(sendSmtpNodes)
      .where(eq(sendSmtpNodes.id, id))
      .returning({ id: sendSmtpNodes.id });

    return Boolean(record);
  },
});
