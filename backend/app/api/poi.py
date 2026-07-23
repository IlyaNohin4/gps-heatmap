"""API endpoints for user-uploaded POI."""

from typing import List, Optional
from pathlib import Path
import io

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session
import xml.etree.ElementTree as ET

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.http_utils import safe_content_disposition
from app.models.poi import POI
from app.models.user import User
from app.services.poi_parser import POIParser, ICON_SLUGS, HEX_COLOR_RE

router = APIRouter(prefix="/api/poi", tags=["poi"])

MAX_FILE_BYTES = 5 * 1024 * 1024  # 5 MB


def _validate_icon(icon: Optional[str]) -> None:
    if icon is not None and icon not in ICON_SLUGS:
        raise HTTPException(status_code=400, detail=f"Invalid icon: {icon}")


def _validate_color(color: Optional[str]) -> None:
    if color is not None and not HEX_COLOR_RE.match(color):
        raise HTTPException(status_code=400, detail="color must be a hex value like #RRGGBB")


class POIResponse(BaseModel):
    id: int
    name: str
    lat: float
    lon: float
    category: str
    description: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    import_name: Optional[str] = None

    model_config = {"from_attributes": True}


class POIListResponse(BaseModel):
    items: List[POIResponse]
    total: int
    has_more: bool


class CategoryStats(BaseModel):
    name: str
    count: int


class UploadResponse(BaseModel):
    imported: int
    categories: List[CategoryStats]


class ImportInfo(BaseModel):
    name: str
    count: int


class RenameImportRequest(BaseModel):
    new_name: str


class CreatePOIRequest(BaseModel):
    name: str = Field(..., max_length=255)
    lat: float
    lon: float
    category: str = Field(..., max_length=255)
    description: Optional[str] = Field(None, max_length=2000)
    icon: Optional[str] = Field(None, max_length=50)
    color: Optional[str] = Field(None, max_length=20)


class UpdatePOIRequest(BaseModel):
    name: Optional[str] = Field(None, max_length=255)
    category: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = Field(None, max_length=2000)
    icon: Optional[str] = Field(None, max_length=50)
    color: Optional[str] = Field(None, max_length=20)


@router.post("/create", response_model=POIResponse, status_code=status.HTTP_201_CREATED)
async def create_poi(
    request: CreatePOIRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a single POI point on the map."""

    # Validate coordinates
    if not (-90 <= request.lat <= 90):
        raise HTTPException(status_code=400, detail="Latitude must be between -90 and 90")
    if not (-180 <= request.lon <= 180):
        raise HTTPException(status_code=400, detail="Longitude must be between -180 and 180")

    _validate_icon(request.icon)
    _validate_color(request.color)

    # Create POI
    poi = POI(
        user_id=current_user.id,
        name=request.name,
        lat=request.lat,
        lon=request.lon,
        category=request.category,
        description=request.description,
        icon=request.icon,
        color=request.color,
    )
    db.add(poi)
    db.commit()
    db.refresh(poi)

    return poi


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

    # Extract import name from filename (remove extension)
    import_name = Path(file.filename).stem

    # Save to DB
    for poi_data in poi_list:
        poi = POI(
            user_id=current_user.id,
            name=poi_data['name'],
            lat=poi_data['lat'],
            lon=poi_data['lon'],
            category=poi_data['category'],
            description=poi_data['description'],
            icon=poi_data.get('icon'),
            color=poi_data.get('color'),
            source=poi_data['source'],
            import_name=import_name,
        )
        db.add(poi)

    db.commit()

    # Return stats
    categories_query = db.query(POI.category, func.count(POI.id)).filter(POI.user_id == current_user.id).group_by(POI.category).all()

    return UploadResponse(
        imported=len(poi_list),
        categories=[CategoryStats(name=c[0], count=c[1]) for c in categories_query]
    )


@router.get("", response_model=POIListResponse)
def list_poi(
    category: str = None,
    search: Optional[str] = Query(None, max_length=200),
    limit: int = Query(50, ge=1, le=5000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get user's POI, optionally filtered by category and/or search, paginated."""
    q = db.query(POI).filter(POI.user_id == current_user.id)

    if category:
        q = q.filter(POI.category == category)

    if search:
        q = q.filter(POI.name.ilike(f"%{search}%"))

    total = q.count()
    items = q.order_by(POI.name.asc()).offset(offset).limit(limit).all()
    has_more = offset + limit < total

    return POIListResponse(items=items, total=total, has_more=has_more)


@router.get("/categories", response_model=List[CategoryStats])
def get_categories(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get unique POI categories for current user with counts."""
    categories = db.query(POI.category, func.count(POI.id)).filter(POI.user_id == current_user.id).group_by(POI.category).all()

    return [CategoryStats(name=c[0], count=c[1]) for c in categories]


@router.patch("/{poi_id}", response_model=POIResponse)
def update_poi(
    poi_id: int,
    request: UpdatePOIRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a POI."""
    poi = db.query(POI).filter(POI.id == poi_id, POI.user_id == current_user.id).first()
    if not poi:
        raise HTTPException(status_code=404, detail="POI not found")

    _validate_icon(request.icon)
    _validate_color(request.color)

    if request.name is not None:
        poi.name = request.name
    if request.category is not None:
        poi.category = request.category
    if request.description is not None:
        poi.description = request.description
    # icon/color are nullable-by-design (null = "auto by category"), so a
    # client must be able to explicitly reset them to null. Distinguish
    # "field omitted" from "field sent as null" via model_fields_set.
    if 'icon' in request.model_fields_set:
        poi.icon = request.icon
    if 'color' in request.model_fields_set:
        poi.color = request.color

    db.commit()
    db.refresh(poi)
    return poi


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


@router.get("/imports", response_model=List[ImportInfo])
def get_imports(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get list of imports with POI counts."""
    imports = db.query(POI.import_name, func.count(POI.id)).filter(
        POI.user_id == current_user.id
    ).group_by(POI.import_name).all()

    return [ImportInfo(name=imp[0], count=imp[1]) for imp in imports if imp[0]]


@router.patch("/imports/{import_name}", status_code=status.HTTP_200_OK)
def rename_import(
    import_name: str,
    request: RenameImportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Rename an import."""
    count = db.query(POI).filter(
        POI.user_id == current_user.id,
        POI.import_name == import_name
    ).update({POI.import_name: request.new_name})

    if count == 0:
        raise HTTPException(status_code=404, detail="Import not found")

    db.commit()

    return {"status": "ok"}


@router.delete("/imports/{import_name}", status_code=status.HTTP_204_NO_CONTENT)
def delete_import(
    import_name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete import and all its POI."""
    count = db.query(POI).filter(
        POI.user_id == current_user.id,
        POI.import_name == import_name
    ).delete()

    if count == 0:
        raise HTTPException(status_code=404, detail="Import not found")

    db.commit()


@router.get("/imports/{import_name}/export")
def export_import(
    import_name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export import as KML file."""
    pois = db.query(POI).filter(
        POI.user_id == current_user.id,
        POI.import_name == import_name
    ).all()

    if not pois:
        raise HTTPException(status_code=404, detail="Import not found")

    # Generate KML
    kml = ET.Element("kml", xmlns="http://www.opengis.net/kml/2.2")
    document = ET.SubElement(kml, "Document")
    ET.SubElement(document, "name").text = import_name

    for poi in pois:
        placemark = ET.SubElement(document, "Placemark")
        ET.SubElement(placemark, "name").text = poi.name
        ET.SubElement(placemark, "description").text = poi.description or ""

        point = ET.SubElement(placemark, "Point")
        ET.SubElement(point, "coordinates").text = f"{poi.lon},{poi.lat}"

    kml_str = ET.tostring(kml, encoding="unicode")

    return StreamingResponse(
        iter([kml_str]),
        media_type="application/vnd.google-earth.kml+xml",
        headers={"Content-Disposition": safe_content_disposition(f"{import_name}.kml")}
    )
