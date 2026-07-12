# T23d — Пересборка модалок треков + AuthModal на UI-kit

**Приоритет:** P1 · **Оценка:** 2-3h · **Зависимости:** T22, T23a, T23b, T23c ·
**Блок:** T22 → T23a → T23b → T23c → **T23d** → T23e → T24.

## Цель

Переписать `SaveTrackModal.jsx`, `AuthModal.jsx`, `TrackRenameModal.jsx`,
`TrackDeleteModal.jsx` на компоненты UI-kit. Поведение — 1:1.

## Важная находка (не была в scope T22)

В ките уже есть готовый `frontend/src/ui/Modal.jsx` (overlay + `.island` +
Escape-закрытие + header/actions slots), но **ни одна из существующих модалок
его не использует** — каждая вручную реализует свой overlay div, portal,
header с крестиком. Задача T23d/e — не просто заменить кнопки/инпуты, а
**перевести структуру на kit `Modal`**, сохранив специфику каждой модалки
(portal через `createPortal`, где он есть; Escape-обработку, если своя
отличается от Modal-дефолтной).

## Железное правило серии T23

**Данные-слой не трогается.** Все `handle*` функции (rename, delete, login/
register/forgot, save/download track), валидации, toast-вызовы — переносятся
копированием без изменений. Инварианты:
- `TrackRenameModal`/`TrackDeleteModal`/`POIRenameModal`/`POIDeleteModal`
  используют `createPortal(content, document.body)` — если переход на kit
  `Modal` меняет это, нужно явно решить (kit `Modal` рендерится напрямую, не
  через portal) — **согласовать с пользователем**, не решать самостоятельно.
- Enter/Escape keydown-хендлеры на инпутах (rename modals) — сохранить.
- `SaveTrackModal` генерирует файлы (GPX/KML/GeoJSON/TCX/FIT) на клиенте —
  это логика форматов, не UI, не трогать `generate*`/`downloadFile`.
- `AuthModal` — login/register/forgot-password табы и режимы (`tab`,
  `forgotMode`) — сохранить структуру переключения.

## Абсолютные запреты

- ❌ НЕ трогать острова (`LeftIsland`, `TopIsland`, `RightIsland`,
  `BottomIsland`) — T23a/b/c, уже приняты.
- ❌ НЕ трогать POI-модалки (`POICreationModal`, `POIDeleteModal`,
  `POIRenameModal`) — это T23e.
- ❌ НЕ менять `generateGPX/KML/GeoJSON/TCX/FIT`, `downloadFile`,
  API-вызовы (`renameTrack`, `deleteTrack`, `apiLogin/apiRegister/
  forgotPassword`).
- ❌ НЕ решать самостоятельно вопрос portal vs no-portal — спросить.
- ❌ НЕ делать `git checkout --` без явной команды пользователя.

## Чекпоинты (после КАЖДОГО: build → скриншот → приёмка пользователем → только потом дальше)

### ЧП-0: решить portal-вопрос
Прежде чем трогать код — задать пользователю вопрос: расширять ли kit `Modal`
поддержкой `usePortal` prop (нужен для z-index поверх карты/других островов),
или оставить обёртку `createPortal` вокруг `<Modal>` в каждом файле, где она
была. Зафиксировать решение перед ЧП-1.

### ЧП-1: TrackDeleteModal (самая простая — confirm-паттерн)
Файл: `TrackDeleteModal.jsx`. Перевести на kit `Modal` (title="Delete Track",
actions с Cancel/Yes-кнопками). Кнопки → `Button` (secondary/danger).
Сохранить portal-решение из ЧП-0. Это эталон confirm-модалки для остальных.

### ЧП-2: TrackRenameModal
Файл: `TrackRenameModal.jsx`. Та же структура, что ЧП-1 + `Input` вместо
голого `<input>`, Enter/Escape-хендлеры на нём сохранить.

### ЧП-3: SaveTrackModal
Файл: `SaveTrackModal.jsx`. kit `Modal`, `Input` для имени трека, `select`
формата (можно оставить нативным select, если в kit нет Select-компонента —
уточнить у пользователя, заводить ли). Три кнопки (Cancel/Download/Save to
DB) → `Button` с соответствующими вариантами.

### ЧП-4: AuthModal
Файл: `AuthModal.jsx`. Самая сложная — табы login/register, forgot-password
режим, password-visibility toggle (`PasswordInput`). kit `Modal` для обёртки;
табы → `Button active`; поля → `Input` с leftIcon (Mail/Lock) — проверить,
поддерживает ли kit `Input` right-side icon-кнопку (eye toggle), если нет —
оставить кастомный wrapper вокруг `Input`, согласовать с пользователем.

### ЧП-5: финальный прогон
Полная функциональная приёмка: delete track подтверждает и удаляет, rename
track сохраняет по Enter и кнопке, Escape закрывает обе, SaveTrackModal
скачивает файл в каждом из 5 форматов и сохраняет в БД, AuthModal — login,
register (с валидацией mismatch/min-length), forgot-password шлёт письмо,
все toast-сообщения на месте. Z-index/portal-поведение не сломано (модалка
поверх карты и островов).

## Критерии приёмки

- Все 6 чекпоинтов (0-5) пройдены, 0-4 явно приняты пользователем.
- Все 4 файла используют kit `Modal` как базовую структуру.
- Build зелёный после каждого чекпоинта.
- Нет числовых px-отступов кроме согласованных исключений (grep-проверка).

## Документация

- `tasks/README.md` — отметь T23d ✅.
- Если kit `Modal` получил новый prop (`usePortal` и т.п.) —
  `architecture/ARCHITECTURE.md` § Design System.
