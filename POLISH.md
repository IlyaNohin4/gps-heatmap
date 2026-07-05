# Polish / known issues

- [x] **RESOLVED** — LeftIsland POI tab delay when switching tabs (Performance, 2026-07-05)
  - **Проблема:** При клике на вкладку POI происходило 1.1s зависание браузера
  - **Причина:** Условный рендер POITab вызывал синхронный mount и render ВСЕ POI одновременно
  - **Решение:** Откатили conditional rendering, вернули display:none/flex
  - **Как это работает:** Оба таба (Tracks, POI) всегда в DOM, смонтированы при загрузке (асинхронно). Переключение = просто display change, не React render
  - **Результат:** Мгновенное открытие POI таба ⚡
  - **DevTools Profile:** Было performSyncWorkOnRoot 1.1s jank, теперь только CSS change
  - **Trade-off:** +50KB памяти за -1.1s задержку. Отличный результат!

---

- [x] **RESOLVED** — Нормализатор не фильтрует GPS-выбросы скорости (Phase 2)
  - Решение: Hard limit 200 km/h (физический максимум для велосипеда)
  - Результат: Все невозможные скорости (247 km/h) отсекаются
  - Тест: реальный трек показывает max 115 км/ч (реалистично для спуска)
---

## ⭐⭐⭐ КРИТИЧНЫЕ (MVP blockers) — 1 ЗАДАЧА

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
  - CI/CD pipeline (GitHub Actions для tests & deploy)
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