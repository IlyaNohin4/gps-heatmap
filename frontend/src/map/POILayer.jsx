import { useEffect, useRef, useMemo } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

import useMapStore from '../store/mapStore.js';
import { fetchPOI } from '../api/poi.js';

const CATEGORY_COLORS = {
  food: '#ff9500',
  water: '#007aff',
  repair: '#5856d6',
  bike: '#34c759',
  medical: '#ff3b30',
  shelter: '#af52de',
  other: '#8e8e93',
};

function makeDivIcon(category, color) {
  const iconEmoji = {
    food: '🍴',
    water: '💧',
    repair: '🔧',
    bike: '🚲',
    medical: '🏥',
    shelter: '🏔️',
    other: '📍',
  }[category] || '📍';

  return L.divIcon({
    html: `<div style="
      width:32px;height:32px;border-radius:50%;
      background:${color};
      border:3px solid #fff;
      box-shadow:0 2px 8px rgba(0,0,0,0.4);
      display:flex;align-items:center;justify-content:center;
      font-size:16px;line-height:1;
    ">${iconEmoji}</div>`,
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
}

export default function POILayer() {
  const map = useMap();
  const { visibleImports, pois } = useMapStore();
  const groupRef = useRef(null);

  // Create layer group on mount
  useEffect(() => {
    const group = L.layerGroup().addTo(map);
    groupRef.current = group;
    return () => group.remove();
  }, [map]);

  // Re-render when POI or visible imports change
  useEffect(() => {
    renderPOI();
  }, [pois, visibleImports]);

  function renderPOI() {
    if (!groupRef.current) return;

    groupRef.current.clearLayers();

    // Show all POI (user-created and imported)
    const visiblePOI = pois.filter((poi) => {
      // Show all user POI regardless of source
      return true;
    });

    visiblePOI.forEach((poi) => {
      const category = poi.category?.toLowerCase() || 'other';
      const color = CATEGORY_COLORS[category] || CATEGORY_COLORS.other;
      const icon = makeDivIcon(category, color);

      L.marker([poi.lat, poi.lon], { icon })
        .bindPopup(`
          <div style="font-size: 12px; max-width: 200px;">
            <strong>${poi.name}</strong>
            <br><small style="color: #666;">${category}</small>
            ${poi.description ? `<br><small>${poi.description}</small>` : ''}
          </div>
        `)
        .addTo(groupRef.current);
    });
  }

  return null;
}
