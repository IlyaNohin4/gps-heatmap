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
import { Search, RotateCcw } from 'lucide-react';
import useMapStore from './store/mapStore.js';

// Lazy-load the public track page so it doesn't pull leaflet into the main bundle
const PublicTrackPage = lazy(() => import('./pages/PublicTrackPage.jsx'));

// Speed legend colors
const SPEED_LEGEND = [
  { maxKmh: 10,  labelKm: '0–10 km/h',   labelMi: '0–6 mph',   color: 'rgb(155,155,155)' },
  { maxKmh: 30,  labelKm: '10–30 km/h',  labelMi: '6–19 mph',  color: 'rgb(0,122,255)' },
  { maxKmh: 60,  labelKm: '30–60 km/h',  labelMi: '19–37 mph', color: 'rgb(52,199,89)' },
  { maxKmh: 90,  labelKm: '60–90 km/h',  labelMi: '37–56 mph', color: 'rgb(255,204,0)' },
  { maxKmh: 120, labelKm: '90–120 km/h', labelMi: '56–75 mph', color: 'rgb(255,149,0)' },
  { maxKmh: Infinity, labelKm: '120+ km/h', labelMi: '75+ mph', color: 'rgb(255,59,48)' },
];

// ---- Main App Page ----
function MainPage() {
  const { isAuthenticated, setUser } = useAuthStore();
  const { theme, setTracks, setTheme, setUnitSystem, setLanguage, selectedTrackId, unitSystem } = useAppStore();
  const { mapInstance, showSpeed } = useMapStore();
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

  async function handleShowAll() {
    try {
      const data = await fetchTracks();
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
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}>
        <button
          className="btn-glass"
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', fontSize: 12, whiteSpace: 'nowrap' }}
          onClick={handleFindInArea}
        >
          <Search size={13} /> {t('tracks.find_in_area')}
        </button>
        <button
          className="btn-glass"
          onClick={handleShowAll}
          title={t('tracks.show_all')}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, padding: 0 }}
        >
          <RotateCcw size={14} />
        </button>
      </div>
      <LeftIsland onUploadClick={handleUploadClick} loading={tracksLoading} />
      <RightIsland />
      {selectedTrackId && <BottomIsland />}
      {/* Speed legend — left bottom corner */}
      {showSpeed && (
        <div className="island" style={{ position: 'fixed', left: 16, bottom: 16, padding: '8px 12px', minWidth: 120, zIndex: 900 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 6 }}>{t('map.speed_legend')}</div>
          {SPEED_LEGEND.map(({ labelKm, labelMi, color }) => (
            <div key={labelKm} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <div style={{ width: 20, height: 4, borderRadius: 2, background: color, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                {unitSystem === 'imperial' ? labelMi : labelKm}
              </span>
            </div>
          ))}
        </div>
      )}
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
