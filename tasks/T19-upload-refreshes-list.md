# T19 — Список треков должен обновляться после загрузки

**Приоритет:** P1 · **Оценка:** 30-60m · **Зависимости:** T05, T06 ·
**Происхождение:** баг найден на приёмке T11 (2026-07-09)

## Симптом

Загружаешь трек → он появляется на карте, но **в списке сайдбара его нет** до
перезагрузки страницы.

## Причина

После T05 список треков живёт в локальном состоянии LeftIsland и перезапрашивается
эффектом только при смене фильтров (`search/sort/formatFilter/speedRange`) или
Retry (`retryCount`). Upload-потоки (`frontend/src/App.jsx`
handleTrackFilesFromOverlay, `frontend/src/components/upload/UploadZone.jsx`)
обновляют только `appStore.tracks` (карту) — список о загрузке не узнаёт.

## Что сделать

1. В `frontend/src/store/appStore.js` добавь счётчик-триггер:
   ```javascript
   tracksListVersion: 0,
   bumpTracksListVersion: () => set((s) => ({ tracksListVersion: s.tracksListVersion + 1 })),
   ```
2. В LeftIsland подпишись на него (`const tracksListVersion = useAppStore((s) => s.tracksListVersion)`)
   и добавь в deps debounce-эффекта списка (рядом с `retryCount`). ВАЖНО: не
   ломай гонко-защиту requestVersion — bump просто перезапускает эффект.
3. Вызови `bumpTracksListVersion()` после **каждого** успешного изменения
   состава треков. Найди все места grep'ом по `setTracks(` и по
   `deleteTrack\|uploadTrack\|createTrackFromPoints`:
   - App.jsx: handleTrackFilesFromOverlay (после успешной загрузки), сохранение
     нарисованного трека (SaveTrackModal-поток), handleFindInArea/handleShowAll
     НЕ трогай (они меняют карту, список фильтруется отдельно);
   - UploadZone.jsx: оба места успешной загрузки;
   - удаление трека (TrackDeleteModal) и переименование (TrackRenameModal) —
     проверь: если после них список сейчас обновляется другим способом, не
     дублируй; если нет — тоже bump.
4. Не перезапрашивай список из самих upload-компонентов напрямую — только bump
   счётчика; единственная точка запросов списка остаётся в LeftIsland.

## Чего НЕ делать

- Не менять механизм фильтров/пагинации/гонко-защиты.
- Не возвращать список на appStore.tracks.
- Не трогать карту и mapStore.

## Критерии приёмки

- Загрузка трека через drag&drop и через кнопку → трек появляется в списке
  сайдбара без перезагрузки страницы (с учётом текущих фильтров: если фильтр
  его отсеивает — это корректно).
- Удаление/переименование трека отражается в списке сразу.
- Смена фильтров и infinite scroll работают как раньше.

## Как проверить

```bash
docker compose exec -T frontend npm run build
# вручную: загрузить трек → список обновился; удалить → пропал из списка
```

## Документация

- `POLISH.md` — закрой запись об этом баге (добавлена в T11).
- `tasks/README.md` — отметь T19 ✅.
