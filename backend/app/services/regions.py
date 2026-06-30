"""Reverse-geocode GPS points to human-readable region strings.

Samples three points (start, middle, end) from the track, queries Nominatim,
and returns a deduplicated list like ["Berlin, Germany", "Brandenburg, Germany"].

Results are cached in Redis for 30 days using the rounded coordinate as the key.
"""

import logging
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


def _cache_key(lat: float, lon: float) -> str:
    return f"nominatim:{round(lat, _COORD_PRECISION)}:{round(lon, _COORD_PRECISION)}"


def _redis_client() -> Optional[redis.Redis]:
    try:
        return redis.from_url(settings.REDIS_URL, decode_responses=True)
    except Exception:
        return None


async def _reverse_geocode(lat: float, lon: float, r: Optional[redis.Redis]) -> Optional[str]:
    key = _cache_key(lat, lon)
    if r:
        cached = r.get(key)
        if cached:
            return cached

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                _NOMINATIM_URL,
                params={"lat": lat, "lon": lon, "format": "json", "zoom": 10},
                headers=_HEADERS,
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.warning("Nominatim reverse geocode failed for (%.4f, %.4f): %s", lat, lon, exc)
        return None

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


def _reverse_geocode_sync(lat: float, lon: float, r: Optional[redis.Redis]) -> Optional[str]:
    """Synchronous version for use inside Celery tasks."""
    key = _cache_key(lat, lon)
    if r:
        cached = r.get(key)
        if cached:
            return cached

    try:
        with httpx.Client(timeout=10) as client:
            resp = client.get(
                _NOMINATIM_URL,
                params={"lat": lat, "lon": lon, "format": "json", "zoom": 10},
                headers=_headers(),
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.warning("Nominatim reverse geocode failed for (%.4f, %.4f): %s", lat, lon, exc)
        return None

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


def get_regions(points: list[dict]) -> list[str]:
    """Return up to 3 unique region labels for the track (start, mid, end)."""
    if not points:
        return []

    indices = {0, len(points) // 2, len(points) - 1}
    sampled = [points[i] for i in sorted(indices)]

    r = _redis_client()
    labels: list[str] = []
    seen: set[str] = set()

    for pt in sampled:
        label = _reverse_geocode_sync(pt["lat"], pt["lon"], r)
        if label and label not in seen:
            labels.append(label)
            seen.add(label)

    return labels
