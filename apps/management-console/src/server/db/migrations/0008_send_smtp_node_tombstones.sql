ALTER TABLE send_smtp_nodes
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
--> statement-breakpoint
DROP INDEX IF EXISTS send_smtp_nodes_name_idx;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS send_smtp_nodes_name_idx
ON send_smtp_nodes (name)
WHERE deleted_at IS NULL;
