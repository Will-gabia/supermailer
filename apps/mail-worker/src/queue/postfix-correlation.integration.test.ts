import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { Client } from 'pg';

import {
  startPostgresContainer,
  startRedisContainer,
  waitFor,
} from '@supermailer/testing';

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
    "insert into send_smtp_nodes (id, name, host, port, is_active, priority) values ('node_corr', 'node_corr', 'sendsmtp.local', 2525, true, 100)",
  );
  await pool.query(
    "insert into routing_rules (id, version, match_type, domain, send_smtp_node_id, priority, is_active) values ('rule_default_corr', 1, 'default', null, 'node_corr', 100, true)",
  );
  await pool.query(
    "insert into sends (id, kind, recipient_email, subject_snapshot, html_snapshot, text_snapshot, status, routing_rule_version, send_smtp_node_id, queue_job_id) values ('01HZYF8SEND00000000000C0R', 'individual', 'corr@example.com', 'subject', '<p>corr</p>', 'corr', 'queued', 1, 'node_corr', 'send-01HZYF8SEND00000000000C0R')",
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

describe('postfix-correlation integration', () => {
  let started: Started | null = null;

  beforeAll(async () => {
    started = await startInfra();
  });

  afterAll(async () => {
    await started?.stop();
  });

  it('correlates app send id, postfix queue id, and relay node via persistence plus postfix config plumbing', async () => {
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
          response: '250 2.0.0 queued as C0RRQ1D',
          postfixQueueId: 'C0RRQ1D',
          relayIdentity: `${request.smtpNode.host}:${request.smtpNode.port}`,
          rawPayload: {
            sendId: request.sendId,
            relayNodeId: request.smtpNode.id,
            correlationHeader: 'X-Supermailer-Send-Id',
          },
        }),
      },
    });

    try {
      await enqueueSendDispatchJob(queue, {
        sendId: '01HZYF8SEND00000000000C0R',
      });
      await waitFor(async () => {
        const pool = createWorkerDatabasePool(ready.databaseUrl);
        const row = await pool.query<{ status: string }>(
          "select status from sends where id = '01HZYF8SEND00000000000C0R'",
        );
        await pool.end();
        expect(row.rows[0]?.status).toBe('accepted_by_mta');
      });

      const pool = createWorkerDatabasePool(ready.databaseUrl);
      const [sendRows, attemptRows, eventRows] = await Promise.all([
        pool.query<{
          id: string;
          send_smtp_node_id: string | null;
          dispatch_accepted_relay_node_id: string | null;
          dispatch_accepted_postfix_queue_id: string | null;
          dispatch_accepted_attempt_id: string | null;
        }>(
          "select id, send_smtp_node_id, dispatch_accepted_relay_node_id, dispatch_accepted_postfix_queue_id, dispatch_accepted_attempt_id from sends where id = '01HZYF8SEND00000000000C0R'",
        ),
        pool.query<{
          id: string;
          send_id: string;
          send_smtp_node_id: string;
          queue_id: string | null;
          relay_identity: string | null;
          status: string;
        }>(
          "select id, send_id, send_smtp_node_id, queue_id, relay_identity, status from send_dispatch_attempts where send_id = '01HZYF8SEND00000000000C0R' order by attempt_number asc",
        ),
        pool.query<{
          event_type: string;
          queue_id: string | null;
          relay_identity: string | null;
        }>(
          "select event_type, queue_id, relay_identity from delivery_events where send_id = '01HZYF8SEND00000000000C0R' order by occurred_at asc",
        ),
      ]);
      await pool.end();

      const send = sendRows.rows[0];
      const attempt = attemptRows.rows[0];
      expect(send?.dispatch_accepted_postfix_queue_id).toBe('C0RRQ1D');
      expect(send?.dispatch_accepted_relay_node_id).toBe('node_corr');
      expect(attempt?.queue_id).toBe('C0RRQ1D');
      expect(attempt?.send_smtp_node_id).toBe('node_corr');
      expect(attempt?.relay_identity).toBe('sendsmtp.local:2525');
      expect(send?.dispatch_accepted_attempt_id).toBe(attempt?.id ?? null);
      expect(
        eventRows.rows.some(
          (row) =>
            row.event_type === 'accepted_by_mta' && row.queue_id === 'C0RRQ1D',
        ),
      ).toBe(true);

      const mainCf = await readFile(
        '/Users/will/Jobs/projects/labs/supermailer/infra/postfix/config/main.cf',
        'utf8',
      );
      const headerChecks = await readFile(
        '/Users/will/Jobs/projects/labs/supermailer/infra/postfix/config/header_checks',
        'utf8',
      );
      const correlateScript = await readFile(
        '/Users/will/Jobs/projects/labs/supermailer/infra/postfix/bin/correlate-send-log.sh',
        'utf8',
      );

      expect(mainCf).toContain(
        'header_checks = regexp:/etc/postfix/header_checks',
      );
      expect(headerChecks).toContain('X-Supermailer-Send-Id');
      expect(correlateScript).toContain('X-Supermailer-Send-Id');
      expect(correlateScript).toContain('queued as');
    } finally {
      await worker.close();
      await queue.obliterate({ force: true });
      await queue.close();
    }
  });
});
