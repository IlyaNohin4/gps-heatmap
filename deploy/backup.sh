#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."          # корень проекта
BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y%m%d_%H%M%S)
docker compose -f docker-compose.prod.yml exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  > "$BACKUP_DIR/gps_heatmap_$STAMP.dump"
find "$BACKUP_DIR" -name "gps_heatmap_*.dump" -mtime +"$KEEP_DAYS" -delete
echo "Backup done: $BACKUP_DIR/gps_heatmap_$STAMP.dump"
