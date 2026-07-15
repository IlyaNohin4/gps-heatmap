#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."          # корень проекта

DUMP_FILE="${1:-}"
if [ -z "$DUMP_FILE" ]; then
  echo "Usage: $0 <path-to-dump-file>" >&2
  exit 1
fi
if [ ! -f "$DUMP_FILE" ]; then
  echo "Dump file not found: $DUMP_FILE" >&2
  exit 1
fi

read -p "This will OVERWRITE the database. Continue? [y/N] " -r REPLY
if [[ ! "$REPLY" =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 1
fi

docker compose -f docker-compose.prod.yml exec -T postgres \
  sh -c 'pg_restore --clean --if-exists -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < "$DUMP_FILE"

echo "Restore done from: $DUMP_FILE"
