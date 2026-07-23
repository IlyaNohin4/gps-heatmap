"""Tests for POI parser (KML/KMZ parsing)."""

import pytest

from app.services.poi_parser import POIParser


def test_parse_kml_simple():
    """Test parsing simple KML with one placemark."""
    kml = b"""<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>Test Cafe</name>
      <description>A nice cafe</description>
      <Point>
        <coordinates>34.807,48.540</coordinates>
      </Point>
    </Placemark>
  </Document>
</kml>"""

    poi_list, error = POIParser.parse(kml)

    assert error is None
    assert len(poi_list) == 1
    assert poi_list[0]['name'] == 'Test Cafe'
    assert poi_list[0]['lat'] == 48.540
    assert poi_list[0]['lon'] == 34.807
    assert poi_list[0]['category'] == 'food'
    assert poi_list[0]['description'] == 'A nice cafe'


def test_parse_kml_multiple():
    """Test parsing KML with multiple placemarks."""
    kml = b"""<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>Restaurant</name>
      <Point><coordinates>10,20</coordinates></Point>
    </Placemark>
    <Placemark>
      <name>Water Fountain</name>
      <Point><coordinates>30,40</coordinates></Point>
    </Placemark>
    <Placemark>
      <name>Bike Shop</name>
      <Point><coordinates>50,60</coordinates></Point>
    </Placemark>
  </Document>
</kml>"""

    poi_list, error = POIParser.parse(kml)

    assert error is None
    assert len(poi_list) == 3
    assert poi_list[0]['category'] == 'food'
    assert poi_list[1]['category'] == 'water'
    assert poi_list[2]['category'] == 'bike'


def test_parse_kml_with_elevation():
    """Test parsing KML with coordinates including elevation."""
    kml = b"""<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>Mountain Shelter</name>
      <Point>
        <coordinates>34.807,48.540,1234.5</coordinates>
      </Point>
    </Placemark>
  </Document>
</kml>"""

    poi_list, error = POIParser.parse(kml)

    assert error is None
    assert len(poi_list) == 1
    assert poi_list[0]['lat'] == 48.540
    assert poi_list[0]['lon'] == 34.807
    assert poi_list[0]['category'] == 'shelter'


def test_parse_kml_invalid_coords():
    """Test that invalid coordinates are skipped."""
    kml = b"""<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>Valid</name>
      <Point><coordinates>10,20</coordinates></Point>
    </Placemark>
    <Placemark>
      <name>Invalid - out of range</name>
      <Point><coordinates>200,100</coordinates></Point>
    </Placemark>
    <Placemark>
      <name>Valid Again</name>
      <Point><coordinates>30,40</coordinates></Point>
    </Placemark>
  </Document>
</kml>"""

    poi_list, error = POIParser.parse(kml)

    assert error is None
    assert len(poi_list) == 2  # Invalid one skipped
    assert poi_list[0]['name'] == 'Valid'
    assert poi_list[1]['name'] == 'Valid Again'


def test_parse_kml_missing_point():
    """Test that placemarks without Point geometry are skipped."""
    kml = b"""<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>No Geometry</name>
      <description>This has no Point element</description>
    </Placemark>
    <Placemark>
      <name>Has Point</name>
      <Point><coordinates>10,20</coordinates></Point>
    </Placemark>
  </Document>
</kml>"""

    poi_list, error = POIParser.parse(kml)

    assert error is None
    assert len(poi_list) == 1
    assert poi_list[0]['name'] == 'Has Point'


def test_parse_invalid_xml():
    """Test that invalid XML returns error."""
    kml = b"<kml>not valid xml</kml"

    poi_list, error = POIParser.parse(kml)

    assert error is not None
    assert len(poi_list) == 0


def test_category_detection():
    """Test auto-category detection from keywords."""
    test_cases = [
        ('McDonald Pizza', 'food'),
        ('Central Fountain', 'water'),
        ('Bike Rental Shop', 'bike'),
        ('Emergency Hospital', 'medical'),
        ('Auto Repair Service', 'repair'),
        ('Mountain Shelter Hut', 'shelter'),
        ('Random Place', 'other'),
    ]

    for name, expected_category in test_cases:
        category = POIParser._detect_category(name, '')
        assert category == expected_category, f"Expected {expected_category} for '{name}', got {category}"


def test_parse_kmz_format():
    """Test that KMZ (ZIP) files are properly detected and extracted.

    Note: This test just verifies the magic bytes detection.
    Full KMZ test would require creating a real ZIP file.
    """
    # ZIP magic bytes (PK)
    kmz_header = b'PK\x03\x04'

    # Should trigger ZIP handling path
    # (actual content won't be valid, but we're testing detection)
    poi_list, error = POIParser.parse(kmz_header + b'invalid')

    # Should fail with ZIP error, not XML error
    assert error is not None
    assert 'zip' in error.lower() or 'kml' in error.lower()


def test_kmz_zip_bomb_is_rejected():
    """A KMZ whose inner doc.kml declares an uncompressed size over the
    5MB limit must be rejected before it's ever decompressed, even though
    the ZIP itself compresses down to a tiny size (highly repetitive
    content compresses ~1000:1)."""
    import zipfile
    from io import BytesIO

    huge_kml = b"<!-- " + b"A" * (6 * 1024 * 1024) + b" -->"

    buf = BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("doc.kml", huge_kml)
    kmz_bytes = buf.getvalue()

    # The compressed archive itself is small (repetitive content), but the
    # declared uncompressed size of doc.kml is > 5MB.
    assert len(kmz_bytes) < 1024 * 1024

    poi_list, error = POIParser.parse(kmz_bytes)

    assert poi_list == []
    assert error is not None
    assert "size" in error.lower() or "large" in error.lower() or "bomb" in error.lower()


def test_parse_kml_style_via_styleurl():
    """Placemark referencing a shared <Style id> should pick up icon + color."""
    kml = b"""<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Style id="restaurant-style">
      <IconStyle>
        <color>ff0000ff</color>
        <Icon><href>https://maps.google.com/mapfiles/kml/shapes/restaurant.png</href></Icon>
      </IconStyle>
    </Style>
    <Placemark>
      <name>Some Diner</name>
      <styleUrl>#restaurant-style</styleUrl>
      <Point><coordinates>10,20</coordinates></Point>
    </Placemark>
  </Document>
</kml>"""

    poi_list, error = POIParser.parse(kml)

    assert error is None
    assert len(poi_list) == 1
    assert poi_list[0]['icon'] == 'food'
    # KML color is aabbggrr; ff0000ff -> alpha ff, blue 00, green 00, red ff -> #ff0000
    assert poi_list[0]['color'] == '#ff0000'


def test_parse_kml_inline_style():
    """Placemark with an inline (unreferenced) <Style> should also resolve."""
    kml = b"""<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>Parking Spot</name>
      <Style>
        <IconStyle>
          <Icon><href>https://maps.google.com/mapfiles/kml/shapes/parking_lot.png</href></Icon>
        </IconStyle>
      </Style>
      <Point><coordinates>10,20</coordinates></Point>
    </Placemark>
  </Document>
</kml>"""

    poi_list, error = POIParser.parse(kml)

    assert error is None
    assert poi_list[0]['icon'] == 'parking'


def test_parse_kml_without_style_has_no_icon():
    """Placemarks without any style info leave icon/color as None (fallback to category)."""
    kml = b"""<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>Plain Spot</name>
      <Point><coordinates>10,20</coordinates></Point>
    </Placemark>
  </Document>
</kml>"""

    poi_list, error = POIParser.parse(kml)

    assert error is None
    assert poi_list[0]['icon'] is None
    assert poi_list[0]['color'] is None


def test_kmz_within_size_limit_still_parses():
    """Control case: a KMZ under the size limit is unaffected by the guard."""
    import zipfile
    from io import BytesIO

    kml = b"""<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>Test POI</name>
      <Point><coordinates>30.5,50.5,0</coordinates></Point>
    </Placemark>
  </Document>
</kml>"""

    buf = BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("doc.kml", kml)

    poi_list, error = POIParser.parse(buf.getvalue())

    assert error is None
    assert len(poi_list) == 1
    assert poi_list[0]["name"] == "Test POI"
