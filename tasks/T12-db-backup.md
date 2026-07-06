# T12 — Бэкапы PostgreSQL (pg_dump + cron)

**Приоритет:** P2 · **Оценка:** 1h · **Зависимости:** T11

## Цель

На VDS нужны ежедневные дампы БД с ротацией. Без облачных сервисов — простой скрипт
`pg_dump` + cron + инструкция восстановления.

## Текущее состояние

- Прод-стек описан в `docker-compose.prod.yml` (T11), postgres без внешних портов.
- Креды postgres — в `.env` (T10): `POSTGRES_USER/POSTGRES_PASSWORD/POSTGRES_DB`.

## Что сделать

1. Создай `deploy/backup.sh`:
   ```bash
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
   ```
   Формат `-Fc` (custom) — компактный и восстанавливается `pg_restore` выборочно.
2. `chmod +x deploy/backup.sh`; добавь `backups/` в `.gitignore`.
3. Создай `deploy/restore.sh` — принимает путь к дампу, делает
   `pg_restore --clean --if-exists -U ... -d ...` внутри контейнера postgres
   (через `docker compose ... exec -T postgres`), с подтверждением
   (`read -p "This will OVERWRITE the database. Continue? [y/N]"`).
4. В `deploy/README.md` (создан в T11) добавь раздел Backups:
   - cron-строка: `0 3 * * * /path/to/repo/deploy/backup.sh >> /var/log/gps-backup.log 2>&1`
   - как проверить дамп и как восстановиться;
   - рекомендация: периодически копировать `backups/` за пределы VDS (rsync/rclone) —
     одной строкой, без автоматизации.

## Чего НЕ делать

- Не подключать S3/облачные хранилища.
- Не бэкапить Redis (кэш и брокер — восстановимы).

## Критерии приёмки

- `./deploy/backup.sh` на работающем прод-стеке создаёт непустой `.dump`.
- `./deploy/restore.sh <dump>` восстанавливает БД: треки/POI на месте после restore
  (проверить на локальном прод-стеке: сделать дамп, удалить трек через UI, восстановить —
  трек вернулся).
- Старые дампы (>14 дней) удаляются (проверить `touch -d '20 days ago'` на фейковом файле).

## Как проверить

```bash
docker compose -f docker-compose.prod.yml up -d
./deploy/backup.sh && ls -lh backups/
./deploy/restore.sh backups/<файл>.dump
```

## Документация

- `deploy/README.md` § Backups.
- `POLISH.md` — закрой пункт «Database backup strategy».
