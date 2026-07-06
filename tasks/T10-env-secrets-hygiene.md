# T10 — Секреты из docker-compose в .env

**Приоритет:** P0 · **Оценка:** 1h · **Зависимости:** нет · **Блокирует:** T11

## Цель

Креды Postgres захардкожены в `docker-compose.yml` (`POSTGRES_PASSWORD: password`),
а `JWT_SECRET` имеет дефолт `change_me` в коде. Нужно: все секреты — через `.env`,
compose параметризован, `.env.example` актуален.

## Текущее состояние

- `docker-compose.yml:4-7`:
  ```yaml
  environment:
    POSTGRES_USER: user
    POSTGRES_PASSWORD: password
    POSTGRES_DB: gps_heatmap
  ```
- Сервисы backend/celery_worker/frontend уже используют `env_file: .env`.
- `backend/app/core/config.py` — pydantic Settings с дефолтами:
  `DATABASE_URL` (с кредами внутри), `JWT_SECRET: str = "change_me"`, `REDIS_URL`,
  `RESEND_API_KEY`, `ORS_API_KEY` и др.
- `.env.example` есть в корне — сверь его состав с config.py.
- Healthcheck postgres использует `pg_isready -U user -d gps_heatmap` — тоже параметризовать.

## Что сделать

1. В `docker-compose.yml` замени хардкод на подстановки с дефолтами для dev:
   ```yaml
   environment:
     POSTGRES_USER: ${POSTGRES_USER:-user}
     POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-password}
     POSTGRES_DB: ${POSTGRES_DB:-gps_heatmap}
   healthcheck:
     test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-user} -d ${POSTGRES_DB:-gps_heatmap}"]
   ```
   (docker compose читает переменные из `.env` в корне автоматически).
2. Обнови `.env.example`: добавь `POSTGRES_USER/POSTGRES_PASSWORD/POSTGRES_DB` и проверь,
   что перечислены ВСЕ переменные из `backend/app/core/config.py` с безопасными
   placeholder-значениями и комментариями. Убедись, что `DATABASE_URL` в примере
   собирается из тех же кредов.
3. В `config.py` добавь защиту от запуска прода с дефолтным секретом: поле
   `ENVIRONMENT: str = "development"`; при `ENVIRONMENT == "production"` и
   `JWT_SECRET == "change_me"` — бросай `RuntimeError` при старте (в `Settings` через
   `model_post_init` или простую проверку в конце модуля).
4. Проверь, что `.env` есть в `.gitignore` и не закоммичен (`git ls-files | grep .env`).
5. `docker compose up` с существующим `.env` должен работать без изменений для остальных
   разработческих настроек.

## Чего НЕ делать

- Не закрывать порты и не делать прод-компоуз (T11).
- Не менять реальные значения в локальном `.env` пользователя без необходимости.
- Не выводить содержимое `.env` в чат/логи.

## Критерии приёмки

- В `docker-compose.yml` нет литеральных секретов.
- `docker compose config` подставляет значения из `.env`.
- Стек поднимается: `docker compose up -d`, backend отвечает на `http://localhost:8000/docs`.
- `.env.example` покрывает все переменные config.py.

## Как проверить

```bash
docker compose config | grep -A3 POSTGRES
docker compose up -d && curl -s http://localhost:8000/docs -o /dev/null -w "%{http_code}\n"
docker compose exec backend python -m pytest tests/ -v
```

## Документация

- `README.md` / `CLAUDE.md` Quick Start — если изменился порядок настройки .env.
