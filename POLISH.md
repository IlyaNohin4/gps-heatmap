# Polish / known issues

- [ ] **`grade_stats` вычисляется, но никогда не персистится и не отдаётся** (найдено при
  синхронизации документации, T13, 2026-07-15)
  - `parser_factory.py` (`_build_segments` и 5 форматных парсеров, строки ~685-871) считает и
    возвращает `grade_stats` (climbing/descent/flat % и метрики) в результате парсинга
  - `process_track.py` этот ключ результата **не читает и не сохраняет** ни в одно поле `Track`
    — есть только `speed_segments` (там уже есть `grade_percent`/`type` на пару точек) и
    `elevation_gain/loss`
  - Frontend (`BottomIsland.jsx`, график Slope) тоже не использует `grade_stats` с бэкенда —
    считает наклон сам из `elevation` в `normalized_points`
  - Итог: `grade_stats` — мёртвый расчёт, тратит CPU на каждую обработку трека, результат
    нигде не используется. Не критично (небольшая нагрузка), но стоит либо убрать вычисление
    из парсера, либо начать реально использовать (например, персистить и отдавать через API,
    если понадобится агрегированная climbing/descent статистика на карточке трека вместо
    графика). Решение — за пользователем, не чинил (документация — не код).

- [ ] **Экспорт TCX/FIT некорректен** (найдено при архитектурном ревью, 2026-07-12)
  - `backend/app/api/tracks.py` — `_points_to_tcx` (строки 107-124) и `_points_to_fit`
    (строки 127-139), обе функции используются и в обычном экспорте (`/api/tracks/{id}/export`),
    и в потоке создания трека вручную на карте (`create_track`, строки 298-333, при
    `body.format in ("tcx", "fit")`)
  - **TCX**: `AltitudeMeters` захардкожен в `0`, `Time` захардкожен в `2024-01-01T00:00:00Z`
    для каждой точки — экспортированный файл теряет реальную высоту и время всех точек,
    не просто "упрощён", а фактически неверен
  - **FIT**: `_points_to_fit` пишет кастомный бинарный формат (lat/lon как `double` +
    заглушка на 4 байта на точку) без CRC-16 заголовка/трейлера и без обязательных FIT
    message definitions по спецификации Garmin — результат не является валидным `.fit`
    файлом, сторонние приложения (Strava, Garmin Connect) его, скорее всего, отклонят
  - Также ручная сборка XML в `_points_to_gpx`/`_points_to_kml`/`_points_to_tcx` через
    f-строки без экранирования — для координат (float) сейчас не опасно, но паттерн
    хрупкий: если в будущем в XML попадёт пользовательский текст (например, `name`)
    без `xml.sax.saxutils.escape()`, это сломает файл
  - **Нужна отдельная задача.** Решение за пользователем: чинить TCX/FIT через
    специализированные библиотеки (`fit-tool`/`garmin-fit-sdk` для FIT, нормальная
    сериализация времени/высоты для TCX) — либо убрать TCX/FIT из списка
    поддерживаемых форматов экспорта/создания трека, если усилия не оправданы
    для личного инструмента

- [x] **RESOLVED** — T23a leftovers: мёртвый `poi.css` после серии T23 (T24, 2026-07-15)
  - **Было:** `poi.css` не удалялся в T23a (запрещено правилами T23), но к T24
    классы `.poi-header`, `.poi-search-wrapper/icon/input/clear`,
    `.poi-list-container`, `.poi-empty-state`, `.poi-loading`, `.poi-actions`,
    `.poi-action-btn` больше нигде не использовались в JSX — строка поиска
    POI-таба и Import/Create к моменту T24 уже были переведены на kit
    `Input`/`Button` (в рамках T23b-e, не осталось отдельной legacy-вёрстки).
  - **Решение:** мёртвые классы удалены из `poi.css`, остались только
    используемые `.poi-tab` и `.poi-status`.
  - **Не трогали:** инлайн `height: '34px'` на инпутах поиска в
    `POITab.jsx`/`LeftIsland.jsx` — это активный код (не мёртвый CSS),
    унификация вне scope T24.
  - Собранное состояние `!sidebarOpen` (свёрнутый остров, маленький div с
    одной кнопкой в `LeftIsland.jsx`) всё ещё не переведено на
    `Panel`/`Button` — вне scope T23a/T24, не чинили.

- [x] **RESOLVED** — T26 audit: elevation_gain/loss расходились с gpx.studio на порядок (2026-07-12, зафиксировано 2026-07-13)
  - **Решение (вариант B, обсуждено с пользователем):** точечный фикс только для
    gain/loss, Phase 4/5 (Савицкий-Голай, график, grade-классификация) НЕ трогали.
    Добавлены `_rdp_profile_1d`/`_windowed_average_by_distance`/`_elevation_gain_loss`
    в `parser_factory.py` (порт методики gpx.studio из `compare_gpxstudio.py`,
    RDP eps=20 по профилю дистанция/высота + скользящее среднее 0.1км), вызывается
    в `_build_segments` вместо построчного суммирования дельт по SavGol-сглаженным
    точкам. Elevation самих точек (график Elevation, grade) не изменена.
  - **Результат:** медианная дельта с gpx.studio упала с +230%/+275% до **1.14%/1.35%**
    (проверено `compare_gpxstudio.py` после фикса). Тест `test_realistic_mountain_route`
    (climbing/flat/descent сплит) прошёл без изменений — Phase 5 не задета, все 153
    теста бэкенда зелёные.
  - **Backfill:** `backend/scripts/backfill_elevation.py` (новый, поддерживает
    `--dry-run`) пересчитал elevation_gain/loss для всех 31 существующих треков в БД
    через `_normalize_points → _build_segments` по уже сохранённым `raw_points` —
    остальные поля (raw_points, normalized_points, distance_km, speed_*, geom,
    regions) не тронуты. Новые/переобрабатываемые треки получают исправленные
    значения автоматически через обычный `process_track.py`.
  - **Trade-off, принят сознательно:** график Elevation и число elevation_gain/loss
    теперь считаются по разным степеням сглаживания одного трека (график — слабый
    SavGol, число — сильный RDP+window) — на глаз может показаться, что «не бьётся»,
    но это осознанный компромисс ради минимального риска (не трогаем защищённый
    Phase 4/5 и его тестовый эталон).
  - **Не решено, вне scope:** трек 152 (см. ниже) — отдельная аномалия в raw_points,
    не в методике.
  - **Backfill подтверждён (T27, 2026-07-15):** `backfill_elevation.py --dry-run`
    на все 31 трек в БД — `0 updated, 31 unchanged/skipped, 0 errors`, все
    сохранённые `elevation_gain/loss` уже совпадают с пересчётом через текущую
    методику, повторный прогон не требуется.

  - **Исходный аудит (архив, до фикса выше), 2026-07-12:**
  - **Скрипт:** `backend/scripts/compare_gpxstudio.py` (read-only, `docker compose
    exec backend python -m scripts.compare_gpxstudio`) — портировал методику
    gpx.studio (haversine-дистанция по raw-точкам; moving speed_avg 0.5-1500 км/ч;
    elevation gain/loss = RDP eps=20 по профилю высоты + скользящее окно 0.1км
    по дистанции; grade — окно 0.05км, посчитан справочно) и сравнил с нашими
    значениями в БД на 31 треке.
  - **distance_km / speed_avg** — сошлись отлично: медианная дельта 0.01% / 0.14%,
    считаем эквивалентными методиками (T25 подтверждён этим аудитом).
    Исключение — **трек 152** (`2021-08-07_16-12_Sat`): distance -51.5%,
    speed_avg -45.7%, сильно выбивается из общей картины — похоже на
    выброс/аномалию в самих raw_points (не в методике), не разбирался,
    решение за пользователем.
  - **elevation_gain / elevation_loss — РАСХОДЯТСЯ СИЛЬНО**: медианная дельта
    +230% / +275%, максимум до +3200% (трек 173). Наши значения систематически
    В НЕСКОЛЬКО РАЗ ВЫШЕ gpx.studio на каждом без исключения треке.
    Причина ожидаемая: наш Савицкий-Голай (окно 5 ТОЧЕК, Phase 4) сглаживает
    заметно слабее, чем RDP eps=20 + окно 0.1км ПО ДИСТАНЦИИ у gpx.studio —
    GPS-шум высоты (баротрон/приёмник) даёт много мелких пилообразных
    колебаний, которые наша методика считает реальным набором/сбросом высоты,
    а методика gpx.studio отфильтровывает через RDP по профилю.
  - **Решение — ждёт пользователя**: перенимать ли elevation-методику
    gpx.studio (RDP по high profile + distance-window) — отдельная задача,
    в этом аудите пайплайн НЕ менялся.

- [x] **RESOLVED** — Смена аккаунта (logout → login под другим юзером) не сбрасывала
  клиентские данные (T21, 2026-07-09)
  - **Проблема:** после T05/T06 списки треков (`LeftIsland`) и POI (`POITab`) живут
    в локальном состоянии компонентов, их debounce-эффекты не зависели от `isAuthenticated` —
    logout не очищал список, login под другим юзером до момента ответа сервера показывал
    список прошлого аккаунта; `mapStore.trackDetailCache`/`visibleTrackIds`/`pois` и др.
    вообще не сбрасывались нигде
  - **Решение:** `isAuthenticated` добавлен в deps обоих debounce-эффектов, при
    `!isAuthenticated` — список/total/hasMore/error очищаются, запрос не идёт;
    `mapStore.resetMapData()` (новое действие) очищает `pois`, `visibleTrackIds`,
    `trackDetailCache`, `imports`, `visibleImports`, `trackCreatorState`;
    `appStore.resetUserData()` очищает `selectedTrackId`, `isUploadingIds`; оба вызываются
    из `App.jsx` в ветке `!isAuthenticated` главного data-эффекта
  - **Что сознательно не тронуто:** UI-настройки (`activeLayer`, `showHeatmap/Speed/POI`,
    `poiCategories`, `showTrackCreator`, `poiCreationMode`), `tracksListVersion` (bump-механизм
    T19), `authStore`

- [x] **RESOLVED** — После загрузки/удаления/переименования трека список в сайдбаре
  не обновлялся без перезагрузки страницы (T19, 2026-07-09)
  - **Причина:** список треков живёт в локальном состоянии `LeftIsland` и
    перезапрашивался только при смене фильтров/`retryCount` — upload/delete/rename
    меняли только `appStore.tracks` (карту), список о них не узнавал
  - **Решение:** счётчик-триггер `appStore.tracksListVersion` +
    `bumpTracksListVersion()`, добавлен в deps debounce-эффекта списка в `LeftIsland`;
    bump вызывается после каждого успешного изменения состава треков (upload в
    `App.jsx`/`UploadZone.jsx`, сохранение нарисованного трека, delete/rename в
    `TrackCard.jsx`); `handleFindInArea`/`handleShowAll` не тронуты — они меняют
    карту, список фильтруется отдельно
  - **Trade-off:** bump сбрасывает список на первую страницу (offset=0) — прокрутка
    возвращается наверх; для upload/delete/rename это приемлемо, сохранение позиции
    прокрутки не реализовано (не по задаче)

- [x] **RESOLVED** — Silent-fail при загрузке данных (T07, 2026-07-09)
  - **Проблема:** `App.jsx` глотал ошибки загрузки треков/POI (`.catch(() => {})`,
    `catch { /* ignore */ }` в `handleFindInArea`/`handleShowAll`), пользователь видел
    пустой экран без объяснения; `mapStore.loadAllGeometries()` тоже падал молча
  - **Решение:** все catch'и заменены на `console.error` + `toast.error`
    (i18n-ключи `errors.tracks_load_failed`/`errors.poi_load_failed`, 5 языков);
    в LeftIsland/POITab при ошибке списка — сообщение + кнопка Retry, сбрасывающая
    error перед повторным запросом; главный data-effect в `App.jsx` теперь зависит
    только от `isAuthenticated` (чтение store через `getState()`), eslint-disable убран
  - [x] **FIXED in T18** — `mapStore.js` теперь использует прямой импорт `i18n.t()`
    (не React-компонент, но может импортировать инстанс i18n), тост для
    'Failed to load track geometries' теперь локализован через `errors.geometries_load_failed`

- [x] **RESOLVED** — VisitLayer (heatmap) получал tracks без геометрии (T04, 2026-07-08)
  - **Проблема:** `VisitLayer` брал `tracks` напрямую из `appStore.tracks` (`TrackOut`, без `normalized_points`/`raw_points`) — heatmap не имел точек для отрисовки, независимо от режима визуализации
  - **Причина:** список треков (`GET /api/tracks`) — облегчённый contract без geometry; только `TrackLayer`/`SpeedLayer` мёржили геометрию через `trackDetailCache`
  - **Решение:** добавлен `useAllTracksWithGeometry()` в `MapContainer.jsx`, мёржащий `appStore.tracks` с `mapStore.trackDetailCache` по id; `VisitLayer` теперь получает этот merged список
  - Заодно: обнаружено, что это выявилось только сейчас — до T04 preload через `ensureTrackDetail` тоже никогда не попадал в `appStore.tracks`

- [x] **RESOLVED** — LeftIsland POI tab delay when switching tabs (Performance, 2026-07-05)
  - **Проблема:** При клике на вкладку POI происходило 1.1s зависание браузера
  - **Причина:** Условный рендер POITab вызывал синхронный mount и render ВСЕ POI одновременно
  - **Решение:** Откатили conditional rendering, вернули display:none/flex
  - **Как это работает:** Оба таба (Tracks, POI) всегда в DOM, смонтированы при загрузке (асинхронно). Переключение = просто display change, не React render
  - **Результат:** Мгновенное открытие POI таба ⚡
  - **DevTools Profile:** Было performSyncWorkOnRoot 1.1s jank, теперь только CSS change
  - **Trade-off:** +50KB памяти за -1.1s задержку. Отличный результат!

- [x] **RESOLVED** — POI tab снова терял display:none/flex (regression, T06, 2026-07-08)
  - **Проблема:** к моменту T06 `LeftIsland.jsx` рендерил POITab условно (`{currentTab === 'poi' && <POITab/>}`)
    вместо display-переключения из резолва выше — POITab размонтировался при уходе с таба и терял
    состояние (пагинированный список POI перезагружался заново при каждом переключении)
  - **Причина:** регрессия где-то между 2026-07-05 и T05/T06, не найдено конкретным коммитом
  - **Решение:** восстановлено задокументированное поведение — POITab всегда смонтирован,
    переключение через `display: currentTab === 'poi' ? 'flex' : 'none'`, как у Tracks-таба
  - **Почему это всё ещё дёшево:** после T06 список POI в табе пагинирован (50 элементов на странице,
    не все 1585+ POI разом) — trade-off из исходного резолва остаётся в силе

---

- [x] **RESOLVED** — Backend-тесты падали на main (T17, 2026-07-06)
  - **Что было:** 8 failed + 2 errors, обнаружено при добавлении CI (T14)
  - **Итог по каждому случаю:**
    - `TestBuildSegments` (4 теста) — тесты устарели: `_build_segments()` осознанно возвращает 7-е значение (`stats` с grade/elevation), тесты распаковывали 6
    - `TestParseKML::test_no_speed_without_timestamps`, `TestParseGeoJSON::test_no_time_so_no_speed` — тесты устарели: контракт `speed_segments` расширен (grade_percent/type/distance_km для каждой пары точек, даже без скорости), `speed_segments == []` больше не верно
    - `test_poi_parser::test_parse_kml_multiple`, `test_category_detection` ('Bike Shop'/'Bike Rental Shop' → food вместо bike) — неоднозначная категоризация, решено с пользователем: убрано слишком общее слово `'shop'`/`'store'` из ключевых слов категории `food` в `poi_parser.py`
    - `test_db_integration.py` (2 ошибки) — тест использовал несуществующую фикстуру `db_session` и SQLite-движок без таблицы `tracks` (ARRAY/PostGIS не поддерживаются SQLite); добавлена `db_session` в `conftest.py`, использующая реальный Postgres с savepoint-изоляцией; тесты также не сериализовали `time` в ISO-строки перед записью в JSON-колонку (как это делает `process_track.py`) — исправлено
  - Заодно убрана мёртвая опция `asyncio_mode = auto` из `pytest.ini` (pytest-asyncio не установлен, асинхронных тестов нет)
  - Результат: `pytest tests/` — 132 passed, 0 failed, 0 errors

---

- [x] **RESOLVED** — Нормализатор не фильтрует GPS-выбросы скорости (Phase 2)
  - Решение: Hard limit 200 km/h (физический максимум для велосипеда)
  - Результат: Все невозможные скорости (247 km/h) отсекаются
  - Тест: реальный трек показывает max 115 км/ч (реалистично для спуска)
---

- [ ] После T04 (bulk-geometries) наблюдалась ощутимая медлительность UI/карты
  (загрузка, отклик) при ручной проверке — не измерено профайлером.
  Кандидаты на профилирование: размер ответа `/api/tracks/geometries`,
  пересчёт `L.heatLayer` на все точки, накладные расходы Vite dev-режима.
  См. `tasks/FUTURE.md` («Серверный heatmap», «Geometries с bbox/зумом»)
  — возможно, туда же. Не чинил, вне scope T04.

## ⚠️ ОКРУЖЕНИЕ

- [ ] Playwright браузеры не установлены в контейнере frontend (обнаружено в T16, 2026-07-08)
  - `npm run test:e2e` падает на всех 33 тестах: `browserType.launch: Executable doesn't exist ... chrome-headless-shell`
  - Нужно `npx playwright install` (и/или chromium deps) внутри образа/контейнера frontend
  - Вне scope T16 (кластеризация POI) — не чинил

---

## ⭐⭐⭐ КРИТИЧНЫЕ (MVP blockers)

- [ ] **Full integration test** (MVP REQUIREMENT)
  - Загрузить реальный трек через UI
  - Проверить что данные появились на карте (normalized_points)
  - Проверить что все графики работают (Elevation, Speed, Slope)
  - Проверить что Slope chart рассчитывается корректно
  - Est. Time: 1-2 часа
  
  **NOTE:** Grade stats (climbing%, flat%, descent%) НЕ нужны в UI
  Slope chart в BottomIsland достаточен для анализа уклона

---

## ⭐⭐ ВАЖНЫЕ

- [ ] Отправка email — Resend API интеграция
  - Resend API настроен в .env.example (RESEND_API_KEY)
  - Нужна реальная интеграция для:
    - Сброса пароля (forgot-password endpoint существует)
    - Подтверждения email при регистрации
    - Смены email в профиле

- [x] **RESOLVED** — Production deployment setup: compose/nginx (T11, 2026-07-09)
  - `docker-compose.prod.yml` — отдельный прод-компоуз: postgres/redis без внешних
    портов, backend без reload/bind-mount (`--workers 2 --proxy-headers`, healthcheck
    через `/health`), celery без watchmedo, frontend — статика за nginx, наружу только 80
  - `frontend/Dockerfile.prod` — multi-stage build (node → nginx:alpine)
  - `deploy/nginx.conf` — прокси `/api/`, `/docs`/`/redoc`/`/openapi.json` на backend,
    SPA fallback, `client_max_body_size 25m`, gzip
  - `deploy/README.md` — шпаргалка деплоя на VDS
  - CI/CD pipeline — частично закрыто: CI есть (`.github/workflows/ci.yml`, T14: pytest + frontend build на push/PR); CD (деплой) — см. FUTURE.md
  - Ещё не сделано: Monitoring & logging setup (Sentry, см. FUTURE.md), автоматизация SSL (см. deploy/README.md § HTTPS)

- [x] **RESOLVED** — Database backup strategy (T12, 2026-07-15)
  - `deploy/backup.sh` — `pg_dump -Fc` (custom format) в `backups/` (в `.gitignore`),
    ротация файлов старше `KEEP_DAYS` (default 14) через `find -mtime +N -delete`
  - `deploy/restore.sh` — `pg_restore --clean --if-exists` с подтверждением `[y/N]`
    перед перезаписью БД
  - `deploy/README.md` § Backups — cron-строка (`0 3 * * *`), проверка дампа
    (`pg_restore --list`), восстановление, рекомендация `rsync` за пределы VDS
  - **Проверено** на изолированном локальном прод-стеке
    (`docker compose -p gps-heatmap-prod -f docker-compose.prod.yml`, не задевая
    dev-стек): создал тестовый трек → `backup.sh` → удалил трек через SQL →
    `restore.sh` → трек вернулся; отдельно проверена ротация (фейковый файл с
    датой 20 дней назад удалился при следующем запуске `backup.sh`)

---

## ⭐ NICE-TO-HAVE

- [ ] Добавить плавные анимации:
  - Раскрытие/сворачивание меню настроек и островов (TopIsland, RightIsland поповеры)
  - Появление/исчезновение элементов (toast уведомления, модальные окна)
  - Переходы между состояниями карты/режимов визуализации (смена тайлового слоя, переключение Speed/Heatmap)

- [ ] Speed legend positioning verification
  - Проверить что легенда работает во всех размерах viewport
  - Currently fixed в bottom-left corner

- [ ] POI search UI (if Overpass API enabled)
  - Food, Amenities, Medical, Tourism, Bicycle, Public Transport
  - Debounced search с 350ms delay

- [ ] Reset bearing button (currently broken)
  - Кнопка в RightIsland не работает

- [ ] Track creation tool
  - Возможность рисовать трек на карте
  - Сохранение как новый трек

---

## 🔧 BACKEND TASKS

### Not Yet Started

- [ ] OpenRouteService routing integration (optional)
  - 2500 req/day free tier
  - Интеграция для route planning

- [ ] POI search via Overpass API (under question)
  - Food, Amenities, Medical, Tourism, Bicycle, Public Transport
  - Возможно не нужна

- [ ] Track creation from scratch (under question)
  - API для создания треков без файла
  - Рисование на карте
  - Возможно не нужна

- [ ] More granular error handling & logging
  - Улучшить error messages
  - Добавить structured logging
  - Better debugging for track processing issues

---

## ✅ Решенные задачи (Normalization Pipeline — Все 6 фаз)

### Phase 1: GPS Drift Collapse
- [x] Кластеризация близких точек (< 3м, > 10с)
- [x] Замена кластера на центроид
- [x] Тесты: все проходят

### Phase 2: Speed Outlier Removal  
- [x] Hard limit 200 км/ч для невозможных скоростей
- [x] Исправлен баг: 247 км/ч на реальном треке
- [x] Тесты: все проходят

### Phase 3: Kalman Filter
- [x] 1D фильтр для lat и lon независимо
- [x] Параметры оптимизированы (Q=0.01, R=0.00001)
- [x] Сглаживание GPS координат
- [x] Тесты: все проходят

### Phase 4: Elevation Smoothing
- [x] Савицкий-Голай фильтр (window=5, polyorder=2)
- [x] 76.3% variance reduction на плоских участках
- [x] 68.6% false elevation gain reduction
- [x] Тесты: все проходят

### Phase 5: Grade Calculation & Classification
- [x] Формула grade = (ele_delta / distance) * 100
- [x] Классификация: climbing (>5%), flat, descent (<-5%)
- [x] Статистика по маршруту (% climbing/flat/descent)
- [x] Тесты: горный маршрут (37% climbing, 25% flat, 37% descent)

### Phase 6: Douglas-Peucker Simplification
- [x] Алгоритм упрощения траектории
- [x] Tolerance 15м (настраиваемо)
- [x] 91-93% сокращение точек (4325→360, 1463→104)
- [x] Тесты: все проходят

### Bug Fixes
- [x] **elevation_gain/loss = 0.0** (критичный)
  - Причина: `_build_segments()` не отслеживала высоты
  - Решение: добавил tracking в цикле по points
  - Результат: теперь рассчитываются правильно для всех 5 парсеров
  
### Validation (Real-world testing)
- [x] Трек 1 (2021-02-06, 94км): 7 validation checks ✓
- [x] Трек 2 (2024-11-17, 15км): 8 validation checks ✓
- [x] Distance accuracy: 0.00% error
- [x] Elevation metrics: realistic values
- [x] All parser formats tested (GPX, KML, TCX, FIT, GeoJSON)