#!/bin/sh
set -eu

mkdir -p /var/log/postfix
touch /var/log/postfix/postfix.log

postfix check
postconf -n | tee /var/log/postfix/postconf.current

tail -n 0 -F /var/log/postfix/postfix.log &
TAIL_PID=$!

cleanup() {
  kill "$TAIL_PID" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

exec postfix start-fg
