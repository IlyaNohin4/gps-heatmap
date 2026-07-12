# GPS Heatmap — Архитектура

## 📋 Навигация

**Для разных задач читай:**
| Задача | Файл | Раздел |
|--------|------|---------|
| Добавить API эндпоинт | ARCHITECTURE.md | API Endpoints |
| Менять парсер/нормализацию | PARSER.md | полностью |
| Менять UI / острова | ARCHITECTURE.md | Frontend — Islands Layout |
| Добавить фоновую задачу | ARCHITECTURE.md | Celery & Background |
| Менять БД модели | ARCHITECTURE.md | Database Models |
| Исправлять баги | ../POLISH.md | Known Issues |

---

## 🏗️ Стек и сервисы

| Компонент | Технология |
|-----------|-----------|
| **Backend** | FastAPI + PostgreSQL + PostGIS + Redis + Celery |
| **Frontend** | React 18 + Vite + Leaflet + Zustand |
| **Auth** | JWT (30 дней) |
| **Email** | Resend API (в .env) |
| **Routing** | OpenRouteService (optional, 2500 req/day) |
| **Structure** | /frontend + /backend, Docker Compose |

**Docker services:** `postgres`, `redis`, `backend`, `celery_worker`, `frontend`

**Build:** `docker compose up --build` для dev, `docker compose exec -T frontend npm run build` для verify

---

## 🗄️ Database Models

### User
```
id, email, password_hash, created_at
language (en|es|de|ru|uk)
theme (light|dark)
unit_distance (km|mi)
unit_speed (km/h|mph|m/s|knots)
```

### Track
```
id, user_id, name
file_format (gpx|kml|tcx|fit|geojson)
distance_km, duration_sec, recorded_at, uploaded_at
speed_avg, speed_max, speed_min             [km/h]
elevation_gain, elevation_loss              [m]
regions (ARRAY TEXT)                        [Nominatim regions, 3 точки]
geom (PostGIS LineString)                   [для bbox фильтрации]
raw_points (JSON)                           [оригинальные GPS точки]
normalized_points (JSON)                    [после фильтрации + Kalman]
speed_segments (JSON)                       [{from:[lat,lon], to:[lat,lon], speed_kmh}]
grade_stats (JSON)                          [climbing%, descent%, flat%, grade metrics]
is_public (bool), public_token (string)
```

### PasswordReset
```
id, user_id, token, expires_at, used
```

**Миграции (Alembic):**
- 0001 — initial schema
- 0002 — elevation_gain, elevation_loss
- 0003 — user preferences (language, theme, units)

**Индексы:**
- `track.user_id` — фильтрация по пользователю
- `track.recorded_at`, `track.uploaded_at` — сортировка по датам
- `track.speed_avg`, `track.distance_km` — фильтры и сортировка по метрикам
- `track.file_format` — фильтр по формату
- PostGIS GIST на `track.geom` — для bbox `ST_Intersects`
- `poi.name` — поиск POI по названию

---

## 🔐 Units & Preferences

**Database:** все speed в `km/h`, elevation в `m`

**User preferences (в БД):**
- `unit_distance` — km | mi (UI конверсия)
- `unit_speed` — km/h | mph | m/s | knots (UI конверсия)
- `language` — en, es, de, ru, uk
- `theme` — light | dark

**Синхронизация:**
- При логине: `GET /api/auth/me` загружает настройки
- Обновление: `PATCH /api/auth/me`
- Тема: применяется через inline-скрипт в `index.html` до React (нет флика)

**i18n:** react-i18next, `frontend/src/i18n/translations.js` (5 языков)

---

## 🔌 API Endpoints

### Auth
```
POST   /api/auth/register              — регистрация                    [rate limit: 3/minute]
POST   /api/auth/login                 — логин, возвращает JWT           [rate limit: 5/minute]
POST   /api/auth/forgot-password       — Resend email                   [rate limit: 3/minute]
POST   /api/auth/reset-password/{token}— сброс пароля                   [rate limit: 3/minute]
GET    /api/auth/me                    — текущий пользователь + настройки
PATCH  /api/auth/me                    — обновить язык, тему, единицы
```

**Rate limiting (T15):** slowapi, лимит по IP (`get_remote_address`), in-memory storage,
подключён только к auth-эндпоинтам (`app/core/limiter.py`). Остальной API не лимитирован —
см. `tasks/FUTURE.md`. За nginx (T11) нужен `--proxy-headers` у uvicorn, иначе limiter
увидит IP nginx вместо клиента.

### Tracks
```
GET    /api/tracks                     — список треков юзера (пагинация)
       ?sort=newest|oldest|longest|shortest|fastest|slowest
       ?search=текст
       ?bbox=minLng,minLat,maxLng,maxLat (PostGIS ST_Intersects)
       ?file_format=gpx|kml|tcx|fit|geojson
       ?speed_avg_min=X&speed_avg_max=Y
       ?limit=N (default 50, max 500) &offset=N (default 0)
       Response: {items: TrackOut[], total: int, has_more: bool}

POST   /api/tracks/upload              — загрузка файла (max 20MB)
GET    /api/tracks/geometries          — bulk: [{id, normalized_points}] для всех треков
       юзера, одним запросом (T04). Должен быть объявлен ВЫШЕ /{id}, иначе
       FastAPI матчит "geometries" как track_id. raw_points/speed_segments не
       включены — тяжёлые, нужны только выбранному треку через GET /{id}.
GET    /api/tracks/{id}                — детали трека
DELETE /api/tracks/{id}
PATCH  /api/tracks/{id}/publish        — toggle is_public, generate public_token
PATCH  /api/tracks/{id}/rename         — переименование
PATCH  /api/tracks/{id}                — обновление (имя, видимость)
GET    /api/tracks/{id}/download       — скачивание файла
GET    /api/tracks/public/{public_token}— просмотр без авторизации
```

### POI
```
GET    /api/poi                        — список POI юзера (пагинация)
       ?category=строка
       ?search=текст (ILIKE по name)
       ?limit=N (default 50, max 5000) &offset=N (default 0)
       Response: {items: POIOut[], total: int, has_more: bool}
       Примечание: слой карты (POILayer) запрашивает limit=5000, чтобы
       получить все POI одним вызовом — фронтенд-обёртка fetchPOI(category)
       сохраняет старую сигнатуру и возвращает массив.

POST   /api/poi/create                 — создать одну точку
POST   /api/poi/upload                 — импорт KML/KMZ (max 5MB)
GET    /api/poi/categories             — категории с count
PATCH  /api/poi/{id}
DELETE /api/poi/{id}
GET    /api/poi/imports                — список импортов с count
PATCH  /api/poi/imports/{import_name}  — переименование
DELETE /api/poi/imports/{import_name}
GET    /api/poi/imports/{import_name}/export — экспорт KML
```

### Tasks
```
GET    /api/tasks/{task_id}/status     — polling upload статуса
       Response: {task_id, state, step?, result?, detail?}
```

**Authorization:** JWT токен (30 дней), `HTTPBearer(auto_error=False)` в deps.py

**Storage:** localStorage `gps_auth = {state: {token, user, isAuthenticated}, version: 0}` (Zustand persist)

---

## 🎨 Frontend — Islands Layout

Картоцентричный дизайн, 4 острова поверх Leaflet карты (glassmorphism).
**ErrorBoundary** (T08): классовый компонент верхнего уровня оборачивает всё приложение в `main.jsx`,
ловит ошибки рендера и показывает fallback-экран с кнопкой Reload (переводы из i18n с англ. fallback).

### TopIsland
- Логотип, файлы (open, duplicate, rename, delete, export)
- Настройки (distance unit, speed unit, language, theme)
- Аккаунт (email, password, delete)

### LeftIsland
- Поиск (border-radius: 24px)
- Фильтры (Sort, Format, Speed range slider)
- Список карточек треков (name, date, distance, avg speed, format)
- "Find in this area" кнопка (bbox фильтр)
- Создание трека
- **Серверная фильтрация списка (T05):** изменение search/sort/format/speed
  запускает `useEffect` с debounce 300мс → `fetchTracksPage({...})` →
  результат в локальном state острова (`items`, `total`, `hasMore`, `isLoading`, `error`).
  `appStore.tracks` НЕ используется и не перезаписывается этим потоком — он
  питает карту/heatmap (все треки, `limit=500` через `/api/tracks/geometries`,
  см. T04) и должен оставаться независимым от фильтров списка.
- **Infinite scroll (T06):** оба таба (Tracks и POI) подгружают следующие 50
  элементов через общий хук `frontend/src/hooks/useInfiniteScroll.js`
  (IntersectionObserver над sentinel-элементом в конце списка, отключается
  при `hasMore === false`, защита от параллельных вызовов на время загрузки).
  Tracks-таб: `loadMore` дергает `fetchTracksPage({..., offset: items.length})`
  и дописывает `page.items` в конец; смена фильтров сбрасывает на первую
  страницу. Счётчик «N из M» — ключ `tracks.count_of` (i18n, 5 языков).
  Защита от гонки loadMore/смена фильтров: `requestVersion` (ref-счётчик,
  инкрементируется при каждой смене фильтров/search; ответ с устаревшей
  версией отбрасывается) — иначе доскролленная-затем-отфильтрованная страница
  дописывает чужие элементы поверх нового списка.
  POI-таб (`POITab.jsx`): аналогичная пагинация через `fetchPOIPage({ search, limit: 50, offset })`
  в **отдельном** локальном state (`listItems/listTotal/listHasMore`) —
  не путать с `mapStore.pois`, который остаётся источником для маркеров на
  карте и всегда получает ВСЕ POI (см. `loadPOIs()`/`fetchPOI()` — не менялось).
  POITab остаётся всегда смонтированным, переключение табов — только
  `display:none/flex` (см. POLISH.md — восстановлено после регрессии в T06),
  поэтому пагинированное состояние списка переживает переключение табов.

### RightIsland
- Zoom, Compass, Nominatim поиск, Geolocation
- Tile layers (OpenStreetMap, CartoDB Light/Dark, OpenTopoMap, CyclOSM, Google Street/Satellite, Esri)
- POI (Overpass API, debounce 350ms)
- Overlays, Attributions

### BottomIsland
- Показывается только при выборе трека
- Графики: Elevation, Speed, Slope (recharts)
- При наведении → маркер на карте
- Состояние: локальный useState (expanded/collapsed)

### Speed Legend
- Независимый компонент, fixed left:16 bottom:16, z-index:900
- Виден только когда режим Speed активен
- Цветовая шкала: 0-10km/h серый, 10-30 синий, 30-60 зелёный, 60-90 жёлтый, 90-120 оранжевый, 120+ красный

---

## 🎯 Design System

```css
--accent: #007AFF;
--radius: 16px;
--radius-search: 24px;
--shadow: 0 8px 32px rgba(0,0,0,0.12);
--glass: rgba(255,255,255,0.75);
backdrop-filter: blur(20px);
font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
```

**Components:**
- `.island` — glassmorphism container (islands + speed legend)
- `.btn-glass` — frosted glass buttons (Find in area, Show all)
- `.btn-primary` — accent color
- `.btn-secondary` — surface buttons

**Global State:**
- `appStore.activePanel` — только одна панель открыта
- Клик на карту → `activePanel = null`

### UI-kit (T22, `frontend/src/ui/`)

Фундамент для пересборки островов/модалок (T23a-e). `tokens.css` и `ui.css`
подключены глобально в `App.jsx` (рядом с `globals.css`) — без этого
kit-компоненты рендерились бы неоформленными вне `/ui-demo` (пропуск T22,
исправлено в T23a).

**LeftIsland (T23a, образец серии)** — первый остров, полностью переведённый
на kit: `TrackCard`, `POICard`, шапка вкладки Tracks (поиск/сортировка/
фильтры/табы), каркас острова (`Panel`). Данные-слой (хуки, debounce,
infinite scroll, tracksListVersion) не менялся — только слой представления.
`POITab.jsx` переведён частично: список и кнопки Import/Create — на kit,
строка поиска POI осталась на legacy `poi.css` (вне скоупа T23a, см. POLISH.md).

**Токены** — `frontend/src/styles/tokens.css` (дополняют, не дублируют
цвета/тени/радиусы из `globals.css`):

```css
--space-1: 4px;  --space-2: 8px;  --space-3: 12px;
--space-4: 16px; --space-5: 24px;
--control-h: 32px;        /* высота кнопок/инпутов */
--control-h-sm: 24px;     /* чипы, компактные кнопки */
--control-h-icon: 36px;   /* iconOnly-кнопки (совпадает с legacy .icon-btn) */
--text-xs: 11px; --text-sm: 12px; --text-md: 14px; --text-lg: 16px;
--danger: #ff3b30; --danger-hover: #cc2d24;
```

**Компоненты** — `frontend/src/ui/*.jsx`, стили в `frontend/src/styles/ui.css`:
- `Button` — variants: primary/secondary/ghost/danger; sizes: md/sm; `iconOnly`
  (36×36, `--control-h-icon`); `active` prop (T23a, согласованное расширение) —
  класс `.ui-btn--active` для toggle-кнопок вроде фильтра; hover на активной
  кнопке не переопределяет цвет (см. `.ui-btn--*.ui-btn--active:hover`)
- `Input` — `leftIcon` prop, высота `--control-h`
- `Card` — паддинг `--space-3`, без внешних margin
- `Modal` — оверлей + окно, Escape/клик-мимо закрывают, слот `actions`; всегда
  рендерится через `createPortal(..., document.body)` (T23d, согласованное
  решение — нужно из-за `transform` на обёртке LeftIsland, который иначе ломает
  `position: fixed` у дочерних модалок); крестик в шапке появляется
  автоматически, если передан `onClose`; используется всеми 7 модалками
  (TrackDeleteModal/TrackRenameModal/SaveTrackModal/AuthModal/
  POIDeleteModal/POIRenameModal/POICreationModal), кроме AuthModal — там
  `onClose` не передаётся (форс-модалка без возможности закрыть)
- `Panel` — обёртка-остров (переиспользует класс `.island`), паддинг `--space-3`
  (обнуляется инлайн-стилем, если внутренние секции сами управляют паддингами —
  см. `LeftIsland.jsx`)
- `Chip` — фильтр-кнопка, высота `--control-h-sm`
- `.ui-badge` (T23a, CSS-класс, не отдельный компонент) — компактный лейбл
  (формат трека и т.п.), `padding: 2px 6px` — документированное исключение
  из шкалы отступов для мини-элементов
- `.track-tag` (T23a, `globals.css`, не `ui.css` — используется вне `ui/`) —
  span-тег для регион-тегов в развёрнутой TrackCard

**Демо:** `/ui-demo` (`frontend/src/pages/UiDemoPage.jsx`) — доступна только в
dev (`import.meta.env.DEV` ветвление вырезает роут и ленивый импорт из
прод-сборки целиком, включая CSS токенов/kit).

---

## 📤 File Upload & Processing

### Upload Flow
1. Drag&drop на окно или выбрать из диалога
2. Фронтенд валидирует magic bytes, размер (max 20MB)
3. Sequential queue — один файл за одним (Redis lock)
4. Polling: `GET /api/tasks/{task_id}/status`
5. На SUCCESS → `fetchTracks()`

**Форматы:** .gpx, .kml, .tcx, .fit, .geojson

### Filtering
- **Speed:** rc-slider (0–200 km/h), dual-range realtime filter
- **Area:** bbox фильтр через `ST_Intersects` в PostGIS
- **Format:** dropdown selector
- **Sort:** newest, oldest, longest, fastest

---

## ⚙️ Celery & Background Processing

**Broker:** Redis, sequential lock `process_track_lock` → max 1 параллельная задача

**Task: `process_track(file_data, file_name, user_id, track_id)`**

1. **Parse + Normalize** (см. PARSER.md)
   - Определить формат по magic bytes
   - Парсить → raw_points
   - 5-этапная нормализация pipeline (collapse drift, remove outliers, Kalman, elevation smooth, simplify)
   - Расчет метрик: distance, speed, elevation_gain/loss, grade_stats

2. **Geocoding** (Nominatim + Redis кэш 30 дней)
   - Reverse geocoding по 3 точкам (start, middle, end)
   - User-Agent: `gps-heatmap/1.0 (email)` в .env

3. **Save to DB**
   - `raw_points` — оригинальные GPS точки
   - `normalized_points` — после фильтрации
   - `speed_segments`, `grade_stats` — расчеты из normalized_points
   - `geom` (PostGIS LineString)
   - `regions` (массив из Nominatim)

4. **Release lock** → следующий трек начинает обработку

**Status polling:** фронтенд получает state: "PENDING" | "SUCCESS" | "FAILURE"

**Trade-off: единый lock, timeout 1h.** Обработка треков сознательно последовательная
(нет параллелизма — не нужен на масштабе личного инструмента), но `process_track_lock`
держится с `timeout=3600`. Если конкретная задача зависнет (не упадёт с ошибкой, а
именно зависнет — например, на тяжёлой Kalman-фильтрации гигантского файла), вся
очередь обработки остальных треков блокируется вплоть до истечения lock, то есть
до часа. Осознанно не чиним сейчас (короче timeout = риск снять lock у ещё живой
долгой задачи); при появлении сигналов реальных зависаний — см. `tasks/FUTURE.md`.

**Retry policy (T09):** `autoretry_for=(OperationalError, redis.ConnectionError, redis.TimeoutError)`,
`retry_backoff=True` (1s, 2s, 4s... до `retry_backoff_max=60`), `retry_jitter=True`, `max_retries=3`.
- Постоянные ошибки (`ValueError` — включая парсинг/валидацию/`FitParseError`/`JSONDecodeError`,
  и `lxml.etree.XMLSyntaxError`) → трек сразу помечается `error` (`_set_error`), без ретраев.
- Временные ошибки (обрыв БД/Redis) → пробрасываются наружу, ретраятся автоматически;
  трек помечается `error` только когда `self.request.retries >= max_retries` (ретраи исчерпаны).

---

## 🔄 Development Workflow (Hot Reload)

**Frontend (Vite + HMR):**
- vite.config.js: `hmr: { protocol: 'ws', host: 'localhost', port: 5173 }`
- Changes → browser auto-updates (~100ms)

**Backend (uvicorn + reload):**
- `command: uvicorn app.main:app --reload`
- Changes → server auto-restarts (~1-2s)

**Celery (watchdog + auto-restart):**
- `watchmedo auto-restart -d /app -p '*.py' --recursive -- celery ...`
- Changes → worker auto-restarts (~2-3s)

**No docker-compose rebuild needed during dev.**

---

## 📊 Визуализация на карте

### Tile Layers
- OpenStreetMap, CartoDB Light/Dark (авто с темой)
- OpenTopoMap, CyclOSM, Google Street/Satellite, Esri Satellite

### Modes
- **Speed:** Polyline с градиентом по speed_segments (цветовая шкала выше)
- **Heatmap (Visit):** react-leaflet-heatmap-layer-v3 по кол-во треков
  - 1 трек → синий, 2-3 зелёный, 4-5 оранжевый, 5+ красный

### Поток геометрий карты (T04)
- `App.jsx` после `fetchTracks({ limit: 500 })` (max API-лимит, T01) один раз
  вызывает `mapStore.loadAllGeometries()` → `GET /api/tracks/geometries` →
  результат мёржится в `mapStore.trackDetailCache` по id, каждая запись
  помечена `partial: true` (только `normalized_points`, без `speed_segments`).
  Записи, где уже есть полный detail, не перезаписываются.
- `ensureTrackDetail(id)` (вызывается при выборе трека в `BottomIsland`/при
  ручном toggle видимости) обновляет `partial`-запись до полного `TrackDetail`
  (со `speed_segments`) через `GET /api/tracks/{id}`.
- `TrackLayer`/`SpeedLayer` рисуют треки из `mapStore.visibleTrackIds`
  (ручной toggle) ∪ выбранный трек — как и раньше, не затронуто T04.
- `VisitLayer` (heatmap) — единственный слой, которому нужны ВСЕ треки
  пользователя, а не только вручную включённые. `MapContainer.jsx` мёржит
  `appStore.tracks` с `trackDetailCache` (`useAllTracksWithGeometry()`) и
  передаёт результат в `VisitLayer`. Ограничение: heatmap видит только первые
  500 треков (текущий `limit`); при >500 треках см. `tasks/FUTURE.md`.
- **Find in area / Show all** — не переведены на mapStore: `handleFindInArea`/
  `handleShowAll` в `App.jsx` по-прежнему просто перезаписывают `appStore.tracks`
  через `fetchTracks({bbox})` — этого достаточно, т.к. `VisitLayer` берёт данные
  оттуда. `TrackLayer`/`SpeedLayer` не подписаны на `appStore.tracks`, поэтому
  bbox-фильтр на них не влиял и раньше — не regression.

### POI
- Overpass API, категории: Food, Amenities, Medical, Tourism, Bicycle, Public Transport
- Debounce 350ms
- **POILayer (`frontend/src/map/POILayer.jsx`): кластеризация** через
  `leaflet.markercluster` — маркеры добавляются в `L.markerClusterGroup({
  disableClusteringAtZoom: 16, showCoverageOnHover: false, maxClusterRadius: 50 })`
  вместо простого `L.layerGroup()`. На зуме ≥16 маркеры показываются
  индивидуально (совпадает с зумом `flyTo` из POITab при выборе POI из списка).

---

## 🔑 Authorization & Sessions

**Token:** JWT 30 дней, HS256

**Storage:** localStorage `gps_auth` (Zustand persist)

**Validation:** `HTTPBearer(auto_error=False)` → явный 401 при отсутствии

**Interceptor:** axios 401 → редирект на главную (только если токен есть = сессия устарела)

---

## 🧪 Testing

**Backend (pytest):**
- test_auth.py — регистрация, логин, сброс пароля
- test_tracks.py — загрузка 5 форматов, изоляция по user
- test_parser.py — speed_segments, нормализация, grade_stats
- test_security.py — XSS, размер файла, невалидный формат
- **Coverage:** 107/107 tests ✓

**Frontend (Playwright + Docker):**
- auth.spec.ts — модал, регистрация, логин, logout
- upload.spec.ts — drag&drop, ошибки
- map.spec.ts — слои, режимы визуализации
- sidebar.spec.ts — поиск, фильтры, карточки

**Run:**
```bash
docker compose exec -T backend pytest
docker compose exec -T playwright npx playwright test
```

---

## 📝 Миграции & Версионирование

**Alembic (backend/alembic/):**
- 0001_initial_schema.py — основные таблицы
- 0002_elevation.py — elevation_gain, elevation_loss
- 0003_user_preferences.py — language, theme, units

**Application version:** не используется, но можно добавить в future

---

## 🔍 PARSER.md — GPS Parsing Details

**Отдельный файл:** `architecture/PARSER.md`

Содержит:
- Format detection (magic bytes)
- GPX sanitization (OsmAnd extensions fix)
- Normalization algorithms (5 этапов)
- Speed/grade calculation
- Elevation smoothing
- Trajectory simplification (Douglas-Peucker)
- Parser contract
- Processing pipeline

**Читай перед изменением парсера или алгоритма нормализации.**

---

## 📋 POLISH.md — Known Issues & TODO

**Отдельный файл:** `../POLISH.md`

Содержит:
- Критичные (MVP blockers) — 1 задача (full integration test)
- Важные (medium priority) — email Resend, production setup
- Nice-to-have (low priority) — animations, POI UI, track creation
- Backend tasks — ORS routing, более точная обработка ошибок

---

## 🚀 Deployment (прод, T11)

Отдельный от dev стек: `docker-compose.prod.yml` (запуск
`docker compose -f docker-compose.prod.yml up -d --build`). Наружу торчит
только nginx (80, задел под 443).

```
Client ── :80 ──▶ nginx (frontend container)
                     ├─ /              → статика React (dist), SPA fallback (try_files → index.html)
                     ├─ /api/*         → proxy_pass backend:8000 (X-Forwarded-For/-Proto, Host)
                     └─ /docs,/redoc,/openapi.json → proxy_pass backend:8000 (Swagger)

backend, celery_worker, postgres, redis — только во внутренней docker-сети,
портов наружу нет.
```

Сервисы прод-компоуза:
- **postgres** / **redis** — без `ports:`, healthcheck, именованный volume
  `postgres_data_prod` (отдельный от dev, чтобы не пересекались).
- **backend** — образ из `backend/Dockerfile` (тот же, что в dev), без
  bind-mount исходников, команда переопределена:
  `alembic upgrade head && uvicorn app.main:app --workers 2 --proxy-headers`
  (`--proxy-headers` обязателен — иначе rate limiter T15 видит IP nginx, а не
  клиента). Healthcheck — `python -c "urllib.request.urlopen(...)"` на
  `GET /health` (curl в образе нет).
- **celery_worker** — без watchmedo (`--concurrency=1`, `--loglevel=warning`).
- **frontend** — собран из `frontend/Dockerfile.prod` (multi-stage:
  `node:20-alpine` → `npm run build` → статика в `nginx:alpine` с конфигом
  `deploy/nginx.conf`), единственный сервис с внешним портом (`80:80`).

Все сервисы: `restart: unless-stopped`, логирование `json-file` (`max-size:
10m`, `max-file: 3`).

Инструкция по деплою на VDS (docker install, `.env` с
`ENVIRONMENT=production`, запуск, обновление, HTTPS через certbot как
следующий шаг) — `deploy/README.md`.

Не сделано (см. `tasks/T12-db-backup.md`, `FUTURE.md`): backup-стратегия БД,
мониторинг/логирование (Sentry), автоматизация выпуска SSL.

---

## 📚 Архивные файлы

**Удалены / архивированы:**
- `AGENTS.md` — инструкции по фазам (проект готов)
- `PROJECT_STATUS.md` — дублирует POLISH.md
- `state.md` — фазовое состояние (не актуально)
- `POI_IMPORT_PLAN.md` — неясный статус

