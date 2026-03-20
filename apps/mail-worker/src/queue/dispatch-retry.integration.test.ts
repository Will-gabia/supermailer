import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';

import {
  startPostgresContainer,
  startRedisContainer,
  waitFor,
} from '@supermailer/testing';
import { SEND_DISPATCH_RETRY_DELAYS_MS } from '@supermailer/contracts';

import { createRedisConnectionOptions } from './connection';
import { createSendDispatchQueue, enqueueSendDispatchJob } from './primitives';
import {
  createSendDispatchWorker,
  createWorkerPrefix,
} from './send-dispatch-worker';
import {
  createWorkerDatabasePool,
  runWorkerTestMigrations,
} from '../persistence/database';

type Started = {
  stop: () => Promise<void>;
  databaseUrl: string;
  redisUrl: string;
};

const startInfra = async (): Promise<Started> => {
  const [postgres, redis] = await Promise.all([
    startPostgresContainer(),
    startRedisContainer(),
  ]);

  await waitFor(async () => {
    const dbClient = new Client({
      connectionString: postgres.connectionString,
    });
    await dbClient.connect();
    await dbClient.end();
  });

  const pool = createWorkerDatabasePool(postgres.connectionString);
  await runWorkerTestMigrations(pool);
  await pool.query(
    "insert into send_smtp_nodes (id, name, host, port, is_active, priority) values ('node_retry', 'node_retry', 'smtp.retry', 2525, true, 100)",
  );
  await pool.query(
    "insert into routing_rules (id, version, match_type, domain, send_smtp_node_id, priority, is_active) values ('rule_default_retry', 1, 'default', null, 'node_retry', 100, true)",
  );
  await pool.query(
    "insert into sends (id, kind, recipient_email, subject_snapshot, html_snapshot, text_snapshot, status, routing_rule_version, send_smtp_node_id, queue_job_id) values ('01HZYF8SEND000000000000RT', 'individual', 'retry@example.com', 'subject', '<p>retry</p>', 'retry', 'queued', 1, 'node_retry', 'send-01HZYF8SEND000000000000RT')",
  );
  await pool.end();

  return {
    databaseUrl: postgres.connectionString,
    redisUrl: redis.redisUrl,
    stop: async () => {
      await postgres.container.stop();
      await redis.container.stop();
    },
  };
};

describe('dispatch-retry integration', () => {
  let started: Started | null = null;

  beforeAll(async () => {
    started = await startInfra();
  });

  afterAll(async () => {
    await started?.stop();
  });

  it('retries transient failures on fixed schedule and ends failed_transient after exhaustion', async () => {
    if (!started) {
      throw new Error('infra not ready');
    }

    let invocations = 0;
    const redisPrefix = createWorkerPrefix();
    const queue = createSendDispatchQueue({
      connection: createRedisConnectionOptions(started.redisUrl),
      prefix: redisPrefix,
    });
    const worker = createSendDispatchWorker({
      redisConnection: createRedisConnectionOptions(started.redisUrl),
      redisPrefix,
      databaseUrl: started.databaseUrl,
      retryDelaysMs: [5, 5, 5],
      transport: {
        dispatch: async () => {
          invocations += 1;
          return {
            result: 'failed_transient',
            smtpCode: '421',
            enhancedCode: '4.7.0',
            reason: '421 4.7.0 temporary failure',
            rawPayload: {
              code: 421,
              enhanced: '4.7.0',
            },
          };
        },
      },
    });

    try {
      const enqueued = await enqueueSendDispatchJob(queue, {
        sendId: '01HZYF8SEND000000000000RT',
      });

      expect(enqueued.id).toBe('send-01HZYF8SEND000000000000RT');

      await waitFor(
        async () => {
          expect(invocations).toBe(4);
        },
        { attempts: 200, delayMs: 10 },
      );

      const pool = createWorkerDatabasePool(started.databaseUrl);
      const [sendRows, attemptsRows, deferredRows, failedRows] =
        await Promise.all([
          pool.query<{ status: string }>(
            "select status from sends where id = '01HZYF8SEND000000000000RT'",
          ),
          pool.query<{
            attempt_number: number;
            status: string;
            smtp_code: string | null;
          }>(
            "select attempt_number, status, smtp_code from send_dispatch_attempts where send_id = '01HZYF8SEND000000000000RT' order by attempt_number asc",
          ),
          pool.query<{
            event_type: string;
            raw_payload: { retryInMs?: number } | null;
          }>(
            "select event_type, raw_payload from delivery_events where send_id = '01HZYF8SEND000000000000RT' and event_type = 'deferred' order by occurred_at asc",
          ),
          pool.query<{ event_type: string }>(
            "select event_type from delivery_events where send_id = '01HZYF8SEND000000000000RT' and event_type = 'failed_transient'",
          ),
        ]);
      await pool.end();

      expect(sendRows.rows[0]?.status).toBe('failed_transient');
      expect(attemptsRows.rows).toHaveLength(4);
      expect(
        attemptsRows.rows.every((row) => row.status === 'failed_transient'),
      ).toBe(true);
      expect(deferredRows.rows).toHaveLength(3);
      expect(
        deferredRows.rows.map((row) => row.raw_payload?.retryInMs ?? null),
      ).toEqual([5, 5, 5]);
      expect(failedRows.rows).toHaveLength(1);
      expect(SEND_DISPATCH_RETRY_DELAYS_MS).toEqual([60_000, 300_000, 900_000]);
    } finally {
      await worker.close();
      await queue.obliterate({ force: true });
      await queue.close();
    }
  });

  it('does not retry permanent failures', async () => {
    if (!started) {
      throw new Error('infra not ready');
    }

    const ready = started;

    const pool = createWorkerDatabasePool(ready.databaseUrl);
    await pool.query(
      "insert into sends (id, kind, recipient_email, subject_snapshot, html_snapshot, text_snapshot, status, routing_rule_version, send_smtp_node_id, queue_job_id) values ('01HZYF8SEND000000000000PM', 'individual', 'perm@example.com', 'subject', '<p>perm</p>', 'perm', 'queued', 1, 'node_retry', 'send-01HZYF8SEND000000000000PM')",
    );
    await pool.end();

    let invocations = 0;
    const redisPrefix = createWorkerPrefix();
    const queue = createSendDispatchQueue({
      connection: createRedisConnectionOptions(ready.redisUrl),
      prefix: redisPrefix,
    });
    const worker = createSendDispatchWorker({
      redisConnection: createRedisConnectionOptions(ready.redisUrl),
      redisPrefix,
      databaseUrl: ready.databaseUrl,
      retryDelaysMs: [5, 5, 5],
      transport: {
        dispatch: async () => {
          invocations += 1;
          return {
            result: 'failed_permanent',
            smtpCode: '550',
            enhancedCode: '5.1.1',
            reason: '550 5.1.1 mailbox unavailable',
            rawPayload: {
              code: 550,
            },
          };
        },
      },
    });

    try {
      await enqueueSendDispatchJob(queue, {
        sendId: '01HZYF8SEND000000000000PM',
      });

      await waitFor(async () => {
        const checkPool = createWorkerDatabasePool(ready.databaseUrl);
        const send = await checkPool.query<{ status: string }>(
          "select status from sends where id = '01HZYF8SEND000000000000PM'",
        );
        await checkPool.end();
        expect(send.rows[0]?.status).toBe('failed_permanent');
      });

      const assertPool = createWorkerDatabasePool(ready.databaseUrl);
      const attempts = await assertPool.query<{ status: string }>(
        "select status from send_dispatch_attempts where send_id = '01HZYF8SEND000000000000PM'",
      );
      await assertPool.end();

      expect(invocations).toBe(1);
      expect(attempts.rows).toHaveLength(1);
      expect(attempts.rows[0]?.status).toBe('failed_permanent');
    } finally {
      await worker.close();
      await queue.obliterate({ force: true });
      await queue.close();
    }
  });
});
