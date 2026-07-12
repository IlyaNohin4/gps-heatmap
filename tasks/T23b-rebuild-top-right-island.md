# T23b — Пересборка TopIsland + RightIsland на UI-kit

**Приоритет:** P1 · **Оценка:** 2-3h · **Зависимости:** T22, T23a ·
**Блок:** T22 → T23a → **T23b** → T23c → T23d → T23e → T24.

## Цель

Переписать слой представления `TopIsland.jsx` (настройки: units/theme/language/
track info, аккаунт: смена email/пароля, logout, delete account) и
`RightIsland.jsx` (zoom, city search, layers, speed/heatmap toggles, track
creator toggle, attribution) на компоненты UI-kit (`frontend/src/ui/`) и
токены. Поведение — 1:1, эталон структуры — TrackCard/POICard из T23a.

## Железное правило серии T23

**Данные-слой не трогается.** Хуки, эффекты, состояния, обработчики переносятся
в новый JSX копированием, без изменения логики. Инварианты, которые нельзя
задеть:
- `activePanel` из `appStore` управляет тем, какой попап открыт (top /
  right:city / right:layers / right:attr) — единственный источник, не заводить
  локальный state для открытости попапов.
- debounce для city search (400ms) и language save (300ms) — не менять тайминги.
- `expandedTrackInfo` chip-группа (off/partial/on) в TopIsland.
- delete account confirm-flow (клик → подтверждение 4с → повторный клик).

## Абсолютные запреты

- ❌ НЕ трогать `LeftIsland.jsx`, `POITab.jsx`, `TrackCard.jsx`, `POICard.jsx`
  (эталоны T23a, уже приняты).
- ❌ НЕ трогать `BottomIsland.jsx` и модалки (T23c/d/e).
- ❌ НЕ удалять `poi.css` и другие legacy-стили.
- ❌ НЕ делать `git checkout --` без явной команды пользователя.
- Расширение kit — только через вопрос пользователю.

## Чекпоинты (после КАЖДОГО: build → скриншот → приёмка пользователем → только потом дальше)

### ЧП-1: RightIsland — панель инструментов (zoom/search/layers/toggles)
Файл: `RightIsland.jsx` (вертикальная колонка иконок). Остров-контейнер →
`Panel`, кнопки-иконки → `Button iconOnly ghost` с `active` prop (для
cityOpen/layersOpen/attrOpen/showSpeed/showHeatmap/showTrackCreator).
Разделители (`divider`) — оставить как есть или перевести на токен-цвет
границы, без изменения визуала.

### ЧП-2: RightIsland — попапы (city search, layers, attribution)
Файл: `RightIsland.jsx` (три popover-блока). Popover-контейнеры → `Panel`.
Поле city search → `Input` с leftIcon (Search) и очисткой (X). Список
результатов города и список layer-опций — карточки-строки на токенах отступов
(--space-*), без числовых px кроме позиционирования попапа (`right: 52`).

### ЧП-3: TopIsland — шапка и секция Display
Файл: `TopIsland.jsx` (кнопка-заголовок острова + секция units/theme/
language/track info). Остров → `Panel`. Кнопка-заголовок (Map ico + название +
chevron) — на токенах. Group-чипы (metric/imperial, off/partial/on) → `Chip`
или `Button` с `active` (решить по образцу ЧП-2 T23a — уточнить у
пользователя, если неочевидно). Theme-toggle кнопка → `Button`.

### ЧП-4: TopIsland — секция Account
Файл: `TopIsland.jsx` (email/password change forms, logout, delete account).
Ссылки-кнопки (change email/password) → `Button ghost`. Инлайн-формы (email/
password inputs) → kit `Input`. Кнопки logout/delete → `Button` (secondary/
danger варианты — проверить, есть ли в kit `Button` danger-вариант; если нет —
согласовать с пользователем расширение).

### ЧП-5: финальный прогон
Полная функциональная приёмка: zoom работает, city search с debounce и
результатами, layers popover меняет слой карты, speed/heatmap/track-creator
toggles работают, attribution ссылки кликабельны, TopIsland сохраняет units/
theme/language (проверить перезагрузкой), track info chips применяются,
account-секция видна только при auth, change email/password шлют запросы,
logout/delete account работают как раньше. Визуально: остров и попапы
соответствуют /ui-demo и стилю LeftIsland (T23a).

## Критерии приёмки

- Все 5 чекпоинтов приняты пользователем явно (по одному).
- В переписанных файлах нет числовых px-отступов, кроме позиционирования
  острова/попапов, динамических цветов и `width: 140` у кнопок Sign out/
  Delete account в TopIsland (ЧП-4, согласованное исключение — пользователь
  явно попросил захардкодить одинаковую ширину, т.к. текст "Delete account"
  длиннее "Sign out" и `flex:1` давал неравный разъезд) — grep-проверка.
- Build зелёный после каждого чекпоинта.
- Функциональность 1:1 с состоянием до задачи (см. чекпоинт 5).

## Документация

- `tasks/README.md` — отметь T23b ✅.
- `POLISH.md` — заметка, если какие-то классы/стили стали мёртвыми.
