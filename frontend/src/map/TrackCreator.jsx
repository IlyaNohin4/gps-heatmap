import { useEffect, useRef } from 'react';
import { useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Undo2, Redo2, Eraser, Download } from 'lucide-react';

import useMapStore from '../store/mapStore.js';
import { fetchDirections } from '../api/routing.js';

export const ORS_PROFILES = [
  { id: 'foot-walking',    label: 'Walking',    icon: '🚶' },
  { id: 'cycling-regular', label: 'Cycling',    icon: '🚲' },
  { id: 'foot-hiking',     label: 'Hiking',     icon: '🥾' },
  { id: 'driving-car',     label: 'Car',        icon: '🚗' },
  { id: 'driving-hgv',     label: 'Motorcycle', icon: '🏍️' },
];

const WAYPOINT_ICON = L.divIcon({
  html: '<div style="width:14px;height:14px;border-radius:50%;background:#007aff;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>',
  className: '',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

async function fetchRoute(waypoints, profile) {
  if (waypoints.length < 2) return null;

  const coords = waypoints.map((p) => [p.lng, p.lat]);
  const data = await fetchDirections(coords, profile);
  const coords2 = data.features?.[0]?.geometry?.coordinates || [];
  return coords2.map(([lng, lat]) => [lat, lng]);
}

export default function TrackCreator() {
  const map = useMap();
  const {
    trackCreatorState,
    addWaypoint,
    updateWaypoint,
    setTrackCreatorState,
  } = useMapStore();

  const layerGroupRef = useRef(null);
  const markersRef = useRef([]);
  const routeLineRef = useRef(null);

  const { waypoints, mode, profile, routing, error, routePoints } = trackCreatorState;

  // Init layer group
  useEffect(() => {
    const group = L.layerGroup().addTo(map);
    layerGroupRef.current = group;
    map.getContainer().style.cursor = 'crosshair';

    return () => {
      group.remove();
      map.getContainer().style.cursor = '';
    };
  }, [map]);

  // Redraw waypoint markers
  useEffect(() => {
    if (!layerGroupRef.current) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    waypoints.forEach((latlng, i) => {
      const marker = L.marker(latlng, { icon: WAYPOINT_ICON, draggable: true })
        .addTo(layerGroupRef.current)
        .bindTooltip(i === 0 ? 'Start' : i === waypoints.length - 1 ? 'End' : `Point ${i + 1}`, {
          permanent: false,
        });
      // QA#8: reposition an existing point by dragging it, instead of only
      // being able to undo/redo. `i` is captured per-marker at creation
      // time; markers are always fully torn down and rebuilt on every
      // `waypoints` change (see cleanup above), so the index a marker was
      // built with never goes stale.
      marker.on('dragend', () => updateWaypoint(i, marker.getLatLng()));
      markersRef.current.push(marker);
    });
  }, [waypoints, updateWaypoint]);

  // Draw route line
  useEffect(() => {
    if (!layerGroupRef.current) return;

    if (routeLineRef.current) {
      routeLineRef.current.remove();
      routeLineRef.current = null;
    }

    if (mode === 'manual' && waypoints.length >= 2) {
      routeLineRef.current = L.polyline(
        waypoints.map((p) => [p.lat, p.lng]),
        { color: '#007aff', weight: 3, dashArray: '6 4' }
      ).addTo(layerGroupRef.current);
    } else if (mode === 'auto' && routePoints.length >= 2) {
      routeLineRef.current = L.polyline(routePoints, {
        color: '#007aff',
        weight: 4,
      }).addTo(layerGroupRef.current);
    }
  }, [waypoints, routePoints, mode]);

  // Fetch ORS route in auto mode when waypoints change
  useEffect(() => {
    if (mode !== 'auto' || waypoints.length < 2) {
      setTrackCreatorState({ routePoints: [], error: null, routing: false });
      return;
    }

    let cancelled = false;
    setTrackCreatorState({ routing: true, error: null });

    fetchRoute(waypoints, profile)
      .then((pts) => {
        if (!cancelled) {
          setTrackCreatorState({ routePoints: pts || [], routing: false });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setTrackCreatorState({
            error: err.response?.data?.detail || err.message,
            routing: false,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [waypoints, mode, profile, setTrackCreatorState]);

  // Map click handler
  useMapEvents({
    click(e) {
      addWaypoint(e.latlng);
    },
  });

  return null;
}

// Control panel (rendered in fixed overlay position)
export function TrackCreatorPanel({
  mode,
  setMode,
  profile,
  setProfile,
  onUndo,
  onRedo,
  onClear,
  onSave,
  onCancel,
}) {
  const { trackCreatorState } = useMapStore();
  const { waypoints, routing, error, redoStack } = trackCreatorState;

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
      }}
    >
      {/* Mode buttons */}
      <div style={{ display: 'flex', gap: 4 }}>
        {['manual', 'auto'].map((m) => (
          <button
            key={m}
            onClick={(e) => {
              e.stopPropagation();
              setMode(m);
            }}
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

      {/* Profile select (auto mode only) */}
      {mode === 'auto' && (
        <select
          value={profile}
          onChange={(e) => {
            e.stopPropagation();
            setProfile(e.target.value);
          }}
          onClick={(e) => e.stopPropagation()}
          style={{
            fontSize: 12,
            padding: '4px 8px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
          }}
        >
          {ORS_PROFILES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.icon} {p.label}
            </option>
          ))}
        </select>
      )}

      {/* Status */}
      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
        {waypoints.length} point{waypoints.length !== 1 ? 's' : ''}
        {routing && ' • Routing…'}
        {error && <span style={{ color: '#ff3b30' }}> • {error}</span>}
      </span>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onUndo();
          }}
          disabled={waypoints.length === 0}
          title="Undo"
          style={{
            width: 28,
            height: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--bg)',
            cursor: waypoints.length === 0 ? 'not-allowed' : 'pointer',
            color: 'var(--text)',
            opacity: waypoints.length === 0 ? 0.5 : 1,
          }}
        >
          <Undo2 size={14} />
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onRedo();
          }}
          disabled={redoStack.length === 0}
          title="Redo"
          style={{
            width: 28,
            height: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--bg)',
            cursor: redoStack.length === 0 ? 'not-allowed' : 'pointer',
            color: 'var(--text)',
            opacity: redoStack.length === 0 ? 0.5 : 1,
          }}
        >
          <Redo2 size={14} />
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          disabled={waypoints.length === 0}
          title="Clear"
          style={{
            width: 28,
            height: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--bg)',
            cursor: waypoints.length === 0 ? 'not-allowed' : 'pointer',
            color: 'var(--text)',
            opacity: waypoints.length === 0 ? 0.5 : 1,
          }}
        >
          <Eraser size={14} />
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onSave();
          }}
          disabled={waypoints.length < 2}
          title="Save"
          style={{
            width: 28,
            height: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            borderRadius: 8,
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
            cursor: waypoints.length < 2 ? 'not-allowed' : 'pointer',
            opacity: waypoints.length < 2 ? 0.5 : 1,
          }}
        >
          <Download size={14} />
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onCancel();
          }}
          style={{
            fontSize: 12,
            width: 28,
            height: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--bg)',
            cursor: 'pointer',
            color: 'var(--text)',
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
