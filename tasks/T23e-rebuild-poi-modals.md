# T23e — Пересборка POI-модалок на UI-kit

**Приоритет:** P1 · **Оценка:** 1.5-2h · **Зависимости:** T22, T23a-d ·
**Блок:** T22 → T23a → T23b → T23c → T23d → **T23e** → T24 (последняя в серии).

## Цель

Переписать `POICreationModal.jsx`, `POIDeleteModal.jsx`,
`POIRenameModal.jsx` на компоненты UI-kit, используя те же паттерны, что
закреплены в T23d (kit `Modal`, portal-решение из T23d/ЧП-0, confirm-паттерн
из TrackDeleteModal). Поведение — 1:1.

## Железное правило серии T23

**Данные-слой не трогается.** `handleCreate`/`handleDelete`/`handleRename`,
API-вызовы (`createPOI`, `deletePOI`, `updatePOI`), валидации и toast —
копируются без изменений. Инварианты:
- `POIDeleteModal`/`POIRenameModal` используют `createPortal` — применить то
  же решение portal vs no-portal, что было принято в T23d/ЧП-0 (не
  пересматривать заново).
- `POIRenameModal` синхронизирует `nameValue`/`categoryValue` с `poi` через
  `useEffect` при открытии — сохранить.
- `POICreationModal` показывает координаты клика (`lat.toFixed(4)`) —
  сохранить.
- Категории (`CATEGORIES` массив) — общие между Creation и Rename модалками,
  не дублировать логику, но можно оставить как есть (уже задублирован в
  исходном коде — не в scope чинить, если пользователь не попросит).

## Абсолютные запреты

- ❌ НЕ трогать острова (T23a/b/c) или модалки треков/auth (T23d).
- ❌ НЕ менять API-вызовы (`createPOI`, `deletePOI`, `updatePOI`).
- ❌ НЕ пересматривать portal-решение — использовать то, что зафиксировано в
  T23d/ЧП-0.
- ❌ НЕ делать `git checkout --` без явной команды пользователя.

## Чекпоинты (после КАЖДОГО: build → скриншот → приёмка пользователем → только потом дальше)

### ЧП-1: POIDeleteModal
Файл: `POIDeleteModal.jsx`. Тот же паттерн, что `TrackDeleteModal` из T23d —
kit `Modal`, `Button` (secondary/danger). Должна выглядеть идентично по
устройству TrackDeleteModal.

### ЧП-2: POIRenameModal
Файл: `POIRenameModal.jsx`. Тот же паттерн, что `TrackRenameModal` из T23d +
доп. поле категории (select). `Input` для имени, категория — тем же способом,
что решили для формата в SaveTrackModal (T23d/ЧП-3).

### ЧП-3: POICreationModal
Файл: `POICreationModal.jsx`. kit `Modal`, `Input` для имени, select для
категории (тем же способом), `textarea` для описания (kit не имеет textarea —
оставить нативный на токенах, если пользователь не попросит завести в kit).
Coordinates-блок — на токенах, без изменения формата отображения.

### ЧП-4: финальный прогон всей серии T23 (a-e)
Полная функциональная приёмка ВСЕХ островов и модалок разом: LeftIsland
(Tracks/POI табы, поиск, фильтры, infinite scroll), TopIsland (settings,
account), RightIsland (zoom/search/layers/toggles), BottomIsland (графики),
все 7 модалок (create/delete/rename POI, delete/rename track, save track,
auth). Визуальная приёмка: все компоненты выглядят как единая система,
соответствуют /ui-demo, никаких визуальных регрессий по сравнению с
состоянием до T23.

## Критерии приёмки

- Все 4 чекпоинта приняты пользователем явно.
- Все 3 файла используют kit `Modal`, паттерн идентичен T23d.
- Build зелёный после каждого чекпоинта.
- Серия T23 (a-e) полностью завершена — все острова и модалки на UI-kit.

## Документация

- `tasks/README.md` — отметь T23e ✅ и всю серию T23 как готовую.
- `POLISH.md` — финальная сводка: какие legacy-классы (`poi.css` и т.п.)
  стали полностью мёртвыми и готовы к сносу в T24.
