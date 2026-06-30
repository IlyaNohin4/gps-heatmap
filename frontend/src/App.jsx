import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useTranslation } from 'react-i18next';

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

import { fetchTracks } from './api/tracks.js';
import { getMe } from './api/auth.js';

// Lazy-load the public track page so it doesn't pull leaflet into the main bundle
const PublicTrackPage = lazy(() => import('./pages/PublicTrackPage.jsx'));

// ---- Main App Page ----
function MainPage() {
  const { isAuthenticated, setUser } = useAuthStore();
  const { theme, setTracks, setTheme, setUnits, setLanguage } = useAppStore();
  const { i18n } = useTranslation();
  const [tracksLoading, setTracksLoading] = useState(false);
  const uploadInputRef = useRef(null);

  // On auth change: fetch user profile and apply server preferences
  useEffect(() => {
    if (!isAuthenticated) {
      setTracks([]);
      return;
    }
    getMe()
      .then((user) => {
        setUser(user);
        setTheme(user.theme);
        setLanguage(user.language);
        setUnits({ distance: user.unit_distance, speed: user.unit_speed });
        i18n.changeLanguage(user.language);
        // Apply theme to DOM and keep fast-load cache in sync
        document.documentElement.dataset.theme = user.theme;
        try { localStorage.setItem('gps_theme', user.theme); } catch (_) {}
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // Load tracks whenever auth state changes
  useEffect(() => {
    if (!isAuthenticated) {
      setTracks([]);
      return;
    }
    let cancelled = false;
    setTracksLoading(true);
    fetchTracks()
      .then((data) => {
        if (!cancelled) setTracks(Array.isArray(data) ? data : (data.tracks || []));
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setTracksLoading(false); });
    return () => { cancelled = true; };
  }, [isAuthenticated, setTracks]);

  function handleUploadClick() {
    uploadInputRef.current?.click();
  }

  return (
    <>
      <MapContainer />
      <TopIsland />
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

// ---- Root App ----
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainPage />} />
        <Route
          path="/track/:token"
          element={
            <Suspense fallback={<div style={{ padding: 32, textAlign: 'center' }}>Loading…</div>}>
              <PublicTrackPage />
            </Suspense>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
