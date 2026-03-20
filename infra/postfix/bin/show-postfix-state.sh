#!/bin/sh
set -eu

docker compose exec postfix-local postconf -n
docker compose logs --tail=200 postfix-local
if [ "$#" -gt 0 ]; then
  docker compose exec postfix-local /usr/local/bin/correlate-send-log.sh "$1"
fi
