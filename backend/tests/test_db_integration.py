"""Integration tests: Parser → Database persistence."""

import json
from datetime import datetime, timezone

import pytest

from app.models.track import Track
from app.models.user import User
from app.services.parser_factory import parse, detect_format


@pytest.fixture
def test_user(db_session):
    """Create a test user."""
    user = User(email="test@example.com", password_hash="hashed_password")
    db_session.add(user)
    db_session.commit()
    return user


@pytest.fixture
def gpx_file():
    """Sample GPX file path."""
    return "tests/fixtures/sample_track.gpx"


def test_parse_and_save_track_to_db(db_session, test_user):
    """Test full pipeline: parse GPX → normalize → save to database."""

    # Read test GPX file (simulated simple track)
    gpx_content = b"""<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test">
  <metadata>
    <name>Test Track</name>
  </metadata>
  <trk>
    <trkseg>
      <trkpt lat="48.540" lon="34.807">
        <ele>30.0</ele>
        <time>2025-01-01T10:00:00Z</time>
      </trkpt>
      <trkpt lat="48.541" lon="34.808">
        <ele>35.0</ele>
        <time>2025-01-01T10:01:00Z</time>
      </trkpt>
      <trkpt lat="48.542" lon="34.809">
        <ele>40.0</ele>
        <time>2025-01-01T10:02:00Z</time>
      </trkpt>
    </trkseg>
  </trk>
</gpx>"""

    # Step 1: Parse
    fmt = detect_format(gpx_content, "test.gpx")
    assert fmt == "gpx", f"Expected 'gpx', got '{fmt}'"

    result = parse(gpx_content, fmt)

    # Step 2: Verify parse results
    assert result is not None
    assert "points" in result
    assert "normalized_points" in result
    assert "speed_segments" in result
    assert "distance_km" in result

    print(f"✓ Parse successful: {len(result['points'])} raw points")

    # Step 3: Create track in database
    track = Track(
        user_id=test_user.id,
        name="Test Track",
        file_format=fmt,
    )
    db_session.add(track)
    db_session.commit()

    # Step 4: Save parsed data to track
    # (datetimes must be serialized before storing in a JSON column — same as
    # the real Celery pipeline does in app/tasks/process_track.py)
    track.raw_points = [
        {**p, "time": p["time"].isoformat() if p["time"] else None}
        for p in result["points"]
    ]
    track.normalized_points = [
        {**p, "time": p["time"].isoformat() if p["time"] else None}
        for p in result["normalized_points"]
    ]
    track.speed_segments = result["speed_segments"]
    track.distance_km = result["distance_km"]
    track.duration_sec = result["duration_sec"]
    track.speed_avg = result["speed_avg"]
    track.speed_max = result["speed_max"]
    track.speed_min = result["speed_min"]
    track.elevation_gain = result["elevation_gain"]
    track.elevation_loss = result["elevation_loss"]
    track.recorded_at = result["recorded_at"]

    db_session.commit()

    print(f"✓ Track saved to database (id={track.id})")

    # Step 5: Verify data was saved correctly
    saved_track = db_session.query(Track).filter_by(id=track.id).first()
    assert saved_track is not None, "Track not found in database"

    assert saved_track.distance_km == result["distance_km"]
    assert saved_track.duration_sec == result["duration_sec"]
    assert saved_track.elevation_gain == result["elevation_gain"]
    assert saved_track.elevation_loss == result["elevation_loss"]

    print(f"✓ Metrics verified:")
    print(f"  - distance_km: {saved_track.distance_km:.2f}")
    print(f"  - elevation_gain: {saved_track.elevation_gain}m")
    print(f"  - elevation_loss: {saved_track.elevation_loss}m")

    # Step 6: Verify raw/normalized points
    assert saved_track.raw_points is not None
    assert len(saved_track.raw_points) > 0
    assert saved_track.normalized_points is not None
    assert len(saved_track.normalized_points) > 0

    reduction = (1 - len(saved_track.normalized_points) / len(saved_track.raw_points)) * 100
    print(f"✓ Points saved:")
    print(f"  - raw: {len(saved_track.raw_points)}")
    print(f"  - normalized: {len(saved_track.normalized_points)} ({reduction:.1f}% reduction)")

    # Step 7: Verify speed_segments
    assert saved_track.speed_segments is not None
    assert len(saved_track.speed_segments) > 0
    print(f"✓ Speed segments: {len(saved_track.speed_segments)}")

    print(f"\n✅ FULL PIPELINE TEST PASSED!")


def test_elevation_gain_loss_saved(db_session, test_user):
    """Test that elevation gain/loss from parser are saved correctly."""

    # Simulated parse result with known elevation values
    result = {
        "points": [
            {"lat": 48.0, "lon": 34.0, "elevation": 100.0, "time": datetime(2025, 1, 1, 10, 0, 0, tzinfo=timezone.utc)},
            {"lat": 48.01, "lon": 34.0, "elevation": 110.0, "time": datetime(2025, 1, 1, 10, 1, 0, tzinfo=timezone.utc)},
            {"lat": 48.02, "lon": 34.0, "elevation": 105.0, "time": datetime(2025, 1, 1, 10, 2, 0, tzinfo=timezone.utc)},
        ],
        "normalized_points": [],
        "distance_km": 2.2,
        "duration_sec": 120,
        "speed_avg": 66.0,
        "speed_max": 70.0,
        "speed_min": 60.0,
        "elevation_gain": 10.0,  # 100→110
        "elevation_loss": 5.0,   # 110→105
        "recorded_at": datetime(2025, 1, 1, 10, 0, 0, tzinfo=timezone.utc),
        "speed_segments": [],
    }

    track = Track(user_id=test_user.id, name="Elevation Test", file_format="gpx")
    track.elevation_gain = result["elevation_gain"]
    track.elevation_loss = result["elevation_loss"]

    db_session.add(track)
    db_session.commit()

    saved = db_session.query(Track).filter_by(id=track.id).first()
    assert saved.elevation_gain == 10.0
    assert saved.elevation_loss == 5.0

    print(f"✓ Elevation metrics saved correctly: gain={saved.elevation_gain}m, loss={saved.elevation_loss}m")
