# CLAUDE.md

Guidance for Claude Code working with this repository.

---

## 🚀 Quick Start

```bash
cp .env.example .env        # Fill in secrets
docker compose up --build   # Start all services

# Frontend: http://localhost:5173
# Backend API: http://localhost:8000
# Swagger docs: http://localhost:8000/docs
```

---

## 🛠️ Common Commands

### Frontend (never run npm locally!)
```bash
docker compose exec -T frontend npm install
docker compose exec -T frontend npm run dev       # Already running with HMR
docker compose exec -T frontend npm run build     # Verify production
docker compose exec -T frontend npm test          # Playwright E2E
```

### CI
GitHub Actions (`.github/workflows/ci.yml`) runs backend pytest + frontend build on every push to `main` and on every PR.

### Backend
```bash
docker compose exec backend python -m pytest      # Run all 132 tests
docker compose exec backend python -m pytest tests/test_parser.py -v

# Database
docker compose exec postgres psql -U user -d gps_heatmap
docker compose exec backend alembic upgrade head
```

### Celery & Redis
```bash
docker compose logs celery_worker     # Check processing
docker compose exec redis redis-cli   # Redis CLI
```

---

## 🏗️ Project Stack

| Component | Tech |
|-----------|------|
| Backend | FastAPI + PostgreSQL (PostGIS) + Redis + Celery |
| Frontend | React 18 + Vite + Leaflet + Zustand |
| Auth | JWT (30 days, HS256) |
| Formats | GPX, KML, TCX, FIT, GeoJSON |
| i18n | 5 languages (en, es, de, ru, uk) |

---

## 📚 Read Architecture Before Coding

| Task | Read |
|------|------|
| Add API endpoint | `architecture/ARCHITECTURE.md` § API Endpoints |
| Fix parser/normalization | `architecture/PARSER.md` (entire file) |
| Change UI/islands | `architecture/ARCHITECTURE.md` § Frontend |
| Add background task | `architecture/ARCHITECTURE.md` § Celery |
| Find known issues | `POLISH.md` |
| Need navigation? | `architecture/INDEX.md` |

**Detail lookup:** see `architecture/ARCHITECTURE.md` for Database Models, Frontend Islands, Design System, API endpoints, etc.

---

## 📋 Development Rules

### ⚠️ Never (Strict Constraints)
- ❌ Never modify code without user confirmation — describe plan first, wait OK
- ❌ Never commit without confirmation — ask "Ready to commit [files]. OK?"
- ❌ Never push without explicit request — only if user says "push" or "commit and push"
- ❌ Never output secrets to chat — never print .env, API keys, passwords
- ❌ Never commit service files — exclude .claude/, .env, node_modules, __pycache__

### ✅ Always
- Always read architecture before coding
- Always describe your plan: "I will change X (lines Y-Z): [what and why]"
- Always wait for confirmation before starting
- Always update architecture files after decisions:
  - New API → `ARCHITECTURE.md` § API Endpoints
  - New feature → relevant architecture section
  - Bug found → `POLISH.md`

### Workflow
```
Task → Read architecture → Propose plan → Wait OK
  ↓
Code → Propose commit → Wait OK → Create commit
  ↓
Only push if user says "push" or "commit and push"
```

---

## 💾 Key Facts

- **Databases:** PostgreSQL + PostGIS (spatial queries), Redis (caching, Celery broker)
- **Speed in DB:** always km/h, elevation: always meters
- **Track processing:** sequential (Redis lock), 6 phases (drift collapse, outlier removal, Kalman, elevation smoothing, grade classification, simplification)
- **Frontend state:** `appStore` (Zustand, not persisted), `authStore` (persisted to localStorage)
- **Speed segments format:** `[{from:[lat,lon], to:[lat,lon], speed_kmh}]` — NOT by index
- **Testing:** 132 backend tests (pytest), E2E tests (Playwright)
- **Production:** not ready yet (see IMPROVEMENTS.md)

---

## 📖 For More Info

- **Full architecture details:** `architecture/ARCHITECTURE.md` (588 lines)
- **GPS parsing details:** `architecture/PARSER.md` (687 lines, 6 phases)
- **Navigation & quick ref:** `architecture/INDEX.md` (40 lines)
- **Known issues & TODOs:** `POLISH.md` (65 lines)
- **Project improvements:** `IMPROVEMENTS.md` (9 recommendations, MVP roadmap)
- **About this refactor:** `DOCUMENTATION_REFACTOR.md`
