"""Test elevation smoothing filter."""

from datetime import datetime, timezone
from app.services.parser_factory import _smooth_elevation


def test_smooth_elevation_removes_noise():
    """Test that Savitzky-Golay filter removes GPS noise while preserving trend."""

    # Create synthetic GPS data with noise
    # Real elevation: 100m constant, then climb to 150m, then down to 100m
    # GPS noise: ±3m random variation
    points = [
        # Flat section with noise
        {"lat": 55.0, "lon": 37.0, "elevation": 100.0, "time": datetime(2025, 1, 1, 10, 0, 0, tzinfo=timezone.utc)},
        {"lat": 55.0, "lon": 37.0, "elevation": 99.0,  "time": datetime(2025, 1, 1, 10, 0, 10, tzinfo=timezone.utc)},
        {"lat": 55.0, "lon": 37.0, "elevation": 102.0, "time": datetime(2025, 1, 1, 10, 0, 20, tzinfo=timezone.utc)},
        {"lat": 55.0, "lon": 37.0, "elevation": 98.0,  "time": datetime(2025, 1, 1, 10, 0, 30, tzinfo=timezone.utc)},
        {"lat": 55.0, "lon": 37.0, "elevation": 101.0, "time": datetime(2025, 1, 1, 10, 0, 40, tzinfo=timezone.utc)},
        # Climb section
        {"lat": 55.0, "lon": 37.0, "elevation": 110.0, "time": datetime(2025, 1, 1, 10, 1, 0, tzinfo=timezone.utc)},
        {"lat": 55.0, "lon": 37.0, "elevation": 120.0, "time": datetime(2025, 1, 1, 10, 1, 10, tzinfo=timezone.utc)},
        {"lat": 55.0, "lon": 37.0, "elevation": 130.0, "time": datetime(2025, 1, 1, 10, 1, 20, tzinfo=timezone.utc)},
        {"lat": 55.0, "lon": 37.0, "elevation": 140.0, "time": datetime(2025, 1, 1, 10, 1, 30, tzinfo=timezone.utc)},
        {"lat": 55.0, "lon": 37.0, "elevation": 150.0, "time": datetime(2025, 1, 1, 10, 1, 40, tzinfo=timezone.utc)},
        # Descent section
        {"lat": 55.0, "lon": 37.0, "elevation": 140.0, "time": datetime(2025, 1, 1, 10, 2, 0, tzinfo=timezone.utc)},
        {"lat": 55.0, "lon": 37.0, "elevation": 130.0, "time": datetime(2025, 1, 1, 10, 2, 10, tzinfo=timezone.utc)},
        {"lat": 55.0, "lon": 37.0, "elevation": 120.0, "time": datetime(2025, 1, 1, 10, 2, 20, tzinfo=timezone.utc)},
        {"lat": 55.0, "lon": 37.0, "elevation": 110.0, "time": datetime(2025, 1, 1, 10, 2, 30, tzinfo=timezone.utc)},
        {"lat": 55.0, "lon": 37.0, "elevation": 100.0, "time": datetime(2025, 1, 1, 10, 2, 40, tzinfo=timezone.utc)},
    ]

    # Apply smoothing
    smoothed = _smooth_elevation(points, window=5)

    # Extract raw and smoothed elevations
    raw_eles = [p["elevation"] for p in points]
    smooth_eles = [p["elevation"] for p in smoothed]

    # Test 1: Check that smoothing happened (values should be different)
    assert any(abs(raw_eles[i] - smooth_eles[i]) > 0.01 for i in range(len(raw_eles))), \
        "Smoothing should have changed at least some elevation values"

    # Test 2: Check that main trend is preserved
    # First section should be ~100m
    assert 98 < smooth_eles[0] < 102, f"Start elevation should be ~100m, got {smooth_eles[0]}"

    # Middle section should be ~150m
    assert 145 < smooth_eles[9] < 155, f"Peak elevation should be ~150m, got {smooth_eles[9]}"

    # Last section should be ~100m
    assert 98 < smooth_eles[-1] < 102, f"End elevation should be ~100m, got {smooth_eles[-1]}"

    # Test 3: Smoothed curve should be smoother (lower variance in flat sections)
    # Calculate variance in first 5 points (flat section)
    raw_var_flat = sum((raw_eles[i] - 100) ** 2 for i in range(5)) / 5
    smooth_var_flat = sum((smooth_eles[i] - 100) ** 2 for i in range(5)) / 5

    assert smooth_var_flat < raw_var_flat, \
        f"Smoothed variance ({smooth_var_flat}) should be less than raw ({raw_var_flat})"

    print(f"✓ Test passed!")
    print(f"  Raw elevation variance (flat): {raw_var_flat:.2f}")
    print(f"  Smoothed elevation variance (flat): {smooth_var_flat:.2f}")
    print(f"  Reduction: {(1 - smooth_var_flat/raw_var_flat)*100:.1f}%")


def test_elevation_gain_calculation():
    """Test that smoothing reduces false elevation gain from noise."""
    # GPS data with noise: supposed to be flat at 100m
    points_noisy = [
        {"lat": 55.0 + i*0.001, "lon": 37.0, "elevation": 100 + (1 if i%3==0 else -1),
         "time": datetime(2025, 1, 1, 10, 0, min(i*5, 59), tzinfo=timezone.utc)}
        for i in range(10)
    ]

    points_smooth = _smooth_elevation(points_noisy, window=5)

    # Calculate elevation gain
    def calc_elevation_gain(points):
        gain = 0
        for i in range(1, len(points)):
            if points[i].get('elevation') and points[i-1].get('elevation'):
                diff = points[i]['elevation'] - points[i-1]['elevation']
                if diff > 0:
                    gain += diff
        return gain

    gain_noisy = calc_elevation_gain(points_noisy)
    gain_smooth = calc_elevation_gain(points_smooth)

    print(f"\nElevation gain test:")
    print(f"  Noisy: {gain_noisy:.1f}m (false gain from noise)")
    print(f"  Smoothed: {gain_smooth:.1f}m (correct, nearly 0)")

    # Smoothed should have much less false gain
    assert gain_smooth < gain_noisy * 0.5, \
        f"Smoothed gain should be much less than noisy. Smooth={gain_smooth}, Noisy={gain_noisy}"

    print(f"  Reduction: {(1 - gain_smooth/gain_noisy)*100:.1f}%")


if __name__ == "__main__":
    test_smooth_elevation_removes_noise()
    test_elevation_gain_calculation()
    print("\n✅ All elevation smoothing tests passed!")
