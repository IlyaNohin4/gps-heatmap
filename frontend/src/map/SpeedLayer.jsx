import { useEffect, useRef, memo } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

// Speed breakpoints with RGB colors
const BREAKPOINTS = [
  { kmh: 0,   rgb: [155, 155, 155] }, // gray
  { kmh: 10,  rgb: [0,   122, 255] }, // blue
  { kmh: 30,  rgb: [52,  199,  89] }, // green
  { kmh: 60,  rgb: [255, 204,   0] }, // yellow
  { kmh: 90,  rgb: [255, 149,   0] }, // orange
  { kmh: 120, rgb: [255,  59,  48] }, // red
];

function speedToColor(kmh) {
  const v = Math.max(0, kmh);
  for (let i = 1; i < BREAKPOINTS.length; i++) {
    const lo = BREAKPOINTS[i - 1];
    const hi = BREAKPOINTS[i];
    if (v <= hi.kmh) {
      const t = (v - lo.kmh) / (hi.kmh - lo.kmh);
      const r = Math.round(lo.rgb[0] + t * (hi.rgb[0] - lo.rgb[0]));
      const g = Math.round(lo.rgb[1] + t * (hi.rgb[1] - lo.rgb[1]));
      const b = Math.round(lo.rgb[2] + t * (hi.rgb[2] - lo.rgb[2]));
      return `rgb(${r},${g},${b})`;
    }
  }
  return 'rgb(255,59,48)';
}

// Which BREAKPOINTS tier a speed falls into — used to run-length-merge
// consecutive same-tier points into one polyline instead of one per point
// pair (see SpeedLayer below). Real GPS speed noise flickers within a
// tier far more than it crosses tiers, so this collapses node count
// substantially without changing what's visible: speedToColor already
// quantizes color perception to these same tiers.
function bucketForSpeed(kmh) {
  const v = Math.max(0, kmh);
  for (let i = 1; i < BREAKPOINTS.length; i++) {
    if (v <= BREAKPOINTS[i].kmh) return i;
  }
  return BREAKPOINTS.length - 1;
}

const SpeedLayer = memo(function SpeedLayer({ tracks }) {
  const map = useMap();
  const groupRef = useRef(null);
  const rendererRef = useRef(null);

  useEffect(() => {
    // One shared L.canvas() renderer for every segment of every track —
    // under the default SVG renderer, a segment-per-point-pair layer (no
    // backend-side merging here, unlike the heatmap's /road-usage chains)
    // means one <path> DOM node per pair of GPS points. With 116 tracks at
    // hundreds of points each that's tens of thousands of nodes Leaflet has
    // to reproject on every pan/zoom frame — that per-frame cost, not how
    // often the layer gets rebuilt, was the actual bottleneck (see
    // 2026-08-06 perf profiling: fixing the rebuild-churn in MapContainer's
    // useVisibleTracks didn't help Speed mode at all). Canvas redraws in a
    // single paint instead of touching each node individually.
    rendererRef.current = L.canvas();
    const group = L.layerGroup().addTo(map);
    groupRef.current = group;
    return () => group.remove();
  }, [map]);

  useEffect(() => {
    const group = groupRef.current;
    const renderer = rendererRef.current;
    if (!group || !renderer) return;
    group.clearLayers();

    tracks.forEach((track) => {
      const points = track.normalized_points || [];
      if (points.length < 2) return;

      // speed_kmh is written onto each point during processing (see
      // _build_segments in parser_factory.py) instead of shipped as a
      // separate speed_segments array — no need to duplicate every
      // from/to coordinate that's already in normalized_points. Tracks
      // processed before that change simply have no speed_kmh on their
      // points yet; fall back to a single average-speed color for those
      // until they're reprocessed/backfilled.
      const hasPointSpeed = points.some((p) => p.speed_kmh !== undefined && p.speed_kmh !== null);
      if (!hasPointSpeed) {
        L.polyline(points.map((p) => [p.lat, p.lon]), {
          renderer,
          color: speedToColor(track.speed_avg ? track.speed_avg * 3.6 : 0),
          weight: 4,
          opacity: 0.85,
        }).addTo(group);
        return;
      }

      // Run-length merge: walk the track once, accumulating consecutive
      // points that fall in the same speed tier into a single multi-point
      // polyline (colored by that run's average speed) instead of creating
      // a separate Path object per raw point pair. A 116-track, hundreds-
      // of-points-each set of tracks was tens of thousands of individual
      // Path objects Leaflet had to reproject on every pan/zoom frame —
      // switching the renderer to canvas alone didn't fix that per-frame
      // reprojection cost (2026-08-06 perf profiling). This cuts the
      // object count to roughly "number of tier transitions" per track,
      // which for real (not adversarially noisy) GPS traces is far lower
      // than "number of points".
      let runBucket = null;
      let runPoints = [];
      let runSpeeds = [];

      const flushRun = () => {
        if (runPoints.length < 2) return;
        const avgSpeed = runSpeeds.reduce((a, b) => a + b, 0) / runSpeeds.length;
        L.polyline(runPoints, {
          renderer,
          color: speedToColor(avgSpeed),
          weight: 4,
          opacity: 0.85,
          interactive: false,
        }).addTo(group);
      };

      for (let i = 1; i < points.length; i++) {
        const p0 = points[i - 1];
        const p1 = points[i];
        const speed = p1.speed_kmh ?? 0;
        const bucket = bucketForSpeed(speed);

        if (bucket !== runBucket) {
          flushRun();
          runBucket = bucket;
          // Start the new run from p0 too, so it connects visually to
          // where the previous run's line ended instead of leaving a gap.
          runPoints = [[p0.lat, p0.lon], [p1.lat, p1.lon]];
          runSpeeds = [speed];
        } else {
          runPoints.push([p1.lat, p1.lon]);
          runSpeeds.push(speed);
        }
      }
      flushRun();
    });
  }, [tracks]);

  return null;
});

export default SpeedLayer;

// Speed legend data (exported for UI use)
export const SPEED_LEGEND = BREAKPOINTS.map((b) => ({
  label: b.kmh === 0 ? '0' : `${b.kmh}+`,
  color: `rgb(${b.rgb.join(',')})`,
}));
