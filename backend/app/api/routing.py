import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, field_validator

from app.core.config import settings
from app.core.deps import get_current_user
from app.core.limiter import limiter
from app.models.user import User

router = APIRouter(prefix="/api/routing", tags=["routing"])

ORS_PROFILES = {"foot-walking", "cycling-regular", "foot-hiking", "driving-car", "driving-hgv"}


class DirectionsRequest(BaseModel):
    profile: str
    coordinates: list[list[float]]

    @field_validator("profile")
    @classmethod
    def profile_must_be_known(cls, v):
        if v not in ORS_PROFILES:
            raise ValueError(f"Unknown profile: {v}")
        return v

    @field_validator("coordinates")
    @classmethod
    def coordinates_must_be_valid(cls, v):
        if len(v) < 2:
            raise ValueError("At least 2 coordinates required")
        for pair in v:
            if len(pair) != 2:
                raise ValueError("Each coordinate must be [lng, lat]")
        return v


@router.post("/directions")
@limiter.limit("30/minute")
async def get_directions(
    request: Request,
    body: DirectionsRequest,
    current_user: User = Depends(get_current_user),
):
    # VITE_ORS_API_KEY used to be bundled into the public frontend JS — this
    # proxy keeps the ORS key server-side only.
    if not settings.ORS_API_KEY:
        raise HTTPException(status_code=503, detail="Routing is not configured")

    url = f"https://api.openrouteservice.org/v2/directions/{body.profile}/geojson"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                url,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {settings.ORS_API_KEY}",
                },
                json={"coordinates": body.coordinates},
            )
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="Routing service unavailable")

    if not resp.is_success:
        detail = "Routing service error"
        try:
            detail = resp.json().get("error", {}).get("message", detail)
        except Exception:
            pass
        raise HTTPException(status_code=502, detail=detail)

    return resp.json()
