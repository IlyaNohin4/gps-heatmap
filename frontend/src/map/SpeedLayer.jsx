import { useEffect, useRef, memo } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { fetchSpeedUsage } from '../api/tracks.js';

// Speed breakpoints with RGB colors
const BREAKPOINTS = [
  { kmh: 0,   rgb: [155, 155, 155] }, // gray
  { kmh: 10,  rgb: [0,   122, 255] }, // blue
  { kmh: 30,  rgb: [52,  199,  89] }, // green
  { kmh: 60,  rgb: [255, 204,   0] }, // yellow
  { kmh: 90,  rgb: [255, 149,   0] }, // orange
  { kmh: 120, rgb: [255,  59,  48] }, // red
];

function colorForBucket(bucket) {
  const tier = BREAKPOINTS[bucket] || BREAKPOINTS[BREAKPOINTS.length - 1];
  return `rgb(${tier.rgb.join(',')})`;
}

const LINE_WEIGHT = 4;

// Line-based speed usage, mirroring HeatmapLayer.jsx's road-usage approach:
// chains come pre-aggregated from GET /api/tracks/speed-usage (grid-keyed
// and merged by speed tier on the backend, both along a single track and
// across different tracks passing the same spot at a similar speed) so
// Speed mode draws a countable number of polylines instead of one per raw
// GPS point pair. The old per-point-pair approach was tens of thousands of
// Leaflet Path objects with 116 tracks — reprojecting all of them on every
// pan/zoom frame was the actual bottleneck, not renderer choice or rebuild
// frequency (see 2026-08-06 perf profiling; a frontend-only run-length
// merge along each track individually wasn't enough, because GPS speed
// noise flickers across tiers within one track far more than it stays
// put — merging across tracks too, like /road-usage already did, is what
// actually cuts the object count).
const SpeedLayer = memo(function SpeedLayer({ tracksListVersion }) {
  const map = useMap();
  const layerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    // One shared L.canvas() renderer for every chain — a fresh L.canvas()
    // per polyline would mean a separate <canvas> per line, defeating the
    // point of switching off SVG in the first place.
    const renderer = L.canvas();
    const group = L.layerGroup();
    fetchSpeedUsage().then((data) => {
      if (cancelled) return;
      const chains = data.chains || [];
      chains.forEach((chain) => {
        L.polyline(chain.points, {
          renderer,
          weight: LINE_WEIGHT,
          color: colorForBucket(chain.bucket),
          opacity: 0.85,
          interactive: false,
        }).addTo(group);
      });
    });

    group.addTo(map);
    layerRef.current = group;

    return () => {
      cancelled = true;
      group.remove();
    };
  // tracksListVersion (not a `tracks` array) on purpose — see
  // HeatmapLayer.jsx's identical comment. This layer fetches its own
  // aggregated data from /speed-usage regardless of what's passed in.
  }, [tracksListVersion, map]);

  return null;
});

export default SpeedLayer;

// Speed legend data (exported for UI use)
export const SPEED_LEGEND = BREAKPOINTS.map((b) => ({
  label: b.kmh === 0 ? '0' : `${b.kmh}+`,
  color: `rgb(${b.rgb.join(',')})`,
}));
