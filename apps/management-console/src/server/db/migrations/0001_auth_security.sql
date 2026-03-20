ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS key_prefix TEXT;
--> statement-breakpoint
UPDATE api_keys SET key_prefix = CONCAT('legacy_', id) WHERE key_prefix IS NULL;
--> statement-breakpoint
ALTER TABLE api_keys ALTER COLUMN key_prefix SET NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS api_keys_key_prefix_idx ON api_keys (key_prefix);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS admin_users_email_idx ON admin_users (email);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS admin_sessions (
  id TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL REFERENCES admin_users(id),
  session_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS admin_sessions_session_hash_idx ON admin_sessions (session_hash);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS admin_sessions_admin_user_id_idx ON admin_sessions (admin_user_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  actor_identifier TEXT,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS audit_logs_event_type_idx ON audit_logs (event_type);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS audit_logs_actor_type_idx ON audit_logs (actor_type);
