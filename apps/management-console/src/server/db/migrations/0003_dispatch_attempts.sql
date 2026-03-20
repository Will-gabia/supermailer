ALTER TABLE sends ADD COLUMN IF NOT EXISTS dispatch_accepted_at TIMESTAMPTZ;
--> statement-breakpoint
ALTER TABLE sends ADD COLUMN IF NOT EXISTS dispatch_accepted_response TEXT;
--> statement-breakpoint
ALTER TABLE sends ADD COLUMN IF NOT EXISTS dispatch_accepted_relay_node_id TEXT REFERENCES send_smtp_nodes(id);
--> statement-breakpoint
ALTER TABLE sends ADD COLUMN IF NOT EXISTS dispatch_accepted_postfix_queue_id TEXT;
--> statement-breakpoint
ALTER TABLE sends ADD COLUMN IF NOT EXISTS dispatch_accepted_attempt_id TEXT;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS send_dispatch_attempts (
  id TEXT PRIMARY KEY,
  send_id TEXT NOT NULL REFERENCES sends(id),
  attempt_number INTEGER NOT NULL,
  send_smtp_node_id TEXT NOT NULL REFERENCES send_smtp_nodes(id),
  relay_identity TEXT,
  queue_id TEXT,
  status TEXT NOT NULL,
  smtp_code TEXT,
  enhanced_smtp_code TEXT,
  reason TEXT,
  raw_payload JSONB,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS send_dispatch_attempts_send_attempt_idx ON send_dispatch_attempts (send_id, attempt_number);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS send_dispatch_attempts_send_id_idx ON send_dispatch_attempts (send_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS send_dispatch_attempts_queue_id_idx ON send_dispatch_attempts (queue_id);
