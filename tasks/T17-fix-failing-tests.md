# T17 — Починить красные тесты на main

**Приоритет:** P0 · **Оценка:** 2-3h · **Зависимости:** T14 (CI покажет результат) ·
**Блокирует:** фактически все остальные — пока main красный, CI-gate бесполезен

## Цель

На main падают 8 тестов + 2 error (обнаружено при настройке CI, 2026-07-06).
Довести `pytest` до полностью зелёного состояния. Предварительный диагноз: тесты
устарели после легитимных изменений кода, а не код сломан — но каждый случай надо
подтвердить, а не предположить.

## Текущее состояние (проверено в docker: 8 failed, 122 passed, 2 errors)

```
FAILED tests/test_parser.py::TestBuildSegments::test_empty_returns_zero        — ValueError: too many values to unpack (expected 6)
FAILED tests/test_parser.py::TestBuildSegments::test_timed_points_produce_segments
FAILED tests/test_parser.py::TestBuildSegments::test_untimed_points_no_speed
FAILED tests/test_parser.py::TestBuildSegments::test_speed_calculation_plausible
FAILED tests/test_parser.py::TestParseKML::test_no_speed_without_timestamps
FAILED tests/test_parser.py::TestParseGeoJSON::test_no_time_so_no_speed
FAILED tests/test_poi_parser.py::test_parse_kml_multiple                        — AssertionError
FAILED tests/test_poi_parser.py::test_category_detection                        — 'Bike Rental Shop': ожидали bike, получили food
ERROR  tests/test_db_integration.py::test_parse_and_save_track_to_db
ERROR  tests/test_db_integration.py::test_elevation_gain_loss_saved
```

Известный контекст:
- `_build_segments()` недавно дорабатывали — добавляли отслеживание высот для
  elevation_gain/loss (см. POLISH.md § Bug Fixes). Ошибка «too many values to unpack
  (expected 6)» указывает, что функция теперь возвращает больше значений, чем
  распаковывают тесты. Вероятно, это же — причина обоих ERROR в test_db_integration.
- POI category detection: порядок/приоритет ключевых слов в
  `backend/app/services/poi_parser.py`, видимо, менялся (сессия POI import).

## Что сделать

1. Прогони `docker compose exec backend python -m pytest tests/ -v --tb=long` и разбери
   **каждый** из 10 случаев по одной схеме:
   - что ожидает тест;
   - что делает код сейчас;
   - что говорит документация (`architecture/PARSER.md` — источник правды по поведению
     парсера и нормализации; для категорий POI — docstring/комментарии poi_parser.py).
2. Классифицируй каждый случай:
   - **Тест устарел** (код изменён осознанно, документация/POLISH.md подтверждают) →
     обнови тест под актуальное поведение.
   - **Код регрессировал** (документация подтверждает старое поведение) → покажи мне
     доказательство (цитата из PARSER.md + diff поведения) и **жди моего явного OK**
     перед изменением кода в `services/` — правило «не трогать парсер» снимается только
     моим подтверждением, для конкретного файла.
   - Непонятно, что правильно (например, 'Bike Rental Shop': bike или food?) → спроси
     меня, покажи варианты.
3. Отдельно: warning `Unknown config option: asyncio_mode` в pytest — проверь
   `pytest.ini`/`pyproject.toml`: если опция осталась от удалённой зависимости
   (pytest-asyncio не установлен) — убери опцию; если асинхронные тесты есть — добавь
   зависимость. Мелочь, но убирает шум в каждом прогоне.
4. Обнови POLISH.md: запись о красных тестах (сделана в T14) перенеси в решённые
   с кратким итогом «что было: тесты устарели после X / регрессия Y».

## Чего НЕ делать

- Не менять код в `backend/app/services/` без моего явного OK (см. п.2).
- Не удалять и не скипать тесты (`@pytest.mark.skip`/`xfail` запрещены) — только чинить.
- Не «подгонять» ассерты под фактический вывод без понимания, какое поведение правильное.

## Критерии приёмки

- `docker compose exec backend python -m pytest tests/ -v` — 0 failed, 0 errors.
- По каждому из 10 случаев в итоговом отчёте: одна строка «тест устарел из-за … /
  регрессия, исправлена с OK пользователя».
- После merge — зелёный workflow CI на main.

## Как проверить

```bash
docker compose exec backend python -m pytest tests/ -v
gh run watch   # после push — CI должен стать зелёным
```

## Документация

- `POLISH.md` — перенести запись о красных тестах в решённые.
- `CLAUDE.md` — поправить число тестов («107 backend tests» устарело; фактически 132).
- Если выявлена регрессия парсера — `architecture/PARSER.md` обновить/подтвердить
  соответствующий раздел.
