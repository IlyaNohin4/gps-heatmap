# T16 — Кластеризация POI-маркеров на карте

**Приоритет:** P1 · **Оценка:** 2h · **Зависимости:** нет

## Цель

POI рисуются индивидуальными DOM-маркерами: `frontend/src/map/POILayer.jsx:75` —
`L.marker([poi.lat, poi.lon], { icon })` с `L.divIcon` (строка 29). При ~1600 POI это
~1600 DOM-узлов — тормоза при зуме/панорамировании. Обернуть в leaflet.markercluster.

## Текущее состояние

- `frontend/src/map/POILayer.jsx` — изучи целиком: как создаётся слой, как маркеры
  добавляются на карту, есть ли popup/клик-обработчики, как слой чистится при
  обновлении списка POI.
- POI приходят из `mapStore.pois` (все сразу — это норм, см. T02).
- Пакета `leaflet.markercluster` в `frontend/package.json` нет.
- **npm только в докере**: `docker compose exec -T frontend npm install leaflet.markercluster`.

## Что сделать

1. Установи пакет: `docker compose exec -T frontend npm install leaflet.markercluster`.
2. В `POILayer.jsx`:
   - импорты:
     ```javascript
     import 'leaflet.markercluster';
     import 'leaflet.markercluster/dist/MarkerCluster.css';
     import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
     ```
   - вместо добавления маркеров напрямую на карту создай
     `L.markerClusterGroup({ disableClusteringAtZoom: 16, showCoverageOnHover: false, maxClusterRadius: 50 })`,
     добавляй маркеры в группу, группу — на карту;
   - существующие `divIcon`-иконки, popup'ы и клик-обработчики маркеров сохрани как есть;
   - cleanup: при обновлении списка POI/размонтировании удаляй clusterGroup с карты
     (по образцу текущего cleanup-кода слоя).
3. Опционально (если легко вписывается в дизайн-систему): кастомный `iconCreateFunction`
   для кластеров с `var(--accent)` фоном. Если возиться — оставь дефолтные стили.
4. Проверь взаимодействия: клик по POI (popup/выбор), выбор POI из списка в POITab
   (если есть «показать на карте» — маркер внутри кластера должен находиться, используй
   `clusterGroup.zoomToShowLayer(marker)` при необходимости — сначала проверь, есть ли
   такой сценарий в коде).

## Чего НЕ делать

- Не кластеризовать треки/heatmap — только POI-слой.
- Не менять формат данных POI и mapStore.
- Не переписывать POILayer на другой подход (canvas и т.п.).

## Критерии приёмки

- На малом зуме POI собраны в кластеры с числом; при зуме ≥16 — индивидуальные маркеры
  с прежними иконками.
- Клик по кластеру зумит к его содержимому; клик по одиночному POI работает как раньше.
- Панорамирование/зум карты с включённым POI-слоем заметно плавнее (сравни до/после
  в DevTools Performance при ~1600 POI).
- Удаление/добавление POI обновляет кластеры без «призрачных» маркеров.

## Как проверить

```bash
docker compose exec -T frontend npm run build
docker compose exec -T frontend npm test
# вручную: включить POI-слой, позумить; проверить клики по кластеру и по одиночному POI
```

## Документация

- `architecture/ARCHITECTURE.md` § Frontend — POILayer: кластеризация
  (leaflet.markercluster, disableClusteringAtZoom: 16).
- `tasks/FUTURE.md` — удали строку про кластеризацию POI.
