import React, { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
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
import { Search } from 'lucide-react';
import useMapStore from './store/mapStore.js';

// Lazy-load the public track page so it doesn't pull leaflet into the main bundle
const PublicTrackPage = lazy(() => import('./pages/PublicTrackPage.jsx'));

// ---- Main App Page ----
function MainPage() {
  const { isAuthenticated, setUser } = useAuthStore();
  const { theme, setTracks, setTheme, setUnitSystem, setLanguage, selectedTrackId } = useAppStore();
  const { mapInstance } = useMapStore();
  const { t, i18n } = useTranslation();
  const [tracksLoading, setTracksLoading] = useState(false);
  const [topIslandBottom, setTopIslandBottom] = useState(64);
  const uploadInputRef = useRef(null);
  const topIslandRef = useRef(null);

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
        setUnitSystem(user.unit_distance === 'mi' ? 'imperial' : 'metric');
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

  useLayoutEffect(() => {
    const el = topIslandRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setTopIslandBottom(el.getBoundingClientRect().bottom + 8);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function handleUploadClick() {
    uploadInputRef.current?.click();
  }

  async function handleFindInArea() {
    if (!mapInstance) return;
    const bounds = mapInstance.getBounds();
    const params = { bbox: `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}` };
    try {
      const data = await fetchTracks(params);
      setTracks(data.tracks || data);
    } catch { /* ignore */ }
  }

  return (
    <>
      <MapContainer />
      <div ref={topIslandRef} style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 1000 }}>
        <TopIsland />
      </div>
      <div style={{
        position: 'fixed',
        top: topIslandBottom,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 999,
        transition: 'top 0.2s ease',
      }}>
        <button
          className="btn-secondary"
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', fontSize: 12, whiteSpace: 'nowrap' }}
          onClick={handleFindInArea}
        >
          <Search size={13} /> {t('tracks.find_in_area')}
        </button>
      </div>
      <LeftIsland onUploadClick={handleUploadClick} loading={tracksLoading} />
      <RightIsland />
      {selectedTrackId && <BottomIsland />}
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
