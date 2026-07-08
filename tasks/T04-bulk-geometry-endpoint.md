# T04 — Bulk-endpoint геометрий вместо N preload-запросов

**Приоритет:** P0 · **Оценка:** 2-3h · **Зависимости:** T01

## Цель

Сейчас карта получает геометрии всех треков так: `App.jsx` в `requestIdleCallback`
вызывает `ensureTrackDetail(id)` для **каждого** трека → N отдельных запросов
`GET /api/tracks/{id}` c полными `raw_points` + `normalized_points` + `speed_segments`.
Это сотни/тысячи запросов и лишние данные.

Нужно: один endpoint `GET /api/tracks/geometries`, отдающий только `normalized_points`
всех треков пользователя, и одна загрузка на фронтенде.

## Текущее состояние

- `frontend/src/App.jsx:96-102` — preload-цикл:
  ```javascript
  requestIdleCallback(() => {
    const { ensureTrackDetail } = useMapStore.getState();
    trackList.forEach((track) => { ensureTrackDetail(track.id); });
  });
  ```
- `frontend/src/store/mapStore.js:86` — `ensureTrackDetail(id)`: кэш деталей
  `trackDetails` по id (содержит normalized_points, speed_segments).
- Слои карты (`frontend/src/map/TrackLayer.jsx:31`, `VisitLayer.jsx:24`,
  `SpeedLayer.jsx:50`) читают `track.normalized_points || track.raw_points`.
  **Изучи**, откуда слои берут объект `track` (из appStore.tracks + merge с
  trackDetails, или напрямую из mapStore) — от этого зависит точка интеграции.
- `backend/app/api/tracks.py` — `TrackDetail` (строка 184) — образец сериализации точек.

## Что сделать

### Backend (`backend/app/api/tracks.py`)

1. Новый endpoint **выше** `GET /{track_id}` (иначе FastAPI сматчит "geometries" как id):
   ```python
   class TrackGeometry(BaseModel):
       id: int
       normalized_points: Optional[object] = None

   @router.get("/geometries", response_model=List[TrackGeometry])
   def list_track_geometries(db=..., current_user=...):
       tracks = db.query(Track.id, Track.normalized_points)\
           .filter(Track.user_id == current_user.id).all()
       return [{"id": t.id, "normalized_points": t.normalized_points} for t in tracks]
   ```
   `speed_segments` и `raw_points` НЕ включать — они тяжёлые и нужны только выбранному треку.
2. Тест: geometries возвращает только треки текущего юзера, только id + points.

### Frontend

3. `frontend/src/api/tracks.js`: добавь `fetchTrackGeometries()` → `GET /api/tracks/geometries`.
4. `frontend/src/store/mapStore.js`: добавь action `loadAllGeometries()`:
   один запрос, результат merge'ится в кэш `trackDetails` по id
   (только поле normalized_points; не перезаписывай записи, где уже есть полный detail).
   `ensureTrackDetail(id)` должен по-прежнему догружать полный detail (speed_segments)
   при выборе трека — пометь bulk-записи флагом `partial: true` и догружай, если запрошен
   полный detail для partial-записи.
5. `frontend/src/App.jsx`: замени весь `requestIdleCallback`-блок на один вызов
   `useMapStore.getState().loadAllGeometries()`.
6. Проверь слои карты: все треки рисуются, как раньше (heatmap/track-линии), выбранный
   трек показывает скоростные сегменты и графики (Elevation/Speed/Slope).
7. **«Find in area» должен ограничивать карту** (решение пользователя, 2026-07-08):
   пространственный фильтр — исключение из правила «карта показывает всё».
   Сейчас это работает само (слои получают `tracks` из appStore, bbox-запрос кладёт
   туда подмножество). Если после твоих изменений слои начнут питаться из mapStore —
   сохрани поведение: `handleFindInArea` после ответа bbox-запроса передаёт список id
   в mapStore (например, `setVisibleTrackIds(ids)`), слои рисуют только эти id;
   `handleShowAll` сбрасывает фильтр (`setVisibleTrackIds(null)`). Списочные фильтры
   (search/sort/format/speed) на карту влиять НЕ должны.

## Чего НЕ делать

- Не менять формат normalized_points.
- Не добавлять bbox/тайлы/кластеризацию (FUTURE.md).
- Не удалять `ensureTrackDetail` — он нужен для выбранного трека.

## Критерии приёмки

- В Network-панели при загрузке приложения: 1 запрос `/api/tracks/geometries` вместо
  N запросов `/api/tracks/{id}`.
- Все треки видны на карте во всех режимах визуализации; выбор трека работает
  (детали, графики, speed segments).
- «Find in area» скрывает с карты треки вне области, «Show all» возвращает все;
  поиск/сортировка/фильтры списка карту не меняют.
- `GET /api/tracks/{track_id}` не сломан (проверь, что "geometries" не матчится как id).

## Как проверить

```bash
docker compose exec backend python -m pytest tests/ -v
docker compose exec -T frontend npm run build
docker compose exec -T frontend npm test   # Playwright E2E
# вручную: карта со всеми треками, клик по треку → графики в BottomIsland
```

## Документация

- `architecture/ARCHITECTURE.md` § API Endpoints — новый endpoint.
- `architecture/ARCHITECTURE.md` § Frontend — обнови описание потока данных карты.
