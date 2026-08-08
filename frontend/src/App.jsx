import React, { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { notify as toast } from './utils/notify.js';
import ToastContainer from './components/notifications/ToastContainer.jsx';
import { useTranslation } from 'react-i18next';

import './styles/globals.css';
import './styles/tokens.css';
import './styles/ui.css';

import useAppStore from './store/appStore.js';
import useAuthStore from './store/authStore.js';
import useMapStore from './store/mapStore.js';

import MapContainer from './components/MapContainer.jsx';
import AuthModal from './components/modals/AuthModal.jsx';
import UploadZone from './components/upload/UploadZone.jsx';
import TopIsland from './components/islands/TopIsland.jsx';
import LeftIsland from './components/islands/LeftIsland.jsx';
import RightIsland from './components/islands/RightIsland.jsx';
import BottomIsland from './components/islands/BottomIsland.jsx';
import { sniffKmlKind, isKml } from './utils/fileSniff.js';

import { fetchTracks, uploadTrack } from './api/tracks.js';
import { uploadPOI, fetchPOI } from './api/poi.js';
import { getMe } from './api/auth.js';
import { Search, RotateCcw } from 'lucide-react';

// Lazy-load the public track page so it doesn't pull leaflet into the main bundle
const PublicTrackPage = lazy(() => import('./pages/PublicTrackPage.jsx'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage.jsx'));

// Dev-only UI-kit demo page — the `import.meta.env.DEV ? ... : null` branch lets Rollup
// dead-code-eliminate the dynamic import entirely from the production bundle.
const UiDemoPage = import.meta.env.DEV ? lazy(() => import('./pages/UiDemoPage.jsx')) : null;

// appStore.tracks feeds the heatmap (HeatmapLayer) directly, so every refetch
// must hold every track the user has — the API's default page size (50)
// would silently drop tracks 51+ from the heatmap and the list.
const TRACKS_FETCH_LIMIT = 500;

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
  const { setTracks, setTheme, setUnitSystem, setLanguage, setToastPosition, selectedTrackId, setSelectedTrackId, setSelectedTrack, unitSystem, tracks, bumpTracksListVersion } = useAppStore();
  const {
    mapInstance, showSpeed,
    visibleTrackIds, toggleTrackVisibility, setShowStartEndMarkers
  } = useMapStore();
  const { t, i18n } = useTranslation();
  const [tracksLoading, setTracksLoading] = useState(false);
  const [topIslandBottom, setTopIslandBottom] = useState(64);
  const [allTracksVisible, setAllTracksVisible] = useState(false);
  const uploadInputRef = useRef(null);
  const topIslandRef = useRef(null);
  const bottomIslandRef = useRef(null);
  const [legendBottom, setLegendBottom] = useState(16);

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
        setShowStartEndMarkers(user.show_start_end_markers);
        setToastPosition(user.toast_position);
        i18n.changeLanguage(user.language);
        document.documentElement.dataset.theme = user.theme;
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // Load tracks whenever auth state changes
  useEffect(() => {
    if (!isAuthenticated) {
      useAppStore.getState().setTracks([]);
      useAppStore.getState().resetUserData();
      useMapStore.getState().resetMapData();
      return;
    }
    let cancelled = false;
    setTracksLoading(true);
    fetchTracks({ limit: TRACKS_FETCH_LIMIT })
      .then((data) => {
        if (!cancelled) {
          useAppStore.getState().setTracks(data);
          // One bulk request for all track geometries (normalized_points), replacing
          // the old N-requests-via-ensureTrackDetail preload.
          useMapStore.getState().loadAllGeometries();
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error(err);
          toast.error(i18n.t('errors.tracks_load_failed'));
        }
      })
      .finally(() => { if (!cancelled) setTracksLoading(false); });

    // Load POI once on page load (not on tab switch)
    fetchPOI()
      .then((data) => {
        if (!cancelled) {
          useMapStore.getState().setPOIs(data);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error(err);
          toast.error(i18n.t('errors.poi_load_failed'));
        }
      });

    return () => { cancelled = true; };
  }, [isAuthenticated]);

  useLayoutEffect(() => {
    const el = topIslandRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setTopIslandBottom(el.getBoundingClientRect().bottom + 8);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Speed legend sits bottom-right, but BottomIsland (the chart panel) spans
  // nearly full width on narrow viewports and grows upward when expanded —
  // without this it silently overlaps/clips the legend (found via manual
  // QA on mobile/tablet widths, see POLISH.md). Not gated on which side of
  // the screen BottomIsland's rect falls on (unlike the old bottom-left
  // check) — "nearly full width" means it can reach the right edge too.
  useLayoutEffect(() => {
    const el = bottomIslandRef.current;
    if (!el || !selectedTrackId) {
      setLegendBottom(16);
      return;
    }
    const observer = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      const overlapsLegend = rect.top < window.innerHeight - 16;
      setLegendBottom(overlapsLegend ? window.innerHeight - rect.top + 8 : 16);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [selectedTrackId]);

  function handleUploadClick() {
    uploadInputRef.current?.click();
  }

  async function handleTrackFilesFromOverlay(files) {
    // One summary toast for the whole batch instead of one per file — see
    // notification-reduction pass: "on one or several tracks, one
    // notification, no specifics" (no filenames, no per-file counts).
    let successCount = 0;
    let failCount = 0;
    for (const file of files) {
      try {
        await uploadTrack(file, null);
        successCount++;
      } catch (err) {
        failCount++;
      }
    }
    if (successCount > 0) {
      const data = await fetchTracks({ limit: TRACKS_FETCH_LIMIT });
      setTracks(data);
      bumpTracksListVersion();
      toast.success(i18n.t(successCount === 1 ? 'tracks.upload_success' : 'tracks.upload_success_plural'));
    }
    if (failCount > 0) {
      toast.error(i18n.t('tracks.upload_failed'));
    }
  }

  async function handlePOIFilesFromOverlay(files) {
    let successCount = 0;
    let failCount = 0;
    for (const file of files) {
      if (isKml(file.name)) {
        const kind = await sniffKmlKind(file).catch(() => 'unknown');
        if (kind === 'track') {
          // Kept per-file: this is guidance about a specific wrong file,
          // not an upload-result summary — see notification-reduction pass.
          toast.error(i18n.t('validation.kml_looks_like_track', { name: file.name }));
          continue;
        }
      }
      try {
        await uploadPOI(file);
        successCount++;
      } catch (err) {
        failCount++;
      }
    }
    if (successCount > 0) {
      const pois = await fetchPOI();
      useMapStore.getState().setPOIs(pois);
      toast.success(i18n.t('poi.import_from_file'));
    }
    if (failCount > 0) {
      toast.error(i18n.t('poi.import_from_file_failed'));
    }
  }

  async function handleFindInArea() {
    if (!mapInstance) return;
    const bounds = mapInstance.getBounds();
    const bbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
    // Also drives the sidebar list (LeftIsland reads mapStore.filterByMapBounds/
    // mapBounds) so "Find in this area" actually filters what's shown, not
    // just the heatmap/map-render pool below.
    useMapStore.getState().setMapBounds(bbox);
    useMapStore.getState().setFilterByMapBounds(true);
    try {
      const data = await fetchTracks({ bbox, limit: TRACKS_FETCH_LIMIT });
      setTracks(data);
    } catch (err) {
      console.error(err);
      toast.error(t('errors.tracks_load_failed'));
    }
  }

  async function handleShowAll() {
    setSelectedTrack(null);
    useMapStore.getState().setFilterByMapBounds(false);
    try {
      const data = await fetchTracks({ limit: TRACKS_FETCH_LIMIT });
      setTracks(data);
    } catch (err) {
      console.error(err);
      toast.error(t('errors.tracks_load_failed'));
    }
  }

  function handleToggleVisibility() {
    if (selectedTrackId) {
      setSelectedTrack(null);
    }

    const next = !allTracksVisible;
    setAllTracksVisible(next);

    tracks.forEach((track) => {
      const isVisible = visibleTrackIds.has(track.id);
      if (next && !isVisible) {
        toggleTrackVisibility(track.id);
      } else if (!next && isVisible) {
        toggleTrackVisibility(track.id);
      }
    });
  }

  return (
    <>
      <MapContainer allTracksVisible={allTracksVisible} />
      <div ref={topIslandRef} style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, animation: 'fadeIn 0.3s ease-out' }}>
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
          onClick={handleFindInArea}
          title={t('tracks.find_in_area')}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, padding: 0 }}
        >
          <Search size={14} />
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
      <LeftIsland
        onUploadClick={handleUploadClick}
        loading={tracksLoading}
        allTracksVisible={allTracksVisible}
        onToggleVisibility={handleToggleVisibility}
      />
      <RightIsland />
      {selectedTrackId && <BottomIsland ref={bottomIslandRef} />}
      {/* Speed legend — right bottom corner */}
      {showSpeed && (
        <div className="island" style={{ position: 'fixed', right: 16, bottom: legendBottom, padding: '8px 12px', minWidth: 120, zIndex: 900, transition: 'bottom 0.15s ease' }}>
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
      <UploadZone
        inputRef={uploadInputRef}
        onTrackFiles={handleTrackFilesFromOverlay}
        onPOIFiles={handlePOIFilesFromOverlay}
        queueProgressBottom={legendBottom}
      />
      <ToastContainer topOffset={topIslandBottom + 40} bottomOffset={legendBottom} />
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
        <Route
          path="/reset-password/:token"
          element={
            <Suspense fallback={<div style={{ padding: 32, textAlign: 'center' }}>Loading…</div>}>
              <ResetPasswordPage />
            </Suspense>
          }
        />
        {import.meta.env.DEV && (
          <Route
            path="/ui-demo"
            element={
              <Suspense fallback={<div style={{ padding: 32, textAlign: 'center' }}>Loading…</div>}>
                <UiDemoPage />
              </Suspense>
            }
          />
        )}
      </Routes>
    </BrowserRouter>
  );
}
