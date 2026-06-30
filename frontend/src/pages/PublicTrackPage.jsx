import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { MapContainer as LeafletMap, TileLayer, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getPublicTrack } from '../api/tracks.js';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function FitBounds({ positions }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 1) {
      map.fitBounds(L.latLngBounds(positions), { padding: [32, 32] });
    }
  }, [map, positions]);
  return null;
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
    ? (track.normalized_points || track.raw_points || []).map((p) => [p.lat, p.lon])
    : [];

  const apiBase = import.meta.env.VITE_API_URL || '';

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f2f2f7',
      color: '#1c1c1e',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 24px',
        borderBottom: '1px solid rgba(0,0,0,0.1)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: 'rgba(255,255,255,0.8)',
        backdropFilter: 'blur(20px)',
      }}>
        <span style={{ fontSize: 20 }}>🗺️</span>
        <span style={{ fontWeight: 700, fontSize: 16 }}>GPS Heatmap</span>
        <span style={{ color: '#8e8e93', fontSize: 14 }}>— Shared Track</span>
      </div>

      {error && (
        <div style={{ padding: 48, textAlign: 'center', color: '#ff3b30', fontSize: 16 }}>
          {error}
        </div>
      )}

      {!track && !error && (
        <div style={{ padding: 48, textAlign: 'center', color: '#8e8e93' }}>Loading…</div>
      )}

      {track && (
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px' }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>{track.name || 'Track'}</h1>

          {/* Map */}
          {positions.length > 0 && (
            <div style={{ height: 360, borderRadius: 16, overflow: 'hidden', marginBottom: 20, border: '1px solid rgba(0,0,0,0.1)' }}>
              <LeafletMap
                center={positions[0]}
                zoom={10}
                style={{ height: '100%', width: '100%' }}
                zoomControl
                attributionControl={false}
              >
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />
                <Polyline positions={positions} color="#007aff" weight={4} opacity={0.9} />
                <FitBounds positions={positions} />
              </LeafletMap>
            </div>
          )}

          {/* Stats */}
          <div style={{
            background: 'rgba(255,255,255,0.75)',
            backdropFilter: 'blur(20px)',
            borderRadius: 16,
            padding: 20,
            marginBottom: 16,
            border: '1px solid rgba(0,0,0,0.08)',
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px 20px' }}>
              {[
                ['Distance',  track.distance_km     != null ? `${track.distance_km.toFixed(2)} km`              : null],
                ['Duration',  track.duration_seconds != null ? `${Math.round(track.duration_seconds / 60)} min`  : null],
                ['Avg speed', track.speed_avg        != null ? `${(track.speed_avg * 3.6).toFixed(1)} km/h`      : null],
                ['Max speed', track.speed_max        != null ? `${(track.speed_max * 3.6).toFixed(1)} km/h`      : null],
                ['Elev gain', track.elevation_gain   != null ? `${Math.round(track.elevation_gain)} m`           : null],
                ['Date',      track.recorded_at      ? new Date(track.recorded_at).toLocaleDateString()           : null],
              ].filter(([, v]) => v != null).map(([label, value]) => (
                <div key={label}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#8e8e93', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Download */}
          <a
            href={`${apiBase}/api/tracks/public/${token}/download`}
            download
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '10px 20px',
              borderRadius: 12,
              background: '#007aff',
              color: '#fff',
              fontWeight: 600,
              fontSize: 14,
              textDecoration: 'none',
            }}
          >
            ⬇ Download track
          </a>
        </div>
      )}
    </div>
  );
}
