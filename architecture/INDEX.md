# GPS Heatmap — Архитектура

## Стек

| Компонент | Технология |
|-----------|-----------|
| **Backend** | FastAPI + PostgreSQL + PostGIS + Redis + Celery |
| **Frontend** | React 18 + Vite + Leaflet + Zustand |
| **Auth** | JWT (30 дней) |
| **Email** | Resend API (в .env, интеграция в POLISH) |
| **Routing** | OpenRouteService (2500 req/day free) |
| **Structure** | /frontend + /backend, Docker Compose |

---

## Database Models

### User
```
id, email, password_hash
language (en|es|de|ru|uk)
theme (light|dark)
unit_distance (km|mi)
unit_speed (km/h|mph|m/s|knots)
```

### Track
```
id, user_id, name, file_format (gpx|kml|tcx|fit|geojson)
distance_km, duration_sec, recorded_at, uploaded_at
speed_avg, speed_max, speed_min  [km/h]
elevation_gain, elevation_loss  [m]
regions (ARRAY TEXT)             [Nominatim regions]
geom (PostGIS LineString)        [bbox filtering]
raw_points (JSON)                [{lat, lon, ele, time}]
normalized_points (JSON)         [after normalization]
speed_segments (JSON)            [{from_idx, to_idx, speed_kmh}]
is_public (bool), public_token (string)
```

### PasswordReset
```
id, user_id, token, expires_at, used
```

**Миграции Alembic:**
- 0001 — initial schema
- 0002 — elevation_gain, elevation_loss
- 0003 — user preferences (language, theme, units)

---

## Units of Measurement

- **Database:** `speed_avg`, `speed_max`, `speed_min`, `speed_segments[].speed_kmh` все в **km/h**
- **UI:** переключение Metric (km + km/h) ↔ Imperial (mi + mph) через селектор в TopIsland
- **Storage:** выбор сохраняется в БД (User.unit_distance, User.unit_speed)

---

## API Endpoints

### Auth
- `POST /api/auth/register` — регистрация
- `POST /api/auth/login` — логин, возвращает JWT
- `POST /api/auth/forgot-password` — Resend email
- `POST /api/auth/reset-password/{token}` — сброс
- `GET /api/auth/me` — текущий пользователь + настройки
- `PATCH /api/auth/me` — обновить язык, тему, единицы

### Tracks
- `GET /api/tracks` — список треков юзера
  - `?sort=newest|oldest|longest|fastest`
  - `?search=text`
  - `?bbox=minLng,minLat,maxLng,maxLat` (PostGIS ST_Intersects)
  - `?file_format=gpx|kml|tcx|fit|geojson`
  - `?speed_avg_min=X&speed_avg_max=Y`
- `POST /api/tracks/upload` — загрузка файла (max 20MB)
- `GET /api/tracks/{id}` — детали трека
- `DELETE /api/tracks/{id}`
- `PATCH /api/tracks/{id}/publish` — toggle is_public, generate public_token
- `PATCH /api/tracks/{id}/rename` — переименование трека
- `GET /api/tracks/{id}/download` — скачивание файла трека
- `GET /api/tracks/public/{public_token}` — просмотр без авторизации + скачивание

### Tasks
- `GET /api/tasks/{task_id}/status` — polling upload статуса
  - `{task_id: str, state: "PENDING"|"SUCCESS"|"FAILURE", step?: str, result?: object, detail?: string}`

---

## Authorization

- **Token:** JWT, срок 30 дней, алгоритм HS256
- **Storage:** localStorage.gps_auth = `{state: {token, user, isAuthenticated}, version: 0}` (Zustand persist)
- **Validation:** `HTTPBearer(auto_error=False)` в deps.py → явный 401 при отсутствии токена
- **Interceptor:** axios 401 → редирект на главную, только если токен есть (сессия устарела, не ошибка логина)

---

## User Settings

- **Storage:** База данных, не localStorage
- **Sync:** `GET /api/auth/me` при старте приложения
- **Update:** `PATCH /api/auth/me`
- **Theme:** применяется до React через инлайн-скрипт в `index.html` (нет флика)
- **Поля:** language, theme, unit_distance, unit_speed

---

## i18n

- **Library:** react-i18next
- **Languages:** en, es, de, ru, uk (5 языков)
- **File:** `frontend/src/i18n/translations.js`
- **Apply:** язык из БД → `i18n.changeLanguage()` при логине

---

## Map & Tile Layers

**Tile layers (no API keys):**
- OpenStreetMap
- CartoDB Light/Dark (авто-выбор по теме)
- OpenTopoMap
- CyclOSM
- Google Street (tiling)
- Google Satellite (tiling)
- Esri Satellite

**POI:** Overpass API с debounce 350ms, категории: Food, Amenities, Medical, Tourism, Bicycle, Public Transport

**Anims:** `flyTo()` / `panTo()` с `animate: true` вместо `setView()`

---

## Frontend — Islands Layout

**Картоцентричный дизайн, 4 острова поверх карты:**

### TopIsland
- Логотип + название
- Файлы: открыть, дублировать, переименовать, удалить, экспорт
- Настройки: дистанция (км/мили), скорость (км/ч, м/с, узлы)
- Язык: en, es, de, ru, uk
- Тема: светлая/тёмная
- Аккаунт: имя, email, пароль, удаление

### LeftIsland
- Поиск (border-radius: 24px)
- Фильтры (кнопка):
  - **Sort:** newest, oldest (time) · longest, shortest (distance) · fastest, slowest (speed)
  - **Format:** all, gpx, kml, tcx, fit, geojson
  - **Speed range:** dual-range slider (0–200 km/h)
- Список карточек треков (название, дата, длина, avg скорость, формат)
- Кнопка "Найти в этой области"
- Создание трека

### RightIsland
- Масштаб
- Компас
- Поиск городов (Nominatim)
- Геолокация (navigator.geolocation)
- Слои (тайлы, POI, overlays)
- Атрибуции

### BottomIsland
- Рендерится только при выборе трека (родитель App.jsx проверяет selectedTrackId)
- Графики: Elevation, Speed, Slope (recharts)
- При наведении → маркер на карте
- Состояние: локальный useState (развёрнут/свёрнут)
- С треком: автоматически разворачивается

### Speed Legend
- Независимый компонент, рендерится из App.jsx
- Показывается в левом нижнем углу (fixed: left 16, bottom 16)
- Видна только когда режим Speed включен
- z-index: 900 (выше LeftIsland, ниже уведомлений)

---

## Design System

```css
--accent: #007AFF
--radius: 16px
--radius-search: 24px
--shadow: 0 8px 32px rgba(0,0,0,0.12)
--glass: rgba(255,255,255,0.75)
backdrop-filter: blur(20px)
font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
```

**Components:**
- `.island` — container with glassmorphism (islands + speed legend)
- `.btn-glass` — action buttons with frosted glass effect (Find in this area, Show all)
- `.btn-secondary` — regular surface buttons
- `.btn-primary` — accent color buttons

---

## Global Panel System

- `appStore.activePanel: string | null` — только одна панель открыта одновременно
- Открытие панели → закрывает все остальные
- Клик на карту → `activePanel = null`

---

## File Upload & Filtering

### Upload
- **Flow:** Sequential queue (один файл за одним)
- **Polling:** `GET /api/tasks/{task_id}/status`
- **Completion:** Backend возвращает `{state: "SUCCESS"|"FAILURE"}` → `fetchTracks()`
- **Limit:** 20MB
- **Formats:** .gpx, .kml, .tcx, .fit, .geojson
- **Validation:** magic bytes (не расширение)

### Speed Filter
- **Component:** rc-slider (dual-range)
- **Range:** 0–200 km/h
- **Type:** Dropdown filter in LeftIsland
- **Behavior:** Realtime filtering of track list

### Area Filtering
- **Find in this area:** кнопка загружает треки в текущей области карты (bbox фильтр)
- **Show all:** маленькая иконка-кнопка отменяет bbox фильтр, загружает все треки

---

## Celery & Background Processing

- **Broker:** Redis
- **Sequential Processing:** Redis lock (`process_track_lock`) ограничивает до 1 параллельной задачи
  - Фронтенд отправляет файлы по одному
  - Celery очередь обрабатывает их последовательно
  - Status "queued" — трек ждет обработки
  - Status "parsing/normalizing/geocoding/saving" — активная обработка
  
- **Task:** `process_track` (разблокируется после завершения предыдущего)
  1. Определить формат по magic bytes
  2. Парсить (см. PARSER.md)
  3. Нормализовать (см. PARSER.md)
  4. Определить регионы (Nominatim + Redis кэш 30 дней)
  5. Сохранить в БД
  6. Освободить lock — следующий трек начинает обработку

- **Nominatim:** User-Agent: `gps-heatmap/1.0 (email)` в `.env` (настроен на 3 точки, Redis кэш 30 дней)

---

## Development Workflow (Hot Reload)

**Goal:** Code changes visible instantly without container rebuild.

**Frontend (Vite + HMR):**
- vite.config.js: `hmr: { protocol: 'ws', host: 'localhost', port: 5173 }`
- Changes to `src/` → browser auto-updates (~100ms)
- Component state preserved where possible

**Backend (uvicorn + reload):**
- docker-compose.yml: `command: uvicorn app.main:app --reload`
- Changes to `app/api/`, `app/models/` → server auto-restarts (~1-2s)

**Celery Worker (watchdog + auto-restart):**
- requirements.txt: `watchdog[watchmedo]==4.0.0`
- docker-compose.yml: `command: watchmedo auto-restart -d /app -p '*.py' --recursive -- celery ...`
- Changes to `app/tasks/` → worker auto-restarts (~2-3s)

**Development Flow:**
```
Edit code → Save → See changes instantly
No docker-compose build needed during development
No manual restarts needed
```

---

## Docker & Infrastructure

**Services:**
- postgres (15 + PostGIS)
- redis
- backend (FastAPI, port 8000)
- celery_worker
- frontend (Vite, port 5173)
- playwright (test profile only)

**Volumes:** `postgres_data`

**Env:** `.env` не в git (в `.gitignore`)

**Build:** lxml требует `apt-get install -y libxml2-dev libxslt-dev` в Dockerfile

---

## Tests

- **Backend:** pytest
  - test_auth.py — регистрация, логин, сброс
  - test_tracks.py — загрузка форматов, изоляция треков
  - test_parser.py — speed_segments, нормализация
  - test_security.py — XSS, размеры, форматы
  - **Coverage:** 107/107 тестов

- **Frontend E2E:** Playwright + Docker (mcr.microsoft.com/playwright)
  - auth.spec.ts — модал, регистрация, логин, logout
  - upload.spec.ts — drag&drop, диалог, ошибки
  - map.spec.ts — слои, режимы
  - sidebar.spec.ts — поиск, фильтры, карточки

**Requirements:** `requirements-test.txt` отдельно (pytest не в продакшене)

---

## Known Issues (POLISH.md)

- Elevation нормализация суммирует GPS шум
- Reset bearing кнопка не работает
- Табличка скоростей в неудобном положении
- Email отправка не реализована (в POLISH)
- POI под вопросом
- Track creation (под вопросом)

---

## Git History

```
3e47669 chore: add favicon, ignore .claude directory
85e3beb chore: ignore playwright test artifacts and .DS_Store
18cc1a4 test: backend pytest suite and playwright e2e tests, fix auth redirect bug
dd09a28 fix: dynamic positioning for find-in-area button, remove duplicate settings icon
fd25942 feat: leaflet map, visualization layers, track creation, i18n, public sharing
38e4c7c fix: sync task status field names, fix race condition in auth interceptor
7c41619 feat: project setup, backend core and track processing pipeline
```
