import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const subscribers = pgTable(
  'subscribers',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    sourceKey: text('source_key'),
    externalId: text('external_id'),
    displayName: text('display_name'),
    status: text('status').notNull().default('active'),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    unsubscribedAt: timestamp('unsubscribed_at', { withTimezone: true }),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('subscribers_email_idx').on(table.email),
    uniqueIndex('subscribers_source_external_idx').on(
      table.sourceKey,
      table.externalId,
    ),
  ],
);

export const suppressions = pgTable(
  'suppressions',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    reason: text('reason').notNull(),
    sourceEventId: text('source_event_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('suppressions_email_reason_idx').on(table.email, table.reason),
    index('suppressions_email_idx').on(table.email),
  ],
);

export const templates = pgTable(
  'templates',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    subject: text('subject').notNull(),
    html: text('html').notNull(),
    textContent: text('text_content'),
    variables: jsonb('variables').$type<string[] | null>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex('templates_name_idx').on(table.name)],
);

export const sendSmtpNodes = pgTable(
  'send_smtp_nodes',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    host: text('host').notNull(),
    port: integer('port').notNull(),
    username: text('username'),
    passwordSecretRef: text('password_secret_ref'),
    isActive: boolean('is_active').notNull().default(true),
    priority: integer('priority').notNull().default(100),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex('send_smtp_nodes_name_idx').on(table.name)],
);

export const routingRules = pgTable(
  'routing_rules',
  {
    id: text('id').primaryKey(),
    version: integer('version').notNull(),
    matchType: text('match_type').notNull(),
    domain: text('domain'),
    sendSmtpNodeId: text('send_smtp_node_id')
      .notNull()
      .references(() => sendSmtpNodes.id),
    priority: integer('priority').notNull().default(100),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('routing_rules_version_domain_type_idx').on(
      table.version,
      table.domain,
      table.matchType,
    ),
    index('routing_rules_version_idx').on(table.version),
  ],
);

export const sends = pgTable(
  'sends',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(),
    recipientEmail: text('recipient_email').notNull(),
    subjectSnapshot: text('subject_snapshot').notNull(),
    htmlSnapshot: text('html_snapshot').notNull(),
    textSnapshot: text('text_snapshot'),
    status: text('status').notNull(),
    templateId: text('template_id').references(() => templates.id),
    routingRuleVersion: integer('routing_rule_version'),
    sendSmtpNodeId: text('send_smtp_node_id').references(
      () => sendSmtpNodes.id,
    ),
    queueJobId: text('queue_job_id'),
    dispatchAcceptedAt: timestamp('dispatch_accepted_at', {
      withTimezone: true,
    }),
    dispatchAcceptedResponse: text('dispatch_accepted_response'),
    dispatchAcceptedRelayNodeId: text(
      'dispatch_accepted_relay_node_id',
    ).references(() => sendSmtpNodes.id),
    dispatchAcceptedPostfixQueueId: text('dispatch_accepted_postfix_queue_id'),
    dispatchAcceptedAttemptId: text('dispatch_accepted_attempt_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex('sends_queue_job_id_idx').on(table.queueJobId)],
);

export const sendDispatchAttempts = pgTable(
  'send_dispatch_attempts',
  {
    id: text('id').primaryKey(),
    sendId: text('send_id')
      .notNull()
      .references(() => sends.id),
    attemptNumber: integer('attempt_number').notNull(),
    sendSmtpNodeId: text('send_smtp_node_id')
      .notNull()
      .references(() => sendSmtpNodes.id),
    relayIdentity: text('relay_identity'),
    queueId: text('queue_id'),
    status: text('status').notNull(),
    smtpCode: text('smtp_code'),
    enhancedSmtpCode: text('enhanced_smtp_code'),
    reason: text('reason'),
    rawPayload: jsonb('raw_payload').$type<Record<string, unknown> | null>(),
    startedAt: timestamp('started_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('send_dispatch_attempts_send_attempt_idx').on(
      table.sendId,
      table.attemptNumber,
    ),
    index('send_dispatch_attempts_send_id_idx').on(table.sendId),
    index('send_dispatch_attempts_queue_id_idx').on(table.queueId),
  ],
);

export const deliveryEvents = pgTable(
  'delivery_events',
  {
    id: text('id').primaryKey(),
    sendId: text('send_id')
      .notNull()
      .references(() => sends.id),
    eventKey: text('event_key').notNull(),
    eventType: text('event_type').notNull(),
    smtpCode: text('smtp_code'),
    enhancedSmtpCode: text('enhanced_smtp_code'),
    reason: text('reason'),
    relayIdentity: text('relay_identity'),
    queueId: text('queue_id'),
    provenance: text('provenance').notNull(),
    rawPayload: jsonb('raw_payload').$type<Record<string, unknown> | null>(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('delivery_events_event_key_idx').on(table.eventKey),
    index('delivery_events_send_id_idx').on(table.sendId),
  ],
);

export const apiKeys = pgTable(
  'api_keys',
  {
    id: text('id').primaryKey(),
    label: text('label').notNull(),
    keyPrefix: text('key_prefix').notNull(),
    keyHash: text('key_hash').notNull(),
    scopes: jsonb('scopes').$type<string[] | null>(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('api_keys_key_hash_idx').on(table.keyHash),
    uniqueIndex('api_keys_key_prefix_idx').on(table.keyPrefix),
  ],
);

export const adminUsers = pgTable(
  'admin_users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex('admin_users_email_idx').on(table.email)],
);

export const adminSessions = pgTable(
  'admin_sessions',
  {
    id: text('id').primaryKey(),
    adminUserId: text('admin_user_id')
      .notNull()
      .references(() => adminUsers.id),
    sessionHash: text('session_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('admin_sessions_session_hash_idx').on(table.sessionHash),
    index('admin_sessions_admin_user_id_idx').on(table.adminUserId),
  ],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),
    eventType: text('event_type').notNull(),
    actorType: text('actor_type').notNull(),
    actorId: text('actor_id'),
    actorIdentifier: text('actor_identifier'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('audit_logs_event_type_idx').on(table.eventType),
    index('audit_logs_actor_type_idx').on(table.actorType),
  ],
);

export const syncRuns = pgTable(
  'sync_runs',
  {
    id: text('id').primaryKey(),
    sourceKey: text('source_key').notNull(),
    status: text('status').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    stats: jsonb('stats').$type<Record<string, unknown> | null>(),
    errorSummary: text('error_summary'),
    startedAt: timestamp('started_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('sync_runs_idempotency_key_idx').on(table.idempotencyKey),
  ],
);

export const syncRunRecords = pgTable(
  'sync_run_records',
  {
    id: text('id').primaryKey(),
    syncRunId: text('sync_run_id')
      .notNull()
      .references(() => syncRuns.id),
    subscriberId: text('subscriber_id').references(() => subscribers.id),
    externalId: text('external_id'),
    email: text('email'),
    normalizedEmail: text('normalized_email'),
    status: text('status').notNull(),
    errorMessage: text('error_message'),
    payload: jsonb('payload').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('sync_run_records_sync_run_id_idx').on(table.syncRunId)],
);

export const outboundWebhookDeliveries = pgTable(
  'outbound_webhook_deliveries',
  {
    id: text('id').primaryKey(),
    sendId: text('send_id')
      .notNull()
      .references(() => sends.id),
    targetUrl: text('target_url').notNull(),
    signingSecret: text('signing_secret').notNull(),
    status: text('status').notNull(),
    attemptCount: integer('attempt_count').notNull().default(0),
    payload: jsonb('payload').$type<Record<string, unknown> | null>(),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('outbound_webhook_deliveries_send_id_idx').on(table.sendId),
  ],
);

export const schema = {
  subscribers,
  suppressions,
  templates,
  sendSmtpNodes,
  routingRules,
  sends,
  sendDispatchAttempts,
  deliveryEvents,
  apiKeys,
  adminUsers,
  adminSessions,
  auditLogs,
  syncRuns,
  syncRunRecords,
  outboundWebhookDeliveries,
};

export type Schema = typeof schema;
