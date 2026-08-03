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

The dev stack (`docker-compose.yml`) publishes Postgres (5432) and Redis
(6379) on the host for local debugging — production does not (see below).

## Supported Track Formats

GPX, KML, TCX, FIT, GeoJSON

## MCP Server

`mcp_server/` exposes the app's track/POI API as MCP tools (e.g. for driving
uploads or POI creation from an LLM client). Not started by the default
`docker compose up` — run with the `mcp` profile:

```bash
docker compose --profile mcp up mcp_server --build
```

See `mcp_server/README.md` for the available tools and required
`mcp_server/.env` config.

## Production Deployment

`docker-compose.prod.yml` + `deploy/nginx.conf` (multi-stage builds,
non-root containers, nginx security headers, no exposed Postgres/Redis
ports). See `deploy/README.md` for the deploy steps and DB backup setup.

## E2E Tests

Playwright specs live in `frontend/tests/`. Run them via the dedicated
`playwright` service/profile (built from `frontend/Dockerfile.playwright`,
which already has browsers baked in — installing them into the regular
`frontend` container is a dead end, since that container gets rebuilt from
scratch on every `docker compose up --build` and loses them):

```bash
docker compose --profile test run --rm playwright
```
