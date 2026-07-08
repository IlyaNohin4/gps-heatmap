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
2. Создай **новый модуль** `backend/app/core/limiter.py` (именно отдельный модуль —
   размещение limiter'а в main.py создаст циклический импорт, т.к. main импортирует
   роутеры, а роутерам нужен limiter):
   ```python
   from slowapi import Limiter
   from slowapi.util import get_remote_address

   limiter = Limiter(key_func=get_remote_address)
   ```
3. В `backend/app/main.py` подключи его:
   ```python
   from slowapi import _rate_limit_exceeded_handler
   from slowapi.errors import RateLimitExceeded
   from app.core.limiter import limiter

   app.state.limiter = limiter
   app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
   ```
   Примечание для будущей T11: за nginx uvicorn'у нужен флаг `--proxy-headers`,
   чтобы limiter видел реальные IP — добавь одну строку-напоминание в
   `tasks/T11-prod-docker-nginx.md` § Что сделать.
4. В `backend/app/api/auth.py`: `from app.core.limiter import limiter`, затем декораторы
   (у slowapi endpoint обязан принимать `request: Request` первым параметром —
   добавь, где его нет):
   - `login`: `@limiter.limit("5/minute")`
   - `register`: `@limiter.limit("3/minute")`
   - `forgot-password` (и reset-password, если есть): `@limiter.limit("3/minute")`
5. Тесты (`backend/tests/test_auth.py`): добавь **autouse-фикстуру сброса** — без неё
   тесты будут флакать в зависимости от порядка запуска:
   ```python
   import pytest
   from app.core.limiter import limiter

   @pytest.fixture(autouse=True)
   def _reset_rate_limiter():
       limiter.reset()
       yield
   ```
   Новый тест: 6 неверных логинов подряд → первые пять 401, шестой 429.

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
