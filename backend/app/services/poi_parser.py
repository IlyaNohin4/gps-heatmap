"""Parse KML and KMZ files to extract POI data."""

import re
import zipfile
import xml.etree.ElementTree as ET
from io import BytesIO
from typing import Dict, List, Optional, Tuple

# Fixed set of icon slugs selectable in the UI. Keep in sync with the
# frontend icon picker. Shared with api/poi.py to avoid two sources of truth.
ICON_SLUGS = {
    "food", "water", "camp", "medical", "bike", "shelter", "viewpoint",
    "parking", "fuel", "danger", "photo", "repair", "toilet", "lodging",
    "transport", "other",
}

HEX_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


class POIParser:
    """Parse KML/KMZ files and extract POI coordinates, names, descriptions."""

    # Matches the 5MB upload limit enforced on the raw KML/KMZ file in
    # api/poi.py — applied here to the *decompressed* KML, since ZIP can
    # compress text ~1000:1 and a small KMZ could otherwise unzip to
    # gigabytes and exhaust worker memory.
    MAX_DECOMPRESSED_BYTES = 5 * 1024 * 1024

    CATEGORY_KEYWORDS = {
        'food': ['cafe', 'restaurant', 'bar', 'pizza', 'burger', 'coffee'],
        'water': ['water', 'fountain', 'well', 'spring', 'stream'],
        'repair': ['repair', 'workshop', 'mechanic', 'service', 'maintenance'],
        'bike': ['bike', 'bicycle', 'cycling', 'rental', 'shop'],
        'medical': ['hospital', 'clinic', 'doctor', 'pharmacy', 'health'],
        'shelter': ['shelter', 'hut', 'cabin', 'lodge', 'camp', 'hostel'],
    }

    # Maps keywords found in a KML <Icon><href> (Google Maps / OsmAnd icon
    # filenames, e.g. ".../restaurant-71.png", "poi_shop_bicycle") to one of
    # our ICON_SLUGS. Checked in order, first match wins.
    ICON_HREF_KEYWORDS = {
        'food': ['restaurant', 'dining', 'cafe', 'bar', 'food', 'pizza'],
        'water': ['water', 'drinking'],
        'medical': ['hospital', 'pharmacy', 'clinic', 'medical', 'doctor'],
        'bike': ['bike', 'bicycle', 'cycling'],
        'camp': ['camping', 'campground', 'campsite'],
        'lodging': ['lodging', 'hotel', 'hostel'],
        'shelter': ['shelter', 'hut', 'cabin'],
        'parking': ['parking'],
        'fuel': ['gas', 'fuel', 'petrol'],
        'viewpoint': ['scenic', 'viewpoint', 'lookout'],
        'toilet': ['toilet', 'restroom', 'wc'],
        'transport': ['bus', 'rail', 'transit', 'airport', 'ferry'],
        'danger': ['caution', 'danger', 'warning'],
        'photo': ['camera', 'photo'],
        'repair': ['repair', 'workshop', 'mechanic'],
    }

    @staticmethod
    def parse(file_bytes: bytes) -> Tuple[List[Dict], str]:
        """
        Parse KML or KMZ file.

        Args:
            file_bytes: Raw file content (KML or KMZ)

        Returns:
            (list of POI dicts, error message if any)
        """
        try:
            kml_content = POIParser._extract_kml(file_bytes)
            poi_list = POIParser._parse_kml_xml(kml_content)
            return poi_list, None
        except Exception as e:
            return [], str(e)

    @staticmethod
    def _extract_kml(file_bytes: bytes) -> bytes:
        """
        Extract KML from KMZ (ZIP) or return raw if KML.

        KMZ files start with ZIP magic bytes: b'PK'
        """
        if file_bytes[:2] == b'PK':  # ZIP magic bytes
            try:
                with zipfile.ZipFile(BytesIO(file_bytes)) as z:
                    # Find .kml file (usually doc.kml or similar)
                    kml_files = [f for f in z.namelist() if f.endswith('.kml')]
                    if not kml_files:
                        raise ValueError("No KML file found in KMZ archive")
                    info = z.getinfo(kml_files[0])
                    if info.file_size > POIParser.MAX_DECOMPRESSED_BYTES:
                        raise ValueError("KML inside KMZ exceeds size limit (zip bomb protection)")
                    return z.read(kml_files[0])
            except zipfile.BadZipFile as e:
                raise ValueError(f"Invalid KMZ file: {str(e)}")
        return file_bytes

    @staticmethod
    def _parse_kml_xml(kml_content: bytes) -> List[Dict]:
        """
        Parse KML XML and extract POI.

        Extracts Placemarks with Point geometry.
        """
        try:
            root = ET.fromstring(kml_content)
        except ET.ParseError as e:
            raise ValueError(f"Invalid KML XML: {str(e)}")

        # KML namespace
        ns = {'kml': 'http://www.opengis.net/kml/2.2'}
        poi_list = []
        styles = POIParser._parse_styles(root, ns)

        # Find all Placemarks
        for placemark in root.findall('.//kml:Placemark', ns):
            try:
                name_elem = placemark.find('kml:name', ns)
                desc_elem = placemark.find('kml:description', ns)
                point_elem = placemark.find('.//kml:Point/kml:coordinates', ns)

                if point_elem is None or point_elem.text is None:
                    continue

                # Parse coordinates: "lon,lat" or "lon,lat,elevation"
                coords_text = point_elem.text.strip()
                if not coords_text:
                    continue

                coords = coords_text.split(',')
                if len(coords) < 2:
                    continue

                try:
                    lon, lat = float(coords[0]), float(coords[1])
                except (ValueError, IndexError):
                    continue

                # Validate coordinates
                if not (-90 <= lat <= 90 and -180 <= lon <= 180):
                    continue

                # Extract name and description
                name = (name_elem.text or '').strip() if name_elem is not None else 'POI'
                if not name:
                    name = 'POI'

                desc = (desc_elem.text or '').strip() if desc_elem is not None else ''

                # Auto-detect category
                category = POIParser._detect_category(name, desc)

                # Auto-detect icon/color from the placemark's KML style, if any
                icon, color = POIParser._resolve_style(placemark, styles, ns)

                poi_list.append({
                    'name': name,
                    'lat': lat,
                    'lon': lon,
                    'category': category,
                    'description': desc,
                    'source': 'uploaded',
                    'icon': icon,
                    'color': color,
                })
            except Exception:
                continue  # Skip invalid placemarks

        return poi_list

    @staticmethod
    def _parse_styles(root, ns) -> Dict[str, Dict[str, Optional[str]]]:
        """Collect top-level <Style id="..."> definitions: id -> {href, color}."""
        styles: Dict[str, Dict[str, Optional[str]]] = {}
        for style in root.findall('.//kml:Style', ns):
            style_id = style.get('id')
            if not style_id:
                continue
            styles[style_id] = POIParser._extract_icon_style(style, ns)
        return styles

    @staticmethod
    def _extract_icon_style(style_elem, ns) -> Dict[str, Optional[str]]:
        href_elem = style_elem.find('.//kml:IconStyle/kml:Icon/kml:href', ns)
        color_elem = style_elem.find('.//kml:IconStyle/kml:color', ns)
        href = (href_elem.text or '').strip() if href_elem is not None else None
        color_raw = (color_elem.text or '').strip() if color_elem is not None else None
        return {
            'href': href or None,
            'color': POIParser._kml_color_to_hex(color_raw),
        }

    @staticmethod
    def _resolve_style(placemark, styles, ns) -> Tuple[Optional[str], Optional[str]]:
        """Resolve a placemark's icon/color via inline <Style> or <styleUrl> reference."""
        inline_style = placemark.find('kml:Style', ns)
        if inline_style is not None:
            info = POIParser._extract_icon_style(inline_style, ns)
        else:
            style_url_elem = placemark.find('kml:styleUrl', ns)
            style_url = (style_url_elem.text or '').strip() if style_url_elem is not None else ''
            info = styles.get(style_url.lstrip('#'), {'href': None, 'color': None})

        icon = POIParser._href_to_icon(info.get('href'))
        color = info.get('color')
        if color is not None and not HEX_COLOR_RE.match(color):
            color = None
        return icon, color

    @staticmethod
    def _href_to_icon(href: Optional[str]) -> Optional[str]:
        if not href:
            return None
        text = href.lower()
        for icon, keywords in POIParser.ICON_HREF_KEYWORDS.items():
            if any(kw in text for kw in keywords):
                return icon
        return None

    @staticmethod
    def _kml_color_to_hex(color_raw: Optional[str]) -> Optional[str]:
        """KML colors are aabbggrr hex. Convert to our #rrggbb, dropping alpha."""
        if not color_raw:
            return None
        text = color_raw.strip().lstrip('#')
        if len(text) != 8 or not re.fullmatch(r'[0-9a-fA-F]{8}', text):
            return None
        aa, bb, gg, rr = text[0:2], text[2:4], text[4:6], text[6:8]
        return f"#{rr}{gg}{bb}".lower()

    @staticmethod
    def _detect_category(name: str, description: str) -> str:
        """Auto-detect POI category from name and description."""
        text = (name + ' ' + description).lower()

        for category, keywords in POIParser.CATEGORY_KEYWORDS.items():
            if any(kw in text for kw in keywords):
                return category

        return 'other'
