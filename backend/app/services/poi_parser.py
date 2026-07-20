"""Parse KML and KMZ files to extract POI data."""

import zipfile
import xml.etree.ElementTree as ET
from io import BytesIO
from typing import List, Dict, Tuple


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

                poi_list.append({
                    'name': name,
                    'lat': lat,
                    'lon': lon,
                    'category': category,
                    'description': desc,
                    'source': 'uploaded'
                })
            except Exception:
                continue  # Skip invalid placemarks

        return poi_list

    @staticmethod
    def _detect_category(name: str, description: str) -> str:
        """Auto-detect POI category from name and description."""
        text = (name + ' ' + description).lower()

        for category, keywords in POIParser.CATEGORY_KEYWORDS.items():
            if any(kw in text for kw in keywords):
                return category

        return 'other'
