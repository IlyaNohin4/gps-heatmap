"""API endpoints for user-uploaded POI."""

from typing import List, Optional
from pathlib import Path
import io

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session
import xml.etree.ElementTree as ET

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
    import_name: Optional[str] = None

    model_config = {"from_attributes": True}


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
        headers={"Content-Disposition": f"attachment; filename={import_name}.kml"}
    )
