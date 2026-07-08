# T11 — Прод-компоуз: nginx, prod Dockerfiles, закрытые порты

**Приоритет:** P1 · **Оценка:** 3-4h · **Зависимости:** T10

## Цель

Подготовить деплой на VDS (2 CPU / 8GB RAM, Ubuntu): отдельный
`docker-compose.prod.yml`, где наружу торчит только nginx (80/443), фронтенд собран
статикой, backend без `--reload` и без bind-mount исходников.

## Текущее состояние

- `docker-compose.yml` — dev-режим: у postgres/redis/backend/frontend проброшены порты
  наружу (5432, 6379, 8000, 5173), исходники примонтированы, `uvicorn --reload`,
  `npm run dev`, celery под watchmedo.
- `backend/Dockerfile` и `frontend/Dockerfile` — посмотри текущие (вероятно dev-oriented).
- Секреты уже в `.env` (после T10).
- Vite: `VITE_API_URL` используется в `frontend/src/api/` — в проде фронт и API за одним
  nginx, поэтому API-путь должен быть относительным (пустой `VITE_API_URL`).

## Что сделать

1. **`frontend/Dockerfile.prod`** — multi-stage:
   - stage 1: `node:20-alpine`, `npm ci`, `npm run build` → `/app/dist`;
   - stage 2: `nginx:alpine`, копия `dist` в `/usr/share/nginx/html` + конфиг из п.3.
2. **`backend/Dockerfile`** — проверь: если он ставит dev-зависимости (watchmedo) или
   что-то dev-специфичное, сделай так, чтобы прод-запуск был чистым. Команда прода:
   `uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2` (2 CPU на VDS).
   Не забудь флаг `--proxy-headers` — иначе rate limiter (T15) за nginx будет видеть
   IP самого nginx вместо реального клиента из `X-Forwarded-For`.
3. **`deploy/nginx.conf`**:
   - `location /api/ { proxy_pass http://backend:8000; }` (+ `proxy_set_header Host`,
     `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`);
   - `location /docs` и `/openapi.json` → backend (Swagger);
   - `location / { try_files $uri /index.html; }` — SPA-фолбэк;
   - `client_max_body_size 25m;` (загрузка файлов до 20MB + запас);
   - `gzip on` для text/css/js/json.
4. **`docker-compose.prod.yml`** (самостоятельный файл, запуск
   `docker compose -f docker-compose.prod.yml up -d`):
   - postgres, redis — **без** `ports:` (только внутренняя сеть), с healthcheck,
     named volumes;
   - backend — без bind-mount, без reload, `restart: unless-stopped`, healthcheck
     (curl на `/docs` или добавь простой `GET /health` в `backend/app/main.py`,
     возвращающий `{"status": "ok"}`);
   - celery_worker — без watchmedo: `celery -A app.tasks.celery_app worker --loglevel=warning --concurrency=1`;
   - frontend — образ из `Dockerfile.prod`, наружу `80:80` (и задел под `443:443`);
   - `restart: unless-stopped` у всех; логи: `logging: driver: json-file` с
     `max-size: 10m`, `max-file: "3"`.
5. **`deploy/README.md`** — короткая шпаргалка деплоя на VDS: установка docker,
   клонирование, заполнение `.env` (`ENVIRONMENT=production`, сильный `JWT_SECRET`,
   пароль Postgres), запуск, миграции
   (`docker compose -f docker-compose.prod.yml exec backend alembic upgrade head`),
   обновление версии. HTTPS: одна строка про certbot/Let's Encrypt как следующий шаг
   (не автоматизировать).
6. Dev-компоуз (`docker-compose.yml`) не менять.

## Чего НЕ делать

- Не настраивать CI/CD, мониторинг, Sentry (FUTURE.md).
- Не автоматизировать выпуск SSL-сертификатов.
- Не менять dev-окружение.

## Критерии приёмки

- `docker compose -f docker-compose.prod.yml up -d --build` локально поднимает стек;
  приложение доступно на `http://localhost/` (логин, треки, карта работают через nginx).
- `docker ps` — наружу проброшен только порт 80 (frontend/nginx).
- Загрузка трека 15-20MB через UI проходит (nginx не режет body).
- `docker compose -f docker-compose.prod.yml down && up -d` — данные Postgres сохраняются.

## Как проверить

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker ps --format '{{.Names}}\t{{.Ports}}'
curl -s http://localhost/api/tracks -o /dev/null -w "%{http_code}\n"   # 401 без токена — ок
docker compose -f docker-compose.prod.yml down
```

## Документация

- `architecture/ARCHITECTURE.md` — раздел Deployment (создай): схема nginx → frontend static
  / backend proxy, список сервисов прод-компоуза.
- `POLISH.md` — закрой пункт «Production deployment setup» в части compose/nginx.
