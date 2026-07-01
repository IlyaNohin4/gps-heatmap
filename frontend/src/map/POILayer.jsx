import { useEffect, useRef, useCallback, useMemo } from 'react';
import { useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

export const POI_CATEGORIES = [
  { id: 'food',      label: 'Food & Drink',      color: '#ff9500', icon: '🍴', query: 'amenity~"restaurant|cafe|bar|fast_food|pub"' },
  { id: 'amenity',   label: 'Amenities',          color: '#007aff', icon: '🏪', query: 'amenity~"atm|bank|fuel|parking|toilets|post_office"' },
  { id: 'medical',   label: 'Medical',            color: '#ff3b30', icon: '🏥', query: 'amenity~"hospital|clinic|pharmacy|doctors"' },
  { id: 'tourism',   label: 'Tourism',            color: '#af52de', icon: '🏛️', query: 'tourism~"attraction|museum|viewpoint|hotel|hostel"' },
  { id: 'bicycle',   label: 'Bicycle',            color: '#34c759', icon: '🚲', query: 'amenity~"bicycle_parking|bicycle_repair_station"' },
  { id: 'transport', label: 'Public Transport',   color: '#5856d6', icon: '🚌', query: 'public_transport~"stop_position|platform"' },
];

function buildOverpassQuery(bounds, categories) {
  const { south, west, north, east } = bounds;
  const bbox = `${south},${west},${north},${east}`;
  const parts = categories.map((cat) => `node[${cat.query}](${bbox});`).join('\n');
  return `[out:json][timeout:20];\n(\n${parts}\n);\nout body 200;`;
}

function makeDivIcon(icon, color) {
  return L.divIcon({
    html: `<div style="
      width:28px;height:28px;border-radius:50%;
      background:${color};
      border:2px solid #fff;
      box-shadow:0 2px 6px rgba(0,0,0,0.3);
      display:flex;align-items:center;justify-content:center;
      font-size:14px;line-height:1;
    ">${icon}</div>`,
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

export default function POILayer({ activeCategories }) {
  const map = useMap();
  const groupRef = useRef(null);
  const abortRef = useRef(null);
  const lastBoundsRef = useRef(null);
  const debounceRef = useRef(null);

  const enabledCats = useMemo(
    () => (activeCategories || []).map((id) => POI_CATEGORIES.find((c) => c.id === id)).filter(Boolean),
    [activeCategories]
  );

  useEffect(() => {
    const group = L.layerGroup().addTo(map);
    groupRef.current = group;
    return () => {
      group.remove();
      abortRef.current?.abort();
      clearTimeout(debounceRef.current);
    };
  }, [map]);

  const fetchPOI = useCallback(async () => {
    if (!enabledCats.length) {
      groupRef.current?.clearLayers();
      return;
    }

    const b = map.getBounds();
    const bounds = {
      south: b.getSouth().toFixed(5),
      west:  b.getWest().toFixed(5),
      north: b.getNorth().toFixed(5),
      east:  b.getEast().toFixed(5),
    };

    // Skip re-fetch if bounds haven't moved significantly
    const key = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
    if (key === lastBoundsRef.current) return;
    lastBoundsRef.current = key;

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const query = buildOverpassQuery(bounds, enabledCats);
      const resp = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: query,
        signal: ctrl.signal,
      });
      const data = await resp.json();
      const group = groupRef.current;
      group.clearLayers();

      data.elements?.forEach((el) => {
        if (!el.lat || !el.lon) return;
        const cat = enabledCats.find((c) => {
          const [key, pattern] = c.query.split('~');
          const k = key.replace('[', '');
          const vals = pattern?.replace(/"/g, '').split('|') || [];
          return el.tags?.[k] && vals.includes(el.tags[k]);
        });
        if (!cat) return;

        const name = el.tags?.name || cat.label;
        L.marker([el.lat, el.lon], { icon: makeDivIcon(cat.icon, cat.color) })
          .bindPopup(`<strong>${name}</strong><br><small>${el.tags?.amenity || el.tags?.tourism || el.tags?.public_transport || ''}</small>`)
          .addTo(group);
      });
    } catch (err) {
      if (err.name !== 'AbortError') console.warn('[POI] fetch error', err);
    }
  }, [map, enabledCats]);

  const debouncedFetch = useCallback(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fetchPOI, 350);
  }, [fetchPOI]);

  // Debounced fetch on move/zoom end
  useMapEvents({
    moveend: debouncedFetch,
    zoomend: debouncedFetch,
  });

  // Immediate fetch when categories change (user action, not map movement)
  useEffect(() => {
    lastBoundsRef.current = null;
    fetchPOI();
  }, [fetchPOI]);

  return null;
}
