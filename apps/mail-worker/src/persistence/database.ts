import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Pool } from 'pg';

import {
  createUlid,
  DeliveryEventType,
  SendState,
} from '@supermailer/contracts';

type RouteRecord = {
  nodeId: string;
  host: string;
  port: number;
  username: string | null;
  passwordSecretRef: string | null;
  routingRuleVersion: number | null;
};

type SendRecord = {
  id: string;
  recipientEmail: string;
  subjectSnapshot: string;
  htmlSnapshot: string;
  textSnapshot: string | null;
  status: string;
  queueJobId: string | null;
  sendSmtpNodeId: string | null;
  routingRuleVersion: number | null;
};

const migrationsDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../management-console/src/server/db/migrations',
);

const splitStatements = (sqlSource: string): string[] =>
  sqlSource
    .split(/^\s*-->\s*statement-breakpoint\s*$/m)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

export const createWorkerDatabasePool = (connectionString: string): Pool =>
  (() => {
    const pool = new Pool({
      connectionString,
      allowExitOnIdle: true,
    });

    pool.on('error', (error) => {
      if ((error as { code?: string }).code === '57P01') {
        return;
      }

      throw error;
    });

    return pool;
  })();

export const runWorkerTestMigrations = async (pool: Pool): Promise<void> => {
  const client = await pool.connect();

  try {
    await client.query('begin');
    await client.query(
      `
        create table if not exists __supermailer_migrations (
          id text primary key,
          applied_at timestamptz not null default now()
        );
      `,
    );

    const migrationFiles = (await readdir(migrationsDirectory))
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const migrationFile of migrationFiles) {
      const existing = await client.query<{ id: string }>(
        'select id from __supermailer_migrations where id = $1',
        [migrationFile],
      );

      if ((existing.rowCount ?? 0) > 0) {
        continue;
      }

      const migrationSql = await readFile(
        path.join(migrationsDirectory, migrationFile),
        'utf8',
      );
      for (const statement of splitStatements(migrationSql)) {
        await client.query(statement);
      }

      await client.query(
        'insert into __supermailer_migrations (id) values ($1)',
        [migrationFile],
      );
    }

    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
};

const extractRecipientDomain = (email: string): string => {
  const [, domain = ''] = email.trim().toLowerCase().split('@');
  return domain;
};

export const createWorkerPersistence = (pool: Pool) => ({
  findSendById: async (sendId: string): Promise<SendRecord | null> => {
    const result = await pool.query<SendRecord>(
      `
        select id, recipient_email as "recipientEmail", subject_snapshot as "subjectSnapshot",
               html_snapshot as "htmlSnapshot", text_snapshot as "textSnapshot", status,
               queue_job_id as "queueJobId", send_smtp_node_id as "sendSmtpNodeId",
               routing_rule_version as "routingRuleVersion"
        from sends
        where id = $1
        limit 1
      `,
      [sendId],
    );

    return result.rows[0] ?? null;
  },
  resolveRouteForSend: async (
    send: SendRecord,
  ): Promise<RouteRecord | null> => {
    if (send.sendSmtpNodeId) {
      const byId = await pool.query<RouteRecord>(
        `
          select n.id as "nodeId", n.host, n.port, n.username, n.password_secret_ref as "passwordSecretRef",
                 $2::integer as "routingRuleVersion"
          from send_smtp_nodes n
          where n.id = $1 and n.is_active = true
          limit 1
        `,
        [send.sendSmtpNodeId, send.routingRuleVersion],
      );

      if (byId.rows[0]) {
        return byId.rows[0];
      }
    }

    const domain = extractRecipientDomain(send.recipientEmail);
    let selectedVersion = send.routingRuleVersion;

    if (selectedVersion === null) {
      const latestVersion = await pool.query<{ value: number | null }>(
        'select max(version) as value from routing_rules',
      );
      selectedVersion = latestVersion.rows[0]?.value ?? null;
    }

    if (selectedVersion === null) {
      return null;
    }

    const exact = await pool.query<RouteRecord>(
      `
        select r.send_smtp_node_id as "nodeId", n.host, n.port, n.username,
               n.password_secret_ref as "passwordSecretRef", r.version as "routingRuleVersion"
        from routing_rules r
        inner join send_smtp_nodes n on n.id = r.send_smtp_node_id
        where r.version = $1 and r.match_type = 'exact' and r.domain = $2 and r.is_active = true and n.is_active = true
        order by r.priority asc, n.priority desc, r.id asc
        limit 1
      `,
      [selectedVersion, domain],
    );

    if (exact.rows[0]) {
      return exact.rows[0];
    }

    const fallback = await pool.query<RouteRecord>(
      `
        select r.send_smtp_node_id as "nodeId", n.host, n.port, n.username,
               n.password_secret_ref as "passwordSecretRef", r.version as "routingRuleVersion"
        from routing_rules r
        inner join send_smtp_nodes n on n.id = r.send_smtp_node_id
        where r.version = $1 and r.match_type = 'default' and r.domain is null and r.is_active = true and n.is_active = true
        order by r.priority asc, n.priority desc, r.id asc
        limit 1
      `,
      [selectedVersion],
    );

    return fallback.rows[0] ?? null;
  },
  getNextAttemptNumber: async (sendId: string): Promise<number> => {
    const result = await pool.query<{ value: number }>(
      'select coalesce(max(attempt_number), 0) as value from send_dispatch_attempts where send_id = $1',
      [sendId],
    );

    return Number(result.rows[0]?.value ?? 0) + 1;
  },
  createDispatchAttempt: async (input: {
    sendId: string;
    attemptNumber: number;
    sendSmtpNodeId: string;
    relayIdentity: string | null;
  }) => {
    const id = createUlid();
    await pool.query(
      `
        insert into send_dispatch_attempts (id, send_id, attempt_number, send_smtp_node_id, relay_identity, status, started_at, created_at, updated_at)
        values ($1, $2, $3, $4, $5, 'started', now(), now(), now())
      `,
      [
        id,
        input.sendId,
        input.attemptNumber,
        input.sendSmtpNodeId,
        input.relayIdentity,
      ],
    );

    return id;
  },
  finishDispatchAttempt: async (input: {
    attemptId: string;
    status: 'accepted' | 'failed_transient' | 'failed_permanent';
    smtpCode: string | null;
    enhancedCode: string | null;
    reason: string | null;
    queueId: string | null;
    relayIdentity: string | null;
    rawPayload: Record<string, unknown>;
  }) => {
    await pool.query(
      `
        update send_dispatch_attempts
        set status = $2,
            smtp_code = $3,
            enhanced_smtp_code = $4,
            reason = $5,
            queue_id = $6,
            relay_identity = $7,
            raw_payload = $8::jsonb,
            finished_at = now(),
            updated_at = now()
        where id = $1
      `,
      [
        input.attemptId,
        input.status,
        input.smtpCode,
        input.enhancedCode,
        input.reason,
        input.queueId,
        input.relayIdentity,
        JSON.stringify(input.rawPayload),
      ],
    );
  },
  updateSendState: async (sendId: string, state: SendState) => {
    await pool.query(
      'update sends set status = $2, updated_at = now() where id = $1',
      [sendId, state],
    );
  },
  markAcceptedByMta: async (input: {
    sendId: string;
    attemptId: string;
    relayNodeId: string;
    queueId: string | null;
    response: string;
  }) => {
    await pool.query(
      `
        update sends
        set status = 'accepted_by_mta',
            dispatch_accepted_attempt_id = $2,
            dispatch_accepted_relay_node_id = $3,
            dispatch_accepted_postfix_queue_id = $4,
            dispatch_accepted_response = $5,
            dispatch_accepted_at = now(),
            updated_at = now()
        where id = $1
      `,
      [
        input.sendId,
        input.attemptId,
        input.relayNodeId,
        input.queueId,
        input.response,
      ],
    );
  },
  appendDeliveryEvent: async (input: {
    sendId: string;
    eventType: DeliveryEventType;
    smtpCode?: string | null;
    enhancedSmtpCode?: string | null;
    reason?: string | null;
    relayIdentity?: string | null;
    queueId?: string | null;
    rawPayload?: Record<string, unknown>;
  }) => {
    const id = createUlid();
    const eventKey = `${input.sendId}:${input.eventType}:${createUlid()}`;

    await pool.query(
      `
        insert into delivery_events (
          id, send_id, event_key, event_type, smtp_code, enhanced_smtp_code, reason, relay_identity,
          queue_id, provenance, raw_payload, occurred_at, received_at
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'application', $10::jsonb, now(), now())
      `,
      [
        id,
        input.sendId,
        eventKey,
        input.eventType,
        input.smtpCode ?? null,
        input.enhancedSmtpCode ?? null,
        input.reason ?? null,
        input.relayIdentity ?? null,
        input.queueId ?? null,
        JSON.stringify(input.rawPayload ?? {}),
      ],
    );
  },
});

export type WorkerPersistence = ReturnType<typeof createWorkerPersistence>;
