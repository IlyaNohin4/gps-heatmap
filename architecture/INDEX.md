# Architecture Navigation

Quick reference for which file to read for different tasks.

---

## 📌 By Task Type

| Task | File | Key Sections |
|------|------|-------------|
| **Add API endpoint** | ARCHITECTURE.md | § API Endpoints, § Database Models |
| **Modify parser or normalization** | PARSER.md | entire file (6 phases) |
| **Change frontend UI / islands** | ARCHITECTURE.md | § Frontend — Islands Layout, § Design System |
| **Add background task (Celery)** | ARCHITECTURE.md | § Celery & Background Processing |
| **Modify database schema** | ARCHITECTURE.md | § Database Models, then alembic/ |
| **Fix known bug** | POLISH.md | § Known Issues / Critical Tasks |
| **Understand project stack** | ../CLAUDE.md | § Project Overview |
| **Development setup / commands** | ../CLAUDE.md | § Common Development Commands |

---

## 📂 File Descriptions

### ARCHITECTURE.md (588 lines)
Single source of truth for all architecture decisions.
- Stack overview
- Database models (User, Track, PasswordReset)
- API endpoints (Auth, Tracks, Tasks, POI)
- Frontend islands layout (TopIsland, LeftIsland, RightIsland, BottomIsland, SpeedLegend)
- Design system (CSS variables, components)
- File upload & processing pipeline
- Celery & background tasks
- Development workflow (hot reload)
- Visualization modes
- Authorization & sessions
- Testing approach

### PARSER.md (687 lines)
Specialized file for GPS parsing and normalization.
- Supported file formats (GPX, KML, TCX, FIT, GeoJSON)
- Parser implementation details
- 6-phase normalization pipeline (drift collapse, outlier removal, Kalman, elevation smoothing, grade calculation, simplification)
- Speed segment calculation
- Grade classification
- Algorithm parameters and rationale
- Real-world validation examples

### NORMALIZATION_COMPLETE.md
Status of the 6-phase normalization pipeline (all phases complete, all tests passing).

### INDEX_LEGACY.md
Archived copy of old INDEX.md (not used, kept for history).

---

## 🔄 After Making Architecture Changes

**IMPORTANT:** Always update architecture files after accepting a decision.

| Decision | Update This |
|----------|------------|
| New API endpoint | ARCHITECTURE.md § API Endpoints table |
| New parser feature | PARSER.md (appropriate section) |
| New UI component | ARCHITECTURE.md § Frontend sections |
| New Celery task | ARCHITECTURE.md § Celery & Background Processing |
| New database table | ARCHITECTURE.md § Database Models |
| Bug found | ../POLISH.md § Known Issues |
| Task completed | ../POLISH.md § Resolved Tasks |

---

## 📖 Reading Order for Common Scenarios

### I'm joining and need to understand the project
1. ../CLAUDE.md § Project Overview (2 min)
2. ARCHITECTURE.md (first 100 lines for stack, 10 min)
3. ARCHITECTURE.md § Frontend (understand UI, 5 min)
4. ARCHITECTURE.md § Celery & Background (understand flow, 5 min)

### I need to add a new API endpoint
1. ARCHITECTURE.md § API Endpoints (see pattern)
2. ../CLAUDE.md § API Overview (quick reference)
3. ../backend/app/api/ (examine similar endpoint)
4. Write code, then update ARCHITECTURE.md

### I need to fix a bug in track processing
1. ../POLISH.md (check if known issue)
2. PARSER.md (understand normalization pipeline)
3. NORMALIZATION_COMPLETE.md (check phase status)
4. ../backend/app/services/normalizer.py (examine code)

### I need to change the UI
1. ARCHITECTURE.md § Frontend — Islands Layout (find the island)
2. ARCHITECTURE.md § Design System (CSS variables)
3. ../frontend/src/components/ (find component)
4. Write code, then update ARCHITECTURE.md

---

## 🔗 Key Files

**Backend:**
- Main app: ../backend/app/main.py
- Auth API: ../backend/app/api/auth.py
- Tracks API: ../backend/app/api/tracks.py
- Parser: ../backend/app/services/parser.py
- Normalizer: ../backend/app/services/normalizer.py
- Celery task: ../backend/app/tasks/process_track.py

**Frontend:**
- Main app: ../frontend/src/App.jsx
- appStore: ../frontend/src/store/appStore.js
- authStore: ../frontend/src/store/authStore.js
- i18n: ../frontend/src/i18n/translations.js

**Config:**
- Docker Compose: ../docker-compose.yml
- Alembic migrations: ../backend/alembic/versions/
- Development rules: ../CLAUDE.md
