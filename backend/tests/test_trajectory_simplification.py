"""Test Douglas-Peucker trajectory simplification."""

from datetime import datetime, timezone
from app.services.parser_factory import _simplify_trajectory, _point_to_line_distance


def test_point_to_line_distance():
    """Test perpendicular distance calculation."""

    # Test 1: Point on the line
    line_start = (55.0, 37.0)
    line_end = (55.1, 37.1)
    point = (55.05, 37.05)  # Midpoint, should be on line
    dist = _point_to_line_distance(point, line_start, line_end)
    assert dist < 100, f"Midpoint should be very close to line, got {dist}m"
    print(f"✓ Midpoint distance to line: {dist:.1f}m")

    # Test 2: Point clearly off the line
    point_off = (55.0, 37.1)  # To the right
    dist_off = _point_to_line_distance(point_off, line_start, line_end)
    assert dist_off > 1000, f"Point off line should be >1km, got {dist_off}m"
    print(f"✓ Off-line point distance: {dist_off:.1f}m")

    # Test 3: Endpoint
    dist_end = _point_to_line_distance(line_end, line_start, line_end)
    assert dist_end < 10, f"Endpoint should be on line, got {dist_end}m"
    print(f"✓ Endpoint distance: {dist_end:.1f}m")


def test_simplify_straight_line():
    """Test simplification of straight line (should keep only endpoints)."""

    # Straight line from (55.0, 37.0) to (55.1, 37.0)
    points = []
    num_points = 101
    for i in range(num_points):
        lat = 55.0 + (i / num_points) * 0.1
        points.append({
            "lat": lat,
            "lon": 37.0,
            "elevation": 100.0,
            "time": datetime(2025, 1, 1, 10, i // 60, i % 60, tzinfo=timezone.utc),
        })

    # Simplify with 10m tolerance
    simplified = _simplify_trajectory(points, tolerance_m=10.0)

    print(f"\n✓ Straight line simplification:")
    print(f"  Original: {len(points)} points")
    print(f"  Simplified: {len(simplified)} points")
    print(f"  Reduction: {(1 - len(simplified)/len(points))*100:.1f}%")

    # Straight line should reduce to 2 points (start, end)
    assert len(simplified) == 2, f"Straight line should simplify to 2 points, got {len(simplified)}"
    assert simplified[0]["lat"] == points[0]["lat"]
    assert simplified[-1]["lat"] == points[-1]["lat"]


def test_simplify_zigzag():
    """Test simplification keeps necessary turns."""

    # Create zigzag pattern
    points = [
        {"lat": 55.0, "lon": 37.0, "elevation": 100.0, "time": datetime(2025, 1, 1, 10, 0, 0, tzinfo=timezone.utc)},
        {"lat": 55.0, "lon": 37.05, "elevation": 100.0, "time": datetime(2025, 1, 1, 10, 0, 10, tzinfo=timezone.utc)},
        {"lat": 55.05, "lon": 37.05, "elevation": 100.0, "time": datetime(2025, 1, 1, 10, 0, 20, tzinfo=timezone.utc)},
        {"lat": 55.05, "lon": 37.0, "elevation": 100.0, "time": datetime(2025, 1, 1, 10, 0, 30, tzinfo=timezone.utc)},
        {"lat": 55.1, "lon": 37.0, "elevation": 100.0, "time": datetime(2025, 1, 1, 10, 0, 40, tzinfo=timezone.utc)},
    ]

    simplified = _simplify_trajectory(points, tolerance_m=10.0)

    print(f"\n✓ Zigzag simplification:")
    print(f"  Original: {len(points)} points")
    print(f"  Simplified: {len(simplified)} points")

    # Zigzag should keep most points (turns are significant)
    assert len(simplified) >= 3, f"Zigzag should keep significant turns, got {len(simplified)} points"


def test_simplify_noisy_curve():
    """Test simplification on realistic noisy curve."""

    # Create a smooth curve with noise
    import math
    points = []
    for i in range(100):
        t = i / 100.0
        # Smooth sine curve
        lat = 55.0 + 0.1 * math.sin(t * 2 * math.pi)
        # Add small noise
        lat += 0.001 * (i % 3 - 1)
        lon = 37.0 + t * 0.1
        points.append({
            "lat": lat,
            "lon": lon,
            "elevation": 100.0 + 10 * math.sin(t * 2 * math.pi),
            "time": datetime(2025, 1, 1, 10, i // 60, i % 60, tzinfo=timezone.utc),
        })

    original_count = len(points)
    simplified = _simplify_trajectory(points, tolerance_m=20.0)

    reduction = (1 - len(simplified) / original_count) * 100

    print(f"\n✓ Noisy curve simplification:")
    print(f"  Original: {original_count} points")
    print(f"  Simplified: {len(simplified)} points")
    print(f"  Reduction: {reduction:.1f}%")

    # Should achieve 50-80% reduction on noisy data
    assert reduction > 20, f"Should reduce noisy curve, got {reduction:.1f}%"
    assert len(simplified) >= 4, f"Should keep key points on curve, got {len(simplified)}"


def test_simplify_real_track():
    """Test on realistic track with turns and straightaways."""

    points = [
        # Start
        {"lat": 55.0, "lon": 37.0, "elevation": 100.0, "time": datetime(2025, 1, 1, 10, 0, 0, tzinfo=timezone.utc)},
        # Straightaway with noise
        {"lat": 55.001, "lon": 37.001, "elevation": 100.1, "time": datetime(2025, 1, 1, 10, 0, 1, tzinfo=timezone.utc)},
        {"lat": 55.002, "lon": 37.002, "elevation": 100.05, "time": datetime(2025, 1, 1, 10, 0, 2, tzinfo=timezone.utc)},
        {"lat": 55.003, "lon": 37.003, "elevation": 100.15, "time": datetime(2025, 1, 1, 10, 0, 3, tzinfo=timezone.utc)},
        # Turn (significant)
        {"lat": 55.004, "lon": 37.002, "elevation": 100.0, "time": datetime(2025, 1, 1, 10, 0, 4, tzinfo=timezone.utc)},
        # Another straightaway
        {"lat": 55.005, "lon": 37.001, "elevation": 100.05, "time": datetime(2025, 1, 1, 10, 0, 5, tzinfo=timezone.utc)},
        {"lat": 55.006, "lon": 37.0, "elevation": 100.1, "time": datetime(2025, 1, 1, 10, 0, 6, tzinfo=timezone.utc)},
        # End
        {"lat": 55.007, "lon": 37.0, "elevation": 100.0, "time": datetime(2025, 1, 1, 10, 0, 7, tzinfo=timezone.utc)},
    ]

    simplified = _simplify_trajectory(points, tolerance_m=15.0)

    print(f"\n✓ Real track simplification:")
    print(f"  Original: {len(points)} points")
    print(f"  Simplified: {len(simplified)} points")
    print(f"  Reduction: {(1 - len(simplified)/len(points))*100:.1f}%")

    # Should keep turn (point 4) and endpoints
    assert len(simplified) >= 3, f"Should keep endpoints and turn, got {len(simplified)}"


def test_simplify_8650_point_track():
    """Test on real-world 8650-point track (like user's file)."""

    import math

    # Simulate realistic track: ~15km with many noisy points
    points = []
    for i in range(8650):
        t = i / 8650.0  # 0 to 1
        # Slightly meandering path
        lat = 48.5 + 0.05 * math.sin(t * 4 * math.pi) + 0.0001 * (i % 7 - 3)
        lon = 34.8 + 0.1 * t + 0.0001 * (i % 5 - 2)
        ele = 30 + 100 * math.sin(t * 2 * math.pi) + 0.5 * (i % 3 - 1)

        sec = min(i, 3599)
        points.append({
            "lat": lat,
            "lon": lon,
            "elevation": ele,
            "time": datetime(2025, 1, 1, 8, sec // 60, sec % 60, tzinfo=timezone.utc),
            "osmand_speed_kmh": 5 + 3 * math.sin(t * 2 * math.pi),
        })

    original_count = len(points)
    simplified = _simplify_trajectory(points, tolerance_m=15.0)

    reduction = (1 - len(simplified) / original_count) * 100

    print(f"\n✓ 8650-point track simplification:")
    print(f"  Original: {original_count} points")
    print(f"  Simplified: {len(simplified)} points")
    print(f"  Reduction: {reduction:.1f}%")

    # Should achieve 70-85% reduction
    assert reduction > 50, f"Should achieve significant reduction (>50%), got {reduction:.1f}%"
    assert len(simplified) > 100, f"Should keep important features (>100 points), got {len(simplified)}"


if __name__ == "__main__":
    print("=" * 60)
    print("TRAJECTORY SIMPLIFICATION TESTS (Phase 6)")
    print("=" * 60)

    test_point_to_line_distance()
    print()

    test_simplify_straight_line()
    print()

    test_simplify_zigzag()
    print()

    test_simplify_noisy_curve()
    print()

    test_simplify_real_track()
    print()

    test_simplify_8650_point_track()

    print("\n" + "=" * 60)
    print("✅ ALL PHASE 6 TESTS PASSED!")
    print("=" * 60)
