import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';

import {
  startPostgresContainer,
  startRedisContainer,
  waitFor,
} from '@supermailer/testing';

import { createSendDispatchQueue, enqueueSendDispatchJob } from './primitives';
import { createRedisConnectionOptions } from './connection';
import {
  createSendDispatchWorker,
  createWorkerPrefix,
} from './send-dispatch-worker';
import {
  createWorkerDatabasePool,
  runWorkerTestMigrations,
} from '../persistence/database';

type DeliveryEventRow = {
  event_type: string;
};

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
    "insert into send_smtp_nodes (id, name, host, port, is_active, priority) values ('node_1', 'node_1', 'smtp.local', 2525, true, 100)",
  );
  await pool.query(
    "insert into routing_rules (id, version, match_type, domain, send_smtp_node_id, priority, is_active) values ('rule_default_1', 1, 'default', null, 'node_1', 100, true)",
  );
  await pool.query(
    "insert into sends (id, kind, recipient_email, subject_snapshot, html_snapshot, text_snapshot, status, routing_rule_version, send_smtp_node_id, queue_job_id) values ('01HZYF8SEND000000000000AA', 'individual', 'alice@example.com', 'subject', '<p>hello</p>', 'hello', 'queued', 1, 'node_1', 'send-01HZYF8SEND000000000000AA')",
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

describe('dispatch-success integration', () => {
  let started: Started | null = null;

  beforeAll(async () => {
    started = await startInfra();
  });

  afterAll(async () => {
    await started?.stop();
  });

  it('dispatches send, records acceptance metadata, and keeps terminal delivery unresolved', async () => {
    if (!started) {
      throw new Error('infra not ready');
    }

    const ready = started;

    const redisPrefix = createWorkerPrefix();
    const queue = createSendDispatchQueue({
      connection: createRedisConnectionOptions(ready.redisUrl),
      prefix: redisPrefix,
    });
    const worker = createSendDispatchWorker({
      redisConnection: createRedisConnectionOptions(ready.redisUrl),
      redisPrefix,
      databaseUrl: ready.databaseUrl,
      transport: {
        dispatch: async (request) => ({
          result: 'accepted',
          smtpCode: '250',
          enhancedCode: '2.0.0',
          response: `250 2.0.0 queued as QID123 from ${request.smtpNode.id}`,
          postfixQueueId: 'QID123',
          relayIdentity: `${request.smtpNode.host}:${request.smtpNode.port}`,
          rawPayload: {
            accepted: true,
          },
        }),
      },
    });

    try {
      await enqueueSendDispatchJob(queue, {
        sendId: '01HZYF8SEND000000000000AA',
      });
      await waitFor(async () => {
        const pool = createWorkerDatabasePool(ready.databaseUrl);
        const result = await pool.query(
          "select status, dispatch_accepted_postfix_queue_id as queue_id from sends where id = '01HZYF8SEND000000000000AA'",
        );
        await pool.end();

        expect(result.rows[0]?.status).toBe('accepted_by_mta');
        expect(result.rows[0]?.queue_id).toBe('QID123');
      });

      const pool = createWorkerDatabasePool(ready.databaseUrl);
      const [attempts, events] = await Promise.all([
        pool.query(
          "select status, queue_id from send_dispatch_attempts where send_id = '01HZYF8SEND000000000000AA' order by attempt_number asc",
        ),
        pool.query<DeliveryEventRow>(
          "select event_type from delivery_events where send_id = '01HZYF8SEND000000000000AA' order by occurred_at asc",
        ),
      ]);
      await pool.end();

      expect(attempts.rows).toHaveLength(1);
      expect(attempts.rows[0]?.status).toBe('accepted');
      expect(events.rows.map((row) => row.event_type)).toContain(
        'accepted_by_mta',
      );
      expect(events.rows.map((row) => row.event_type)).not.toContain(
        'delivered',
      );
    } finally {
      await worker.close();
      await queue.obliterate({ force: true });
      await queue.close();
    }
  });
});
