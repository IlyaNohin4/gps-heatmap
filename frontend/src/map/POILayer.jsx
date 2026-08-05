import { useEffect, useRef, useMemo } from 'react';
import { useMap } from 'react-leaflet';
import { renderToStaticMarkup } from 'react-dom/server';
import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

import useMapStore from '../store/mapStore.js';
import { fetchPOI } from '../api/poi.js';
import { POI_ICON_COMPONENT, DEFAULT_POI_ICON, DEFAULT_POI_COLOR } from '../utils/poiIcons.js';

const CATEGORY_COLORS = {
  food: '#ff9500',
  water: '#007aff',
  repair: '#5856d6',
  bike: '#34c759',
  medical: '#ff3b30',
  shelter: '#af52de',
  other: '#8e8e93',
};

const CATEGORY_ICON_COMPONENT = {
  food: POI_ICON_COMPONENT.food,
  water: POI_ICON_COMPONENT.water,
  repair: POI_ICON_COMPONENT.repair,
  bike: POI_ICON_COMPONENT.bike,
  medical: POI_ICON_COMPONENT.medical,
  shelter: POI_ICON_COMPONENT.shelter,
  other: DEFAULT_POI_ICON,
};

// Cache serialized icon markup per (slug|category) — the SVG itself never
// changes, only the marker's background color, so there's no need to
// re-render the same icon to a string on every POI/marker.
const iconMarkupCache = new Map();

function iconMarkupFor(category, iconSlug) {
  const key = iconSlug || category || 'other';
  if (!iconMarkupCache.has(key)) {
    const Icon = POI_ICON_COMPONENT[iconSlug] || CATEGORY_ICON_COMPONENT[category] || DEFAULT_POI_ICON;
    iconMarkupCache.set(key, renderToStaticMarkup(<Icon size={16} color="#fff" strokeWidth={2.5} />));
  }
  return iconMarkupCache.get(key);
}

// L6: this is the one spot where a DB-sourced value lands in innerHTML
// without going through escapeHtml (the server already validates #RRGGBB on
// create/update, and KML imports convert through _kml_color_to_hex, so this
// is currently safe) — a local guard means it stays safe even if that
// server-side validation is ever loosened, instead of silently breaking.
const _HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

function makeDivIcon(category, color, iconSlug) {
  const svgMarkup = iconMarkupFor(category, iconSlug);
  const safeColor = _HEX_COLOR_RE.test(color) ? color : DEFAULT_POI_COLOR;

  return L.divIcon({
    html: `<div style="
      width:32px;height:32px;border-radius:50%;
      background:${safeColor};
      border:3px solid #fff;
      box-shadow:0 2px 8px rgba(0,0,0,0.4);
      display:flex;align-items:center;justify-content:center;
    ">${svgMarkup}</div>`,
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
}

export default function POILayer({ onPOIClick }) {
  const map = useMap();
  const { hiddenLists, pois } = useMapStore();
  const groupRef = useRef(null);

  // Create layer group on mount
  useEffect(() => {
    const group = L.markerClusterGroup({
      disableClusteringAtZoom: 16,
      showCoverageOnHover: false,
      maxClusterRadius: 50,
    }).addTo(map);
    groupRef.current = group;
    return () => group.remove();
  }, [map]);

  // Re-render when POI or hidden lists change
  useEffect(() => {
    renderPOI();
  }, [pois, hiddenLists]);

  function renderPOI() {
    if (!groupRef.current) return;

    groupRef.current.clearLayers();

    // POI with no import_name (the field name on the wire — see api/poi.js)
    // were created directly (not from a KML/KMZ import) and are always
    // shown; imported POI are shown unless their list was explicitly hidden
    // via the per-list toggle.
    const visiblePOI = pois.filter((poi) => !poi.import_name || !hiddenLists.has(poi.import_name));

    const markers = visiblePOI.map((poi) => {
      const category = poi.category?.toLowerCase() || 'other';
      const color = poi.color || CATEGORY_COLORS[category] || DEFAULT_POI_COLOR;
      const icon = makeDivIcon(category, color, poi.icon);

      const marker = L.marker([poi.lat, poi.lon], { icon });
      // Clicking a marker opens a small non-modal popup (name + Rename/
      // Delete) — see POIDetailsPopover.jsx — anchored near the click,
      // same pattern as TrackDetailsPopover for track lines.
      if (onPOIClick) marker.on('click', (e) => onPOIClick(poi, e.originalEvent));
      return marker;
    });

    groupRef.current.addLayers(markers);
  }

  return null;
}
