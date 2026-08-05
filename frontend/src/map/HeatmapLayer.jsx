import { useEffect, useRef, memo } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';

// Density-based heatmap (uMap-style): every point of every visible track
// feeds a single L.heatLayer instead of drawing faint overlapping polylines
// — the more tracks passed through an area, the "hotter" it reads.
const HeatmapLayer = memo(function HeatmapLayer({ tracks }) {
  const map = useMap();
  const layerRef = useRef(null);

  useEffect(() => {
    const points = [];
    tracks.forEach((track) => {
      (track.normalized_points || []).forEach((p) => {
        points.push([p.lat, p.lon, 0.5]);
      });
    });

    const layer = L.heatLayer(points, {
      radius: 18,
      blur: 22,
      maxZoom: 17,
      minOpacity: 0.35,
      gradient: {
        0.2: '#3b82f6',
        0.4: '#22d3ee',
        0.6: '#facc15',
        0.8: '#fb923c',
        1.0: '#ef4444',
      },
    }).addTo(map);
    layerRef.current = layer;
    // leaflet.heat's canvas defaults to pointer-events: auto, which silently
    // eats clicks/drags meant for the map underneath (pan, zoom, right-click
    // menu) — the heatmap is purely visual, so let events pass through it.
    if (layer._canvas) layer._canvas.style.pointerEvents = 'none';

    return () => layer.remove();
  }, [tracks, map]);

  return null;
});

export default HeatmapLayer;
