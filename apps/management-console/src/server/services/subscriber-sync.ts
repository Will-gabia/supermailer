import { createSubscriberDto, createUlid, normalizeEmailAddress } from '@supermailer/contracts';

import type { ManagementConsoleAppContext } from '../app-context';

type SyncSubscriberRecord = {
  externalId?: string | null;
  email: string;
  displayName?: string | null;
  unsubscribed?: boolean;
  metadata?: Record<string, unknown>;
};

type SyncSourcePayload = {
  subscribers: SyncSubscriberRecord[];
};

const parseSyncResponse = (payload: unknown): SyncSourcePayload => {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { subscribers?: unknown }).subscribers)) {
    throw new Error('Sync source must return { subscribers: [] }');
  }

  return payload as SyncSourcePayload;
};

const sanitizeHeaders = (headers?: Record<string, string>): Record<string, string> => {
  if (!headers) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(headers).filter(([key, value]) => key.trim().length > 0 && typeof value === 'string'),
  );
};

export const runSubscriberSync = async (
  appContext: ManagementConsoleAppContext,
  input: {
    sourceKey: string;
    endpointUrl: string;
    headers?: Record<string, string>;
  },
) => {
  const sourceKey = input.sourceKey.trim();
  const endpointUrl = input.endpointUrl.trim();

  if (!sourceKey) {
    throw new Error('sourceKey is required');
  }

  if (!endpointUrl) {
    throw new Error('endpointUrl is required');
  }

  const syncRun = await appContext.repositories.syncRuns.create({
    id: createUlid(),
    sourceKey,
    status: 'running',
    idempotencyKey: createUlid(),
    stats: {
      processed: 0,
      created: 0,
      updated: 0,
      failed: 0,
    },
  });

  try {
    const response = await fetch(endpointUrl, {
      method: 'GET',
      headers: sanitizeHeaders(input.headers),
    });

    if (!response.ok) {
      throw new Error(`Sync source request failed with ${response.status}`);
    }

    const parsed = parseSyncResponse(await response.json());
    const startedAt = new Date();
    const stats = {
      processed: 0,
      created: 0,
      updated: 0,
      failed: 0,
    };

    for (const rawRecord of parsed.subscribers) {
      stats.processed += 1;

      try {
        const subscriber = createSubscriberDto({
          email: rawRecord.email,
          externalId: rawRecord.externalId ?? null,
          isUnsubscribed: rawRecord.unsubscribed ?? false,
        });

        const result = await appContext.repositories.subscribers.upsertFromSync({
          id: createUlid(),
          email: subscriber.email,
          sourceKey,
          externalId: rawRecord.externalId ?? null,
          displayName: rawRecord.displayName ?? null,
          metadata: rawRecord.metadata,
          unsubscribedAt: rawRecord.unsubscribed ? startedAt : null,
          lastSyncedAt: startedAt,
        });

        stats[result.operation] += 1;

        await appContext.repositories.syncRunRecords.create({
          id: createUlid(),
          syncRunId: syncRun.id,
          subscriberId: result.record.id,
          externalId: rawRecord.externalId ?? null,
          email: rawRecord.email,
          normalizedEmail: normalizeEmailAddress(rawRecord.email),
          status: result.operation,
          payload: rawRecord.metadata ?? null,
        });
      } catch (error) {
        stats.failed += 1;

        await appContext.repositories.syncRunRecords.create({
          id: createUlid(),
          syncRunId: syncRun.id,
          externalId: rawRecord.externalId ?? null,
          email: typeof rawRecord.email === 'string' ? rawRecord.email : null,
          normalizedEmail: typeof rawRecord.email === 'string' ? rawRecord.email.trim().toLowerCase() : null,
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'Sync record failed',
          payload: rawRecord.metadata ?? null,
        });
      }
    }

    const completedRun = await appContext.repositories.syncRuns.complete(syncRun.id, {
      status: stats.failed > 0 ? 'completed_with_errors' : 'completed',
      stats,
    });

    return {
      syncRun: completedRun ?? syncRun,
      records: await appContext.repositories.syncRunRecords.listForRun(syncRun.id),
      stats,
    };
  } catch (error) {
    const completedRun = await appContext.repositories.syncRuns.complete(syncRun.id, {
      status: 'failed',
      errorSummary: error instanceof Error ? error.message : 'Sync failed',
      stats: {
        processed: 0,
        created: 0,
        updated: 0,
        failed: 1,
      },
    });

    return {
      syncRun: completedRun ?? syncRun,
      records: await appContext.repositories.syncRunRecords.listForRun(syncRun.id),
      stats: {
        processed: 0,
        created: 0,
        updated: 0,
        failed: 1,
      },
    };
  }
};
