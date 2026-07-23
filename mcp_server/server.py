"""MCP server exposing gps-heatmap POI/track management to AI clients.

Thin wrapper around the existing FastAPI backend's HTTP API — no direct
database access, so all validation/business logic stays in one place.
"""

import os
from pathlib import Path
from typing import Optional

import httpx
from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP

load_dotenv()

API_URL = os.environ.get("GPS_HEATMAP_API_URL", "http://localhost:8000")
TOKEN = os.environ.get("GPS_HEATMAP_TOKEN")

if not TOKEN:
    raise RuntimeError(
        "GPS_HEATMAP_TOKEN is not set. Copy .env.example to .env and fill in a JWT "
        "obtained via POST /api/auth/login."
    )

client = httpx.Client(
    base_url=API_URL,
    headers={"Authorization": f"Bearer {TOKEN}"},
    timeout=30.0,
)

mcp = FastMCP("gps-heatmap")


def _raise_for_status(resp: httpx.Response) -> None:
    if resp.status_code >= 400:
        try:
            detail = resp.json().get("detail", resp.text)
        except Exception:
            detail = resp.text
        raise RuntimeError(f"API error {resp.status_code}: {detail}")


# ── POI ──────────────────────────────────────────────────────────────────────

@mcp.tool()
def list_poi(category: Optional[str] = None, search: Optional[str] = None, limit: int = 200) -> list[dict]:
    """List the user's POI (points of interest), optionally filtered by category or name search."""
    params = {"limit": limit}
    if category:
        params["category"] = category
    if search:
        params["search"] = search
    resp = client.get("/api/poi", params=params)
    _raise_for_status(resp)
    return resp.json()["items"]


@mcp.tool()
def get_poi_categories() -> list[dict]:
    """Get the user's POI categories with counts."""
    resp = client.get("/api/poi/categories")
    _raise_for_status(resp)
    return resp.json()


@mcp.tool()
def create_poi(
    name: str,
    lat: float,
    lon: float,
    category: str,
    description: Optional[str] = None,
    icon: Optional[str] = None,
    color: Optional[str] = None,
    visited: bool = False,
) -> dict:
    """Create a new POI. icon must be one of the app's fixed icon slugs (see list_poi
    output for examples already in use); color must be a hex value like #RRGGBB."""
    resp = client.post(
        "/api/poi/create",
        json={
            "name": name,
            "lat": lat,
            "lon": lon,
            "category": category,
            "description": description,
            "icon": icon,
            "color": color,
            "visited": visited,
        },
    )
    _raise_for_status(resp)
    return resp.json()


@mcp.tool()
def update_poi(
    poi_id: int,
    name: Optional[str] = None,
    category: Optional[str] = None,
    description: Optional[str] = None,
    icon: Optional[str] = None,
    color: Optional[str] = None,
    visited: Optional[bool] = None,
) -> dict:
    """Update fields on an existing POI. Only provided fields are changed."""
    body = {
        k: v for k, v in {
            "name": name,
            "category": category,
            "description": description,
            "icon": icon,
            "color": color,
            "visited": visited,
        }.items() if v is not None
    }
    resp = client.patch(f"/api/poi/{poi_id}", json=body)
    _raise_for_status(resp)
    return resp.json()


@mcp.tool()
def delete_poi(poi_id: int) -> str:
    """Delete a POI by id."""
    resp = client.delete(f"/api/poi/{poi_id}")
    _raise_for_status(resp)
    return f"POI {poi_id} deleted"


# ── Tracks ───────────────────────────────────────────────────────────────────

@mcp.tool()
def list_tracks(search: Optional[str] = None, sort: Optional[str] = None, limit: int = 50) -> list[dict]:
    """List the user's tracks. sort: newest|oldest|longest|shortest|fastest|slowest."""
    params = {"limit": limit}
    if search:
        params["search"] = search
    if sort:
        params["sort"] = sort
    resp = client.get("/api/tracks", params=params)
    _raise_for_status(resp)
    return resp.json()["items"]


@mcp.tool()
def get_track(track_id: int) -> dict:
    """Get full details/statistics for a single track (distance, elevation, speed, etc)."""
    resp = client.get(f"/api/tracks/{track_id}")
    _raise_for_status(resp)
    return resp.json()


@mcp.tool()
def upload_track(file_path: str) -> dict:
    """Upload a GPS track file (GPX/KML/TCX/FIT/GeoJSON). file_path must point to a
    file under /data (the host's mcp_server/data/ directory, mounted into this
    container) — place the file there first. Processing happens asynchronously in
    the backend; poll get_track with the returned id to check when statistics are
    available."""
    path = Path(file_path).expanduser()
    if not path.is_file():
        raise RuntimeError(f"File not found: {path}")
    with path.open("rb") as f:
        resp = client.post("/api/tracks/upload", files={"file": (path.name, f)})
    _raise_for_status(resp)
    return resp.json()


@mcp.tool()
def rename_track(track_id: int, name: str) -> dict:
    """Rename a track."""
    resp = client.patch(f"/api/tracks/{track_id}/rename", json={"name": name})
    _raise_for_status(resp)
    return resp.json()


@mcp.tool()
def delete_track(track_id: int) -> str:
    """Delete a track by id."""
    resp = client.delete(f"/api/tracks/{track_id}")
    _raise_for_status(resp)
    return f"Track {track_id} deleted"


@mcp.tool()
def export_track(track_id: int, output_path: str, poi_radius_m: Optional[float] = None) -> str:
    """Download a track file. output_path must be under /data (the host's
    mcp_server/data/ directory, mounted into this container) — that's where the
    saved file will actually show up on disk. If poi_radius_m is set, the user's
    own POIs within that many meters of the track's route are embedded as
    waypoints (name preserved) — useful for OsmAnd navigation exports."""
    params = {}
    if poi_radius_m:
        params["poi_radius_m"] = poi_radius_m
    resp = client.get(f"/api/tracks/{track_id}/download", params=params)
    _raise_for_status(resp)

    out_path = Path(output_path).expanduser()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(resp.content)
    return f"Saved to {out_path} ({len(resp.content)} bytes)"


if __name__ == "__main__":
    mcp.run(transport="stdio")
