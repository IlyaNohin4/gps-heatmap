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

const HeatmapLayer = memo(function HeatmapLayer({ tracks }) {
  const map = useMap();
  const layerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const group = L.layerGroup();
    // Chains are now merged into continuous multi-point paths (few dozen
    // objects, not thousands of grid segments), so the default SVG renderer
    // is affordable again — its vector strokes render crisper than
    // L.canvas()'s rasterized, more anti-aliased edges, and it resolves
    // CSS custom properties like 'var(--accent)' directly.
    fetchRoadUsage().then((data) => {
      if (cancelled) return;
      const chains = [...(data.chains || [])].sort((a, b) => a.count - b.count);
      chains.forEach((chain) => {
        L.polyline(chain.points, {
          weight: LINE_WEIGHT,
          color: 'var(--accent)',
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
  }, [tracks, map]);

  return null;
});

export default HeatmapLayer;
