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

## 5. HTTPS

Следующий шаг (не автоматизирован в этой задаче): выпустить сертификат
через certbot/Let's Encrypt и подключить его в `deploy/nginx.conf` + открыть
порт 443 в `docker-compose.prod.yml`.
