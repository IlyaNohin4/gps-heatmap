import { useEffect, useRef } from 'react';
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

export default function SpeedLayer({ tracks }) {
  const map = useMap();
  const groupRef = useRef(null);

  useEffect(() => {
    const group = L.layerGroup().addTo(map);
    groupRef.current = group;
    return () => group.remove();
  }, [map]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    group.clearLayers();

    tracks.forEach((track) => {
      const segments = track.speed_segments || [];
      if (!segments.length) {
        // Fallback: draw normalized_points with a single color
        const pts = track.normalized_points || track.raw_points || [];
        if (pts.length) {
          L.polyline(pts.map((p) => [p.lat, p.lon]), {
            color: speedToColor(track.speed_avg ? track.speed_avg * 3.6 : 0),
            weight: 4,
            opacity: 0.85,
          }).addTo(group);
        }
        return;
      }

      segments.forEach((seg) => {
        if (!seg.from || !seg.to) return;
        const color = speedToColor(seg.speed_kmh ?? 0);
        L.polyline([seg.from, seg.to], {
          color,
          weight: 4,
          opacity: 0.85,
        })
          .bindTooltip(`${(seg.speed_kmh ?? 0).toFixed(1)} km/h`, { sticky: true })
          .addTo(group);
      });
    });
  }, [tracks]);

  return null;
}

// Speed legend data (exported for UI use)
export const SPEED_LEGEND = BREAKPOINTS.map((b) => ({
  label: b.kmh === 0 ? '0' : `${b.kmh}+`,
  color: `rgb(${b.rgb.join(',')})`,
}));
