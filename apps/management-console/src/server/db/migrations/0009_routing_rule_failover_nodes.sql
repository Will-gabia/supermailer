CREATE TABLE IF NOT EXISTS routing_rule_failover_nodes (
  id TEXT PRIMARY KEY,
  routing_rule_id TEXT NOT NULL REFERENCES routing_rules(id),
  send_smtp_node_id TEXT NOT NULL REFERENCES send_smtp_nodes(id),
  position INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS routing_rule_failover_nodes_rule_position_idx
ON routing_rule_failover_nodes (routing_rule_id, position);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS routing_rule_failover_nodes_rule_idx
ON routing_rule_failover_nodes (routing_rule_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS routing_rule_failover_nodes_node_idx
ON routing_rule_failover_nodes (send_smtp_node_id);
