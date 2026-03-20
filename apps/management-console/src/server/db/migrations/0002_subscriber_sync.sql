ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS source_key TEXT;
--> statement-breakpoint
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS subscribers_source_external_idx ON subscribers (source_key, external_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS suppressions (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  reason TEXT NOT NULL,
  source_event_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS suppressions_email_reason_idx ON suppressions (email, reason);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS suppressions_email_idx ON suppressions (email);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS sync_run_records (
  id TEXT PRIMARY KEY,
  sync_run_id TEXT NOT NULL REFERENCES sync_runs(id),
  subscriber_id TEXT REFERENCES subscribers(id),
  external_id TEXT,
  email TEXT,
  normalized_email TEXT,
  status TEXT NOT NULL,
  error_message TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS sync_run_records_sync_run_id_idx ON sync_run_records (sync_run_id);
