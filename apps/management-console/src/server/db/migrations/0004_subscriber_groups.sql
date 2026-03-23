CREATE TABLE IF NOT EXISTS subscriber_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS subscriber_groups_name_idx ON subscriber_groups (name);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS subscriber_group_memberships (
  subscriber_id TEXT NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES subscriber_groups(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (subscriber_id, group_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS subscriber_group_memberships_subscriber_id_idx ON subscriber_group_memberships (subscriber_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS subscriber_group_memberships_group_id_idx ON subscriber_group_memberships (group_id);
