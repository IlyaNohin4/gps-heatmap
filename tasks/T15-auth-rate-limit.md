# T15 — Rate limiting на auth-эндпоинты

**Приоритет:** P1 · **Оценка:** 1h · **Зависимости:** нет (согласовано с T11)

## Цель

`POST /api/auth/login`, `/register`, `/forgot-password` не имеют защиты от перебора —
на публичном VDS пароль можно брутфорсить. Добавить ограничение попыток по IP через
slowapi. **Только auth** — остальное API не трогаем (личный сервис, глобальный
rate limiting не нужен).

## Текущее состояние

- `backend/app/api/auth.py` — `register` (строка ~60), `login` (~71); найди также
  forgot-password/reset-password endpoints в этом файле.
- `backend/app/main.py` — создание FastAPI app.
- `backend/requirements.txt` — slowapi отсутствует.
- В проде backend стоит за nginx (T11), реальный IP приходит в `X-Forwarded-For`.

## Что сделать

1. Добавь в `backend/requirements.txt`: `slowapi==0.1.9`. Пересобери:
   `docker compose build backend celery_worker && docker compose up -d`.
2. В `backend/app/main.py`:
   ```python
   from slowapi import Limiter, _rate_limit_exceeded_handler
   from slowapi.errors import RateLimitExceeded
   from slowapi.util import get_remote_address

   limiter = Limiter(key_func=get_remote_address)
   app.state.limiter = limiter
   app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
   ```
   `get_remote_address` у slowapi уважает uvicorn-клиентский IP; чтобы за nginx он видел
   реальный адрес, в прод-команде uvicorn нужен флаг `--proxy-headers`
   (в `docker-compose.prod.yml`; если T11 ещё не выполнена — оставь комментарий-указание
   в T11-файле или добавь флаг сразу, если файл уже существует).
3. В `backend/app/api/auth.py` повесь лимиты (у slowapi endpoint должен принимать
   `request: Request` — добавь параметр, если его нет):
   - `login`: `@limiter.limit("5/minute")`
   - `register`: `@limiter.limit("3/minute")`
   - `forgot-password` (и reset, если есть): `@limiter.limit("3/minute")`
   Импортируй limiter из main (или вынеси limiter в `app/core/`, чтобы избежать
   циклического импорта — проверь, как main импортирует роутеры, и выбери место без цикла).
4. Тесты (`backend/tests/test_auth.py` — образцы уже там): 6-й login подряд с одного IP →
   HTTP 429. Учти, что limiter хранит состояние в памяти — в тестах сбрасывай
   (`limiter.reset()`) в фикстуре, чтобы не заражать соседние тесты.

## Чего НЕ делать

- Не вешать лимиты на /api/tracks, /api/poi и прочие endpoints.
- Не добавлять Redis-storage для limiter'а — in-memory достаточно (один процесс uvicorn;
  если в проде workers=2, лимит будет ×2 — для защиты от брутфорса это приемлемо, отметь
  комментарием в коде).
- Не делать lockout аккаунтов по email.

## Критерии приёмки

- 6 быстрых `POST /api/auth/login` с неверным паролем → шестой ответ 429 с внятным телом.
- Обычный логин работает; лимит не срабатывает при нормальном использовании.
- Все тесты проходят: `docker compose exec backend python -m pytest`.

## Как проверить

```bash
docker compose exec backend python -m pytest tests/ -v
for i in 1 2 3 4 5 6; do curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST http://localhost:8000/api/auth/login \
  -H 'Content-Type: application/json' -d '{"email":"x@x.x","password":"wrong"}'; done
# ожидание: 401 ×5, затем 429
```

## Документация

- `architecture/ARCHITECTURE.md` § API Endpoints (Auth) — лимиты по endpoint'ам.
- `tasks/FUTURE.md` — строку про rate limiting обнови: auth закрыт, остальное API — по триггеру.
