# Деплой на VDS

Целевая среда: Ubuntu, 2 CPU / 8GB RAM. Наружу торчит только nginx (порт 80,
443 — задел под будущий HTTPS).

## 1. Установка Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # перелогиниться после этого
```

## 2. Клонирование и настройка

```bash
git clone <repo-url> gps-heatmap
cd gps-heatmap
cp .env.example .env
```

Заполнить `.env`:

- `ENVIRONMENT=production` — обязательно; при `development`/дефолтном
  `JWT_SECRET` backend откажется стартовать (guard из T10).
- `JWT_SECRET` — сильный случайный секрет, например `openssl rand -hex 32`.
- `POSTGRES_PASSWORD` — не дефолтный пароль.
- Остальные ключи (`RESEND_API_KEY`, `ORS_API_KEY`, `NOMINATIM_USER_AGENT`) —
  по необходимости.

## 3. Запуск

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Миграции (`alembic upgrade head`) выполняются автоматически при каждом старте
backend-контейнера — отдельно гонять не нужно.

Проверка:

```bash
docker ps --format '{{.Names}}\t{{.Ports}}'   # наружу только frontend:80
curl -s http://localhost/api/tracks -o /dev/null -w "%{http_code}\n"   # 401 без токена — ок
```

## 4. Обновление версии

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Миграции применятся автоматически при рестарте backend.

## 5. Backups

Дампы через `pg_dump` (custom format, `-Fc`) с ротацией по возрасту.
Никаких облачных хранилищ — просто файлы в `backups/` (в `.gitignore`).

```bash
./deploy/backup.sh                 # дефолт: ./backups, хранить 14 дней
BACKUP_DIR=/opt/backups KEEP_DAYS=30 ./deploy/backup.sh   # переопределить
```

Cron (ежедневно в 3:00, лог в `/var/log/gps-backup.log`):

```
0 3 * * * /path/to/repo/deploy/backup.sh >> /var/log/gps-backup.log 2>&1
```

Проверить дамп (не восстанавливая — только список содержимого):

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_restore --list < backups/gps_heatmap_<STAMP>.dump
```

Восстановление (спросит подтверждение, перед `--clean` сносит текущие данные):

```bash
./deploy/restore.sh backups/gps_heatmap_<STAMP>.dump
```

Рекомендация: периодически копировать `backups/` за пределы VDS, например

```bash
rsync -avz backups/ user@offsite-host:/path/to/offsite-backups/
```

— вручную или отдельной cron-строкой, без дополнительной автоматизации в этом репозитории.

## 6. HTTPS

Следующий шаг (не автоматизирован в этой задаче): выпустить сертификат
через certbot/Let's Encrypt и подключить его в `deploy/nginx.conf` + открыть
порт 443 в `docker-compose.prod.yml`.
