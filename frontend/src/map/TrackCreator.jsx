import { useEffect, useRef, useState, useCallback } from 'react';
import { useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

export const ORS_PROFILES = [
  { id: 'foot-walking',    label: 'Walking',    icon: '🚶' },
  { id: 'cycling-regular', label: 'Cycling',    icon: '🚲' },
  { id: 'foot-hiking',     label: 'Hiking',     icon: '🥾' },
  { id: 'driving-car',     label: 'Car',        icon: '🚗' },
  { id: 'driving-hgv',     label: 'Motorcycle', icon: '🏍️' },
];

const WAYPOINT_ICON = L.divIcon({
  html: '<div style="width:12px;height:12px;border-radius:50%;background:#007aff;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>',
  className: '',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

async function fetchRoute(waypoints, profile, orsApiKey) {
  if (waypoints.length < 2) return null;
  const coords = waypoints.map((p) => [p.lng, p.lat]);
  const url = `https://api.openrouteservice.org/v2/directions/${profile}/geojson`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: orsApiKey,
    },
    body: JSON.stringify({ coordinates: coords }),
  });
  if (!resp.ok) throw new Error(`ORS error ${resp.status}`);
  const data = await resp.json();
  const coords2 = data.features?.[0]?.geometry?.coordinates || [];
  return coords2.map(([lng, lat]) => [lat, lng]);
}

export default function TrackCreator({ mode, profile, orsApiKey, onSave, onCancel }) {
  const map = useMap();
  const groupRef = useRef(null);
  const markersRef = useRef([]);
  const routeLineRef = useRef(null);
  const [waypoints, setWaypoints] = useState([]);
  const [routePoints, setRoutePoints] = useState([]);
  const [routing, setRouting] = useState(false);
  const [error, setError] = useState(null);

  // Init layer group
  useEffect(() => {
    const group = L.layerGroup().addTo(map);
    groupRef.current = group;
    map.getContainer().style.cursor = 'crosshair';
    return () => {
      group.remove();
      map.getContainer().style.cursor = '';
    };
  }, [map]);

  // Redraw markers when waypoints change
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    waypoints.forEach((latlng, i) => {
      const m = L.marker(latlng, { icon: WAYPOINT_ICON, draggable: true })
        .addTo(group)
        .on('drag', (e) => {
          setWaypoints((prev) => {
            const next = [...prev];
            next[i] = e.target.getLatLng();
            return next;
          });
        })
        .bindTooltip(i === 0 ? 'Start' : i === waypoints.length - 1 ? 'End' : `Point ${i + 1}`, { permanent: false });
      markersRef.current.push(m);
    });
  }, [waypoints]);

  // Draw manual polyline
  useEffect(() => {
    if (mode !== 'manual') return;
    if (routeLineRef.current) { routeLineRef.current.remove(); routeLineRef.current = null; }
    if (waypoints.length < 2) return;
    const group = groupRef.current;
    routeLineRef.current = L.polyline(waypoints.map((p) => [p.lat, p.lng]), {
      color: '#007aff',
      weight: 3,
      dashArray: '6 4',
    }).addTo(group);
  }, [waypoints, mode]);

  // Fetch ORS route when in auto mode and waypoints change
  useEffect(() => {
    if (mode !== 'auto' || waypoints.length < 2) return;
    let cancelled = false;
    setRouting(true);
    setError(null);
    fetchRoute(waypoints, profile, orsApiKey)
      .then((pts) => {
        if (cancelled) return;
        setRoutePoints(pts || []);
        const group = groupRef.current;
        if (routeLineRef.current) { routeLineRef.current.remove(); routeLineRef.current = null; }
        if (pts && pts.length > 0) {
          routeLineRef.current = L.polyline(pts, { color: '#007aff', weight: 4 }).addTo(group);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setRouting(false);
      });
    return () => { cancelled = true; };
  }, [waypoints, mode, profile, orsApiKey]);

  // Map click handler
  useMapEvents({
    click(e) {
      setWaypoints((prev) => [...prev, e.latlng]);
    },
  });

  function handleUndo() {
    setWaypoints((prev) => prev.slice(0, -1));
  }

  function handleClear() {
    setWaypoints([]);
    setRoutePoints([]);
    if (routeLineRef.current) { routeLineRef.current.remove(); routeLineRef.current = null; }
  }

  function handleSave() {
    const pts = mode === 'auto'
      ? routePoints.map(([lat, lon]) => ({ lat, lon }))
      : waypoints.map((p) => ({ lat: p.lat, lon: p.lng }));
    onSave?.(pts);
  }

  // Control panel is rendered via portal-like approach — we just expose imperative interface
  // The actual UI panel is rendered by TrackCreatorPanel in RightIsland / LeftIsland
  return null;
}

// Standalone control panel component (rendered outside the map)
export function TrackCreatorPanel({ mode, setMode, profile, setProfile, routing, error, waypointCount, onUndo, onClear, onSave, onCancel }) {
  return (
    <div style={{
      position: 'fixed',
      bottom: 80,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 1200,
      background: 'var(--glass)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      boxShadow: 'var(--shadow)',
      padding: '12px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      flexWrap: 'wrap',
      minWidth: 360,
    }}>
      <div style={{ display: 'flex', gap: 4 }}>
        {['manual', 'auto'].map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              padding: '5px 12px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              background: mode === m ? 'var(--accent)' : 'var(--bg)',
              color: mode === m ? '#fff' : 'var(--text)',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            {m === 'manual' ? 'Manual' : 'Auto Route'}
          </button>
        ))}
      </div>

      {mode === 'auto' && (
        <select
          value={profile}
          onChange={(e) => setProfile(e.target.value)}
          style={{ fontSize: 12, padding: '4px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)' }}
        >
          {ORS_PROFILES.map((p) => (
            <option key={p.id} value={p.id}>{p.icon} {p.label}</option>
          ))}
        </select>
      )}

      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
        {waypointCount} point{waypointCount !== 1 ? 's' : ''}
        {routing && ' • Routing…'}
        {error && <span style={{ color: '#ff3b30' }}> • {error}</span>}
      </span>

      <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
        <button onClick={onUndo} style={{ fontSize: 12, padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', color: 'var(--text)' }}>Undo</button>
        <button onClick={onClear} style={{ fontSize: 12, padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', color: 'var(--text)' }}>Clear</button>
        <button
          onClick={onSave}
          disabled={waypointCount < 2}
          style={{ fontSize: 12, padding: '5px 12px', borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', opacity: waypointCount < 2 ? 0.5 : 1 }}
        >
          Save
        </button>
        <button onClick={onCancel} style={{ fontSize: 12, padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', color: 'var(--text)' }}>✕</button>
      </div>
    </div>
  );
}
