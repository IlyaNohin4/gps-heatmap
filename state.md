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

## Next

Фаза 4 — Frontend Core: React app, design system, auth, islands layout.
