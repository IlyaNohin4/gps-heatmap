# T01 — Пагинация и envelope для GET /api/tracks

**Приоритет:** P0 · **Оценка:** 2-3h · **Зависимости:** нет · **Блокирует:** T04, T05, T06

## Цель

`GET /api/tracks` сейчас возвращает голый список всех треков пользователя без лимита.
Нужно: пагинация `limit/offset` и envelope-ответ `{items, total, has_more}`, при этом
все существующие потребители на фронтенде продолжают работать.

## Текущее состояние

- `backend/app/api/tracks.py:202` — `@router.get("", response_model=List[TrackOut])`,
  `def list_tracks(...)`. Фильтры уже есть: `sort`, `search`, `bbox`, `file_format`,
  `speed_avg_min`, `speed_avg_max`. Пагинации нет.
- `sort` валидируется паттерном `^(newest|oldest|longest|fastest)$` — а UI (LeftIsland)
  предлагает ещё `slowest` и `shortest`. Их надо добавить.
- `frontend/src/api/tracks.js` — `fetchTracks(params)` возвращает `data` как есть.
- Потребители `fetchTracks` в `frontend/src/App.jsx` (строки ~91, 140, 168, 176, 306)
  используют паттерн `data.tracks || data` или `Array.isArray(data) ? data : ...` —
  т.е. ожидают массив.

## Что сделать

### Backend (`backend/app/api/tracks.py`)

1. Добавь Pydantic-модель рядом с `TrackOut`:
   ```python
   class TrackListResponse(BaseModel):
       items: List[TrackOut]
       total: int
       has_more: bool
   ```
2. В `list_tracks` добавь параметры:
   `limit: int = Query(50, ge=1, le=500)`, `offset: int = Query(0, ge=0)`.
3. Расширь паттерн sort: `^(newest|oldest|longest|shortest|fastest|slowest)$` и добавь
   соответствующие ветки в `order_map` (`shortest` = `distance_km.asc()`,
   `slowest` = `speed_avg.asc()`).
4. После применения фильтров: `total = q.count()`, затем
   `items = q.offset(offset).limit(limit).all()`,
   `has_more = offset + limit < total`.
5. `response_model=TrackListResponse`, верни envelope.

### Frontend (`frontend/src/api/tracks.js`)

6. Добавь `fetchTracksPage(params)` — возвращает весь envelope `{items, total, has_more}`.
7. Измени `fetchTracks(params)` — возвращает `data.items` (массив), чтобы существующие
   вызовы не сломались.

### Frontend (`frontend/src/App.jsx`)

8. Найди все вызовы `fetchTracks` (grep). Упрости обработку результата: теперь это
   всегда массив — убери `data.tracks || data` и `Array.isArray(data) ? ...`.
9. **Не меняй** логику `requestIdleCallback` preload — этим занимается T04.

### Тесты

10. Добавь в `backend/tests/` тесты: (a) дефолтный limit=50, (b) offset смещает выборку,
    (c) `total` считается до limit, (d) `has_more` корректен, (e) sort=slowest/shortest
    работают. Смотри существующие тесты треков как образец фикстур.

## Чего НЕ делать

- Не трогать `GET /tracks/{id}`, upload, publish и другие endpoints.
- Не менять фильтрацию в LeftIsland (T05) и preload (T04).
- Не добавлять rate limiting, кэш-заголовки.

## Критерии приёмки

- `GET /api/tracks` без параметров → 50 элементов, `total` = общее число, `has_more` корректен.
- `GET /api/tracks?limit=10&offset=10` → вторая страница.
- Все 6 значений sort работают, невалидный sort → 422.
- UI работает как раньше: список треков отображается, «Find in area» и «Show all» работают.

## Как проверить

```bash
docker compose exec backend python -m pytest tests/ -v
docker compose exec -T frontend npm run build
# вручную: открыть http://localhost:5173, проверить список треков
```

## Документация

- `architecture/ARCHITECTURE.md` § API Endpoints — обнови сигнатуру GET /api/tracks
  (параметры limit/offset, новые sort, формат ответа).
