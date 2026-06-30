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

```json
{
  "phase": "5-polish-2",
  "status": "done",
  "notes": "Additional fixes after phase 5-polish commit: (1) 'Find in this area' button moved from LeftIsland bottom to center-top below TopIsland; TopIsland no longer self-positions, wrapper in App.jsx holds fixed position with ref; ResizeObserver tracks TopIsland height and dynamically offsets button so it never overlaps the expanded settings panel. (2) Duplicate Settings gear icon removed from TopIsland header button.",
  "files": [
    "frontend/src/App.jsx",
    "frontend/src/components/islands/TopIsland.jsx",
    "frontend/src/components/islands/LeftIsland.jsx"
  ]
}
```

```json
{
  "phase": 6,
  "status": "done",
  "results": {
    "backend_pytest": "107/107 passed",
    "frontend_playwright": "33/33 passed",
    "suites": ["test_auth.py", "test_tracks.py", "test_parser.py", "test_security.py", "auth.spec.ts", "upload.spec.ts", "map.spec.ts", "sidebar.spec.ts"]
  },
  "bugs_fixed": [
    "HTTPBearer auto_error=True → 403 instead of 401 on missing auth header; fixed with auto_error=False + explicit 401 raise",
    "SQLite in-memory without StaticPool: each connection sees a different empty DB (no tables); fixed by poolclass=StaticPool",
    "app.main import triggers Base.metadata.create_all → connects to PostgreSQL during test collection; patched with unittest.mock.patch.object",
    "MagicMock track tests: get_current_user uses db.get() not db.query(), so mock chain must use separate .get.return_value for user vs .query().filter().first() for track",
    "Vite 5.x allowedHosts: requests with Host: frontend:5173 blocked by DNS rebinding protection; fixed allowedHosts: ['localhost', 'frontend'] in vite.config.js",
    "axios baseURL='http://localhost:8000': inside Playwright Docker container, localhost:8000 is the container itself; fixed with baseURL='' (empty string) so all /api/* calls go through Vite proxy → backend:8000",
    "401 interceptor redirect on login failures: any 401 triggered window.location.href='/' including wrong-password responses, preventing error toast from appearing; fixed to redirect only when localStorage has an existing token (expired session case)",
    "localStorage SecurityError: page.evaluate() called on about:blank before page.goto(); fixed in clearAuth() and registerAndInjectToken() helpers by checking page.url().startsWith('http') first",
    "Leaflet zoomControl={false}: test looked for .leaflet-control-zoom which doesn't exist; fixed to check custom RightIsland buttons by title attribute",
    "Format filter chips hidden by default: LeftIsland filterOpen=false on mount, chips inside collapsed panel; fixed tests to click button[title='Filters'] first"
  ],
  "docker": {
    "playwright_service": "docker-compose run --rm playwright npx playwright test",
    "dockerfile": "frontend/Dockerfile.playwright (mcr.microsoft.com/playwright:v1.61.1-noble)"
  },
  "files": [
    "backend/pytest.ini",
    "backend/requirements-test.txt",
    "backend/tests/__init__.py",
    "backend/tests/conftest.py",
    "backend/tests/test_auth.py",
    "backend/tests/test_parser.py",
    "backend/tests/test_tracks.py",
    "backend/tests/test_security.py",
    "frontend/playwright.config.ts",
    "frontend/tests/helpers.ts",
    "frontend/tests/auth.spec.ts",
    "frontend/tests/upload.spec.ts",
    "frontend/tests/map.spec.ts",
    "frontend/tests/sidebar.spec.ts",
    "frontend/Dockerfile.playwright"
  ],
  "run_backend": "cd backend && pip install -r requirements-test.txt && pytest tests/ -v",
  "run_frontend_docker": "docker-compose run --rm playwright npx playwright test"
}
```

## Next

Фаза 7 — GitHub: коммиты и git push. ✅ (выполнено)
