import { useEffect, useRef, memo } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { fetchRoadUsage } from '../api/tracks.js';

// Line-based road usage: same road drawn once as a normal-width polyline,
// with opacity growing by how many distinct tracks passed over it — busy
// roads read as a solid accent color, rarely-used ones fade almost away.
// Chains come pre-aggregated from GET /api/tracks/road-usage (grid-keyed and
// merged into continuous multi-point paths on the backend) so a road reads
// as one line instead of a string of visibly-jointed short segments, and
// stays cheap to render even with many tracks.
const MIN_OPACITY = 0.35;
const OPACITY_STEP = 0.2;
const LINE_WEIGHT = 4;

function opacityForCount(count) {
  return Math.min(MIN_OPACITY + count * OPACITY_STEP, 1);
}

const HeatmapLayer = memo(function HeatmapLayer({ tracksListVersion }) {
  const map = useMap();
  const layerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    // One shared L.canvas() renderer for every chain: with real-world track
    // counts, road-usage chains can run into the thousands (see backend's
    // grid-merge in /road-usage) — that many separate <path> elements under
    // the default SVG renderer is the difference between smooth and "дико
    // лагает" (see perf profile, 2026-08-06). All polylines must share one
    // renderer instance, not get their own L.canvas() each — a fresh one
    // per call would mean a separate <canvas> per line, which defeats the
    // point entirely.
    const renderer = L.canvas();
    const group = L.layerGroup();
    fetchRoadUsage().then((data) => {
      if (cancelled) return;
      const chains = [...(data.chains || [])].sort((a, b) => a.count - b.count);
      chains.forEach((chain) => {
        L.polyline(chain.points, {
          renderer,
          weight: LINE_WEIGHT,
          color: '#002287',
          opacity: opacityForCount(chain.count),
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
  // tracksListVersion (not a `tracks` array) on purpose: this layer fetches
  // its own aggregated data from /road-usage regardless of what's passed
  // in, so it only needs to know "did the track list actually change" —
  // not be handed a fresh-identity array on every unrelated re-render of
  // MapContainer (selecting a track, a toast firing, hovering a POI, …).
  // The old `tracks` prop looked like a real dependency but wasn't one;
  // MapContainer built a brand-new array every render, so this effect —
  // and the full teardown/rebuild of every chain's polyline it does, via
  // Leaflet's internal `_layers` object — reran constantly rather than
  // only when tracks were actually added/removed.
  }, [tracksListVersion, map]);

  return null;
});

export default HeatmapLayer;
