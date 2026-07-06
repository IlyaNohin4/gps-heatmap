# T06 — Infinite scroll для списков Tracks и POI

**Приоритет:** P1 · **Оценка:** 2h · **Зависимости:** T01, T02, T05

## Цель

Списки треков (LeftIsland, вкладка Tracks) и POI (вкладка POI) должны подгружать
следующие 50 элементов автоматически при прокрутке до конца списка (IntersectionObserver),
используя `has_more` из envelope-ответов.

## Текущее состояние

- После T05: вкладка Tracks грузит первую страницу через `fetchTracksPage({..., limit: 50, offset: 0})`.
- После T02: есть `fetchPOIPage(params)` с `search/limit/offset`; вкладка POI пока
  рендерит все POI из mapStore.
- Вкладка POI: `frontend/src/components/Islands/POITab.jsx` (рендер списка POI;
  оба таба всегда в DOM, переключение через display — это поведение сохранить,
  см. POLISH.md, resolved issue про 1.1s jank).

## Что сделать

### Общий hook

1. Создай `frontend/src/hooks/useInfiniteScroll.js` (папку `hooks/` создай):
   hook принимает `loadMore` и `hasMore`, возвращает `sentinelRef` для div-«часового»
   в конце списка. Внутри — IntersectionObserver, отключение при `hasMore === false`,
   защита от повторного вызова, пока идёт загрузка.

### Вкладка Tracks (LeftIsland)

2. Состояние страницы: `items`, `total`, `hasMore`, `offset`. Смена фильтров (T05)
   сбрасывает `offset` в 0 и заменяет `items`; `loadMore` делает запрос с
   `offset: items.length` и **дописывает** `page.items` в конец.
3. В конец списка добавь sentinel-элемент + счётчик вида «N из M» (используй существующий
   i18n-механизм `frontend/src/i18n/translations.js`, добавь ключи для всех 5 языков:
   en, es, de, ru, uk).

### Вкладка POI (POITab)

4. Аналогично: список POI переведи на `fetchPOIPage` с локальным состоянием страницы
   (search-поле POITab, если есть — прокидывай в параметр `search`).
5. **Не трогай** поток данных карты: маркеры POI на карте продолжают питаться из
   `mapStore.pois` (все POI). Пагинация — только для списка внутри таба.

## Чего НЕ делать

- Не менять переключение табов (display:none/flex — оставить как есть).
- Не добавлять виртуализацию списка (react-window) — не нужно на этих объёмах.
- Не менять слои карты.

## Критерии приёмки

- Прокрутка списка треков до конца → автоматический запрос со следующим offset,
  элементы дописываются; по достижении total подгрузка прекращается.
- То же для списка POI.
- Смена фильтра/поиска сбрасывает список на первую страницу (без дублей).
- Нет параллельных дублирующих запросов при быстрой прокрутке.

## Как проверить

```bash
docker compose exec -T frontend npm run build
docker compose exec -T frontend npm test
# вручную: прокрутить оба списка до конца при >50 элементов; Network — запросы с offset
```

## Документация

- `architecture/ARCHITECTURE.md` § Frontend — Islands Layout: infinite scroll в обоих табах.
