import React, { useEffect, useRef } from 'react';
import useMapStore from '../store/mapStore.js';

export default function MapContainer() {
  const { setMapInstance } = useMapStore();
  const mapRef = useRef(null);

  // Phase 5 will initialize the actual Leaflet map here.
  // For now we just expose a mock map instance so islands can wire up.
  useEffect(() => {
    const mockMap = {
      zoomIn: () => console.log('[map] zoomIn'),
      zoomOut: () => console.log('[map] zoomOut'),
      flyTo: (latlng, zoom) => console.log('[map] flyTo', latlng, zoom),
      setBearing: (b) => console.log('[map] setBearing', b),
      getBounds: () => ({
        getWest: () => -180,
        getSouth: () => -90,
        getEast: () => 180,
        getNorth: () => 90,
      }),
    };
    setMapInstance(mockMap);
    return () => setMapInstance(null);
  }, [setMapInstance]);

  return (
    <div
      id="map"
      ref={mapRef}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🗺️</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>Map coming in Phase 5</div>
        <div style={{ fontSize: 13, marginTop: 4 }}>Leaflet integration will render here</div>
      </div>
    </div>
  );
}
