# Polish / known issues

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

- [ ] Production deployment setup
  - Оптимизация production Dockerfile
  - nginx reverse proxy конфигурация
  - .env template и environment variable management
  - CI/CD pipeline — частично закрыто: CI есть (`.github/workflows/ci.yml`, T14: pytest + frontend build на push/PR); CD (деплой) — см. FUTURE.md
  - Database backup strategy
  - Monitoring & logging setup (e.g., Sentry)

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