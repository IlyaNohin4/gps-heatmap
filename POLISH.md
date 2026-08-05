# Polish / known issues

- [x] **RESOLVED** — Fable 5 security/logic audit, 4 раунда фиксов (2026-07-30,
  3 коммита: CRITICAL/HIGH, MEDIUM `5f86243`, LOW+Docker hardening `ee56112`)
  - Независимый второй аудит (не путать с записью T15/2026-07-15 ниже в
    § Security review — это отдельный, более поздний и подробный проход).
    Каждый пункт сначала перепроверен вручную по коду/CVE (OSV.dev) перед
    фиксом — почти все подтвердились, кроме заявленного CRITICAL "XXE во всех
    парсерах" (уже блокировалось по умолчанию lxml/stdlib) и "дублирующего"
    вызова `_build_segments` (на деле два разных набора точек для разных
    целей, см. T26 elevation trade-off).
  - **CRITICAL/HIGH (5/5):** дублирование первых 2048 байт при upload
    (`tracks.py`, chunked read); кириллица → 500 при скачивании
    (`http_utils.py`, ASCII fallback теперь реально ASCII); публичная
    страница показывала неверные duration/speed (`PublicTrackPage.jsx`);
    upload грузил файл в память + устаревшие `fastapi`/`python-jose`/
    `python-multipart` (CVE-2024-47874, CVE-2024-33663/33664, CVE-2024-53981
    и ещё 6 непомянутых в аудите CVE на multipart) — апгрейд всех трёх;
    rate limiting ломался за nginx в проде (добавлен `--forwarded-allow-ips`).
  - **MEDIUM (10/10):** `create_all` убран в пользу чистого Alembic; email
    нормализуется + race-safe unique constraint при регистрации; password-reset
    токены теперь хэшируются (были plaintext), `FRONTEND_URL` вместо
    хардкода домена, JWT инвалидируются при смене/сбросе пароля (новое поле
    `password_changed_at` + миграция 0011); XXE hardening на всякий случай
    всё равно добавлен (lxml `resolve_entities=False`/`no_network=True`,
    `defusedxml` для POI); список треков переставал грузиться после 50 в трёх
    местах (`App.jsx`, `UploadZone.jsx`); тумблеры видимости POI-импортов
    были декоративными (заодно найдено: вся панель `POIImportPanel.jsx`
    вообще не подключена к UI — см. отдельную запись ниже); polling загрузки
    зависал бесконечно без таймаута; прод-nginx отдавал HTML без security
    заголовков и открыто проксировал `/docs`; `ORS_API_KEY` фронтенда
    (`VITE_ORS_API_KEY`) был в открытом JS-бандле — заменён на backend-прокси
    `POST /api/routing/directions`.
  - **LOW (по существу — часть подтвердилась, часть нет):** `elevation: 0.0`
    ложно считался отсутствующей высотой (`_collapse_drift`, falsy-баг);
    guard на `filename=None` в POI upload; `max_length` на
    `RenameImportRequest.new_name`; мёртвая async `_reverse_geocode` со
    сломанной ссылкой на `_HEADERS` удалена; `MAX_FILE_BYTES` теперь читает
    `settings.MAX_FILE_SIZE_MB`; внутренний маркер `__error: ...` (process_track
    пишет ошибку в `regions`, т.к. у Track нет отдельного статус-поля)
    больше не рендерится как регион на фронте; мёртвый `normalizer.py` (не
    задействованная альтернативная реализация drift-collapse/outlier —
    боевой пайплайн использует свою логику в `parser_factory.py`) удалён
    вместе с 4 тестами; неиспользуемые импорты (`statistics`, `io`,
    `traceback`, `re`/`EMAIL_RE`) убраны; RDP-упрощение траектории
    переписано с рекурсии на итеративный стек (риск `RecursionError` на
    треках с тысячами почти-коллинеарных точек); Nominatim теперь получает
    паузу 1 req/sec между реальными (не кэш-хит) запросами. **Не тронуто
    сознательно:** `parser_factory.detect_format` — при проверке оказался не
    мёртвым (5 тестов magic-byte spoofing), трогать не стал; "дублирующий"
    `_build_segments` — см. выше, не баг.
  - **Docker hardening:** `backend/Dockerfile` — multi-stage (gcc/libgdal-dev,
    оказавшиеся не нужны вообще ни одному рантайм-пакету, теперь только в
    builder-слое), контейнер работает от непривилегированного `appuser`
    вместо root; `--chown` на site-packages, чтобы `pip install -r
    requirements-test.txt` в dev по-прежнему работал без root. Проверено
    вживую: `whoami`/`id` подтвердили non-root, `which gcc` — отсутствует,
    полный upload → Celery processing → успех end-to-end от `appuser`.
  - **Не в этом раунде:** `react-router-dom` moderate CVE (требует major-
    апгрейда до v7, см. отдельную запись ниже); JWT в `localStorage`
    (архитектурный выбор, не баг — обоснование см. в истории сессии); Redis
    без пароля в dev-compose.
  - 218 backend-тестов, фронтенд-билд — оба зелёные на каждом из 4 раундов;
    несколько пунктов дополнительно проверены вживую (реальный Postgres,
    реальный прод-образ nginx, браузер).
  - **Довнесено 2026-07-31:** `POIImportPanel.jsx` (был не подключён, см.
    отдельную запись ниже) переработан в полноценную фичу списков POI —
    233 теста, см. ту же запись ниже за подробностями.

- [x] **RESOLVED** — Security hardening + manual QA bugfix sprint (2026-07-21,
  4 коммита: `823bce3`, `662b545`, `8f0e210`, `18e9118`)
  - **Security (backend):**
    - IDOR на `/api/tasks/{id}/status` — см. отдельную запись ниже в § Security review
    - Rate limit (5/minute) на `POST /api/auth/change-password` (был единственным
      auth-эндпоинтом без лимита — можно было брутфорсить старый пароль)
    - `Content-Disposition` — backslash-escaping заменён на strip + RFC 5987
      `filename*=UTF-8''...` (`backend/app/core/http_utils.py`), header injection
      закрыт; попутно найден и закрыт CORS-баг — без `expose_headers` браузер не
      мог прочитать заголовок на кросс-origin запросах (dev: `VITE_API_URL`
      указывает на другой порт) → скачивание сохранялось с fallback-именем/
      расширением, хотя содержимое всегда было верным
    - `max_length` на name/description полях Track/POI (раньше не было лимита)
    - `GET /api/tracks/geometries` — `.limit(5000)` как верхняя граница (без
      полноценной пагинации — эндпоинт намеренно возвращает всё разом для heatmap)
  - **Download был сломан на нескольких уровнях** (баг репортился пользователем
    несколько раз, каждый раз оказывалась новая причина):
    1. `/api/tracks/{id}/download` **всегда** отдавал GeoJSON независимо от
       `file_format` трека — переписан на генерацию правильного формата
       (gpx/kml/tcx/fit/geojson) из `raw_points` с реальными elevation/time
    2. `/api/tracks/public/{token}/download` (кнопка на странице публичного
       шаринга) вообще не существовал как роут — 404
    3. CORS `expose_headers` (см. выше) — сервер отвечал верно, но фронтенд не
       мог прочитать `Content-Disposition`
  - **Карта/данные:**
    - Download трека в сайдбаре — был `<a href download>` без auth-заголовка (401);
      заменён на authenticated fetch → blob
    - Rename/delete трека не обновляли `mapStore.trackDetailCache`/`visibleTrackIds`
      — удалённый трек мог продолжать рендериться, переименованный — показывать
      старое имя в тултипе карты и в `BottomIsland`
    - "Показать все" не работал при выбранном треке (ранний `return` до toggle)
    - Heatmap показывала посещения по всем трекам, а не по видимым/выбранным —
      см. отдельную (superseded) запись T04 выше
    - Drag-and-drop на POI-зону с неподдерживаемым для POI типом файла тихо
      уходил в загрузку треков вместо явной ошибки
    - `.kml`-файлы (валидны и для треков, и для POI) теперь проверяются по
      содержимому (`<LineString>`/`<Track>` vs `<Point>`) перед отправкой —
      `frontend/src/utils/fileSniff.js`
  - **График (`BottomIsland`):**
    - Hover по графику теперь двигает маркер по треку на карте (раньше не был
      реализован вообще)
    - Elevation gain/loss не конвертировались в футы при imperial unit system
    - Slope — было `%`, подписанное как `°`; затем по фидбеку пользователя
      переделано на настоящий угол через `atan(подъём/дистанция)`
    - `user-select: none` на контейнере графика (выделение текста при драге)
  - **Прочее:** "Uploading" → "Processing" для очереди загрузки треков (POI
    оставлен как есть — там действительно нет фоновой обработки); FastAPI
    422-ошибки (массив вместо строки в `detail`) больше не рендерятся как
    `[object Object]` в toast — `frontend/src/utils/apiError.js`
  - Все 182 backend-теста зелёные, каждый фикс проверен вживую в браузере
    (см. коммиты для деталей по каждому пункту)

- [ ] **Multi-tab session bleed** (найдено при ручном тестировании, 2026-07-21):
  `frontend/src/api/client.js` (`getToken()`) читает JWT напрямую из
  `localStorage` при **каждом** запросе (комментарий в коде: "avoid timing
  issues with Zustand hydration"), а не из in-memory состояния конкретной
  вкладки. Так как `localStorage` общий на весь origin, если залогиниться
  под другим пользователем в одной вкладке браузера, все остальные открытые
  вкладки того же браузера при следующем запросе начинают действовать от
  его имени (наблюдалось: загрузка в первой вкладке "укатилась" под аккаунт,
  залогиненный во второй). Для личного инструмента с 1-5 известными
  пользователями, не логинящимися параллельно под разными аккаунтами в
  разных вкладках одного браузера — не критично, отложено. Если чинить:
  нужна per-tab изоляция сессии (`sessionStorage` вместо `localStorage`,
  либо `BroadcastChannel`/`storage`-event синхронизация с явным выбором
  "какая вкладка главная").

- [ ] **Security review (Fable 5, 2026-07-15) — перепроверено вручную, статус по пунктам**
  - **Не подтвердилось:** заявленный CRITICAL — XXE во всех XML-парсерах
    (`parser_factory.py`/`poi_parser.py`). Протестировано эмпирически в
    контейнере: `lxml.etree.fromstring()` (5.2.2) и stdlib
    `xml.etree.ElementTree.fromstring()` блокируют внешние `SYSTEM`-сущности
    по умолчанию (payload с `file:///etc/hostname` падает с ошибкой парсинга,
    не подставляет содержимое); «billion laughs» тоже блокируется — libxml2
    кидает `Maximum entity amplification factor exceeded`. Не проблема,
    фиксить не нужно.
  - [x] **RESOLVED** — Zip-бомба в KMZ-импорте POI (2026-07-15). Было:
    `POIParser._extract_kml` (`backend/app/services/poi_parser.py`) читал
    содержимое ZIP без проверки распакованного размера — компактный
    (<1МБ) KMZ с высокосжимаемым содержимым мог развернуться в
    гигабайты и уронить воркер по памяти. Решение: проверка
    `ZipInfo.file_size` против лимита 5MB (тот же, что у самого upload'а
    в `api/poi.py`) **до** `z.read()`. Тесты:
    `test_kmz_zip_bomb_is_rejected`, `test_kmz_within_size_limit_still_parses`
    в `backend/tests/test_poi_parser.py`.
  - [x] **RESOLVED** — Stored XSS в `POILayer.jsx` (`bindPopup`) и
    `TrackLayer.jsx:44` (`bindTooltip`) (2026-07-15). Было: `poi.name`/
    `description` и `track.name` шли в Leaflet-попап/тултип HTML-строкой без
    экранирования — Leaflet рендерит их как `innerHTML`, React здесь не
    защищает. Для трека это реальный вектор через публичный шаринг
    (`is_public`/`public_token`): злоумышленник переименовывает свой трек во
    вредоносную строку и делает публичным — XSS у анонимного зрителя, не
    только self-XSS. Решение: общая `frontend/src/utils/escapeHtml.js`,
    применена к обоим местам. Проверено вживую в браузере: создал POI/трек с
    payload `<img src=x onerror=...>`/`<script>...</script>` через прямой
    API-вызов, открыл попап — payload отрендерился как экранированный текст
    (`&lt;img...&gt;`), JS не выполнился (`window.__xss_fired` осталось
    `false`). `SpeedLayer.jsx`/`TrackCreator.jsx` проверены отдельно — там
    только фиксированные строки/числа, не уязвимы, не трогал.
  - [x] **RESOLVED** — `/api/tasks/{id}/status` без авторизации
    (2026-07-15, довнесено 2026-07-21). Было: вообще нет `Depends(get_current_user)`
    — любой аноним с `task_id` (UUID) видел `result`/`detail` чужой задачи. Сначала
    (2026-07-15) добавлен `Depends(get_current_user)` — требовался валидный JWT, но
    ЛЮБОЙ авторизованный юзер мог подставить чужой `task_id` и всё равно увидеть
    чужие данные (IDOR, не только анонимный доступ). **Довнесено 2026-07-21:**
    `redis_client.setex(f"task_owner:{task_id}", 24h, user_id)` при создании задачи
    в `/upload`/`/create`, `/api/tasks/{id}/status` теперь сверяет владельца — чужой
    `task_id` отдаёт 404. Тесты: `backend/tests/test_tasks.py` (owner-check case
    добавлен).
  - **Подтверждено, не критично, не в этой волне** (backend `USER`,
    `MAX_FILE_BYTES` hardcode и JWT-инвалидация при смене пароля позже
    **RESOLVED** в аудите Fable 5/2026-07-30 выше)**:** Redis без пароля +
    порт 6379 наружу в dev `docker-compose.yml` (в проде порта нет, T11);
    нет `soft_time_limit`/`time_limit` у Celery-таски `process_track`; нет
    лимита на количество точек в файле (`MAX_POINTS`).
  - **Подтверждено, но не проблема на момент 2026-07-15** — **позже удалено
    как мёртвый код** (аудит Fable 5/2026-07-30 выше): `regions.py` —
    async `_reverse_geocode` использовала несуществующее имя `_HEADERS`;
    функция была мёртвым кодом, нигде не вызывалась; рабочий путь
    (`_reverse_geocode_sync`) использовал правильный `_headers()`.
  - **Мелкие LOW — позже RESOLVED** (аудит Fable 5/2026-07-30 выше):
    неиспользуемые импорты (`traceback` в `process_track.py`, `io` в
    `poi.py`, мёртвый `EMAIL_RE` в `auth.py`) убраны. **Не тронуто:** CORS
    `allow_methods/headers=["*"]` (в коде уже есть комментарий, что в проде
    за nginx не срабатывает — dev-only).

- [x] **RESOLVED** — CLAUDE.md тестовое число (T28, 2026-07-15): поправлено на 170
  (162 из T13 + 8 новых из `test_track_export_formats.py`) в том же коммите, что и T28.

- [x] **RESOLVED** — Две мелочи, найдены при обходе (2026-07-15; починено 2026-07-20)
  - **`fontSize: 13` вне шкалы токенов** — было в 5 местах: `TopIsland.jsx:155,
    163, 171, 184` (лейблы Units/Theme/Language/Track Info) и
    `RightIsland.jsx:186`. Заменено на `var(--text-sm)` (12px) во всех пяти.
    Визуально сверено в браузере (EN/RU) — строки не поплыли.
  - **`TopIsland.jsx:184` — захардкоженный английский лейбл "Track Info"**
    среди соседей на `t('settings.*')`. Добавлен ключ `settings.track_info`
    в `frontend/src/i18n/translations.js` для всех 5 языков (en/ru/uk/de/es),
    `TopIsland.jsx` переведён на `t('settings.track_info')`. Проверено вживую
    переключением языка на русский — «Инфо о треке» отображается корректно.

- [x] **RESOLVED** — SaveTrackModal client-side Download дублировал и усугублял баги
  TCX/FIT (найдено при работе над T28, 2026-07-15; починено 2026-07-15)
  - **Было:** `frontend/src/components/track/SaveTrackModal.jsx` — кнопка **Download**
    генерировала файл целиком в браузере (`generateFile()`), никогда не обращаясь к
    бэкенду, независимо от кнопки **Save to DB** (`POST /api/tracks/create`, уже
    использовала исправленные в T28 `_points_to_*`). `generateTCX()` — те же баги, что
    были в бэкенде до T28 (хардкод `AltitudeMeters=0`/`Time="2024-01-01"`).
    `generateFIT()` — **вообще не FIT-формат**: `JSON.stringify(массив чисел)` с
    расширением `.fit`, даже не бинарные данные.
  - **Решение:** новый no-persist эндпоинт `POST /api/tracks/export`
    (`backend/app/api/tracks.py`) — переиспользует те же `_points_to_*`/
    `_validate_track_points`, что и `/create` (вынесены в общие хелперы, чтобы не
    дублировать валидацию). `SaveTrackModal.jsx` заменил всю самописную генерацию
    (~90 строк: `generateGPX/KML/GeoJSON/TCX/FIT`) на вызов `exportTrackFile()`
    (`frontend/src/api/tracks.js`) → `Blob` → тот же `downloadBlob()`. Теперь единственный
    источник правды для TCX/FIT — бэкенд, дублирования в двух местах больше нет.
  - **Тесты:** `backend/tests/test_track_export_endpoint.py` (6 тестов: auth, GPX
    контент, FIT round-trip через `fit-tool`, валидация точек/формата, дефолтное имя).
  - **Проверено вживую:** прямой вызов `/api/tracks/export` из браузера — FIT с
    правильной сигнатурой `.FIT`, TCX без хардкода даты/высоты, корректный
    `Content-Disposition` с именем файла.

- [x] **RESOLVED** — `grade_stats` вычислялся, но никогда не персистился и не отдавался
  (найдено при синхронизации документации, T13, 2026-07-15; убрано 2026-07-15)
  - **Было:** `parser_factory.py` (5 форматных парсеров) добавляли `"grade_stats": stats`
    (climbing/descent/flat % и grade_avg/max/min — сумма из `_build_segments`) в результат
    парсинга. `process_track.py` этот ключ **не читал и не сохранял** ни в одно поле `Track`.
    Frontend (`BottomIsland.jsx`, график Slope) тоже не использует `grade_stats` — считает
    наклон сам из `elevation` в `normalized_points`.
  - **Согласовывалось с более ранним продуктовым решением** (см. ниже «⭐⭐⭐ КРИТИЧНЫЕ» §
    Full integration test: «Grade stats НЕ нужны в UI, Slope chart достаточен»).
  - **Решение:** убрана только внешняя строка `"grade_stats": stats` из 5 return-словарей
    парсеров (`parser_factory.py`) — сама `_build_segments()` и её `stats` (7-й элемент
    tuple) **не тронуты**: они по-прежнему используются и протестированы напрямую в
    `test_grade_classification.py` (climbing/descent/flat классификация — реальная,
    используемая функциональность `speed_segments`, не мёртвый код). Мёртвым был только
    внешний слой, который пробрасывал уже посчитанное дальше в никуда.
  - Обновлён `test_db_integration.py` (assert на `"grade_stats" in result` →
    `"speed_segments" in result`). Все 180 тестов зелёные.

- [x] **RESOLVED** — Экспорт TCX/FIT из Track Creator (backend), T28, 2026-07-15
  - **Было** (найдено при архитектурном ревью, 2026-07-12): `backend/app/api/tracks.py` —
    `_points_to_tcx` хардкодил `AltitudeMeters=0`/`Time=2024-01-01T00:00:00Z` на каждую точку;
    `_points_to_fit` писал кастомный бинарник (lat/lon как `double` + заглушка 4 байта) без
    CRC-16 и без FIT message definitions — не валидный `.fit`, сторонние приложения (Strava,
    Garmin Connect) его бы отклонили
  - **Уточнение при постановке T28**: исходная запись ошибочно упоминала эндпоинт
    `/api/tracks/{id}/export` — такого в коде нет и не было; обе функции используются только
    в `POST /api/tracks/create` (Track Creator, рисование трека на карте)
  - **Решение (вариант 1, выбран пользователем — исправить через библиотеки, не убирать
    форматы):** `_points_to_fit` переписан на `fit-tool` (валидный FIT-курс: FileId → Course →
    Event(START) → Record* → Event(STOP_ALL) → Lap, с настоящим CRC); `_points_to_tcx` —
    синтетическое, но честное время (момент экспорта + 1с на точку) вместо одной фиксированной
    даты на все точки, `AltitudeMeters` убран совсем (опционален в TCX-схеме) вместо лживого
    нуля. Заодно добавлено `xml.sax.saxutils.escape()` в GPX/KML/TCX f-строки (защитная мера,
    сейчас в XML попадают только числа-координаты, реальной уязвимости не было)
  - **Тесты:** `backend/tests/test_track_export_formats.py` (8 тестов) — TCX без хардкода даты/
    высоты, валидный XML; FIT проходит round-trip через собственный декодер `fit-tool`
    (валидирует CRC), record-сообщения совпадают с точками на входе
  - Клиентский путь (`SaveTrackModal.jsx`, кнопка Download) не был затронут T28,
    генерировал файл независимо в браузере — закрыто отдельно, см. запись выше
    («SaveTrackModal client-side Download»).

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
  - **Решение (T04):** добавлен `useAllTracksWithGeometry()` в `MapContainer.jsx`, мёржащий `appStore.tracks` с `mapStore.trackDetailCache` по id; `VisitLayer` получал этот merged список (ВСЕ треки юзера с геометрией, не только видимые)
  - Заодно: обнаружено, что это выявилось только сейчас — до T04 preload через `ensureTrackDetail` тоже никогда не попадал в `appStore.tracks`
  - **СУПЕРСЕДЕД 2026-07-21:** по фидбеку пользователя ("странно, что при выборе
    одного трека heatmap показывает посещения по всем") `useAllTracksWithGeometry()`
    убрана, `VisitLayer` переведён на тот же `visibleTracks`, что и
    `TrackLayer`/`SpeedLayer` — heatmap теперь показывает только видимые/выбранные
    треки. См. группу B фиксов.
  - **СУПЕРСЕДЕД ЕЩЁ РАЗ 2026-08-05:** `VisitLayer` удалён целиком (`HeatmapLayer`
    переписан в line-based слой на `/api/tracks/road-usage`, см. `ARCHITECTURE.md`
    § Modes) — visibleTracks-гейтинг из абзаца выше больше не действует, heatmap
    снова показывает агрегат по всем трекам юзера, но теперь это осознанное решение
    (агрегация server-side, не привязана к тому, что сейчас включено на карте), а
    не регрессия.

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

- [ ] Playwright браузеры не установлены в контейнере frontend (обнаружено в T16, 2026-07-08;
  перепроверено 2026-07-21 — статус не изменился)
  - `npm run test:e2e` падает на всех 33 тестах: `browserType.launch: Executable doesn't exist ... chrome-headless-shell`
  - Нужно `npx playwright install` (и/или chromium deps) внутри образа/контейнера frontend
  - Вне scope T16 (кластеризация POI) — не чинил

---

## ⭐⭐⭐ КРИТИЧНЫЕ (MVP blockers)

- [x] **RESOLVED** — Full integration test (MVP REQUIREMENT) (2026-07-21)
  - Загружен реальный GPX (6 точек, Киев) через API + открыт в UI: трек появился в
    списке сразу, выбор трека отрисовал polyline на карте (авто-zoom к треку),
    `elevation_gain`/`elevation_loss`/`distance_km`/`speed_avg` посчитаны и совпали
    с ожидаемыми значениями, region определён (`Київ, Україна`)
  - Все 3 графика (Elevation/Speed/Slope) в `BottomIsland` открыты и отрисовались с
    реальными данными; hover на графике синхронно двигает маркер по треку на карте
    (см. группа C ранее в этой же сессии правок)
  - Slope chart считает через `atan(подъём/дистанция)` в градусах (не проценты,
    ошибочно подписанные как °, см. фикс группы C) — на тестовом треке показал
    корректные -0.3…-0.7°, что соответствует пологому уклону вниз
  - Тестовый трек удалён после проверки, БД не замусорена

  **NOTE:** Grade stats (climbing%, flat%, descent%) НЕ нужны в UI
  Slope chart в BottomIsland достаточен для анализа уклона

---

## ⭐⭐ ВАЖНЫЕ

- [ ] `react-router-dom` 6.30.4 — moderate CVE (open redirect via backslash in
  `<Link>`/`useNavigate`, GHSA-wrjc-x8rr-h8h6; deserialization issue in SSR
  hydration, GHSA-337j-9hxr-rhxg), найдено при аудите зависимостей (MEDIUM #10,
  2026-07-30). Полный фикс требует мажорного апгрейда до v7 (breaking API
  changes — не входит в текущий scope без отдельного согласования). Для
  личного инструмента без SSR и без непроверенных redirect-ссылок риск низкий
  — оставлено как известный долг, не смёрджено.

- [x] **RESOLVED** — `POIImportPanel.jsx` нигде не подключён к приложению
  (обнаружено 2026-07-27; решено 2026-07-31)
  - Обнаружено 2026-07-27 при фиксе аудита Fable (пункт про декоративные тумблеры
    видимости импортов): компонент содержал полноценный UI управления импортами,
    но не был подключён ни к `POITab.jsx`, ни откуда-либо ещё.
  - **Решение (2026-07-31), шире, чем просто "подключить панель":** списки
    импортов стали первоклассной сущностью (`POIImport`, миграция 0012) вместо
    производной группировки по `POI.import_name` — теперь можно создать пустой
    список заранее и выбрать его при ручном создании точки (`POICreationModal`),
    не только при загрузке KML. `POIImportPanel.jsx` как отдельный компонент
    удалён, его функционал (rename/delete/export/toggle-visibility) встроен
    прямо в `POITab.jsx`, раскрывается над нижним рядом кнопок. Подробности —
    см. новую запись выше (аудит Fable 5, 2026-07-30/31) и `ARCHITECTURE.md`
    § POIImport / § API Endpoints / § LeftIsland.

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

- [x] **RESOLVED** — Speed legend positioning verification (2026-07-21)
  - Проверено на mobile (375px)/tablet (768px)/desktop viewport: на mobile/tablet
    легенда (`App.jsx`, fixed bottom:16/left:16) реально перекрывалась/обрезалась
    нижней панелью графика (`BottomIsland`, тоже fixed, растёт вверх при expand,
    занимает почти всю ширину на узких экранах) — последние 1-2 строки легенды были
    не видны
  - **Решение:** `BottomIsland` обёрнут в `forwardRef`, `App.jsx` меряет его
    `getBoundingClientRect()` через `ResizeObserver` (тот же паттерн, что уже
    использовался для `topIslandBottom`) и поднимает легенду выше панели графика,
    когда они пересекаются по горизонтали; когда трек не выбран или панели не
    пересекаются (обычно на desktop) — легенда остаётся на `bottom: 16`
  - Проверено вживую на всех трёх viewport после фикса — все 6 строк легенды видны
    без обрезки, на desktop поведение не изменилось

- [ ] POI search UI (if Overpass API enabled)
  - Food, Amenities, Medical, Tourism, Bicycle, Public Transport
  - Debounced search с 350ms delay

- [x] **STALE ENTRY, дублирует уже реализованное** — "Reset bearing button (currently
  broken)" (обнаружено при ревизии POLISH.md, 2026-07-21): в кодовой базе такой
  кнопки больше нет — есть только неиспользуемый i18n-ключ `map.reset_bearing`
  (все 5 языков), нигде не подключённый к компоненту. Не "сломана", а просто
  отсутствует; если функциональность нужна — заводить как новую задачу, не баг.

- [x] **STALE ENTRY, уже реализовано** — "Track creation tool" (обнаружено при
  ревизии POLISH.md, 2026-07-21): Track Creator полностью реализован —
  `frontend/src/map/TrackCreator.jsx` (рисование на карте, undo/redo, routing через
  OpenRouteService) + `POST /api/tracks/create` на бэкенде. Проверено вживую в этой
  же сессии (созданы и скачаны тестовые треки во всех 5 форматах через Track
  Creator). Запись была неактуальна на момент ревизии.

---

## 🔧 BACKEND TASKS

### Not Yet Started

- [ ] OpenRouteService routing integration (optional)
  - 2500 req/day free tier
  - Интеграция для route planning

- [ ] POI search via Overpass API (under question)
  - Food, Amenities, Medical, Tourism, Bicycle, Public Transport
  - Возможно не нужна

- [x] **STALE ENTRY, уже реализовано** — "Track creation from scratch" (обнаружено
  при ревизии POLISH.md, 2026-07-21): см. дубликат записи выше в NICE-TO-HAVE
  ("Track creation tool") — `POST /api/tracks/create` + Track Creator на фронтенде
  полностью работают, вопрос "нужна ли" закрыт фактом реализации.

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