# GPS Heatmap

Web application for visualizing GPS tracks with heatmap and speed overlays.

## Stack

- **Backend:** FastAPI + PostgreSQL + PostGIS + Redis + Celery
- **Frontend:** React + Vite + Leaflet
- **Auth:** JWT (30 days)
- **Email:** Resend
- **Routing:** OpenRouteService

## Quick Start

```bash
cp .env.example .env
# Fill in your secrets in .env
docker compose up --build
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API docs: http://localhost:8000/docs

## Supported Track Formats

GPX, KML, TCX, FIT, GeoJSON
