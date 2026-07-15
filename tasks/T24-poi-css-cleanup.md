# T24 — Чистка мёртвого poi.css после серии T23

**Приоритет:** P2 · **Оценка:** 30-45m · **Зависимости:** T22, T23a-e ·
**Блок:** T22 → T23a → T23b → T23c → T23d → T23e → **T24** (последняя в
серии UI-kit).
**Происхождение:** POLISH.md, «T23a leftovers» (запись от T23a, 2026-07-11) +
финальная сводка T23e — после перевода `POITab.jsx`/`LeftIsland.jsx` на kit
`Input`/`Button` часть классов `poi.css` осталась в файле, но больше нигде не
используется в JSX.

## Проверено перед постановкой задачи

`grep -rn "poi-search\|poi-header\|poi-list-container\|poi-empty-state\|poi-loading\|poi-action-btn\|poi-actions"`
по всему `frontend/src/` — совпадения только в `frontend/src/styles/poi.css`,
ни одного `className` в JSX. Значит эти классы полностью мертвы:
`.poi-header`, `.poi-search-wrapper`, `.poi-search-icon`, `.poi-search-input`,
`.poi-search-clear`, `.poi-list-container`, `.poi-empty-state`,
`.poi-loading`, `.poi-actions`, `.poi-action-btn`.

Использующиеся классы (НЕ трогать): `.poi-tab` (`POITab.jsx:182`),
`.poi-status` (`POITab.jsx:303`).

**Важное уточнение:** пункт из POLISH.md про «строку поиска POI-таба на
legacy-вёрстке» и «height:34px костыль» **уже неактуален** — на момент
постановки T24 `POITab.jsx:184-198` уже использует kit `Input`
(`borderRadius: var(--radius-search)`, `height: '34px'`), идентично
`LeftIsland.jsx:178`. Хардкод `height: '34px'`/`paddingRight: 30` на обоих
инпутах — это НЕ то же самое, что раскиданные сырые px classes из poi.css;
трогать эти два инлайн-стиля в этой задаче не нужно (см. «Чего не делать»).

## Что сделать

1. Удалить из `frontend/src/styles/poi.css` мёртвые классы, перечисленные
   выше (`.poi-header`, `.poi-search-*`, `.poi-list-container`,
   `.poi-empty-state`, `.poi-loading`, `.poi-actions`, `.poi-action-btn`).
2. Оставить `.poi-tab` и `.poi-status` как есть (используются).
3. Перед удалением — ещё раз перепроверить `grep` по всему `frontend/src`
   (не только `.jsx`, но и `.js` на случай динамических classNames), чтобы
   не снести что-то живое.
4. Визуально проверить POI-таб (список, поиск, фильтры, пустое состояние,
   статус-бар снизу) в браузере до/после — не должно быть регрессий.

## Чего не делать

- Не трогать `.poi-tab`/`.poi-status` — используются.
- Не трогать инлайн `height: '34px'` в `POITab.jsx:191` и
  `LeftIsland.jsx:178` — это не в scope (не «мёртвый CSS», а активный код;
  унификация этих инпутов, если ещё нужна, — отдельная задача, не T24).
- Не трогать другие файлы `styles/` — только `poi.css`.
- Не менять компоненты `POITab.jsx`/`LeftIsland.jsx` — задача только про CSS.

## Критерии приёмки

- `frontend/src/styles/poi.css` содержит только `.poi-tab` и `.poi-status`.
- `docker compose exec -T frontend npm run build` — зелёный.
- Визуальная проверка POI-таба (браузер) — без регрессий, скриншот до/после.

## Документация

- `tasks/README.md` — отметь T24 ✅, зафиксируй завершение всей серии T22→T24.
- `POLISH.md` — обнови/закрой запись «T23a leftovers» (пункт про `poi.css`),
  уточни, что пункт про legacy-вёрстку строки поиска устарел ещё до T24
  (см. «Проверено перед постановкой задачи» выше).
