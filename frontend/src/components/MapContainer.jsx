import React, { useEffect, useState } from 'react';
import {
  MapContainer as LeafletMap,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';
import 'leaflet-rotate';

import useMapStore from '../store/mapStore.js';
import useAppStore from '../store/appStore.js';

import { TILE_LAYERS } from '../map/MapLayers.js';
import TrackLayer from '../map/TrackLayer.jsx';
import SpeedLayer from '../map/SpeedLayer.jsx';
import VisitLayer from '../map/VisitLayer.jsx';
import POILayer from '../map/POILayer.jsx';
import TrackCreator from '../map/TrackCreator.jsx';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Wires the real Leaflet map instance into our Zustand store
function MapController() {
  const { setMapInstance } = useMapStore();
  const map = useMap();
  useEffect(() => {
    setMapInstance(map);
    return () => setMapInstance(null);
  }, [map, setMapInstance]);
  return null;
}

// Clears the global active panel when user clicks on the map
function MapClickHandler() {
  const setActivePanel = useAppStore((s) => s.setActivePanel);
  useMapEvents({ click: () => setActivePanel(null) });
  return null;
}

// Animates map to selected track with smooth flyToBounds
function TrackAnimator() {
  const map = useMap();
  const selectedTrackId = useAppStore((s) => s.selectedTrackId);
  const trackDetailCache = useMapStore((s) => s.trackDetailCache);

  useEffect(() => {
    if (!selectedTrackId || !map) return;

    const track = trackDetailCache[selectedTrackId];
    if (!track?.normalized_points || track.normalized_points.length === 0) return;

    // Calculate bounds from normalized_points
    const bounds = track.normalized_points.reduce(
      (acc, pt) => {
        if (!pt.lat || !pt.lon) return acc;
        return acc.extend([pt.lat, pt.lon]);
      },
      L.latLngBounds(null)
    );

    if (bounds.isValid()) {
      // Smooth animation with padding
      map.flyToBounds(bounds, {
        padding: [64, 64],
        duration: 1, // 1 second animation
        easeLinearity: 0.25,
      });
    }
  }, [selectedTrackId, trackDetailCache, map]);

  return null;
}

function ActiveTileLayer() {
  const { activeLayer } = useMapStore();
  const { theme } = useAppStore();
  let layerId = activeLayer;
  if (layerId === 'carto-auto') layerId = theme === 'dark' ? 'carto-dark' : 'carto-light';
  const cfg = TILE_LAYERS[layerId] || TILE_LAYERS.osm;
  return (
    <TileLayer
      key={layerId}
      url={cfg.url}
      attribution={cfg.attribution}
      maxZoom={cfg.maxZoom || 19}
      subdomains={cfg.subdomains !== undefined ? cfg.subdomains : ['a', 'b', 'c']}
    />
  );
}

/**
 * Resolves which tracks to render on the map.
 * Merges visibleTrackIds + selectedTrackId so that clicking a card
 * immediately shows the track without the user having to toggle visibility.
 * Uses trackDetailCache (with speed_segments / normalized_points) when available,
 * falling back to summary data from the track list.
 */
function useVisibleTracks() {
  const { visibleTrackIds, trackDetailCache, ensureTrackDetail } = useMapStore();
  const tracks = useAppStore((s) => s.tracks);
  const selectedTrackId = useAppStore((s) => s.selectedTrackId);

  // Always include the selected track in the rendered set
  const effectiveIds = new Set(visibleTrackIds);
  if (selectedTrackId) effectiveIds.add(selectedTrackId);

  // Lazy-load full detail for selected track (needs normalized_points / speed_segments)
  useEffect(() => {
    if (selectedTrackId) ensureTrackDetail(selectedTrackId);
  }, [selectedTrackId, ensureTrackDetail]);

  const visibleTracks = [];
  effectiveIds.forEach((id) => {
    const detail = trackDetailCache[id];
    const summary = tracks.find((t) => t.id === id);
    if (detail) visibleTracks.push(detail);
    else if (summary) visibleTracks.push(summary);
  });

  return { visibleTracks, selectedTrackId };
}

function MapLayers() {
  const {
    showSpeed, showHeatmap, showPOI, showTrackCreator, toggleTrackCreator,
    trackCreatorState,
    setTrackCreatorState,
    undoWaypoint,
    redoWaypoint,
    clearTrackCreatorState,
  } = useMapStore();
  const tracks = useAppStore((s) => s.tracks);
  const { visibleTracks, selectedTrackId } = useVisibleTracks();


  return (
    <>
      <ActiveTileLayer />
      <MapController />
      <MapClickHandler />
      <TrackAnimator />

      {/* Plain coloured polylines (default) */}
      {!showSpeed && (
        <TrackLayer tracks={visibleTracks} selectedTrackId={selectedTrackId} />
      )}

      {/* Speed gradient segments */}
      {showSpeed && (
        <SpeedLayer tracks={visibleTracks} />
      )}

      {/* Heatmap across all loaded tracks */}
      {showHeatmap && (
        <VisitLayer tracks={tracks} />
      )}

      {/* POI markers */}
      {showPOI && (
        <POILayer />
      )}

      {/* Track creator (map click handler) */}
      {showTrackCreator && (
        <TrackCreator />
      )}
    </>
  );
}

export default function MapContainer() {
  return (
    <LeafletMap
      center={[48.8566, 2.3522]}
      zoom={4}
      style={{ position: 'fixed', inset: 0, zIndex: 0 }}
      zoomControl={false}
      attributionControl={false}
      bearing={0}
      transform={true}
      rotateControl={false}
    >
      <MapLayers />
    </LeafletMap>
  );
}
