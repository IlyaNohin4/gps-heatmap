import React, { useEffect, useState } from 'react';
import {
  MapContainer as LeafletMap,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

import useMapStore from '../store/mapStore.js';
import useAppStore from '../store/appStore.js';

import { TILE_LAYERS } from '../map/MapLayers.js';
import { MAP_ANIMATIONS } from '../config/mapAnimations.js';
import TrackLayer from '../map/TrackLayer.jsx';
import HeatmapLayer from '../map/HeatmapLayer.jsx';
import SpeedLayer from '../map/SpeedLayer.jsx';
import POILayer from '../map/POILayer.jsx';
import TrackCreator from '../map/TrackCreator.jsx';
import POICreationModal from '../components/modals/POICreationModal.jsx';
import POIDetailsPopover from '../components/poi/POIDetailsPopover.jsx';
import POIContextMenu from '../components/poi/POIContextMenu.jsx';
import TrackDetailsPopover from '../components/tracks/TrackDetailsPopover.jsx';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
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

// POIContextMenu (copy coords / create POI here / cancel) opens from two
// entry points that both land on the same menu: a plain right-click
// anywhere on the map, and a left-click while POI creation mode is on
// (POITab's "+ Create" toggle).
function POIContextMenuHandler({ onCoordinatesMenu, poiCreationMode }) {
  useMapEvents({
    contextmenu: (e) => {
      e.originalEvent.preventDefault();
      onCoordinatesMenu(e.latlng.lat, e.latlng.lng, e.originalEvent.clientX, e.originalEvent.clientY);
    },
    click: (e) => {
      if (!poiCreationMode) return;
      onCoordinatesMenu(e.latlng.lat, e.latlng.lng, e.originalEvent.clientX, e.originalEvent.clientY);
    },
  });
  return null;
}

function ActiveTileLayer() {
  const { activeLayer } = useMapStore();
  let layerId = activeLayer;
  if (layerId === 'carto-auto') layerId = 'carto-voyager';
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

function MapLayers({ onPOIClick }) {
  const {
    showSpeed, showHeatmap, showPOI, showStartEndMarkers, showTrackCreator, toggleTrackCreator,
    trackCreatorState,
    setTrackCreatorState,
    undoWaypoint,
    redoWaypoint,
    clearTrackCreatorState,
  } = useMapStore();
  const { visibleTracks, selectedTrackId } = useVisibleTracks();


  return (
    <>
      <ActiveTileLayer />
      <MapController />
      <MapClickHandler />

      {/* Plain coloured polylines (default) */}
      {!showSpeed && !showHeatmap && (
        <TrackLayer
          tracks={visibleTracks}
          selectedTrackId={selectedTrackId}
          showStartEndMarkers={showStartEndMarkers}
          onTrackClick={(id, originalEvent) => {
            useAppStore.getState().setDetailsTrackId(id);
            useAppStore.getState().setDetailsTrackPosition(
              originalEvent ? { x: originalEvent.clientX, y: originalEvent.clientY } : null
            );
          }}
        />
      )}

      {/* Density heatmap (uMap-style) */}
      {showHeatmap && (
        <HeatmapLayer tracks={visibleTracks} />
      )}

      {/* Speed gradient segments */}
      {showSpeed && (
        <SpeedLayer tracks={visibleTracks} />
      )}

      {/* POI markers */}
      {showPOI && (
        <POILayer onPOIClick={onPOIClick} />
      )}

      {/* Track creator (map click handler) */}
      {showTrackCreator && (
        <TrackCreator />
      )}
    </>
  );
}

export default function MapContainer() {
  const poiCreationMode = useMapStore((s) => s.poiCreationMode);
  const [coordsMenu, setCoordsMenu] = useState(null);
  const [creatingPOI, setCreatingPOI] = useState(null);
  const [detailsPOI, setDetailsPOI] = useState(null);
  const [detailsPOIPosition, setDetailsPOIPosition] = useState(null);

  const handlePOIRenamed = (updatedPOI) => {
    useMapStore.getState().setPOIs(
      useMapStore.getState().pois.map((p) => (p.id === updatedPOI.id ? updatedPOI : p))
    );
    useAppStore.getState().bumpPOIListVersion();
  };

  const handlePOIDeleted = (poiId) => {
    useMapStore.getState().removePOI(poiId);
    useAppStore.getState().bumpPOIListVersion();
  };

  const handleSuccessPOI = (poi) => {
    setCreatingPOI(null);
    // Refresh POI list in Zustand store
    useMapStore.getState().addPOI(poi);
    // POITab's own paginated list is separate state — without this it stays
    // stale (new point invisible in the sidebar) until a page reload.
    useAppStore.getState().bumpPOIListVersion();
  };

  return (
    <>
      <LeafletMap
        center={[48.8566, 2.3522]}
        zoom={4}
        style={{ position: 'fixed', inset: 0, zIndex: 0 }}
        zoomControl={false}
        attributionControl={false}
      >
        <MapLayers
          onPOIClick={(poi, originalEvent) => {
            setDetailsPOI(poi);
            setDetailsPOIPosition(originalEvent ? { x: originalEvent.clientX, y: originalEvent.clientY } : null);
          }}
        />
        <POIContextMenuHandler
          onCoordinatesMenu={(lat, lon, x, y) => setCoordsMenu({ lat, lon, x, y })}
          poiCreationMode={poiCreationMode}
        />
      </LeafletMap>

      <TrackDetailsPopover />

      {creatingPOI && (
        <POICreationModal
          lat={creatingPOI.lat}
          lon={creatingPOI.lon}
          onClose={() => setCreatingPOI(null)}
          onSuccess={handleSuccessPOI}
        />
      )}

      <POIDetailsPopover
        poi={detailsPOI}
        position={detailsPOIPosition}
        onClose={() => {
          setDetailsPOI(null);
          setDetailsPOIPosition(null);
        }}
        onRenamed={(updated) => {
          handlePOIRenamed(updated);
          setDetailsPOI(updated);
        }}
        onDeleted={handlePOIDeleted}
      />

      {coordsMenu && (
        <>
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1999,
            }}
            onClick={() => setCoordsMenu(null)}
          />
          <POIContextMenu
            lat={coordsMenu.lat}
            lon={coordsMenu.lon}
            x={coordsMenu.x}
            y={coordsMenu.y}
            onCancel={() => setCoordsMenu(null)}
            onCreateClick={() => {
              setCreatingPOI({ lat: coordsMenu.lat, lon: coordsMenu.lon });
              setCoordsMenu(null);
            }}
          />
        </>
      )}
    </>
  );
}
