import { useEffect, useRef, memo } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';

// Visit count coloring via heatmap gradient:
// blue (1 visit) → green (2-3) → yellow (4-5) → red (5+)
const GRADIENT = {
  0.15: '#007aff',
  0.40: '#34c759',
  0.65: '#ffcc00',
  0.85: '#ff9500',
  1.00: '#ff3b30',
};

const VisitLayer = memo(function VisitLayer({ tracks }) {
  const map = useMap();
  const heatRef = useRef(null);

  useEffect(() => {
    // Collect all points from all tracks with equal intensity
    const points = [];
    tracks.forEach((track) => {
      const pts = track.normalized_points || track.raw_points || [];
      pts.forEach((pt) => {
        if (pt.lat !== undefined && pt.lon !== undefined) {
          points.push([pt.lat, pt.lon, 1]);
        }
      });
    });

    if (heatRef.current) {
      heatRef.current.remove();
      heatRef.current = null;
    }

    if (points.length > 0) {
      heatRef.current = L.heatLayer(points, {
        radius: 18,
        blur: 15,
        maxZoom: 17,
        max: 1,
        gradient: GRADIENT,
      }).addTo(map);
    }

    return () => {
      if (heatRef.current) {
        heatRef.current.remove();
        heatRef.current = null;
      }
    };
  }, [map, tracks]);

  return null;
});

export default VisitLayer;
