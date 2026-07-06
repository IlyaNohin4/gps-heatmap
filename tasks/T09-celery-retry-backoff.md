# T09 — Retry с exponential backoff в Celery

**Приоритет:** P1 · **Оценка:** 1h · **Зависимости:** нет

## Цель

`process_track` ретраит все исключения подряд с фиксированной задержкой 5s и при этом
уже пометил трек как error. Нужно: ретраить только временные сбои, с exponential backoff,
и помечать трек ошибкой только когда ретраи исчерпаны.

## Текущее состояние

- `backend/app/tasks/process_track.py:25` — `@celery_app.task(bind=True, name="process_track")`.
- Обработчик ошибок (строки ~101-106):
  ```python
  except Exception as exc:
      db.rollback()
      _set_error(db, track if 'track' in dir() else None, str(exc))
      raise self.retry(exc=exc, countdown=5, max_retries=2)
  ```
  Проблемы:
  1. `_set_error` вызывается **до** retry — трек помечен error, хотя ретрай может пройти.
  2. Ретраятся и постоянные ошибки (битый файл, ошибка парсинга) — бессмысленно.
  3. Фиксированный countdown=5 вместо backoff.
  4. `'track' in dir()` — хрупкая проверка (dir() без аргументов — локальные имена; работает,
     но лучше инициализировать `track = None` до try).
- Обработка последовательная через Redis lock (`_semaphore`) — НЕ менять.
- Парсер кидает свои исключения — посмотри в `backend/app/services/parser_factory.py`,
  какие типы исключений означают «файл невалиден» (постоянная ошибка).

## Что сделать

1. В декораторе задачи включи backoff:
   ```python
   @celery_app.task(
       bind=True, name="process_track",
       autoretry_for=(OperationalError,),   # sqlalchemy.exc + другие временные (redis.exceptions.ConnectionError)
       retry_backoff=True,                   # 1s, 2s, 4s...
       retry_backoff_max=60,
       retry_jitter=True,
       max_retries=3,
   )
   ```
   Точный набор «временных» исключений определи по коду задачи: ошибки соединения
   с БД (sqlalchemy `OperationalError`), Redis. Ошибки парсинга/валидации в него
   НЕ включай.
2. Перепиши except-блок:
   - `track = None` инициализируй до `try`;
   - постоянные ошибки (парсинг, невалидные данные) → `_set_error` + НЕ retry (return/raise без retry);
   - временные → пробрасывай для autoretry; `_set_error` вызывай только когда
     `self.request.retries >= self.max_retries` (ретраи исчерпаны).
3. Тесты: в `backend/tests/` найди тесты process_track (образец моков). Добавь: (a) битый
   файл → статус error без ретраев; (b) OperationalError → задача ретраится (можно через
   `task.apply()` с моком и проверкой `Retry` exception).

## Чего НЕ делать

- Не менять пайплайн нормализации (6 фаз) и Redis lock.
- Не добавлять dead-letter queue и мониторинг (FUTURE.md).

## Критерии приёмки

- Загрузка битого файла → трек в статусе error сразу, без 3 ретраев (см. логи).
- Все существующие тесты проходят: `docker compose exec backend python -m pytest`.
- В логах celery_worker при временной ошибке видны ретраи с растущим интервалом.

## Как проверить

```bash
docker compose exec backend python -m pytest tests/ -v
docker compose logs celery_worker --tail 50
# вручную: загрузить через UI заведомо битый .gpx (текстовый файл с расширением .gpx)
```

## Документация

- `architecture/ARCHITECTURE.md` § Celery & Background Processing — политика ретраев.
