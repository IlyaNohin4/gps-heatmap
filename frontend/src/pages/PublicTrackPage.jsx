import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { MapContainer as LeafletMap, TileLayer, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Route, Clock, Gauge, ChevronUp, Calendar, Download, Map as MapIcon } from 'lucide-react';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { getPublicTrack } from '../api/tracks.js';
import Panel from '../ui/Panel.jsx';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

function FitBounds({ positions }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 1) {
      map.fitBounds(L.latLngBounds(positions), { padding: [48, 48] });
    }
  }, [map, positions]);
  return null;
}

function Stat({ icon, label, value }) {
  if (value == null) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ color: 'var(--text-secondary)', display: 'flex' }}>{icon}</div>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{value}</div>
      </div>
    </div>
  );
}

export default function PublicTrackPage() {
  const { token } = useParams();
  const [track, setTrack] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getPublicTrack(token)
      .then(setTrack)
      .catch(() => setError('Track not found or not public'));
  }, [token]);

  const positions = track
    ? (track.normalized_points || []).map((p) => [p.lat, p.lon])
    : [];

  const apiBase = import.meta.env.VITE_API_URL || '';

  if (error) {
    return (
      <div style={{
        position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg)', color: 'var(--danger, #ff3b30)', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}>
        {error}
      </div>
    );
  }

  if (!track) {
    return (
      <div style={{
        position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg)', color: 'var(--text-secondary)', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}>
        Loading…
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      {/* Full-screen map */}
      <div style={{ position: 'absolute', inset: 0 }}>
        {positions.length > 0 ? (
          <LeafletMap
            center={positions[0]}
            zoom={10}
            style={{ height: '100%', width: '100%' }}
            zoomControl={false}
            attributionControl={false}
          >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />
            <Polyline positions={positions} color="#007aff" weight={4} opacity={0.9} />
            <FitBounds positions={positions} />
          </LeafletMap>
        ) : (
          <div style={{ height: '100%', width: '100%', background: 'var(--bg-secondary, #e5e5ea)' }} />
        )}
      </div>

      {/* Top bar — name left-aligned, floats over the map like the app's own islands */}
      <div style={{ position: 'fixed', top: 16, left: 16, right: 16, zIndex: 1000, display: 'flex', justifyContent: 'space-between' }}>
        <Panel style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, maxWidth: '70%' }}>
          <MapIcon size={18} color="var(--accent)" style={{ flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: 16, fontWeight: 700, color: 'var(--text)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {track.name || 'Track'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>GPS Heatmap — Shared Track</div>
          </div>
        </Panel>
      </div>

      {/* Bottom mini-island — stats + download */}
      <div style={{ position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, maxWidth: 'calc(100vw - 32px)' }}>
        <Panel style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <Stat icon={<Route size={14} />} label="Distance" value={track.distance_km != null ? `${track.distance_km.toFixed(2)} km` : null} />
          <Stat icon={<Clock size={14} />} label="Duration" value={track.duration_sec != null ? `${Math.round(track.duration_sec / 60)} min` : null} />
          <Stat icon={<Gauge size={14} />} label="Avg speed" value={track.speed_avg != null ? `${track.speed_avg.toFixed(1)} km/h` : null} />
          <Stat icon={<ChevronUp size={14} />} label="Elev gain" value={track.elevation_gain != null ? `${Math.round(track.elevation_gain)} m` : null} />
          <Stat icon={<Calendar size={14} />} label="Date" value={track.recorded_at ? new Date(track.recorded_at).toLocaleDateString() : null} />

          <a
            href={`${apiBase}/api/tracks/public/${token}/download`}
            download
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 10,
              background: 'var(--accent)', color: '#fff',
              fontWeight: 600, fontSize: 13, textDecoration: 'none', flexShrink: 0,
            }}
          >
            <Download size={14} /> Download
          </a>
        </Panel>
      </div>
    </div>
  );
}
