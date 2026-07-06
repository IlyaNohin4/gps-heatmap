# T02 — Пагинация и поиск для GET /api/poi

**Приоритет:** P0 · **Оценка:** 1-2h · **Зависимости:** нет · **Блокирует:** T06

## Цель

`GET /api/poi` возвращает все POI пользователя (~1500+) одним списком, фильтр только по
category. Нужно: параметры `search`, `limit/offset` и envelope `{items, total, has_more}` —
по тому же образцу, что T01 для треков.

## Текущее состояние

- `backend/app/api/poi.py:151` — `@router.get("", response_model=List[POIResponse])`,
  `def list_poi(category: str = None, ...)` → `q.all()` без лимита.
- `frontend/src/api/poi.js` — `fetchPOI(category)` возвращает `data` (массив).
- Потребители: `frontend/src/App.jsx` (~строки 109, 154 — кладут результат в
  `useMapStore.setPOIs`), и поиск по компонентам `frontend/src/components/poi/`,
  `islands/POITab.jsx` (найди grep'ом `fetchPOI`).
- Важно: **карта рисует все POI** через `mapStore.pois` — этот поток данных должен
  по-прежнему получать все POI (или большой limit), пагинация нужна для списка в POITab.

## Что сделать

### Backend (`backend/app/api/poi.py`)

1. Модель `POIListResponse(BaseModel)`: `items: List[POIResponse]`, `total: int`,
   `has_more: bool`.
2. В `list_poi` добавь параметры:
   - `search: Optional[str] = Query(None, max_length=200)` → `q.filter(POI.name.ilike(f"%{search}%"))`
   - `limit: int = Query(50, ge=1, le=5000)`, `offset: int = Query(0, ge=0)`
3. `total = q.count()`; `items = q.order_by(POI.name.asc()).offset(offset).limit(limit).all()`;
   `has_more = offset + limit < total`. Верни envelope, `response_model=POIListResponse`.

### Frontend (`frontend/src/api/poi.js`)

4. `fetchPOIPage(params)` — возвращает весь envelope.
5. `fetchPOI(category)` — сохрани сигнатуру, но внутри запрашивай с `limit: 5000`
   и возвращай `data.items` (массив). Это поток данных для карты — он должен получать все POI.

### Frontend (потребители)

6. Grep `fetchPOI` по `frontend/src`; убедись, что все места после изменения получают массив
   и работают. Ничего больше не переделывай — пагинацию списка в UI делает T06.

### Тесты

7. Тесты в `backend/tests/`: search по подстроке (регистронезависимый), limit/offset,
   total/has_more, совместная работа category+search.

## Чего НЕ делать

- Не менять create/upload/update/delete/imports endpoints.
- Не переделывать POITab UI (T06).

## Критерии приёмки

- `GET /api/poi?search=озеро&limit=10` → до 10 совпадений + корректные total/has_more.
- Карта показывает все POI, как раньше; вкладка POI работает без изменений в поведении.

## Как проверить

```bash
docker compose exec backend python -m pytest tests/ -v
docker compose exec -T frontend npm run build
# вручную: вкладка POI, маркеры POI на карте
```

## Документация

- `architecture/ARCHITECTURE.md` § API Endpoints — обнови GET /api/poi.
