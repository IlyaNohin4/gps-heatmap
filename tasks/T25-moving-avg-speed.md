# T25 — Средняя скорость по методике gpx.studio (moving time)

**Приоритет:** P1 · **Оценка:** 2-3h · **Зависимости:** нет (backend, не пересекается
с серией T23) · **Происхождение:** сомнение пользователя в точности расчётов
(2026-07-10), подтверждено сравнением с gpx.studio (эталонная реализация:
`gpxstudio/gpx.studio`, `gpx/src/gpx.ts` `_computeStatistics`).

## Проблема

`backend/app/services/parser_factory.py`, `_build_segments` (~строка 419):

```python
speed_avg = sum(speeds) / len(speeds)   # среднее арифметическое скоростей сегментов
```

Это неверная методика: короткие сегменты весят как длинные, а околонулевые сегменты
стоянок занижают среднюю. Понятия «время в движении» нет — `duration_sec` включает
все остановки.

## Эталон (gpx.studio, проверено по исходникам)

Для каждой пары соседних точек с таймстампами: `speed = dist / time`. Пара считается
движением, если `0.5 <= speed <= 1500` км/ч (ниже — стоянка, выше — GPS-мусор;
у нас уже есть свой hard limit 200 км/ч для велосипеда — он строже и остаётся).
Накапливаются `distance_moving` и `time_moving`, и:

```
speed_avg = distance_moving / (time_moving / 3600)   # км/ч
```

## Что сделать

⚠️ Задача трогает `backend/app/services/parser_factory.py` — защищённую зону.
Разрешение дано ЭТОЙ задачей, но строго в объёме ниже; пайплайн нормализации
(6 фаз, Kalman, RDP и пр.) НЕ менять.

1. В `_build_segments` (функция уже возвращает 7-tuple) поменяй расчёт:
   - накапливай `distance_moving_km` и `moving_time_sec` по правилу движения
     (порог 0.5 км/ч снизу; сверху остаётся существующий hard limit 200);
   - `speed_avg = distance_moving_km / (moving_time_sec / 3600)` при
     `moving_time_sec > 0`, иначе None;
   - добавь `moving_time_sec` в возвращаемую статистику (tuple НЕ расширяй —
     положи в dict stats, который уже возвращается 7-м элементом).
2. Модель Track (`backend/app/models/track.py`): новая колонка
   `moving_time_sec = Column(Integer, nullable=True)` + alembic-миграция 0008.
   `duration_sec` остаётся как есть (полное время).
3. Сохранение: `process_track.py` пишет `moving_time_sec` из stats.
4. API: `TrackOut` (backend/app/api/tracks.py) — добавь `moving_time_sec`.
5. Тесты: обнови существующие тесты `_build_segments`/статистики под новую
   методику + новые кейсы: (a) трек со стоянкой (пары < 0.5 км/ч исключены
   из moving, speed_avg считается по движению); (b) трек без таймстампов —
   speed_avg None, moving_time_sec None.
6. **Пересчёт существующих треков**: одноразовый скрипт
   `backend/scripts/recompute_stats.py` — проходит по всем трекам с
   raw_points, пересчитывает speed_avg/moving_time_sec (только эти поля!)
   и сохраняет. Запуск: docker compose exec backend python -m scripts.recompute_stats.
   НЕ прогонять полный пайплайн нормализации заново.
7. Frontend (минимум): в развёрнутой карточке трека, где показывается
   duration, добавь строку «время в движении» (i18n, 5 языков). Формат
   вывода — как у duration.

## Чего НЕ делать

- Не менять 6-фазный пайплайн нормализации, Kalman, RDP, elevation smoothing.
- Не менять speed_max/speed_min и hard limit 200.
- Не трогать speed_segments (графики) — их методика отдельно, не в этой задаче.
- Не менять сортировку "fastest/slowest" (она станет честнее сама).

## Критерии приёмки

- Юнит-тесты: синтетический трек 10 км за 30 мин движения + 10 мин стоянки →
  speed_avg = 20 км/ч (было бы ~13-15 по старой методике), moving_time_sec = 1800.
- После recompute_stats: у реальных треков пользователя speed_avg вырос там,
  где были остановки (спот-чек 2-3 треков вручную).
- Полный pytest зелёный; CI зелёный.

## Документация

- `architecture/PARSER.md` — раздел про speed stats: новая методика + ссылка
  на gpx.studio как эталон.
- `tasks/README.md` — отметь T25 ✅.
