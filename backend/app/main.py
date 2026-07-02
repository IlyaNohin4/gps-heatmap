from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth, poi, tasks, tracks
from app.core.database import Base, engine

Base.metadata.create_all(bind=engine)

app = FastAPI(title="GPS Heatmap API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security headers
_DOCS_PATHS = {"/docs", "/redoc", "/openapi.json"}

_CSP_STRICT = (
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: https://*.tile.openstreetmap.org https://*.tile.opentopomap.org "
    "https://*.tile-cyclosm.openstreetmap.fr https://tile.waymarkedtrails.org "
    "https://server.arcgisonline.com https://*.googleapis.com https://*.gstatic.com; "
    "connect-src 'self' https://nominatim.openstreetmap.org https://api.openrouteservice.org "
    "https://overpass-api.de"
)

# Swagger UI loads JS/CSS from jsdelivr and fonts from unpkg
_CSP_DOCS = (
    "default-src 'self'; "
    "script-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; "
    "style-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; "
    "img-src 'self' data: https://fastapi.tiangolo.com; "
    "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net; "
    "connect-src 'self'"
)


@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    is_docs = request.url.path in _DOCS_PATHS or request.url.path.startswith("/docs/")
    response.headers["Content-Security-Policy"] = _CSP_DOCS if is_docs else _CSP_STRICT
    return response


app.include_router(auth.router)
app.include_router(tracks.router)
app.include_router(tasks.router)
app.include_router(poi.router)


@app.get("/health")
def health():
    return {"status": "ok"}
