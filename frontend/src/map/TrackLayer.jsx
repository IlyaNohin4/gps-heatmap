import { useEffect, useRef, memo } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { MAP_ANIMATIONS } from '../config/mapAnimations.js';

const TRACK_COLORS = [
  '#007aff', '#34c759', '#ff9500', '#af52de',
  '#ff2d55', '#5856d6', '#00c7be', '#ffcc00',
];

function colorForIndex(i) {
  return TRACK_COLORS[i % TRACK_COLORS.length];
}

const TrackLayer = memo(function TrackLayer({ tracks, selectedTrackId }) {
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
      const color = colorForIndex(idx);

      const line = L.polyline(latlngs, {
        color,
        weight: isSelected ? 5 : 3,
        opacity: isSelected ? 1 : 0.7,
      });

      line.bindTooltip(track.name || 'Track', { sticky: true, offset: [0, -4] });
      line.addTo(group);
    });
  }, [tracks, selectedTrackId, map]);

  return null;
});

export default TrackLayer;
