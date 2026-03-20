#!/bin/sh
set -eu

if [ "$#" -lt 1 ]; then
  printf 'usage: %s <send-id>\n' "$0"
  exit 1
fi

SEND_ID="$1"
LOG_FILE="/var/log/postfix/postfix.log"

if [ ! -f "$LOG_FILE" ]; then
  printf 'log file not found: %s\n' "$LOG_FILE"
  exit 2
fi

python3 - "$SEND_ID" "$LOG_FILE" <<'PY'
import re
import sys

send_id = sys.argv[1]
log_file = sys.argv[2]

queued_as_pattern = re.compile(r"queued as", re.IGNORECASE)

header_pattern = re.compile(rf"X-Supermailer-Send-Id[:=]\s*{re.escape(send_id)}", re.IGNORECASE)
queue_pattern = re.compile(r"\b([A-F0-9]{7,})\b")

queue_ids = []
lines = []

with open(log_file, "r", encoding="utf-8", errors="ignore") as handle:
    for line in handle:
        if header_pattern.search(line):
            lines.append(line.rstrip())
            if queued_as_pattern.search(line):
                pass
            queue_match = queue_pattern.search(line)
            if queue_match:
                queue_ids.append(queue_match.group(1))

if not lines:
    print("no matching entries")
    sys.exit(3)

print(f"send_id={send_id}")
for queue_id in sorted(set(queue_ids)):
    print(f"queue_id={queue_id}")

for line in lines:
    print(line)
PY
