# Tasks — реорганизация архитектуры

Набор самодостаточных задач для агентов. Один файл = одна задача = один PR/коммит.
Как запускать агентов и какие промпты использовать — [LAUNCH.md](LAUNCH.md).
Контекст: **личный инструмент** (1-5 пользователей, до ~10k треков), деплой на VDS (2 CPU / 8GB RAM)
через docker compose. Полный CI/CD и enterprise-фичи не нужны — они вынесены в [FUTURE.md](FUTURE.md).

## Целевая архитектура (после выполнения всех задач)

- **Backend владеет бизнес-логикой**: фильтрация/сортировка/пагинация — в SQL, под индексами.
- **Два контракта данных для треков**:
  - *Список* (`GET /api/tracks`) — лёгкие метаданные, пагинация `{items, total, has_more}`, фильтры.
  - *Карта* (`GET /api/tracks/geometries`) — все геометрии одним запросом (вместо N поштучных).
- **Frontend — тонкий клиент**: рендер + состояния loading/error, без локальной фильтрации.
- **Списочные фильтры влияют только на список**; карта всегда показывает все треки.
  Исключение — пространственный фильтр «Find in area»: он ограничивает и карту
  (треки вне области скрываются, «Show all» возвращает), см. T04 п.7.
- **Надёжность**: retry с backoff в Celery, ErrorBoundary, нормальные HTTP-коды ошибок.
- **DevOps минимально достаточный**: секреты в .env, прод-compose с nginx, бэкапы pg_dump.

## Порядок выполнения и зависимости

```
Волна 1 (независимые):  T01  T02  T03  T09  T10  T14  T15  T16
Волна 2:                T04 (после T01)   T05 (после T01)
Волна 3:                T06 (после T01,T02,T05)   T07 (после T05,T06)
Волна 4:                T08   T11 (после T10)   T12 (после T11)
Финал:                  T13 (после всех)
```

Совет: T14 (CI) стоит сделать самой первой — дальше каждый push будет проверяться автоматически.
Сразу после T14 — T17 (починка красных тестов на main): пока main красный, CI-gate бесполезен.

| # | Задача | Область | Приоритет | Оценка |
|---|--------|---------|-----------|--------|
| [T01](T01-tracks-api-pagination.md) | ✅ Пагинация и envelope для GET /api/tracks (готово 2026-07-08, PR #5) | Backend+API client | P0 | 2-3h |
| [T02](T02-poi-api-pagination-search.md) | ✅ Пагинация и поиск для GET /api/poi (готово 2026-07-08) | Backend+API client | P0 | 1-2h |
| [T03](T03-db-indices.md) | ✅ Индексы БД под фильтры (готово 2026-07-08, PR #4) | Database | P0 | 1h |
| [T04](T04-bulk-geometry-endpoint.md) | ✅ Bulk-endpoint геометрий вместо N preload-запросов (готово 2026-07-08) | Backend+Frontend | P0 | 2-3h |
| [T05](T05-server-side-filtering.md) | ✅ Серверная фильтрация списка треков (готово 2026-07-08) | Frontend | P0 | 2h |
| [T06](T06-infinite-scroll.md) | ✅ Infinite scroll для списков Tracks и POI (готово 2026-07-08) | Frontend | P1 | 2h |
| [T07](T07-loading-error-states.md) | ✅ Loading/error states, фикс useEffect (готово 2026-07-09) | Frontend | P1 | 1-2h |
| [T08](T08-error-boundary.md) | ✅ Глобальный ErrorBoundary (готово 2026-07-09) | Frontend | P1 | 1h |
| [T09](T09-celery-retry-backoff.md) | ✅ Retry с exponential backoff в Celery (готово 2026-07-08) | Backend | P1 | 1h |
| [T10](T10-env-secrets-hygiene.md) | ✅ Секреты из compose в .env (готово 2026-07-06, PR #3) | DevOps | P0 | 1h |
| [T11](T11-prod-docker-nginx.md) | ✅ Прод-компоуз: nginx, prod Dockerfiles, закрытые порты (готово 2026-07-09) | DevOps | P1 | 3-4h |
| [T12](T12-db-backup.md) | Бэкапы PostgreSQL (pg_dump + cron) | DevOps | P2 | 1h |
| [T14](T14-ci-test-gate.md) | ✅ CI test-gate: pytest + build на каждый push (готово 2026-07-06, PR #1) | DevOps | P1 | 1-2h |
| [T17](T17-fix-failing-tests.md) | ✅ Починить красные тесты на main (готово 2026-07-06, PR #2 — 132 passed) | Backend | P0 | 2-3h |
| [T15](T15-auth-rate-limit.md) | ✅ Rate limiting на auth-эндпоинты (готово 2026-07-08) | Backend | P1 | 1h |
| [T16](T16-poi-clustering.md) | ✅ Кластеризация POI-маркеров на карте (готово 2026-07-08) | Frontend | P1 | 2h |
| [T18](T18-notifications-style.md) | ✅ Единый стиль уведомлений: i18n всех тостов + эмодзи (готово 2026-07-09) | Frontend | P2 | 1h |
| [T19](T19-upload-refreshes-list.md) | ✅ Список треков обновляется после загрузки/удаления (готово 2026-07-09) | Frontend | P1 | 30-60m |
| [T20](T20-ui-spacing.md) | ❌ ОТМЕНЕНА (2026-07-10) в пользу блока UI-kit: T22 → T23a-e → T24 | Frontend | — | — |
| [T22](T22-ui-kit.md) | ✅ UI-kit: дизайн-токены + 6 базовых компонентов + /ui-demo (готово 2026-07-10) | Frontend | P1 | 3-4h |
| [T23a](T23a-rebuild-leftisland.md) | ✅ Пересборка LeftIsland на UI-kit (образец серии T23, готово 2026-07-11, v2 по чекпоинтам) | Frontend | P1 | 2-3h |
| [T25](T25-moving-avg-speed.md) | Средняя скорость по методике gpx.studio (moving time) | Backend | P1 | 2-3h |
| [T26](T26-stats-parity-audit.md) | Аудит статистики vs gpx.studio (read-only сравнение) | Backend | P2 | 2h |
| [T21](T21-auth-switch-resets-data.md) | ✅ Смена аккаунта сбрасывает клиентские данные (готово 2026-07-09) | Frontend | P1 | 1-1.5h |
| [T13](T13-docs-sync.md) | Синхронизация архитектурной документации (последняя) | Docs | P1 | 1-2h |

## Правила для агента (обязательны, см. также /CLAUDE.md)

1. **Никогда не запускай npm локально** — только `docker compose exec -T frontend npm ...`.
2. Перед кодом прочитай указанные в задаче разделы `architecture/ARCHITECTURE.md`.
3. Выполняй **только свою задачу**. Заметил проблему вне scope — запиши в `POLISH.md`, не чини.
4. После изменений прогони проверки из раздела «Как проверить» задачи. Минимум:
   - Backend: `docker compose exec backend python -m pytest`
   - Frontend: `docker compose exec -T frontend npm run build`
5. Обнови документацию, указанную в разделе «Документация» задачи.
6. Коммит — только после подтверждения пользователем («Ready to commit [files]. OK?»).
7. Не трогай парсер и нормализатор (`backend/app/services/normalizer.py`, `parser_factory.py`) — они стабильны и покрыты тестами.
8. Секреты не выводить в чат и не коммитить (`.env` в .gitignore).

## Инварианты проекта

- Скорость в БД — всегда km/h; высота — метры.
- `speed_segments` формат: `[{from:[lat,lon], to:[lat,lon], speed_kmh}]`.
- Обработка треков последовательная (Redis lock, 6 фаз) — не менять.
- Auth: JWT 30 дней, HS256.
