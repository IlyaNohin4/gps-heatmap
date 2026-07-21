# GPS Heatmap — Рекомендации по улучшению

Анализ проекта на основе архитектуры и кода. Приоритизировано по влиянию и трудоёмкости.

---

## 🔴 КРИТИЧНЫЕ (блокируют продакшн)

### 1. Full Integration Test (MVP requirement)
**Файл:** POLISH.md

**Текущий статус:** ✅ **СДЕЛАНО (2026-07-21)** — загружен реальный GPX через API,
открыт в UI: карта, все 3 графика (Elevation/Speed/Slope) и hover-синхронизация
графика с маркером на карте проверены вживую с реальными данными. Подробности —
POLISH.md § Full integration test.

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
**Файл:** `frontend/src/App.jsx` (инлайн JSX — отдельного компонента
`SpeedLegend.jsx` в кодовой базе нет)

**Статус:** ✅ **СДЕЛАНО (2026-07-21)** — подтверждено на mobile/tablet: легенда
реально перекрывалась `BottomIsland`. `BottomIsland` обёрнут в `forwardRef`,
`App.jsx` меряет его через `ResizeObserver` и поднимает легенду выше панели,
когда они пересекаются. См. POLISH.md.

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
**Статус:** ⚠️ **УТОЧНЕНО (2026-07-21)** — такой кнопки в кодовой базе больше нет
(проверено: нет ни в `RightIsland.jsx`, ни где-либо ещё), остался только
неиспользуемый i18n-ключ `map.reset_bearing` во всех 5 языках. Не "сломана", а
отсутствует — если функциональность нужна, это задача "добавить", не "починить".

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

**Статус:** ✅ **УЖЕ РЕАЛИЗОВАНО** (проверено 2026-07-21, устаревшая запись
исправлена) — оба режима работают: ручной (клик → точки → линия) И auto через
`fetchRoute()` (`TrackCreator.jsx`), который зовёт OpenRouteService API с выбором
`profile` (cycling-regular и другие). Сохранение как новый трек — `POST
/api/tracks/create`. Протестировано вживую в сессии 2026-07-21 (созданы и
скачаны тестовые треки во всех 5 форматов через Track Creator).

---

### 2. OpenRouteService Routing Integration
**Статус:** ✅ **УЖЕ РЕАЛИЗОВАНО** (проверено 2026-07-21, устаревшая запись
исправлена) — `TrackCreator.jsx` вызывает ORS API напрямую с фронтенда
(`VITE_ORS_API_KEY`) при `mode === 'auto'`, кэша в Redis нет (не требовался —
ORS free tier 2500 req/day достаточен для личного использования). Дублирует
запись выше.

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
- ✅ 182 теста пасс (обновлено 2026-07-21, было 162)
- ✅ Database индексы (T03/T07)
- ✅ Production deployment (T11/T12/T14) — monitoring/SSL ещё нет
- ❌ Email отправка (не интегрирована)

### Frontend
- ✅ React 18 + Vite
- ✅ Islands layout работает
- ✅ Leaflet карта
- ✅ Upload drag&drop
- ✅ Speed + Heatmap режимы (heatmap теперь ограничена видимыми/выбранными
  треками, не показывает всё сразу — изменено 2026-07-21, см. POLISH.md)
- ✅ Graphs (Elevation, Speed, Slope) — hover синхронизирован с маркером на карте
- ✅ i18n (5 языков)
- ✅ Dark/Light theme
- ⚠️ POI search (работает, но UI можно улучшить)
- ✅ Speed Legend (позиционирование проверено и исправлено 2026-07-21)
- ✅ TrackCreator Auto режим (уже реализован, запись выше была устаревшей)
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
1. ~~Full Integration Test (MVP blocker)~~ — ✅ сделано (2026-07-21)
2. Email интеграция (Resend) — 1 час — ❌ ещё не сделано (последний MVP-блокер)
3. ~~Database индексы (performance)~~ — ✅ сделано (T03/T07)
4. ~~Production deployment setup~~ — ✅ сделано (T11/T12/T14)
5. ~~GitHub Actions CI/CD~~ — ✅ сделано (T14)

**Осталось для MVP:** пункт 2 (email), ~1 час

**После MVP (nice-to-have):**
1. ~~Speed Legend fix~~ — ✅ сделано (2026-07-21)
2. ~~Reset bearing button~~ — кнопки не существует, не задача "починить" (см. выше)
3. Анимации — 2-3 часа
4. POI UI улучшение — 1-2 часа

---

## 🔍 Код Quality

**Strengths:**
- ✅ Чистая архитектура (separated concerns)
- ✅ Хорошее покрытие тестами (182 backend tests)
- ✅ Type hints в Python (Pydantic models)
- ✅ Consistent naming conventions

**Areas for improvement:**
- [ ] Frontend TypeScript (currently JavaScript)
- [ ] More E2E tests (currently 4 test files)
- [ ] Error handling улучшение (более детальные ошибки)
- [ ] API documentation (Swagger работает, но docs могут быть лучше)
- [ ] Logging & monitoring (нет Sentry, нет structured logging)

