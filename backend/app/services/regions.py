"""Reverse-geocode GPS points to human-readable region strings.

Samples three points (start, middle, end) from the track, queries Nominatim,
and returns a deduplicated list like ["Berlin, Germany", "Brandenburg, Germany"].

Results are cached in Redis for 30 days using the rounded coordinate as the key.
"""

import logging
import time
from typing import Optional

import httpx
import redis

from app.core.config import settings

logger = logging.getLogger(__name__)

_CACHE_TTL = 30 * 24 * 3600  # 30 days in seconds
_NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse"
_COORD_PRECISION = 2  # round to ~1 km grid for cache key


def _headers() -> dict:
    return {"User-Agent": settings.NOMINATIM_USER_AGENT}


def _cache_key(lat: float, lon: float, language: str) -> str:
    # language is part of the key — Nominatim's response text differs per
    # accept-language, so a cache hit for one language must never leak into
    # a request for another (would otherwise "stick" to whichever language
    # happened to populate the cache first, for the full 30-day TTL).
    return f"nominatim:{language}:{round(lat, _COORD_PRECISION)}:{round(lon, _COORD_PRECISION)}"


def _redis_client() -> Optional[redis.Redis]:
    try:
        return redis.from_url(settings.REDIS_URL, decode_responses=True)
    except Exception:
        return None


def _reverse_geocode_sync(lat: float, lon: float, r: Optional[redis.Redis], language: str) -> Optional[str]:
    """Synchronous version for use inside Celery tasks."""
    key = _cache_key(lat, lon, language)
    if r:
        cached = r.get(key)
        if cached:
            return cached

    try:
        with httpx.Client(timeout=10) as client:
            resp = client.get(
                _NOMINATIM_URL,
                params={"lat": lat, "lon": lon, "format": "json", "zoom": 10, "accept-language": language},
                headers=_headers(),
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.warning("Nominatim reverse geocode failed for (%.4f, %.4f): %s", lat, lon, exc)
        return None
    finally:
        # Nominatim's usage policy caps anonymous usage at 1 req/sec; get_regions
        # fires up to 3 of these back-to-back inside the global track-processing
        # lock, so only a real network call (not a cache hit) needs to pace itself.
        time.sleep(1)

    addr = data.get("address", {})
    parts = [
        addr.get("city") or addr.get("town") or addr.get("village") or addr.get("county"),
        addr.get("state") or addr.get("region"),
        addr.get("country"),
    ]
    label = ", ".join(p for p in parts if p) or data.get("display_name", "")
    if not label:
        return None

    if r:
        r.setex(key, _CACHE_TTL, label)

    return label


def get_regions(points: list[dict], language: str = "en") -> list[str]:
    """Return up to 3 unique region labels for the track (start, mid, end).

    language: the owning user's UI language (VALID_LANGUAGES in auth.py) —
    passed to Nominatim's accept-language so region names come back in the
    language the user actually reads, not whatever the geocoder defaults
    to. Only affects tracks processed after this was added; existing
    tracks keep whatever language their regions were first geocoded in
    until reprocessed.
    """
    if not points:
        return []

    indices = {0, len(points) // 2, len(points) - 1}
    sampled = [points[i] for i in sorted(indices)]

    r = _redis_client()
    labels: list[str] = []
    seen: set[str] = set()

    for pt in sampled:
        label = _reverse_geocode_sync(pt["lat"], pt["lon"], r, language)
        if label and label not in seen:
            labels.append(label)
            seen.add(label)

    return labels
