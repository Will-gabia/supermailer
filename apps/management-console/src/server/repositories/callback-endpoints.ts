import { and, asc, eq } from 'drizzle-orm';

import type { ManagementConsoleDatabase } from '../db';
import { callbackEndpoints } from '../db/schema';

export const createCallbackEndpointsRepository = (
  db: ManagementConsoleDatabase,
) => ({
  create: async (input: {
    id: string;
    apiKeyId: string;
    label: string;
    targetUrl: string;
    signingSecret: string;
    isActive?: boolean;
  }) => {
    const [record] = await db
      .insert(callbackEndpoints)
      .values({
        id: input.id,
        apiKeyId: input.apiKeyId,
        label: input.label,
        targetUrl: input.targetUrl,
        signingSecret: input.signingSecret,
        isActive: input.isActive ?? true,
      })
      .returning();

    return record;
  },
  listByApiKeyId: async (apiKeyId: string) =>
    db
      .select()
      .from(callbackEndpoints)
      .where(eq(callbackEndpoints.apiKeyId, apiKeyId))
      .orderBy(asc(callbackEndpoints.createdAt), asc(callbackEndpoints.id)),
  findByIdForApiKey: async (id: string, apiKeyId: string) => {
    const [record] = await db
      .select()
      .from(callbackEndpoints)
      .where(
        and(
          eq(callbackEndpoints.id, id),
          eq(callbackEndpoints.apiKeyId, apiKeyId),
        ),
      )
      .limit(1);

    return record ?? null;
  },
  findById: async (id: string) => {
    const [record] = await db
      .select()
      .from(callbackEndpoints)
      .where(eq(callbackEndpoints.id, id))
      .limit(1);

    return record ?? null;
  },
});
