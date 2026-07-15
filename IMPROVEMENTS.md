# GPS Heatmap — Рекомендации по улучшению

Анализ проекта на основе архитектуры и кода. Приоритизировано по влиянию и трудоёмкости.

---

## 🔴 КРИТИЧНЫЕ (блокируют продакшн)

### 1. Full Integration Test (MVP requirement)
**Файл:** POLISH.md

**Что нужно:**
- Загрузить реальный трек через UI
- Проверить что данные появились на карте
- Проверить что все графики работают (Elevation, Speed, Slope)
- Проверить корректность Slope chart (grade_stats)

**Почему важно:** Никакой гарантии что парсинг + фронтенд работают вместе

**Est. Time:** 1-2 часа

**Текущий статус:** ❌ не сделано

---

## 🟠 ВАЖНЫЕ (нужны для продакшна)

### 1. Email интеграция (Resend API)
**Файлы:** backend/app/api/auth.py, POLISH.md

**Что сейчас:** 
- Эндпоинт `POST /api/auth/forgot-password` существует
- RESEND_API_KEY в .env.example
- **Но реального отправления email нет**

**Что нужно:**
- Реальный вызов Resend API в forgot-password endpoint
- Подтверждение email при регистрации (опционально)
- Отправка при смене email в профиле (опционально)

**Est. Time:** 1 часа

---

### 2. Database Индексы (performance) — ✅ СДЕЛАНО (T03/T07, миграция 0007)
**Файл:** `backend/alembic/versions/0007_add_filter_indices.py`

Добавлены индексы на `tracks.recorded_at/uploaded_at/speed_avg/distance_km/
file_format`, `poi.name`, плюс `user_id`/`id` (index=True в моделях изначально).
PostGIS GIST на `geom` — часть initial schema (0001), не отдельной миграцией.

---

### 3. Production Deployment — ✅ В ОСНОВНОМ СДЕЛАНО (T11, T12, T14)
**Файлы:** `docker-compose.prod.yml`, `frontend/Dockerfile.prod`, `deploy/nginx.conf`,
`deploy/README.md`, `.github/workflows/ci.yml`, `deploy/backup.sh`/`restore.sh`

- [x] Оптимизированный Dockerfile (multi-stage `frontend/Dockerfile.prod`)
- [x] nginx reverse proxy (`deploy/nginx.conf`)
- [x] Environment variable management (`.env.example`, guard на dev JWT_SECRET
      в проде — `backend/app/core/config.py`)
- [x] CI/CD: тесты на PR/push (`.github/workflows/ci.yml`, T14). Auto-deploy на
      main — не сделано, вне scope личного инструмента (ручной `git pull` +
      `docker compose up -d --build` на VDS, см. `deploy/README.md`)
- [x] Database backup strategy (T12: `deploy/backup.sh`/`restore.sh` + cron)
- [ ] Monitoring & logging (Sentry) — не сделано, см. `tasks/FUTURE.md`
- [ ] Автоматизация HTTPS/SSL (certbot) — не сделано, см. `deploy/README.md` § 5

---

## 🟡 NICE-TO-HAVE (улучшают UX)

### 1. Speed Legend Positioning Fix
**Файл:** `frontend/src/App.jsx` (инлайн JSX, ~строка 267 — отдельного
компонента `SpeedLegend.jsx` в кодовой базе нет)

**Проблема:** fixed position fixed левый нижний угол, но может перекрывать контент на мобильных

**Решение:**
- Адаптивное позиционирование (mobile: другой угол или modal)
- Или: прячется при открытии других島ов

**Est. Time:** 30 мин

---

### 2. Анимации при открытии/закрытии
**Файлы:** frontend/src/components/Islands/*

**Что добавить:**
- Плавное раскрытие TopIsland меню
- Появление/исчезновение BottomIsland с spring анимацией
- Переходы при смене слоёв карты
- Toast уведомления с fade-in/out

**Почему:** Улучшает ощущение polish и responsiveness

**Est. Time:** 2-3 часа (если использовать Framer Motion)

---

### 3. POI Search UI Полирование
**Файлы:** frontend/src/map/POILayer.jsx

**Текущий статус:** Overpass API вызывается, но UI может быть лучше

**Улучшения:**
- Лучший выбор категорий (radio buttons → checkboxes)
- Показ количества результатов
- Фильтрация по радиусу от текущего центра карты
- Loading spinner при загрузке

**Est. Time:** 1-2 часа

---

### 4. Reset Bearing Button Fix
**Файл:** frontend/src/components/islands/RightIsland.jsx

**Проблема:** Кнопка в RightIsland не работает

**Решение:** Вызвать `map.setRotation(0)` при клике

**Est. Time:** 15 мин

---

### 5. Elevation Smoothing Улучшение
**Файл:** architecture/PARSER.md (§ Elevation Smoothing)

**Текущий статус:** Savitzky-Golay фильтр работает, но параметры можно оптимизировать

**Идеи:**
- Адаптивное окно фильтра (зависит от кол-ва точек)
- Polyorder зависит от типа трека (mountain vs road)
- A/B тестирование параметров на real-world треках

**Когда:** После MVP

**Est. Time:** 2-3 часа

---

## 🔵 FUTURE FEATURES (не для MVP)

### 1. Track Creation Tool (TrackCreator улучшение)
**Файлы:** frontend/src/map/TrackCreator.jsx, backend/app/api/tracks.py

**Текущий статус:** Ручной режим (клик → точки → линия) существует

**Что добавить:**
- Auto режим с OpenRouteService: A → B через определённый profile
- Profiles: пешком, велосипед, хайкинг, авто, мотоцикл
- Сохранение нарисованного трека как новый

**Est. Time:** 3-4 часа

---

### 2. OpenRouteService Routing Integration
**Файлы:** backend/app/services/ors.py (новый), frontend/src/components/RouteSelector.jsx (новый)

**Текущий статус:** ORS API ключ в .env.example, но не используется

**Что сделать:**
- Интеграция для route planning между точками
- Cache результатов (Redis)
- UI для выбора профиля маршрута

**Когда:** После MVP, если нужно

**Est. Time:** 2-3 часа

---

### 3. Public Track Sharing Улучшение
**Файлы:** frontend/src/pages/PublicTrackPage.jsx, backend/app/api/tracks.py

**Текущий статус:** Базовый просмотр работает

**Улучшения:**
- Share button: copy URL, social media (Twitter, Facebook, WhatsApp)
- QR code для быстрого доступа
- Embed код для вставки на другие сайты
- Password protection для треков

**Est. Time:** 2-3 часа

---

### 4. Advanced Analytics & Statistics
**Файлы:** frontend/src/pages/AnalyticsPage.jsx (новый), backend/app/api/analytics.py (новый)

**Что добавить:**
- Общая статистика по всем трекам (общая дистанция, elevation, время)
- Месячные графики активности
- Сравнение с историей (growth/decline trends)
- Сегментация: по времени суток, по дню недели, по типу местности

**Est. Time:** 4-5 часов

---

## 📋 Текущее состояние по категориям

### Backend
- ✅ FastAPI setup
- ✅ JWT auth
- ✅ PostgreSQL + PostGIS
- ✅ Celery + Redis (retry/backoff, T09)
- ✅ 5 парсеров готовы (GPX, KML, TCX, FIT, GeoJSON)
- ✅ Нормализация (6 фаз) готова
- ✅ 162 теста пасс
- ✅ Database индексы (T03/T07)
- ✅ Production deployment (T11/T12/T14) — monitoring/SSL ещё нет
- ❌ Email отправка (не интегрирована)

### Frontend
- ✅ React 18 + Vite
- ✅ Islands layout работает
- ✅ Leaflet карта
- ✅ Upload drag&drop
- ✅ Speed + Heatmap режимы
- ✅ Graphs (Elevation, Speed, Slope)
- ✅ i18n (5 языков)
- ✅ Dark/Light theme
- ⚠️ POI search (работает, но UI можно улучшить)
- ⚠️ Speed Legend (работает, но позиционирование нужно проверить)
- ❌ TrackCreator Auto режим (не готов)
- ❌ Public sharing улучшения (QR, embed, social)

### DevOps
- ✅ Docker Compose setup
- ✅ Hot reload (Vite + uvicorn + watchdog)
- ⚠️ Playwright E2E tests написаны, но браузеры не установлены в контейнере
  (`npm run test:e2e` падает — см. POLISH.md § окружение)
- ✅ CI/CD pipeline (T14, `.github/workflows/ci.yml`)
- ✅ Production setup (T11: nginx, оптимизированный `Dockerfile.prod`)
- ✅ DB backups (T12)

---

## 🎯 Рекомендуемый порядок

**Для готовности к продакшену:**
1. Full Integration Test (MVP blocker) — 1-2 часа — ❌ ещё не сделано
2. Email интеграция (Resend) — 1 час — ❌ ещё не сделано
3. ~~Database индексы (performance)~~ — ✅ сделано (T03/T07)
4. ~~Production deployment setup~~ — ✅ сделано (T11/T12/T14)
5. ~~GitHub Actions CI/CD~~ — ✅ сделано (T14)

**Осталось для MVP:** пункты 1-2, ~2-3 часа

**После MVP (nice-to-have):**
1. Speed Legend fix — 30 мин
2. Reset bearing button — 15 мин
3. Анимации — 2-3 часа
4. POI UI улучшение — 1-2 часа

---

## 🔍 Код Quality

**Strengths:**
- ✅ Чистая архитектура (separated concerns)
- ✅ Хорошее покрытие тестами (162 backend tests)
- ✅ Type hints в Python (Pydantic models)
- ✅ Consistent naming conventions

**Areas for improvement:**
- [ ] Frontend TypeScript (currently JavaScript)
- [ ] More E2E tests (currently 4 test files)
- [ ] Error handling улучшение (более детальные ошибки)
- [ ] API documentation (Swagger работает, но docs могут быть лучше)
- [ ] Logging & monitoring (нет Sentry, нет structured logging)

