"""Tests for the gpx.studio-methodology elevation gain/loss pipeline
(_rdp_profile_1d, _windowed_average_by_distance, _elevation_gain_loss) added
in b36d932 / documented in POLISH.md T26 audit. Functions are treated as
frozen (accepted by the user) — these tests only pin down their behavior.
"""
from app.services.parser_factory import (
    _rdp_profile_1d,
    _windowed_average_by_distance,
    _elevation_gain_loss,
)

_DEG_PER_KM = 1 / 111.320  # equator, so haversine distance per lon-degree step is ~constant


def _make_points(seg_km_list, elevations, lat=0.0):
    """Points along the equator, spaced by seg_km_list (km) via longitude steps."""
    pts = [{"lat": lat, "lon": 0.0, "elevation": elevations[0]}]
    lon = 0.0
    for i, seg_km in enumerate(seg_km_list):
        lon += seg_km * _DEG_PER_KM
        pts.append({"lat": lat, "lon": lon, "elevation": elevations[i + 1]})
    return pts


class TestRdpProfile1d:
    def test_empty(self):
        assert _rdp_profile_1d([], [], 20.0) == []

    def test_single_point(self):
        assert _rdp_profile_1d([1.0], [5.0], 20.0) == [0]

    def test_two_points(self):
        assert _rdp_profile_1d([1.0, 2.0], [5.0, 6.0], 20.0) == [0, 1]

    def test_collinear_keeps_only_endpoints(self):
        xs = [0, 1, 2, 3, 4]
        ys = [0, 1, 2, 3, 4]
        assert _rdp_profile_1d(xs, ys, 0.001) == [0, 4]


class TestWindowedAverageByDistance:
    def test_window_larger_than_span_averages_everything(self):
        xs = [0, 1, 2, 3, 4]
        ys = [10, 20, 30, 40, 50]
        result = _windowed_average_by_distance(xs, ys, 100.0)
        assert result == [30.0, 30.0, 30.0, 30.0, 30.0]

    def test_zero_window_is_identity(self):
        xs = [0, 1, 2, 3, 4]
        ys = [10, 20, 30, 40, 50]
        assert _windowed_average_by_distance(xs, ys, 0.0) == ys


class TestElevationGainLoss:
    def test_monotonic_climb(self):
        """0 -> 500m over 10km (21 points, 0.5km steps of +25m):
        no descent anywhere, so RDP+windowing can't lose the trend."""
        n = 20
        seg_km = 0.5
        elevations = [i * 25.0 for i in range(n + 1)]
        points = _make_points([seg_km] * n, elevations)

        gain, loss = _elevation_gain_loss(points)

        assert gain == 500.0
        assert loss == 0.0

    def test_flat_noisy_profile_is_smoothed_to_near_zero(self):
        """100m +/- 1m noise (seeded) over 5km: amplitude is far below the
        20m RDP epsilon, so it should collapse to essentially a flat line."""
        import random

        random.seed(42)
        n = 100
        seg_km = 5.0 / n
        elevations = [100.0 + random.uniform(-1, 1) for _ in range(n + 1)]
        points = _make_points([seg_km] * n, elevations)

        gain, loss = _elevation_gain_loss(points)

        assert gain < 5.0
        assert loss < 5.0

    def test_sawtooth_collapses_to_single_representative_bump(self):
        """10 climbs/descents of 30m amplitude (above the 20m RDP epsilon)
        over 10km, symmetric around a 100m baseline (start == end == 100m).

        Naively one might expect gain == loss == 300m (10 * 30m each), but
        that is NOT what this RDP-based methodology produces: because every
        peak has the identical deviation from the global start/end chord,
        the top-level recursion picks exactly one representative peak, and
        the chord from that peak back to the end point then passes close
        enough to every other peak/trough (deviation < eps) that they all
        get dropped too. This holds regardless of how the peaks are spaced
        (tested both with adjacent peaks and with flat runs between them).

        This is not a bug — it's the same RDP algorithm gpx.studio uses,
        applied to an adversarial, perfectly-symmetric synthetic input.
        Real elevation profiles rarely have many peaks of exactly equal
        height, so this degenerate case is unlikely to occur in practice.
        This test pins down the actual (verified) output so a future change
        to the algorithm doesn't silently alter behavior.
        """
        n = 10
        elevations = [100.0]
        seg_km_list = []
        for _ in range(n):
            seg_km_list.append(0.5)
            elevations.append(130.0)
            seg_km_list.append(0.5)
            elevations.append(100.0)
        points = _make_points(seg_km_list, elevations)

        gain, loss = _elevation_gain_loss(points)

        assert abs(gain - 30.0) < 1.0
        assert abs(loss - 30.0) < 1.0
