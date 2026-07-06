# T13 — Синхронизация архитектурной документации

**Приоритет:** P1 · **Оценка:** 1-2h · **Зависимости:** все T01–T12, T14–T16 (выполнять последней)

## Цель

После выполнения задач T01–T12 привести документацию в соответствие с кодом: каждый
таск должен был обновить свой раздел, эта задача — финальная сверка и чистка.

## Что сделать

1. **Сверь `architecture/ARCHITECTURE.md` с кодом** (это главный источник правды):
   - § API Endpoints: `GET /api/tracks` (пагинация, envelope, 6 sort), `GET /api/poi`
     (search/limit/offset), `GET /api/tracks/geometries` — сверь с
     `backend/app/api/tracks.py` и `poi.py`;
   - § Database Models: индексы из миграции 0007;
   - § Frontend: серверная фильтрация LeftIsland, infinite scroll, ErrorBoundary,
     поток данных карты (bulk geometries + on-demand detail);
   - § Celery: политика ретраев (backoff, разделение временных/постоянных ошибок);
   - § Deployment: прод-компоуз, nginx, бэкапы (создан в T11/T12).
2. **`CLAUDE.md`**: раздел Quick Start и «Key Facts» — если изменились команды или
   появился прод-компоуз, добавь 1-2 строки (например, ссылку на `deploy/README.md`).
   Число тестов «107 backend tests» наверняка устарело — выполни
   `docker compose exec backend python -m pytest --collect-only -q | tail -1` и поправь.
3. **`POLISH.md`**: перенеси закрытые пункты в раздел решённых (production deployment,
   backup, error handling); добавь новые известные проблемы, если задачи их вскрыли.
4. **`IMPROVEMENTS.md`**: отметь выполненные рекомендации.
5. **`tasks/`**: в README.md проставь статусы задач (✅ по выполненным); файлы задач
   не удаляй.
6. **`architecture/INDEX.md`**: добавь строки навигации для новых документов
   (`deploy/README.md`, раздел Deployment).

## Чего НЕ делать

- Не переписывать PARSER.md и NORMALIZATION_COMPLETE.md — пайплайн не менялся.
- Не менять код. Если найдено расхождение кода с задуманным — запиши в POLISH.md.

## Критерии приёмки

- Каждый endpoint в ARCHITECTURE.md § API Endpoints совпадает с фактической сигнатурой
  в `backend/app/api/`.
- В документации нет упоминаний старого поведения (загрузка всех треков на старте,
  локальная фильтрация, поштучный preload).
- Навигация INDEX.md ведёт на существующие файлы.
