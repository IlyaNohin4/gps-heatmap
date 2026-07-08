# T05 — Серверная фильтрация списка треков (LeftIsland)

**Приоритет:** P0 · **Оценка:** 2h · **Зависимости:** T01 · **Блокирует:** T06, T07

## Цель

LeftIsland фильтрует и сортирует треки локально через `useMemo` — дублирование
бэкенд-логики на неверном слое. Перевести список на серверную фильтрацию:
изменение фильтра → запрос `fetchTracksPage({...})` → рендер готового результата.

**Важное решение:** фильтры влияют **только на список** в LeftIsland. Карта продолжает
показывать все треки (она питается из mapStore, см. T04). Ничего в слоях карты не менять.

## Текущее состояние

- `frontend/src/components/Islands/LeftIsland.jsx:63` — `const filtered = useMemo(...)`:
  локальный search (includes), formatFilter, speedRange, 6 вариантов sort. Внутри —
  временные замеры `performance.mark/measure` и `console.log('🔍 Track filtering...')`
  (добавлены в perf-сессии, их нужно удалить).
- Состояние фильтров: `useState` в LeftIsland — `search`, `sort`, `formatFilter`,
  `speedRange` ([0, 200]).
- Треки приходят из appStore (`tracks`, `setTracks`) — заполняются в `App.jsx`.
- После T01 доступен `fetchTracksPage(params)` → `{items, total, has_more}`,
  параметры бэкенда: `sort`, `search`, `file_format`, `speed_avg_min`, `speed_avg_max`,
  `limit`, `offset`.

## Что сделать

1. В LeftIsland удали `useMemo`-фильтрацию целиком (вместе с performance.mark/measure
   и console.log).
2. Добавь `useEffect`, который при изменении `search / sort / formatFilter / speedRange`
   вызывает `fetchTracksPage` и кладёт результат в состояние списка:
   ```javascript
   useEffect(() => {
     let cancelled = false;
     const timer = setTimeout(async () => {
       try {
         const params = { sort, limit: 50, offset: 0 };
         if (search.trim()) params.search = search.trim();
         if (formatFilter !== 'all') params.file_format = formatFilter;
         if (speedRange[0] > 0) params.speed_avg_min = speedRange[0];
         if (speedRange[1] < 200) params.speed_avg_max = speedRange[1];
         const page = await fetchTracksPage(params);
         if (!cancelled) { /* setItems(page.items); setTotal(page.total); ... */ }
       } catch (err) { /* setError(...) */ }
     }, 300); // debounce для search
     return () => { cancelled = true; clearTimeout(timer); };
   }, [search, sort, formatFilter, speedRange]);
   ```
3. Где держать результат — **обязательное требование** (после T04, 2026-07-08):
   `appStore.tracks` ПЕРЕТИРАТЬ НЕЛЬЗЯ — от него напрямую зависит heatmap
   (VisitLayer получает merged appStore.tracks через MapContainer, см. T04).
   Результаты фильтрации держи в локальном состоянии LeftIsland (useState).
   Исключение из правила — существующие «Find in area»/«Show all» в App.jsx:
   они пишут в appStore.tracks сознательно (пространственный фильтр должен
   ограничивать карту, решение пользователя) — их не трогай.
4. Сортировка значений UI ↔ API: UI использует `newest|oldest|longest|shortest|fastest|slowest`
   — все они поддержаны бэкендом после T01. Маппинг не нужен, передавай как есть.
5. Пустой результат — покажи существующее empty-состояние списка.

## Чего НЕ делать

- Не делать infinite scroll (T06) — только первая страница (limit 50).
- Не добавлять loading-спиннеры/тосты (T07) — но заготовь места (`isLoading`, `error`
  state), пусть пока просто существуют.
- Не менять POITab.
- Не трогать слои карты и mapStore.

## Критерии приёмки

- Ввод в поиск → через ~300ms один запрос `/api/tracks?search=...` (видно в Network),
  список обновляется. Нет запроса на каждый символ.
- Смена sort/format/speed — список обновляется с сервера; `useMemo`-фильтрации
  и perf-логов в коде больше нет.
- Карта по-прежнему показывает все треки независимо от фильтров.
- Быстрая смена фильтров не приводит к «миганию» устаревших результатов
  (флаг `cancelled` отрабатывает).

## Как проверить

```bash
docker compose exec -T frontend npm run build
docker compose exec -T frontend npm test
# вручную: поиск, все сортировки, фильтр формата, слайдер скорости; карта не меняется
```

## Документация

- `architecture/ARCHITECTURE.md` § Frontend — Islands Layout: обнови описание LeftIsland
  (серверная фильтрация, debounce 300ms, фильтры не влияют на карту).
