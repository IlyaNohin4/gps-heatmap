import { useEffect, useRef, memo } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { MAP_ANIMATIONS } from '../config/mapAnimations.js';
import { escapeHtml } from '../utils/escapeHtml.js';

const TRACK_COLORS = [
  '#007aff', '#34c759', '#ff9500', '#af52de',
  '#ff2d55', '#5856d6', '#00c7be', '#ffcc00',
];

function colorForIndex(i) {
  return TRACK_COLORS[i % TRACK_COLORS.length];
}

const TrackLayer = memo(function TrackLayer({ tracks, selectedTrackId, showHeatmap }) {
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

    tracks.forEach((track, idx) => {
      const pts = track.normalized_points || track.raw_points || [];
      if (!pts.length) return;

      const latlngs = pts.map((p) => [p.lat, p.lon]);
      const isSelected = track.id === selectedTrackId;
      const color = showHeatmap ? '#007aff' : (isSelected ? '#007aff' : colorForIndex(idx));

      const line = L.polyline(latlngs, {
        color,
        weight: isSelected ? 6 : 4,
        opacity: isSelected ? 1 : 0.7,
      });

      line.bindTooltip(escapeHtml(track.name || 'Track'), { sticky: true, offset: [0, -4] });
      line.addTo(group);

      // Start marker (green circle with play icon)
      if (pts.length > 0) {
        const startIcon = L.divIcon({
          html: `<div style="width: 18px; height: 18px; background: #34c759; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 0 2px white; border: 1px solid #000;">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/></svg>
          </div>`,
          iconSize: [18, 18],
          className: 'track-start-marker',
        });
        L.marker([pts[0].lat, pts[0].lon], { icon: startIcon }).addTo(group);
      }

      // End marker (white circle with black flag icon)
      if (pts.length > 1) {
        const endIcon = L.divIcon({
          html: `<div style="width: 18px; height: 18px; background: #ffffff; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 0 2px white; border: 1px solid #000;">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528"/></svg>
          </div>`,
          iconSize: [18, 18],
          className: 'track-end-marker',
        });
        L.marker([pts[pts.length - 1].lat, pts[pts.length - 1].lon], { icon: endIcon }).addTo(group);
      }
    });
  }, [tracks, selectedTrackId, map, showHeatmap]);

  return null;
});

export default TrackLayer;
