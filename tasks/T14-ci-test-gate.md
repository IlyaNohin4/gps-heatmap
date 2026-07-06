# T14 — CI test-gate (GitHub Actions: pytest + build)

**Приоритет:** P1 · **Оценка:** 1-2h · **Зависимости:** нет

## Цель

Автоматическая проверка каждого push/PR в GitHub: backend-тесты + сборка фронтенда.
Это страховка от регрессий (в т.ч. от изменений, которые делают агенты). Деплой (CD)
**не** входит в задачу — только тесты.

## Текущее состояние

- Remote: `https://github.com/IlyaNohin4/gps-heatmap.git`, папки `.github/` нет.
- Backend-тесты **не требуют** Postgres/Redis: `backend/tests/conftest.py` подставляет
  SQLite in-memory (`DATABASE_URL=sqlite:///:memory:`) и мокает PostGIS-части ещё до
  импорта приложения. Запуск: `cd backend && pytest tests/ -v`.
- Python-версию возьми из `backend/Dockerfile` (образ `FROM python:...`), Node-версию —
  из `frontend/Dockerfile`. Зависимости: `backend/requirements.txt`,
  `frontend/package-lock.json`.

## Что сделать

1. Создай `.github/workflows/ci.yml`:
   ```yaml
   name: CI
   on:
     push:
       branches: [main]
     pull_request:

   jobs:
     backend-tests:
       runs-on: ubuntu-latest
       defaults: { run: { working-directory: backend } }
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-python@v5
           with: { python-version: "<из Dockerfile>", cache: pip, cache-dependency-path: backend/requirements.txt }
         - run: pip install -r requirements.txt
         - run: python -m pytest tests/ -v

     frontend-build:
       runs-on: ubuntu-latest
       defaults: { run: { working-directory: frontend } }
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with: { node-version: "<из Dockerfile>", cache: npm, cache-dependency-path: frontend/package-lock.json }
         - run: npm ci
         - run: npm run build
   ```
2. Если `pip install -r requirements.txt` на ubuntu-latest падает из-за системных
   зависимостей (например, для fitparse/gdal-подобных пакетов) — добавь шаг
   `sudo apt-get install -y <пакеты>`; выясняй по логу CI, не гадай заранее.
3. Прогони workflow: закоммить в отдельную ветку, открой PR (или push в main после OK
   пользователя) и добейся зелёного статуса. Смотреть статус: `gh run list`, `gh run view --log-failed`.

## Чего НЕ делать

- Никакого деплоя, docker build/push, секретов в GitHub — только тесты и build.
- Не запускать Playwright E2E в CI (требует полного стека; кандидат в FUTURE).
- Не добавлять линтеры с нуля (если ESLint уже настроен и `npm run lint` существует —
  можно добавить шагом, иначе пропусти).

## Критерии приёмки

- Оба джоба зелёные на GitHub для текущего main.
- Падение любого backend-теста или ошибки сборки фронтенда роняют workflow (проверь,
  временно сломав тест в ветке).
- Время прогона < ~5 минут (с кэшем зависимостей).

## Как проверить

```bash
# локальный эквивалент того, что делает CI:
docker compose exec backend python -m pytest tests/ -v
docker compose exec -T frontend npm run build
gh run list --limit 3   # после push
```

## Документация

- `CLAUDE.md` — строка в Common Commands: CI гоняет pytest+build на каждый push.
- `POLISH.md` — пункт «CI/CD pipeline» пометь частично закрытым (CI есть, CD — FUTURE).
