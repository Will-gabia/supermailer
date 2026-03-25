CREATE TABLE IF NOT EXISTS callback_endpoints (
  id TEXT PRIMARY KEY,
  api_key_id TEXT NOT NULL REFERENCES api_keys(id),
  label TEXT NOT NULL,
  target_url TEXT NOT NULL,
  signing_secret TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS callback_endpoints_api_key_id_idx ON callback_endpoints (api_key_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS callback_endpoints_active_idx ON callback_endpoints (is_active);
--> statement-breakpoint
ALTER TABLE sends ADD COLUMN IF NOT EXISTS callback_endpoint_id TEXT REFERENCES callback_endpoints(id);
--> statement-breakpoint
ALTER TABLE sends ADD COLUMN IF NOT EXISTS api_key_id TEXT REFERENCES api_keys(id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS sends_api_key_id_idx ON sends (api_key_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS sends_callback_endpoint_id_idx ON sends (callback_endpoint_id);
