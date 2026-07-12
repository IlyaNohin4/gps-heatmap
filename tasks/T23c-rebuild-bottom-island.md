# T23c — Пересборка BottomIsland на UI-kit

**Приоритет:** P1 · **Оценка:** 2h · **Зависимости:** T22, T23a, T23b ·
**Блок:** T22 → T23a → T23b → **T23c** → T23d → T23e → T24.

## Цель

Переписать слой представления `BottomIsland.jsx` (Elevation/Speed/Slope
chart-панель) на компоненты UI-kit и токены. **Логика графика
(recharts-конфигурация, вычисление `chartData`, tooltip) не трогается** —
только обёртка, шапка, табы, кнопки и stat-блоки.

## Железное правило серии T23

**Данные-слой и графики не трогаются.** `useEffect` загрузки трека,
`chartData` computation, `handleZoomToTrack`/`handleDeselectTrack`,
`CustomTooltip`, весь JSX внутри `<AreaChart>`/`<ResponsiveContainer>` —
переносятся копированием без изменений. Инварианты:
- Заголовок острова виден всегда (свёрнутый/развёрнутый режим через
  `expanded` state) — это тот же паттерн display-переключения, что и табы
  LeftIsland, не переводить на unmount/remount.
- Табы Elevation/Speed/Slope видны только когда `selectedTrackId` задан.
- Zoom-to-track и deselect кнопки видны только при выбранном треке.

## Абсолютные запреты

- ❌ НЕ трогать `RightIsland.jsx`, `TopIsland.jsx` (T23b), `LeftIsland.jsx`,
  `TrackCard.jsx`, `POICard.jsx`, `POITab.jsx` (T23a).
- ❌ НЕ менять recharts-конфигурацию, цвета графика (`colors` map по вкладке),
  `CustomTooltip`, вычисление `chartData`.
- ❌ НЕ удалять `poi.css` и другие legacy-стили вне scope.
- ❌ НЕ делать `git checkout --` без явной команды пользователя.
- Расширение kit — только через вопрос пользователю.

## Чекпоинты (после КАЖДОГО: build → скриншот → приёмка пользователем → только потом дальше)

### ЧП-1: шапка острова (свёрнутое состояние, табы, кнопки действий)
Файл: `BottomIsland.jsx` (header-строка: табы, имя трека, zoom/deselect/
expand-collapse кнопки). Остров-контейнер → `Panel`. Табы Elevation/Speed/
Slope → `Button` с `active` (цвет активной вкладки динамический — оставить
инлайн, задокументировать как допустимое исключение из grep-проверки, раз
цвет зависит от `activeTab`, а не статичный токен). Icon-кнопки (zoom/
deselect/expand) → `Button iconOnly ghost`.

### ЧП-2: тело — обёртка графика и stat-строка
Файл: `BottomIsland.jsx` (body: контейнер вокруг `ResponsiveContainer`,
loading/empty/no-track states, stat-блоки внизу). Сам `<AreaChart>` и его
дочерние recharts-компоненты — НЕ трогать (это чужеродная библиотека со своим
API, не UI-kit). Обёртка/паддинги body → токены. Loading/empty/no-track
placeholder-тексты → на токенах (уже используют `var(--text-secondary)`,
проверить только отступы). Stat-блоки (distance/duration/avg speed/max speed/
elev gain/elev loss) — привести к единому виду на токенах, можно оставить
текущую inline-функцию `stat()`, если она уже token-based после правки.

### ЧП-3: финальный прогон
Полная функциональная приёмка: выбор трека показывает график, переключение
табов Elevation/Speed/Slope работает и меняет цвет/данные, zoom-to-track
летит к треку, deselect снимает выбор и сворачивает данные, expand/collapse
работает, stat-строка показывает верные значения (сверить с BottomIsland до
правки), loading/no-data состояния отображаются корректно. Визуально: остров
соответствует стилю LeftIsland/TopIsland/RightIsland (T23a/b) и /ui-demo.

## Критерии приёмки

- Все 3 чекпоинта приняты пользователем явно (по одному).
- В переписанных НЕ-recharts частях файла нет числовых px-отступов, кроме
  позиционирования острова и динамических цветов графика — grep-проверка
  (recharts JSX исключён из проверки, там числа — часть API библиотеки).
- Build зелёный после каждого чекпоинта.
- Recharts-логика и вычисления не изменены (diff по этим блокам — только
  форматирование/перенос, не логика).

## Документация

- `tasks/README.md` — отметь T23c ✅.
- `POLISH.md` — заметка, если что-то стало мёртвым кодом.
