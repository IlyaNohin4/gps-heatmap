# T08 — Глобальный ErrorBoundary

**Приоритет:** P1 · **Оценка:** 1h · **Зависимости:** нет

## Цель

Ошибка рендера в любом компоненте сейчас роняет всё приложение в белый экран.
Нужен ErrorBoundary верхнего уровня с fallback-экраном и кнопкой перезагрузки.

## Текущее состояние

- ErrorBoundary в проекте нет (grep `ErrorBoundary` по `frontend/src` пуст).
- Точка входа: `frontend/src/main.jsx` рендерит `App` (посмотри точную структуру —
  там может быть Router/провайдеры).
- Дизайн-система: CSS-переменные описаны в `architecture/ARCHITECTURE.md` § Design System
  (используй `var(--bg)`, `var(--text)`, `var(--accent)` и т.д., не хардкодь цвета).

## Что сделать

1. Создай `frontend/src/components/ErrorBoundary.jsx` — классовый компонент:
   - `static getDerivedStateFromError` → `{ hasError: true }`;
   - `componentDidCatch(error, info)` → `console.error('App crashed:', error, info)`;
   - fallback-рендер: центрированная карточка в стиле дизайн-системы с заголовком,
     кратким текстом и кнопкой «Reload», вызывающей `window.location.reload()`.
     Тексты — через i18n (`frontend/src/i18n/translations.js`, все 5 языков), но учти:
     если упал сам i18n-контекст, компонент должен отрисоваться с англ. фолбэком —
     оберни получение переводов в try/catch.
2. В `frontend/src/main.jsx` оберни дерево приложения в `<ErrorBoundary>` — максимально
   снаружи, но внутри того, что нужно самому fallback'у (если ничего не нужно — снаружи всего).
3. Для проверки временно добавь в любой компонент `throw new Error('test')`,
   убедись, что виден fallback, затем убери.

## Чего НЕ делать

- Не добавлять отправку ошибок в Sentry (FUTURE.md).
- Не оборачивать отдельные острова в собственные boundary — только глобальный.

## Критерии приёмки

- Искусственный `throw` в компоненте → fallback-экран вместо белого экрана,
  кнопка Reload восстанавливает приложение.
- Обычная работа приложения не изменилась.

## Как проверить

```bash
docker compose exec -T frontend npm run build
docker compose exec -T frontend npm test
```

## Документация

- `architecture/ARCHITECTURE.md` § Frontend — упомяни ErrorBoundary в структуре.
