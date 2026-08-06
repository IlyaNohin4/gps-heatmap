"""Per-user Redis cache for GET /api/tracks/geometries, /road-usage and
/speed-usage.

All three endpoints deserialize every one of a user's tracks'
normalized_points JSON on every call (road-usage/speed-usage then also
rebuild the whole segment graph) — with no cache, two page-refresh-driven
parallel requests on a VDS with only 2 backend workers can tie both of them
up at once. The data only ever changes when a track finishes processing or
is deleted, so it's cached until explicitly invalidated at those two
points, not on a blanket short TTL — GEOMETRY_CACHE_TTL is a safety net in
case an invalidation call site is ever missed, not the primary mechanism.

Lives in app.core (not app.api.tracks) so app.tasks.process_track — which
needs to invalidate on completion — doesn't have to import the API router
module (tracks.py imports process_track, so the reverse would be circular).
"""

from app.core.redis_client import redis_client

GEOMETRY_CACHE_TTL = 3600


def geometry_cache_key(user_id: int) -> str:
    return f"geometries_cache:{user_id}"


def road_usage_cache_key(user_id: int) -> str:
    return f"road_usage_cache:{user_id}"


def speed_usage_cache_key(user_id: int) -> str:
    return f"speed_usage_cache:{user_id}"


def invalidate_geometry_cache(user_id: int) -> None:
    """Called wherever a user's tracks' normalized_points can change:
    process_track finishing (success or error) and track deletion."""
    redis_client.delete(
        geometry_cache_key(user_id),
        road_usage_cache_key(user_id),
        speed_usage_cache_key(user_id),
    )
