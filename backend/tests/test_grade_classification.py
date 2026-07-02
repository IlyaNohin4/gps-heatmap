"""Test grade calculation and segment classification."""

from datetime import datetime, timezone
from app.services.parser_factory import _calculate_grade, _classify_segment, _build_segments


def test_calculate_grade():
    """Test grade (slope) calculation formula."""

    # Test 1: Climb
    grade = _calculate_grade(ele_delta_m=10, distance_m=200)
    assert grade is not None
    assert abs(grade - 5.0) < 0.01, f"Expected 5.0%, got {grade}%"
    print(f"✓ Climb: +10m over 200m = {grade}% grade")

    # Test 2: Descent
    grade = _calculate_grade(ele_delta_m=-10, distance_m=200)
    assert grade is not None
    assert abs(grade - (-5.0)) < 0.01, f"Expected -5.0%, got {grade}%"
    print(f"✓ Descent: -10m over 200m = {grade}% grade")

    # Test 3: Steep climb
    grade = _calculate_grade(ele_delta_m=15, distance_m=100)
    assert grade is not None
    assert abs(grade - 15.0) < 0.01, f"Expected 15.0%, got {grade}%"
    print(f"✓ Steep climb: +15m over 100m = {grade}% grade")

    # Test 4: Flat
    grade = _calculate_grade(ele_delta_m=0, distance_m=200)
    assert grade is not None
    assert abs(grade) < 0.01, f"Expected ~0%, got {grade}%"
    print(f"✓ Flat: no elevation over 200m = {grade}% grade")

    # Test 5: Invalid (zero distance)
    grade = _calculate_grade(ele_delta_m=10, distance_m=0)
    assert grade is None, "Should return None for zero distance"
    print(f"✓ Invalid: zero distance returns None")


def test_classify_segment():
    """Test segment classification by grade."""

    # Test 1: Climbing
    seg_type = _classify_segment(grade=10.0)
    assert seg_type == "climbing", f"Expected 'climbing', got '{seg_type}'"
    print(f"✓ 10% grade → climbing")

    # Test 2: Descent
    seg_type = _classify_segment(grade=-10.0)
    assert seg_type == "descent", f"Expected 'descent', got '{seg_type}'"
    print(f"✓ -10% grade → descent")

    # Test 3: Flat
    seg_type = _classify_segment(grade=2.5)
    assert seg_type == "flat", f"Expected 'flat', got '{seg_type}'"
    print(f"✓ 2.5% grade → flat")

    # Test 4: Edge: exactly at threshold
    seg_type = _classify_segment(grade=5.0)
    assert seg_type == "flat", f"Expected 'flat' at 5%, got '{seg_type}'"
    print(f"✓ 5.0% grade (threshold) → flat")

    seg_type = _classify_segment(grade=-5.0)
    assert seg_type == "flat", f"Expected 'flat' at -5%, got '{seg_type}'"
    print(f"✓ -5.0% grade (threshold) → flat")

    # Test 5: Just above/below threshold
    seg_type = _classify_segment(grade=5.1)
    assert seg_type == "climbing", f"Expected 'climbing' at 5.1%, got '{seg_type}'"
    print(f"✓ 5.1% grade → climbing")

    seg_type = _classify_segment(grade=-5.1)
    assert seg_type == "descent", f"Expected 'descent' at -5.1%, got '{seg_type}'"
    print(f"✓ -5.1% grade → descent")

    # Test 6: None grade
    seg_type = _classify_segment(grade=None)
    assert seg_type == "flat", f"Expected 'flat' for None, got '{seg_type}'"
    print(f"✓ None grade → flat")


def test_build_segments_with_grade():
    """Test complete segment building with grade and classification."""

    points = [
        # Start at 1000m elevation
        {"lat": 45.0, "lon": 10.0, "elevation": 1000.0,
         "time": datetime(2025, 1, 1, 10, 0, 0, tzinfo=timezone.utc),
         "osmand_speed_kmh": None},
        # Climb 600m over short distance → steep climb
        {"lat": 45.05, "lon": 10.0, "elevation": 1600.0,
         "time": datetime(2025, 1, 1, 10, 5, 0, tzinfo=timezone.utc),
         "osmand_speed_kmh": None},
        # Flat section (same elevation)
        {"lat": 45.05, "lon": 10.05, "elevation": 1600.0,
         "time": datetime(2025, 1, 1, 10, 10, 0, tzinfo=timezone.utc),
         "osmand_speed_kmh": None},
        # Descend 600m over short distance → steep descent
        {"lat": 45.0, "lon": 10.05, "elevation": 1000.0,
         "time": datetime(2025, 1, 1, 10, 15, 0, tzinfo=timezone.utc),
         "osmand_speed_kmh": None},
    ]

    segs, dist, s_avg, s_max, s_min, dur, stats = _build_segments(points)

    # Test segments
    assert len(segs) == 3, f"Expected 3 segments, got {len(segs)}"
    print(f"✓ Created {len(segs)} segments")

    # Segment 1: Climbing
    seg1 = segs[0]
    print(f"DEBUG Seg1: type={seg1['type']}, grade={seg1['grade_percent']}%, distance={seg1.get('distance_km')}km")
    assert seg1["type"] == "climbing", f"Seg1 should be climbing, got {seg1['type']}"
    assert seg1["grade_percent"] is not None, "Seg1 grade should not be None"
    assert seg1["grade_percent"] > 0, f"Seg1 grade should be positive, got {seg1['grade_percent']}"
    print(f"✓ Seg1: climbing, grade={seg1['grade_percent']}%")

    # Segment 2: Flat
    seg2 = segs[1]
    assert seg2["type"] == "flat", f"Seg2 should be flat, got {seg2['type']}"
    print(f"✓ Seg2: flat, grade={seg2['grade_percent']}%")

    # Segment 3: Descent
    seg3 = segs[2]
    assert seg3["type"] == "descent", f"Seg3 should be descent, got {seg3['type']}"
    assert seg3["grade_percent"] is not None, "Seg3 grade should not be None"
    assert seg3["grade_percent"] < 0, f"Seg3 grade should be negative, got {seg3['grade_percent']}"
    print(f"✓ Seg3: descent, grade={seg3['grade_percent']}%")

    # Test statistics
    assert stats["segment_counts"]["climbing"] == 1, f"Expected 1 climbing, got {stats['segment_counts']['climbing']}"
    assert stats["segment_counts"]["descent"] == 1, f"Expected 1 descent, got {stats['segment_counts']['descent']}"
    assert stats["segment_counts"]["flat"] == 1, f"Expected 1 flat, got {stats['segment_counts']['flat']}"
    print(f"✓ Segment counts: climbing=1, descent=1, flat=1")

    # Test percentages (should sum to 100)
    climbing_pct = stats["segment_percentages"]["climbing"]
    descent_pct = stats["segment_percentages"]["descent"]
    flat_pct = stats["segment_percentages"]["flat"]
    total = climbing_pct + descent_pct + flat_pct
    assert abs(total - 100.0) < 0.1, f"Percentages should sum to 100%, got {total}%"
    print(f"✓ Percentages: climbing={climbing_pct}%, descent={descent_pct}%, flat={flat_pct}%")

    # Test grade stats
    assert stats["grade_avg"] is not None, "grade_avg should not be None"
    assert stats["grade_max"] is not None, "grade_max should not be None"
    assert stats["grade_min"] is not None, "grade_min should not be None"
    print(f"✓ Grade stats: avg={stats['grade_avg']}%, max={stats['grade_max']}%, min={stats['grade_min']}%")


def test_realistic_mountain_route():
    """Test with realistic mountain route: climbing, flat, descent."""

    points = [
        # Elevation: 1000m
        {"lat": 46.0, "lon": 10.0, "elevation": 1000.0,
         "time": datetime(2025, 1, 1, 8, 0, 0, tzinfo=timezone.utc),
         "osmand_speed_kmh": None},
        # After ~5.6km: elevation 1600m (600m gain = steep climbing)
        {"lat": 46.05, "lon": 10.0, "elevation": 1600.0,
         "time": datetime(2025, 1, 1, 8, 30, 0, tzinfo=timezone.utc),
         "osmand_speed_kmh": None},
        # After ~11.1km: elevation 1600m (flat section)
        {"lat": 46.05, "lon": 10.05, "elevation": 1600.0,
         "time": datetime(2025, 1, 1, 9, 0, 0, tzinfo=timezone.utc),
         "osmand_speed_kmh": None},
        # After ~16.7km: elevation 1000m (600m descent = steep descent)
        {"lat": 46.0, "lon": 10.05, "elevation": 1000.0,
         "time": datetime(2025, 1, 1, 9, 30, 0, tzinfo=timezone.utc),
         "osmand_speed_kmh": None},
    ]

    segs, dist, s_avg, s_max, s_min, dur, stats = _build_segments(points)

    print(f"\n📊 Mountain Route Analysis:")
    print(f"  Total distance: {dist:.2f} km")
    print(f"  Duration: {dur}s ({dur/60:.1f} min)")
    print(f"  Grade stats: avg={stats['grade_avg']}%, max={stats['grade_max']}%, min={stats['grade_min']}%")
    print(f"  Segments: {stats['segment_counts']}")
    print(f"  Distribution: climbing {stats['segment_percentages']['climbing']:.1f}%, "
          f"flat {stats['segment_percentages']['flat']:.1f}%, "
          f"descent {stats['segment_percentages']['descent']:.1f}%")

    # Verify route profile
    assert stats["segment_counts"]["climbing"] > 0, "Should have climbing segments"
    assert stats["segment_counts"]["flat"] > 0, "Should have flat segments"
    assert stats["segment_counts"]["descent"] > 0, "Should have descent segments"
    assert stats["segment_percentages"]["climbing"] > 30, "Should be mostly climbing (>30%)"

    print(f"\n✅ Mountain route test passed!")


if __name__ == "__main__":
    print("=" * 60)
    print("GRADE CALCULATION & SEGMENT CLASSIFICATION TESTS")
    print("=" * 60)

    test_calculate_grade()
    print()

    test_classify_segment()
    print()

    test_build_segments_with_grade()
    print()

    test_realistic_mountain_route()

    print("\n" + "=" * 60)
    print("✅ ALL TESTS PASSED!")
    print("=" * 60)
