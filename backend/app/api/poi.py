"""API endpoints for user-uploaded POI."""

from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.poi import POI
from app.models.user import User
from app.services.poi_parser import POIParser

router = APIRouter(prefix="/api/poi", tags=["poi"])

MAX_FILE_BYTES = 5 * 1024 * 1024  # 5 MB


class POIResponse(BaseModel):
    id: int
    name: str
    lat: float
    lon: float
    category: str
    description: str

    model_config = {"from_attributes": True}


class CategoryStats(BaseModel):
    name: str
    count: int


class UploadResponse(BaseModel):
    imported: int
    categories: List[CategoryStats]


@router.post("/upload", response_model=UploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_poi(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload KML or KMZ file with POI."""

    # Read file
    content = await file.read()
    if len(content) > MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 5 MB limit")

    # Parse
    poi_list, error = POIParser.parse(content)
    if error:
        raise HTTPException(status_code=400, detail=f"Parse error: {error}")

    if not poi_list:
        raise HTTPException(status_code=400, detail="No POI found in file")

    # Save to DB
    for poi_data in poi_list:
        poi = POI(
            user_id=current_user.id,
            name=poi_data['name'],
            lat=poi_data['lat'],
            lon=poi_data['lon'],
            category=poi_data['category'],
            description=poi_data['description'],
            source=poi_data['source'],
        )
        db.add(poi)

    db.commit()

    # Return stats
    categories_query = db.query(POI.category, func.count(POI.id)).filter(POI.user_id == current_user.id).group_by(POI.category).all()

    return UploadResponse(
        imported=len(poi_list),
        categories=[CategoryStats(name=c[0], count=c[1]) for c in categories_query]
    )


@router.get("", response_model=List[POIResponse])
def list_poi(
    category: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get user's POI, optionally filtered by category."""
    q = db.query(POI).filter(POI.user_id == current_user.id)

    if category:
        q = q.filter(POI.category == category)

    return q.all()


@router.get("/categories", response_model=List[CategoryStats])
def get_categories(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get unique POI categories for current user with counts."""
    categories = db.query(POI.category, func.count(POI.id)).filter(POI.user_id == current_user.id).group_by(POI.category).all()

    return [CategoryStats(name=c[0], count=c[1]) for c in categories]


@router.delete("/{poi_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_poi(
    poi_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete single POI."""
    poi = db.query(POI).filter(POI.id == poi_id, POI.user_id == current_user.id).first()
    if not poi:
        raise HTTPException(status_code=404, detail="POI not found")

    db.delete(poi)
    db.commit()
