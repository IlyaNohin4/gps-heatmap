# T03 — Индексы БД под фильтры и сортировки

**Приоритет:** P0 · **Оценка:** 1h · **Зависимости:** нет

## Цель

Фильтры и сортировки `GET /api/tracks` (sort по датам/дистанции/скорости, фильтры по
формату/скорости, bbox по geom) работают без индексов — full table scan. Добавить индексы
миграцией Alembic.

## Текущее состояние

- Индексы есть только на: `tracks.id`, `tracks.user_id`, `poi.id`, `poi.user_id`,
  `poi.category`, `users.email`, `password_resets.token` (см. `backend/app/models/*.py`).
- Миграции: `backend/alembic/versions/` — последняя `0006_add_import_name_to_poi.py`.
  Посмотри её как образец оформления (revision/down_revision).
- **Проверь**, есть ли GIST-индекс на `tracks.geom` (нужен для bbox-запросов через
  `ST_Intersects`): смотри `0001_initial_schema.py` и
  `docker compose exec postgres psql -U user -d gps_heatmap -c "\d tracks"`.
  Если нет — добавь в эту же миграцию.

## Что сделать

1. Создай миграцию `backend/alembic/versions/0007_add_filter_indices.py`
   (down_revision = '0006_...', скопируй точный id из файла 0006).
2. В `upgrade()` создай индексы (в `downgrade()` — удали):
   ```python
   op.create_index("ix_tracks_recorded_at", "tracks", ["recorded_at"])
   op.create_index("ix_tracks_uploaded_at", "tracks", ["uploaded_at"])
   op.create_index("ix_tracks_speed_avg", "tracks", ["speed_avg"])
   op.create_index("ix_tracks_distance_km", "tracks", ["distance_km"])
   op.create_index("ix_tracks_file_format", "tracks", ["file_format"])
   op.create_index("ix_poi_name", "poi", ["name"])
   # если GIST-индекса на geom нет:
   # op.create_index("ix_tracks_geom", "tracks", ["geom"], postgresql_using="gist")
   ```
   Перед этим сверь реальные имена таблиц/колонок с моделями
   `backend/app/models/track.py` и `poi.py` (`__tablename__`).
3. Продублируй индексы в моделях (`index=True` у колонок), чтобы модели и БД не расходились.
4. Применить: `docker compose exec backend alembic upgrade head`.

## Чего НЕ делать

- Не добавлять pg_trgm / full-text search (вынесено в FUTURE.md).
- Не менять схему таблиц (колонки, типы).

## Критерии приёмки

- `alembic upgrade head` проходит; `alembic downgrade -1` откатывает и снова `upgrade head`.
- `\d tracks` в psql показывает новые индексы.
- `EXPLAIN SELECT * FROM tracks WHERE user_id=1 ORDER BY recorded_at DESC LIMIT 50;`
  использует индекс (Index Scan, не Seq Scan) — при наличии данных.

## Как проверить

```bash
docker compose exec backend alembic upgrade head
docker compose exec postgres psql -U user -d gps_heatmap -c "\d tracks"
docker compose exec postgres psql -U user -d gps_heatmap -c "\d poi"
docker compose exec backend python -m pytest tests/ -v
```

## Документация

- `architecture/ARCHITECTURE.md` § Database Models — упомяни индексы.
