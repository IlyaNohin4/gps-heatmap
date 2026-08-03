"""API endpoints for user-uploaded POI."""

from typing import Dict, List, Optional, Tuple
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
import re
from sqlalchemy import func
from sqlalchemy.orm import Session
from xml.dom.minidom import Document

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.http_utils import safe_content_disposition
from app.models.poi import POI
from app.models.poi_category import POICategory
from app.models.poi_import import POIImport
from app.models.user import User
from app.services.poi_parser import POIParser, ICON_SLUGS, HEX_COLOR_RE, ICON_SLUG_TO_GOOGLE_HREF, hex_to_kml_color

router = APIRouter(prefix="/api/poi", tags=["poi"])

MAX_FILE_BYTES = 5 * 1024 * 1024  # 5 MB
UPLOAD_CHUNK_SIZE = 1024 * 1024  # 1 MB — read in chunks so the size limit aborts early


def _validate_icon(icon: Optional[str]) -> None:
    if icon is not None and icon not in ICON_SLUGS:
        raise HTTPException(status_code=400, detail=f"Invalid icon: {icon}")


def _validate_color(color: Optional[str]) -> None:
    if color is not None and not HEX_COLOR_RE.match(color):
        raise HTTPException(status_code=400, detail="color must be a hex value like #RRGGBB")


def _get_or_create_import(db: Session, user_id: int, name: str) -> POIImport:
    imp = db.query(POIImport).filter(POIImport.user_id == user_id, POIImport.name == name).first()
    if imp is None:
        imp = POIImport(user_id=user_id, name=name)
        db.add(imp)
        db.flush()
    return imp


class POIResponse(BaseModel):
    id: int
    name: str
    lat: float
    lon: float
    category: str
    description: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    visited: bool = False
    source: str = "user"
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
    new_name: str = Field(..., max_length=255)


class RenameCategoryRequest(BaseModel):
    new_name: str = Field(..., min_length=1, max_length=100)


class CreateCategoryRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)


class CreateImportRequest(BaseModel):
    name: str = Field(..., max_length=255)


class CreatePOIRequest(BaseModel):
    name: str = Field(..., max_length=255)
    lat: float
    lon: float
    category: str = Field(..., max_length=255)
    description: Optional[str] = Field(None, max_length=2000)
    icon: Optional[str] = Field(None, max_length=50)
    color: Optional[str] = Field(None, max_length=20)
    visited: bool = False
    import_name: str = Field(..., min_length=1, max_length=255)


class UpdatePOIRequest(BaseModel):
    name: Optional[str] = Field(None, max_length=255)
    category: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = Field(None, max_length=2000)
    icon: Optional[str] = Field(None, max_length=50)
    color: Optional[str] = Field(None, max_length=20)
    visited: Optional[bool] = None


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

    if request.import_name:
        _get_or_create_import(db, current_user.id, request.import_name)

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
        visited=request.visited,
        import_name=request.import_name,
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

    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")

    content = bytearray()
    while True:
        chunk = await file.read(UPLOAD_CHUNK_SIZE)
        if not chunk:
            break
        content.extend(chunk)
        if len(content) > MAX_FILE_BYTES:
            raise HTTPException(status_code=413, detail="File exceeds 5 MB limit")
    content = bytes(content)

    # Parse
    poi_list, error = POIParser.parse(content)

    if error:
        raise HTTPException(status_code=400, detail=f"Parse error: {error}")

    if not poi_list:
        raise HTTPException(status_code=400, detail="No POI found in file")

    # Extract import name from filename (remove extension)
    import_name = Path(file.filename).stem
    _get_or_create_import(db, current_user.id, import_name)

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
            kml_icon_href=poi_data.get('kml_icon_href'),
            kml_style_color=poi_data.get('kml_style_color'),
            kml_altitude=poi_data.get('kml_altitude'),
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
    """Get the user's categories with POI counts — includes categories
    registered via POST /categories that have zero POI yet."""
    counts = dict(
        db.query(POI.category, func.count(POI.id))
        .filter(POI.user_id == current_user.id)
        .group_by(POI.category)
        .all()
    )
    registered = db.query(POICategory.name).filter(POICategory.user_id == current_user.id).all()
    names = set(counts.keys()) | {r[0] for r in registered}

    return [CategoryStats(name=name, count=counts.get(name, 0)) for name in sorted(names)]


@router.post("/categories", response_model=CategoryStats, status_code=status.HTTP_201_CREATED)
def create_category(
    request: CreateCategoryRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Register a category ahead of time, before any POI uses it."""
    exists = db.query(POICategory).filter(
        POICategory.user_id == current_user.id, POICategory.name == request.name
    ).first()
    has_poi = db.query(POI).filter(
        POI.user_id == current_user.id, POI.category == request.name
    ).first()
    if exists or has_poi:
        raise HTTPException(status_code=409, detail="A category with this name already exists")

    db.add(POICategory(user_id=current_user.id, name=request.name))
    db.commit()

    return CategoryStats(name=request.name, count=0)


@router.patch("/categories/{category_name}", status_code=status.HTTP_200_OK)
def rename_category(
    category_name: str,
    request: RenameCategoryRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Rename a category across all of the user's POI (and its registry entry, if any) at once.

    If `new_name` is already a registered/used category, this merges
    `category_name` into it (e.g. consolidating "food" into "Food") instead
    of rejecting the rename — the source registry row is dropped either way.
    """
    updated_poi = db.query(POI).filter(
        POI.user_id == current_user.id, POI.category == category_name
    ).update({POI.category: request.new_name})

    source_registry = db.query(POICategory).filter(
        POICategory.user_id == current_user.id, POICategory.name == category_name
    ).first()
    if source_registry:
        target_exists = db.query(POICategory).filter(
            POICategory.user_id == current_user.id, POICategory.name == request.new_name
        ).first()
        if target_exists:
            # Merging into an already-registered category — drop the source
            # row rather than renaming it in place, which would collide with
            # the (user_id, name) unique constraint on the target row.
            db.delete(source_registry)
        else:
            source_registry.name = request.new_name

    if not updated_poi and not source_registry:
        raise HTTPException(status_code=404, detail="Category not found")

    db.commit()
    return {"status": "ok"}


@router.delete("/categories/{category_name}", status_code=status.HTTP_200_OK)
def delete_category(
    category_name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Reset a category to 'other' across all of the user's POI and remove its
    registry entry — does not delete the POI themselves."""
    if category_name == "other":
        raise HTTPException(status_code=400, detail="Cannot delete the 'other' category")

    updated_poi = db.query(POI).filter(
        POI.user_id == current_user.id, POI.category == category_name
    ).update({POI.category: "other"})
    deleted_registry = db.query(POICategory).filter(
        POICategory.user_id == current_user.id, POICategory.name == category_name
    ).delete()

    if not updated_poi and not deleted_registry:
        raise HTTPException(status_code=404, detail="Category not found")

    db.commit()
    return {"status": "ok"}


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
    if request.visited is not None:
        poi.visited = request.visited

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


@router.post("/imports", response_model=ImportInfo, status_code=status.HTTP_201_CREATED)
def create_import(
    request: CreateImportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create an empty list to assign POI to (e.g. before placing points via Create mode)."""
    exists = db.query(POIImport).filter(
        POIImport.user_id == current_user.id, POIImport.name == request.name
    ).first()
    if exists:
        raise HTTPException(status_code=409, detail="A list with this name already exists")

    imp = POIImport(user_id=current_user.id, name=request.name)
    db.add(imp)
    db.commit()

    return ImportInfo(name=imp.name, count=0)


@router.get("/imports", response_model=List[ImportInfo])
def get_imports(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get list of imports (including empty ones) with POI counts."""
    counts = dict(
        db.query(POI.import_name, func.count(POI.id))
        .filter(POI.user_id == current_user.id, POI.import_name.isnot(None))
        .group_by(POI.import_name)
        .all()
    )
    imports = db.query(POIImport).filter(POIImport.user_id == current_user.id).order_by(POIImport.name.asc()).all()

    return [ImportInfo(name=imp.name, count=counts.get(imp.name, 0)) for imp in imports]


@router.patch("/imports/{import_name}", status_code=status.HTTP_200_OK)
def rename_import(
    import_name: str,
    request: RenameImportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Rename an import."""
    imp = db.query(POIImport).filter(
        POIImport.user_id == current_user.id, POIImport.name == import_name
    ).first()
    if imp is None:
        raise HTTPException(status_code=404, detail="Import not found")

    if request.new_name != import_name:
        taken = db.query(POIImport).filter(
            POIImport.user_id == current_user.id, POIImport.name == request.new_name
        ).first()
        if taken:
            raise HTTPException(status_code=409, detail="A list with this name already exists")

    imp.name = request.new_name
    db.query(POI).filter(
        POI.user_id == current_user.id, POI.import_name == import_name
    ).update({POI.import_name: request.new_name})

    db.commit()

    return {"status": "ok"}


@router.delete("/imports/{import_name}", status_code=status.HTTP_204_NO_CONTENT)
def delete_import(
    import_name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete an import list and all POI assigned to it."""
    imp = db.query(POIImport).filter(
        POIImport.user_id == current_user.id, POIImport.name == import_name
    ).first()
    if imp is None:
        raise HTTPException(status_code=404, detail="Import not found")

    db.query(POI).filter(
        POI.user_id == current_user.id, POI.import_name == import_name
    ).delete()
    db.delete(imp)

    db.commit()


@router.get("/imports/{import_name}/export")
def export_import(
    import_name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export import as KML file."""
    imp = db.query(POIImport).filter(
        POIImport.user_id == current_user.id, POIImport.name == import_name
    ).first()
    if imp is None:
        raise HTTPException(status_code=404, detail="Import not found")

    pois = db.query(POI).filter(
        POI.user_id == current_user.id,
        POI.import_name == import_name
    ).all()

    kml_str = _build_kml(import_name, pois)

    return StreamingResponse(
        iter([kml_str]),
        media_type="application/vnd.google-earth.kml+xml",
        headers={"Content-Disposition": safe_content_disposition(f"{import_name}.kml")}
    )


_RAW_KML_COLOR_RE = re.compile(r'^[0-9a-fA-F]{8}$')


def _append_cdata(parent, doc: Document, text: str) -> None:
    """Append `text` as a CDATA section, safe even if it contains a literal
    "]]>" — minidom's CDATASection.writexml *raises ValueError* the moment a
    section's data contains that substring (it would otherwise prematurely
    close the section), so a POI name/description containing it used to 500
    the whole export.

    "]]>" can't be escaped inside one CDATA node (minidom's own check
    forbids it), and splitting into multiple sibling CDATA/text nodes hits a
    separate minidom pretty-printing bug (toprettyxml injects whitespace
    between sibling text-like children, corrupting the content) — so this
    rare case falls back to a plain, properly-escaped text node instead of
    CDATA. Every other name/description (the overwhelming majority) keeps
    using CDATA as before.
    """
    if "]]>" in text:
        parent.appendChild(doc.createTextNode(text))
    else:
        parent.appendChild(doc.createCDATASection(text))


def _build_kml(import_name: str, pois: List[POI]) -> str:
    """Build a KML document, restoring each POI's original <Style> (icon href +
    color) and altitude when captured on import, so round-tripping a file we
    parsed produces the same look as the source instead of a bare-bones export.
    """
    doc = Document()
    kml = doc.createElement("kml")
    kml.setAttribute("xmlns", "http://www.opengis.net/kml/2.2")
    doc.appendChild(kml)

    document = doc.createElement("Document")
    kml.appendChild(document)
    name_el = doc.createElement("name")
    _append_cdata(name_el, doc, import_name)
    document.appendChild(name_el)

    # One <Style> per unique (href, color) pair, referenced by styleUrl —
    # mirrors what Google My Maps produces, minus the normal/highlight
    # <StyleMap> pair (cosmetic in the editor UI, irrelevant to rendering).
    style_ids: Dict[Tuple[Optional[str], Optional[str]], str] = {}

    # Styles are collected while walking placemarks but appended to the
    # Document *before* any Placemark — matching where Google My Maps puts
    # them (order is technically irrelevant to KML renderers, but this keeps
    # a re-exported file structurally close to the original).
    style_elements = []

    def _style_id_for(poi: POI) -> Optional[str]:
        if poi.kml_icon_href:
            # Came from a KML import — reproduce the exact original style.
            href = poi.kml_icon_href
            color = poi.kml_style_color if poi.kml_style_color and _RAW_KML_COLOR_RE.match(poi.kml_style_color) else None
        elif poi.icon and poi.icon in ICON_SLUG_TO_GOOGLE_HREF:
            # Created/edited in-app — no original KML style to restore, so
            # substitute a real Google icon of a matching shape/color instead
            # of exporting a plain unstyled Placemark.
            href = ICON_SLUG_TO_GOOGLE_HREF[poi.icon]
            color = hex_to_kml_color(poi.color)
        else:
            return None

        key = (href, color)
        if key not in style_ids:
            style_id = f"style{len(style_ids)}"
            style_ids[key] = style_id
            style = doc.createElement("Style")
            style.setAttribute("id", style_id)
            icon_style = doc.createElement("IconStyle")
            if color:
                color_el = doc.createElement("color")
                color_el.appendChild(doc.createTextNode(color))
                icon_style.appendChild(color_el)
            icon = doc.createElement("Icon")
            href_el = doc.createElement("href")
            href_el.appendChild(doc.createTextNode(href))
            icon.appendChild(href_el)
            icon_style.appendChild(icon)
            style.appendChild(icon_style)
            style_elements.append(style)
        return style_ids[key]

    placemark_elements = []
    for poi in pois:
        placemark = doc.createElement("Placemark")
        placemark_elements.append(placemark)

        name = doc.createElement("name")
        _append_cdata(name, doc, poi.name)
        placemark.appendChild(name)

        description = doc.createElement("description")
        _append_cdata(description, doc, poi.description or "")
        placemark.appendChild(description)

        style_id = _style_id_for(poi)
        if style_id:
            style_url = doc.createElement("styleUrl")
            style_url.appendChild(doc.createTextNode(f"#{style_id}"))
            placemark.appendChild(style_url)

        point = doc.createElement("Point")
        placemark.appendChild(point)
        coordinates = doc.createElement("coordinates")
        altitude = poi.kml_altitude if poi.kml_altitude is not None else 0
        coordinates.appendChild(doc.createTextNode(f"{poi.lon},{poi.lat},{altitude}"))
        point.appendChild(coordinates)

    for style in style_elements:
        document.appendChild(style)
    for placemark in placemark_elements:
        document.appendChild(placemark)

    return doc.toprettyxml(indent="  ")
