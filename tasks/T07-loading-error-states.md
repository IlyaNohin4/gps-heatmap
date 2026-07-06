# T07 — Loading/error states и фикс загрузки данных в App.jsx

**Приоритет:** P1 · **Оценка:** 1-2h · **Зависимости:** T05, T06 (чтобы не конфликтовать правками)

## Цель

Сбои загрузки данных сейчас проглатываются молча (`.catch(() => {})`) — пользователь
видит пустой экран без объяснения. Нужно: видимые ошибки (toast + retry), консистентные
loading-состояния, чистые зависимости useEffect.

## Текущее состояние

- `frontend/src/App.jsx:84-119` — effect загрузки: `fetchTracks().catch(() => {})`,
  `fetchPOI().catch(() => {})`; deps `[isAuthenticated, setTracks]` (несогласованные, у
  соседнего effect'а строкой выше стоит eslint-disable).
- `handleFindInArea` / `handleShowAll` (`App.jsx:163-179`) — `catch { /* ignore */ }`.
- В проекте уже используется `react-toastify` через динамический import
  (см. `handleTrackFilesFromOverlay`, `App.jsx:136`).
- Loading-состояния: `setTracksLoading` уже есть; есть компонент
  `frontend/src/components/LoadingIndicator.jsx`.
- В LeftIsland после T05 заготовлены `isLoading` / `error` state.

## Что сделать

### App.jsx

1. Все `catch(() => {})` и `catch { /* ignore */ }` при загрузке данных замени на:
   `console.error(...)` + toast с сообщением через i18n (добавь ключи в
   `frontend/src/i18n/translations.js` для 5 языков: en, es, de, ru, uk).
2. Приведи deps главного data-effect'а в порядок: включи все используемые стабильные
   ссылки (`setTracks` и т.п.) либо перенеси чтение store внутрь effect'а через
   `useAppStore.getState()` — цель: без eslint-disable и без лишних перезапусков.
   Проверь: effect должен перезапускаться ТОЛЬКО при смене `isAuthenticated`.
3. Загрузка треков и POI: оставь независимыми (падение POI не должно блокировать треки),
   но обе ветки должны показывать ошибку.

### LeftIsland / POITab

4. Используй `isLoading` (T05): пока идёт запрос — существующий LoadingIndicator или
   skeleton в списке; при `error` — сообщение + кнопка «Retry», повторяющая запрос.

## Чего НЕ делать

- Не добавлять ErrorBoundary (T08).
- Не подключать Sentry/мониторинг (FUTURE.md).
- Не менять логику upload-потоков — там тосты уже есть.

## Критерии приёмки

- Остановить backend (`docker compose stop backend`), перезагрузить страницу →
  toast с ошибкой и Retry в списке; запустить backend, нажать Retry → данные загрузились.
- Во время загрузки списков виден индикатор.
- `docker compose exec -T frontend npm run build` — без ESLint-warning'ов о deps
  в затронутых effect'ах.

## Как проверить

```bash
docker compose exec -T frontend npm run build
docker compose exec -T frontend npm test
docker compose stop backend   # проверить error-состояния, затем:
docker compose start backend
```

## Документация

- `POLISH.md` — отметь, что silent-fail загрузки данных исправлен.
