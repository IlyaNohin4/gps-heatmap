# AGENTS.md — GPS Heatmap Project

## Как использовать
Читай этот файл перед каждой задачей. Каждая фаза — отдельный разговор с Claude Code.
После каждой фазы обновляй state.md с результатами.

## Стек
- Backend: FastAPI + PostgreSQL + PostGIS + Redis + Celery
- Frontend: React + Vite + Leaflet
- Auth: JWT (30 дней)
- Email: Resend
- Routing: OpenRouteService
- Структура: /frontend + /backend

## Фазы

---

### Фаза 1 — Архитектор
**Задача:** создать скелет проекта

Создай структуру:
gps-heatmap/

├── backend/

│   ├── app/

│   │   ├── api/

│   │   ├── models/

│   │   ├── services/

│   │   ├── tasks/

│   │   └── core/

│   ├── requirements.txt

│   └── Dockerfile

├── frontend/

│   ├── src/

│   │   ├── components/

│   │   ├── store/

│   │   ├── map/

│   │   └── styles/

│   ├── package.json

│   └── Dockerfile

├── docker-compose.yml

├── .env.example

└── README.md

**docker-compose.yml** должен включать сервисы:
- postgres (postgres:15 + PostGIS)
- redis
- backend (FastAPI, port 8000)
- celery_worker
- frontend (Vite, port 5173)

**.env.example:**
DATABASE_URL=postgresql://user:password@localhost/gps_heatmap

REDIS_URL=redis://localhost:6379

JWT_SECRET=your_secret_here

JWT_EXPIRES_DAYS=30

RESEND_API_KEY=your_resend_key

ORS_API_KEY=your_openrouteservice_key

MAX_FILE_SIZE_MB=20

**requirements.txt:**
fastapi, uvicorn, sqlalchemy, geoalchemy2, psycopg2-binary,
alembic, redis, celery, httpx, python-jose, passlib,
gpxpy, fastkml, lxml, fitparse, python-multipart,
resend, python-dotenv, pydantic-settings

**package.json зависимости:**
react, react-router-dom, leaflet, react-leaflet,
react-leaflet-heatmap-layer-v3, react-toastify,
lucide-react, axios, zustand, recharts, vite

После создания запиши state.md:
- phase: 1
- status: done
- next: Фаза 2 — Backend

---

### Фаза 2 — Backend Core
**Читай:** state.md
**Задача:** модели БД, JWT авторизация, API эндпоинты

**Модели (models/):**

User:
- id, email, password_hash, created_at

Track:
- id, user_id, name, file_format
- distance_km, duration_sec
- recorded_at, uploaded_at
- speed_avg, speed_max, speed_min
- regions (ARRAY)
- geom (PostGIS LineString)
- raw_points (JSONB)
- normalized_points (JSONB)
- speed_segments (JSONB)
- is_public (bool)
- public_token (string)

PasswordReset:
- token, user_id, expires_at, used

**Auth (api/auth.py):**
- POST /api/auth/register
- POST /api/auth/login
- POST /api/auth/forgot-password (Resend email)
- POST /api/auth/reset-password/{token}
- JWT токен, 30 дней

**Tracks API (api/tracks.py):**
- GET /api/tracks (список треков юзера)
  - ?sort=newest|oldest|longest|fastest
  - ?search=текст
  - ?bbox=minLng,minLat,maxLng,maxLat (PostGIS ST_Intersects)
  - ?file_format=gpx|kml|tcx|fit|geojson
  - ?speed_avg_min=&speed_avg_max=
- POST /api/tracks/upload (загрузка файла)
- GET /api/tracks/{id}
- DELETE /api/tracks/{id}
- PATCH /api/tracks/{id}/publish (is_public toggle)
- GET /api/tracks/public/{public_token} (без авторизации)

**Важно:**
- Все секреты из .env
- user_id фильтр на всех запросах
- Валидация magic bytes файлов
- Максимум 20MB на файл
- Санитизация всех inputs
- CSP заголовки

После записи state.md:
- phase: 2
- status: done
- endpoints: [список]

---

### Фаза 3 — Парсеры + Celery
**Читай:** state.md
**Задача:** парсинг треков, нормализация, Celery задачи

**parser_factory.py** — определяет формат по magic bytes и вызывает нужный парсер:
- GPX → gpxpy
- KML → fastkml + lxml
- TCX → lxml
- FIT → fitparse
- GeoJSON → json

**Из каждого трека извлекать:**
- точки: lat, lon, elevation, time
- скорость между точками через Haversine
- speed_segments: [{"from": [lat,lon], "to": [lat,lon], "speed_kmh": 45.2}]

**normalizer.py:**
- GPS дрифт при простое → кластер точек заменяется одной
- Выбросы скорости → фильтрация
- Если трек чистый → пропускаем

**regions.py:**
- Nominatim reverse geocoding по 3 точкам (начало, конец, середина)
- Кэш в Redis на 30 дней
- httpx async запросы

**Celery задача (tasks/process_track.py):**
1. Принять файл
2. Определить формат (magic bytes)
3. Парсить
4. Нормализовать
5. Определить регионы (Nominatim + Redis кэш)
6. Сохранить в БД
7. Обновить статус задачи

**GET /api/tasks/{task_id}/status** — фронтенд поллит этот эндпоинт

После записи state.md:
- phase: 3
- status: done

---

### Фаза 4 — Frontend Core
**Читай:** state.md
**Задача:** React приложение, дизайн-система, авторизация, острова

**Дизайн-система (styles/globals.css):**
```css
--accent: #007AFF;
--radius: 16px;
--radius-search: 24px;
--shadow: 0 8px 32px rgba(0,0,0,0.12);
--glass: rgba(255,255,255,0.75);
backdrop-filter: blur(20px);
font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
```

**Layout — четыре острова (все минимизированы по умолчанию):**

Верхний остров:
- Лого + название
- Файлы: открытие, дубликат, переименование, удаление, экспорт
- Настройки: дистанция (км/мили), скорость (км/ч, м/с, узлы)
- Язык: en, es, de, fr, it, nl, pl, ru, uk, zh
- Тема: светлая/тёмная
- Аккаунт: имя, email, пароль, удаление

Левый остров:
- Строка поиска (border-radius: 24px)
- Панель фильтров (кнопка)
- Список карточек треков
- Кнопка "Найти в этой области"
- Создание трека
- Редактирование трека

Правый остров:
- Масштаб
- Компас
- Поиск городов (Nominatim)
- Геолокация (navigator.geolocation)
- Слои (тайлы, POI, overlays)
- Атрибуции (иконка ⓘ)

Нижний остров:
- Появляется при выборе трека
- График высоты, скорости, уклона (recharts)
- При наведении → маркер на карте
- Статистика сегмента при выделении

**Auth (AuthModal.jsx):**
- Появляется если нет токена или истёк
- Вход / Регистрация (табы)
- Сброс пароля
- Zustand authStore

**Upload (UploadZone.jsx):**
- Drag&drop на всё окно (window drop event)
- Мультиселект диалог
- Форматы: .gpx .kml .tcx .fit .geojson
- Лимит 20MB
- Toast уведомления

**Карточка трека:**
- название, дата записи, длина, avg скорость, тип файла
- Кнопка "Подробнее": + дата загрузки, max/min скорость, регион(ы)

После записи state.md:
- phase: 4
- status: done

---

### Фаза 5 — Карта и визуализация
**Читай:** state.md
**Задача:** Leaflet карта, слои, режимы визуализации, POI

**Тайловые слои (MapLayers.js):**
- OpenStreetMap
- OpenTopoMap: https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png
- CyclOSM: https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png
- OpenHikingMap
- CartoDB Light/Dark (авто с темой)
- Google Street (тайловый URL)
- Google Satellite (тайловый URL)
- Esri Satellite
- Mapillary (TODO)

**Режим скорость (SpeedLayer.jsx):**
Polyline с градиентом по speed_segments:
- 0-10 км/ч → серый
- 10-30 км/ч → синий
- 30-60 км/ч → зелёный
- 60-90 км/ч → жёлтый
- 90-120 км/ч → оранжевый
- 120+ км/ч → красный
Плавный градиент между цветами, без резких границ.

**Режим посещения (VisitLayer.jsx):**
react-leaflet-heatmap-layer-v3:
- 1 трек → синий
- 2-3 → зелёный
- 4-5 → оранжевый/жёлтый
- 5+ → красный

**POI (POILayer.jsx):**
Overpass API, категории:
- Food, Amenities, Medical, Tourism, Bicycle, Public Transport

**Overlays:**
- Waymarked Trails

**Создание треков (TrackCreator.jsx):**
- Ручной режим: клик → точки → линия
- Авто режим: A→B через OpenRouteService
- Профили: пешком, велосипед, хайкинг, авто, мотоцикл

**Публичный трек:**
- Страница /track/{public_token} без авторизации
- Просмотр + скачивание

После записи state.md:
- phase: 5
- status: done

---

### Фаза 6 — Тесты
**Читай:** state.md
**Задача:** E2E тесты Playwright + pytest

**Backend (pytest):**
- test_auth.py: регистрация, логин, сброс пароля
- test_tracks.py: загрузка GPX/KML/TCX/FIT/GeoJSON, изоляция треков
- test_parser.py: корректность speed_segments, нормализация
- test_security.py: XSS, превышение размера, поддельный формат

**Frontend (Playwright):**
- auth.spec.ts: модал, регистрация, логин, logout
- upload.spec.ts: drag&drop, диалог, ошибки формата
- map.spec.ts: слои, режимы скорость/посещения
- sidebar.spec.ts: поиск, фильтры, карточки

При багах записывай в state.md:
- bugs: [{phase: "2", file: "api/tracks.py", issue: "..."}]

После записи state.md:
- phase: 6
- status: done | has_bugs

---

### Фаза 7 — GitHub
**Читай:** state.md, убедись status всех фаз: done

**.gitignore** должен включать:
node_modules, __pycache__, .env, *.pyc, dist, .pytest_cache

Коммиты:
- "feat: project structure and docker setup"
- "feat: backend models, auth and API endpoints"
- "feat: track parsers, normalizer and celery tasks"
- "feat: react frontend core and design system"
- "feat: map visualization and track creation"
- "test: playwright e2e and pytest coverage"
git push -u origin main

---

## state.md формат
После каждой фазы агент дописывает:
```json
{
  "phase": 1,
  "status": "done",
  "notes": "любые важные детали"
}
```