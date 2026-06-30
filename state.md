# Project State

```json
{
  "phase": 1,
  "status": "done",
  "notes": "Project skeleton created: backend (FastAPI+Celery structure), frontend (React+Vite), docker-compose with postgres/postgis, redis, backend, celery_worker, frontend services. .env.example, requirements.txt, package.json all in place."
}
```

```json
{
  "phase": 2,
  "status": "done",
  "notes": "DB models, JWT auth, and all API endpoints implemented.",
  "endpoints": [
    "POST /api/auth/register",
    "POST /api/auth/login",
    "POST /api/auth/forgot-password",
    "POST /api/auth/reset-password/{token}",
    "GET  /api/tracks",
    "POST /api/tracks/upload",
    "GET  /api/tracks/{id}",
    "DELETE /api/tracks/{id}",
    "PATCH /api/tracks/{id}/publish",
    "GET  /api/tracks/public/{public_token}"
  ]
}
```

```json
{
  "phase": 3,
  "status": "done",
  "notes": "Parsers (GPX/KML/TCX/FIT/GeoJSON), normalizer (drift+outliers), Nominatim regions with Redis cache, full Celery process_track pipeline, and GET /api/tasks/{task_id}/status endpoint implemented.",
  "files": [
    "backend/app/services/parser_factory.py",
    "backend/app/services/normalizer.py",
    "backend/app/services/regions.py",
    "backend/app/tasks/process_track.py",
    "backend/app/api/tasks.py"
  ]
}
```

```json
{
  "phase": 4,
  "status": "done",
  "notes": "React frontend core complete. Design system (CSS vars, glass islands, dark mode), 3 Zustand stores (auth/app/map), axios client with auth interceptor, full API layer (auth + tracks), AuthModal (login/register/forgot-password), UploadZone (window drag-and-drop, 20MB, multi-file, polling), TrackCard with units-aware display, four island components (Top/Left/Right/Bottom), MapContainer placeholder, BrowserRouter with public track route.",
  "files": [
    "frontend/src/styles/globals.css",
    "frontend/src/store/authStore.js",
    "frontend/src/store/appStore.js",
    "frontend/src/store/mapStore.js",
    "frontend/src/api/client.js",
    "frontend/src/api/auth.js",
    "frontend/src/api/tracks.js",
    "frontend/src/components/auth/AuthModal.jsx",
    "frontend/src/components/upload/UploadZone.jsx",
    "frontend/src/components/tracks/TrackCard.jsx",
    "frontend/src/components/islands/TopIsland.jsx",
    "frontend/src/components/islands/LeftIsland.jsx",
    "frontend/src/components/islands/RightIsland.jsx",
    "frontend/src/components/islands/BottomIsland.jsx",
    "frontend/src/components/MapContainer.jsx",
    "frontend/src/App.jsx",
    "frontend/src/main.jsx"
  ]
}
```

```json
{
  "phase": 5,
  "status": "done",
  "notes": "Full Leaflet map via react-leaflet. Tile layers: OSM, OpenTopoMap, CyclOSM, Waymarked Hiking, CartoDB Light/Dark, Google Street, Google Satellite, Esri Satellite. SpeedLayer: per-segment colored polylines with smooth gradient (gray→blue→green→yellow→orange→red) from speed_segments. VisitLayer: leaflet.heat heatmap across all tracks. POILayer: Overpass API with 6 categories (Food, Amenities, Medical, Tourism, Bicycle, Transport), fetches on map move. TrackCreator: manual click-to-place mode + auto ORS routing with 5 profiles. mapStore extended: showPOI, poiCategories, showTrackCreator, trackDetailCache with lazy-loading. RightIsland: all tile layers grouped, speed/heatmap toggles, POI category checkboxes, speed legend, attribution popover. PublicTrackPage: full-page view with Leaflet mini-map, stats grid, and download link.",
  "files": [
    "frontend/src/map/MapLayers.js",
    "frontend/src/map/TrackLayer.jsx",
    "frontend/src/map/SpeedLayer.jsx",
    "frontend/src/map/VisitLayer.jsx",
    "frontend/src/map/POILayer.jsx",
    "frontend/src/map/TrackCreator.jsx",
    "frontend/src/store/mapStore.js",
    "frontend/src/components/MapContainer.jsx",
    "frontend/src/components/islands/RightIsland.jsx",
    "frontend/src/App.jsx"
  ]
}
```

```json
{
  "phase": "5-polish",
  "status": "done",
  "notes": "Post-phase-5 polish: TrackCard 2-row layout (rename/download/delete in row 2), elevation gain/loss added to DB + Celery task, rename + download endpoints, i18n via react-i18next (10 languages: en/es/de/fr/it/nl/pl/ru/uk/zh), all UI strings translated across TopIsland/LeftIsland/RightIsland/BottomIsland/TrackCard. User preferences (language/theme/unit_distance/unit_speed) stored in DB, synced on login via GET /api/auth/me, PATCH /api/auth/me. Email change endpoint with uniqueness check. Speed units: kmh/mph/ms (knots removed). Zero-flash theme via gps_theme localStorage key + inline script in index.html. BottomIsland: Speed tab fixed (speed_segments are [{from:[lat,lon], to:[lat,lon], speed_kmh}], matched by coord lookup); Slope tab computed on-the-fly (elev diff / dist * 100, clamped ±80%). Format filter buttons: All/GPX/KML/TCX/FIT/GeoJSON. Speed unit buttons: KPH/MPH/MPS. Distance buttons: KM/MI.",
  "files": [
    "backend/app/models/user.py",
    "backend/app/models/track.py",
    "backend/app/api/auth.py",
    "backend/app/api/tracks.py",
    "backend/app/tasks/process_track.py",
    "backend/alembic/versions/0002_add_elevation_columns.py",
    "backend/alembic/versions/0003_add_user_preferences.py",
    "frontend/src/i18n/index.js",
    "frontend/src/i18n/translations.js",
    "frontend/src/store/appStore.js",
    "frontend/src/api/auth.js",
    "frontend/src/api/tracks.js",
    "frontend/src/components/islands/TopIsland.jsx",
    "frontend/src/components/islands/LeftIsland.jsx",
    "frontend/src/components/islands/BottomIsland.jsx",
    "frontend/src/components/tracks/TrackCard.jsx",
    "frontend/src/App.jsx",
    "frontend/index.html"
  ]
}
```

## Next

Фаза 6 — Тесты: pytest (backend) + Playwright E2E (frontend).
