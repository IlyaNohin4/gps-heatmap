import React, { useEffect, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import './styles/globals.css';

import useAppStore from './store/appStore.js';
import useAuthStore from './store/authStore.js';

import MapContainer from './components/MapContainer.jsx';
import AuthModal from './components/auth/AuthModal.jsx';
import UploadZone from './components/upload/UploadZone.jsx';
import TopIsland from './components/islands/TopIsland.jsx';
import LeftIsland from './components/islands/LeftIsland.jsx';
import RightIsland from './components/islands/RightIsland.jsx';
import BottomIsland from './components/islands/BottomIsland.jsx';

import { fetchTracks, getPublicTrack } from './api/tracks.js';

// ---- Main App Page ----
function MainPage() {
  const { isAuthenticated } = useAuthStore();
  const { theme, setTracks } = useAppStore();
  const [tracksLoading, setTracksLoading] = useState(false);
  const uploadInputRef = useRef(null);

  // Apply theme to <html>
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Load tracks on mount / auth change
  useEffect(() => {
    if (!isAuthenticated) { setTracks([]); return; }
    setTracksLoading(true);
    fetchTracks()
      .then((data) => setTracks(data.tracks || data))
      .catch(() => {})
      .finally(() => setTracksLoading(false));
  }, [isAuthenticated]);

  function handleUploadClick() {
    uploadInputRef.current?.click();
  }

  return (
    <>
      <MapContainer />
      <TopIsland onUploadClick={handleUploadClick} />
      <LeftIsland onUploadClick={handleUploadClick} loading={tracksLoading} />
      <RightIsland />
      <BottomIsland />
      <AuthModal />
      <UploadZone inputRef={uploadInputRef} />
      <ToastContainer
        position="bottom-right"
        autoClose={3500}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        pauseOnHover
        theme={theme === 'dark' ? 'dark' : 'light'}
        style={{ zIndex: 20000 }}
      />
    </>
  );
}

// ---- Public Track Page ----
function PublicTrackPage() {
  const { token } = useParams();
  const [track, setTrack] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getPublicTrack(token)
      .then(setTrack)
      .catch(() => setError('Track not found or not public'));
  }, [token]);

  return (
    <div style={{ padding: 32, maxWidth: 600, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>GPS Heatmap</h1>
      {error && <div style={{ color: '#ff3b30' }}>{error}</div>}
      {track && (
        <div className="island" style={{ padding: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>{track.name || 'Track'}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px' }}>
            {track.distance_km && <div><strong>Distance:</strong> {track.distance_km.toFixed(2)} km</div>}
            {track.duration_seconds && <div><strong>Duration:</strong> {Math.round(track.duration_seconds / 60)} min</div>}
            {track.speed_avg && <div><strong>Avg speed:</strong> {(track.speed_avg * 3.6).toFixed(1)} km/h</div>}
            {track.speed_max && <div><strong>Max speed:</strong> {(track.speed_max * 3.6).toFixed(1)} km/h</div>}
            {track.elevation_gain && <div><strong>Elev gain:</strong> {Math.round(track.elevation_gain)} m</div>}
            {track.recorded_at && <div><strong>Date:</strong> {new Date(track.recorded_at).toLocaleDateString()}</div>}
          </div>
        </div>
      )}
      {!track && !error && <div style={{ color: 'var(--text-secondary)' }}>Loading…</div>}
    </div>
  );
}

// ---- Root App ----
export default function App() {
  const { theme } = useAppStore();

  // Sync theme on initial load
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainPage />} />
        <Route path="/track/:token" element={<PublicTrackPage />} />
      </Routes>
    </BrowserRouter>
  );
}
