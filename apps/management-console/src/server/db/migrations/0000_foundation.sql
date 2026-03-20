CREATE TABLE IF NOT EXISTS subscribers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  external_id TEXT,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  metadata JSONB,
  unsubscribed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS subscribers_email_idx ON subscribers (email);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  html TEXT NOT NULL,
  text_content TEXT,
  variables JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS templates_name_idx ON templates (name);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS send_smtp_nodes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  username TEXT,
  password_secret_ref TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  priority INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS send_smtp_nodes_name_idx ON send_smtp_nodes (name);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS routing_rules (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  match_type TEXT NOT NULL,
  domain TEXT,
  send_smtp_node_id TEXT NOT NULL REFERENCES send_smtp_nodes(id),
  priority INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS routing_rules_version_domain_type_idx ON routing_rules (version, domain, match_type);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS routing_rules_version_idx ON routing_rules (version);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS sends (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  subject_snapshot TEXT NOT NULL,
  html_snapshot TEXT NOT NULL,
  text_snapshot TEXT,
  status TEXT NOT NULL,
  template_id TEXT REFERENCES templates(id),
  routing_rule_version INTEGER,
  send_smtp_node_id TEXT REFERENCES send_smtp_nodes(id),
  queue_job_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS sends_queue_job_id_idx ON sends (queue_job_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS delivery_events (
  id TEXT PRIMARY KEY,
  send_id TEXT NOT NULL REFERENCES sends(id),
  event_key TEXT NOT NULL,
  event_type TEXT NOT NULL,
  smtp_code TEXT,
  enhanced_smtp_code TEXT,
  reason TEXT,
  relay_identity TEXT,
  queue_id TEXT,
  provenance TEXT NOT NULL,
  raw_payload JSONB,
  occurred_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS delivery_events_event_key_idx ON delivery_events (event_key);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS delivery_events_send_id_idx ON delivery_events (send_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  scopes JSONB,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS api_keys_key_hash_idx ON api_keys (key_hash);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS sync_runs (
  id TEXT PRIMARY KEY,
  source_key TEXT NOT NULL,
  status TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  stats JSONB,
  error_summary TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS sync_runs_idempotency_key_idx ON sync_runs (idempotency_key);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS outbound_webhook_deliveries (
  id TEXT PRIMARY KEY,
  send_id TEXT NOT NULL REFERENCES sends(id),
  target_url TEXT NOT NULL,
  signing_secret TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  payload JSONB,
  last_attempt_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS outbound_webhook_deliveries_send_id_idx ON outbound_webhook_deliveries (send_id);
