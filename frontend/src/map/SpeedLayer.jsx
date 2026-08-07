import { useEffect, useRef, memo } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { fetchSpeedUsage } from '../api/tracks.js';
import useAppStore from '../store/appStore.js';
import useMapStore from '../store/mapStore.js';

// Speed breakpoints with RGB colors
const BREAKPOINTS = [
  { kmh: 0,   rgb: [155, 155, 155] }, // gray
  { kmh: 10,  rgb: [0,   122, 255] }, // blue
  { kmh: 30,  rgb: [52,  199,  89] }, // green
  { kmh: 60,  rgb: [255, 204,   0] }, // yellow
  { kmh: 90,  rgb: [255, 149,   0] }, // orange
  { kmh: 120, rgb: [255,  59,  48] }, // red
];

const KMH_TO_MPH = 0.621371;

function colorForBucket(bucket) {
  const tier = BREAKPOINTS[bucket] || BREAKPOINTS[BREAKPOINTS.length - 1];
  return `rgb(${tier.rgb.join(',')})`;
}

function speedLabel(kmh, unitSystem) {
  return unitSystem === 'imperial'
    ? `${(kmh * KMH_TO_MPH).toFixed(1)} mph`
    : `${kmh.toFixed(1)} km/h`;
}

// Hover hit radius in *screen pixels*, not real-world meters — a fixed
// meters threshold made the popup effectively unhittable at anything but
// close-in zoom (25m is under a pixel wide when zoomed out, so the mouse
// could never land within it), and pointless-loose at close zoom. Pixel
// distance is what the cursor is actually doing, at any zoom level.
const HOVER_PIXEL_RADIUS = 12;

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
  const unitSystem = useAppStore((s) => s.unitSystem);
  const trackDetailCache = useMapStore((s) => s.trackDetailCache);
  // Flat {lat, lon, speed_kmh} list built from the real per-point track
  // data (mapStore.trackDetailCache, loaded in bulk via /geometries at app
  // start — see MapContainer's loadAllGeometries) — not the /speed-usage
  // chains below, which are merged by speed *tier* across tracks for
  // drawing and no longer carry an exact per-point value. Rebuilt only when
  // the cache changes, not on every mousemove.
  const pointsRef = useRef([]);

  useEffect(() => {
    const pts = [];
    Object.values(trackDetailCache).forEach((track) => {
      (track.normalized_points || []).forEach((p) => {
        if (p.speed_kmh != null) pts.push(p);
      });
    });
    pointsRef.current = pts;
  }, [trackDetailCache]);

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
          // Not interactive — hover is handled by the map-wide mousemove
          // + grid lookup below, not per-chain hit-testing, so there's no
          // need to pay canvas hit-test cost per polyline here.
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

  // Hover popup — nearest real track point to the cursor, within
  // HOVER_THRESHOLD_M, shows its exact speed_kmh.
  useEffect(() => {
    if (!map) return;

    const tooltip = L.tooltip({ sticky: true, direction: 'top', offset: [0, -8] });
    let shown = false;
    let raf = null;

    function findNearest(cursorPx) {
      const pts = pointsRef.current;
      let best = null;
      let bestDistSq = Infinity;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const px = map.latLngToContainerPoint([p.lat, p.lon]);
        const dx = px.x - cursorPx.x;
        const dy = px.y - cursorPx.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < bestDistSq) {
          bestDistSq = distSq;
          best = p;
        }
      }
      return bestDistSq <= HOVER_PIXEL_RADIUS * HOVER_PIXEL_RADIUS ? best : null;
    }

    function handleMove(e) {
      if (raf) return; // throttle to one lookup per animation frame
      raf = requestAnimationFrame(() => {
        raf = null;
        const nearest = findNearest(map.latLngToContainerPoint(e.latlng));
        if (nearest) {
          tooltip.setContent(speedLabel(nearest.speed_kmh, unitSystem));
          tooltip.setLatLng(e.latlng);
          if (!shown) {
            tooltip.addTo(map);
            shown = true;
          }
        } else if (shown) {
          map.removeLayer(tooltip);
          shown = false;
        }
      });
    }

    map.on('mousemove', handleMove);
    return () => {
      map.off('mousemove', handleMove);
      if (raf) cancelAnimationFrame(raf);
      if (shown) map.removeLayer(tooltip);
    };
  }, [map, unitSystem]);

  return null;
});

export default SpeedLayer;

// Speed legend data (exported for UI use)
export const SPEED_LEGEND = BREAKPOINTS.map((b) => ({
  label: b.kmh === 0 ? '0' : `${b.kmh}+`,
  color: `rgb(${b.rgb.join(',')})`,
}));
