import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
    "insert into send_smtp_nodes (id, name, host, port, is_active, priority) values ('node_eml', 'node_eml', 'smtp.local', 2525, true, 100)",
  );
  await pool.query(
    "insert into routing_rules (id, version, match_type, domain, send_smtp_node_id, priority, is_active) values ('rule_default_eml', 1, 'default', null, 'node_eml', 100, true)",
  );
  await pool.query(
    [
      'insert into sends (',
      'id, kind, recipient_email, subject_snapshot, html_snapshot, text_snapshot, eml_snapshot, status, routing_rule_version, send_smtp_node_id, queue_job_id',
      ') values (',
      "'01HZYF8SEND00000000000EML', 'individual', 'raw-worker@example.com', 'Raw Worker Subject', '<p>placeholder</p>', null, $1, 'queued', 1, 'node_eml', 'send-01HZYF8SEND00000000000EML'",
      ')',
    ].join(' '),
    [
      [
        'From: sender@example.com',
        'To: raw-worker@example.com',
        'Subject: Raw Worker Subject',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=utf-8',
        '',
        'Hello from worker raw EML.',
      ].join('\r\n'),
    ],
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

describe('raw-eml-dispatch integration', () => {
  let started: Started | null = null;

  beforeAll(async () => {
    started = await startInfra();
  });

  afterAll(async () => {
    await started?.stop();
  });

  it('passes raw EML through the worker dispatch path', async () => {
    if (!started) {
      throw new Error('infra not ready');
    }

    const ready = started;
    const redisPrefix = createWorkerPrefix();
    const queue = createSendDispatchQueue({
      connection: createRedisConnectionOptions(ready.redisUrl),
      prefix: redisPrefix,
    });
    let dispatchedEml: string | null = null;
    const worker = createSendDispatchWorker({
      redisConnection: createRedisConnectionOptions(ready.redisUrl),
      redisPrefix,
      databaseUrl: ready.databaseUrl,
      transport: {
        dispatch: async (request) => {
          dispatchedEml = Reflect.get(request, 'eml') as string | null;
          return {
            result: 'accepted',
            smtpCode: '250',
            enhancedCode: '2.0.0',
            response: '250 2.0.0 queued as EMLQID',
            postfixQueueId: 'EMLQID',
            relayIdentity: `${request.smtpNode.host}:${request.smtpNode.port}`,
            rawPayload: {
              accepted: true,
            },
          };
        },
      },
    });

    try {
      await enqueueSendDispatchJob(queue, {
        sendId: '01HZYF8SEND00000000000EML',
      });

      await waitFor(async () => {
        expect(dispatchedEml).toContain('Subject: Raw Worker Subject');
        expect(dispatchedEml).toContain('Hello from worker raw EML.');
      });
    } finally {
      await worker.close();
      await queue.obliterate({ force: true });
      await queue.close();
    }
  });
});
