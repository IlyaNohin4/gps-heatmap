import React, { useState, useEffect, useCallback, useRef, useTransition } from 'react';
import { Search, Filter, Plus, X, ChevronLeft, ChevronRight, MapPin, Route } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';
import TrackCard from '../tracks/TrackCard.jsx';
import POITab from './POITab.jsx';
import useAppStore from '../../store/appStore.js';
import useAuthStore from '../../store/authStore.js';
import useMapStore from '../../store/mapStore.js';
import { getTrack, fetchTracksPage } from '../../api/tracks.js';
import useInfiniteScroll from '../../hooks/useInfiniteScroll.js';
import Input from '../../ui/Input.jsx';
import Chip from '../../ui/Chip.jsx';
import Button from '../../ui/Button.jsx';
import Panel from '../../ui/Panel.jsx';

const FORMAT_OPTIONS = [
  { value: 'all',     label: 'All' },
  { value: 'gpx',     label: 'GPX' },
  { value: 'kml',     label: 'KML' },
  { value: 'tcx',     label: 'TCX' },
  { value: 'fit',     label: 'FIT' },
  { value: 'geojson', label: 'GeoJSON' },
];

function SkeletonCard() {
  return (
    <div style={{
      borderRadius: 12,
      padding: 'var(--space-3) var(--space-4)',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
    }}>
      {[80, 50, 60].map((w, i) => (
        <div key={i} style={{
          height: 12,
          width: `${w}%`,
          borderRadius: 6,
          background: 'var(--border)',
          marginBottom: i < 2 ? 'var(--space-2)' : 0,
          animation: 'pulse 1.4s ease-in-out infinite',
        }} />
      ))}
    </div>
  );
}

function LeftIslandContent({ onUploadClick, loading }) {
  const { t } = useTranslation();
  const { selectedTrackId, setSelectedTrack, isUploadingIds, activePanel, setActivePanel, tracksListVersion } = useAppStore();
  const { showTrackCreator, toggleTrackCreator, mapInstance } = useMapStore();
  const { isAuthenticated } = useAuthStore();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [currentTab, setCurrentTab] = useState('tracks'); // 'tracks' or 'poi'
  const [search, setSearch] = useState('');
  const filterOpen = activePanel === 'left:filter';
  const [sort, setSort] = useState('newest');
  const [formatFilter, setFormatFilter] = useState('all');
  const [speedRange, setSpeedRange] = useState([0, 200]);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const requestVersion = useRef(0);

  const handleSetCurrentTab = useCallback((tab) => {
    startTransition(() => setCurrentTab(tab));
  }, []);
  const handleCollapse = useCallback(() => setSidebarOpen(false), []);

  const buildParams = useCallback((offset) => {
    const params = { sort, limit: 50, offset };
    if (search.trim()) params.search = search.trim();
    if (formatFilter !== 'all') params.file_format = formatFilter;
    if (speedRange[0] > 0) params.speed_avg_min = speedRange[0];
    if (speedRange[1] < 200) params.speed_avg_max = speedRange[1];
    return params;
  }, [search, sort, formatFilter, speedRange]);

  // Список фильтруется/сортируется на сервере — это отдельный от карты поток
  // данных: App.jsx грузит все треки (limit=500) для heatmap через
  // /api/tracks/geometries, а этот эффект грузит только одну страницу (limit=50)
  // под текущие фильтры списка. Не "оптимизировать" объединением с appStore.tracks —
  // heatmap не должен зависеть от фильтров списка (см. T04/T05).
  useEffect(() => {
    if (!isAuthenticated) {
      setItems([]);
      setTotal(0);
      setHasMore(false);
      setError(null);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    const version = ++requestVersion.current;
    setIsLoading(true);
    const timer = setTimeout(async () => {
      try {
        const page = await fetchTracksPage(buildParams(0));
        if (!cancelled && version === requestVersion.current) {
          setItems(page.items);
          setTotal(page.total);
          setHasMore(page.has_more);
          setError(null);
        }
      } catch (err) {
        if (!cancelled && version === requestVersion.current) setError(err);
      } finally {
        if (!cancelled && version === requestVersion.current) setIsLoading(false);
      }
    }, 300); // debounce для search
    return () => { cancelled = true; clearTimeout(timer); };
  // tracksListVersion (T19): bump после upload/delete/rename перезапускает
  // этот эффект и грузит список заново с offset=0 — прокрутка списка
  // сбрасывается наверх. Для этих операций это приемлемо, сохранение
  // позиции прокрутки не реализуем — не по задаче.
  }, [buildParams, retryCount, tracksListVersion, isAuthenticated]);

  const handleRetry = useCallback(() => {
    setError(null);
    setRetryCount((c) => c + 1);
  }, []);

  const loadMoreTracks = useCallback(async () => {
    const version = requestVersion.current;
    try {
      const page = await fetchTracksPage(buildParams(items.length));
      if (version !== requestVersion.current) return; // фильтры сменились, отбрасываем
      setItems((prev) => [...prev, ...page.items]);
      setTotal(page.total);
      setHasMore(page.has_more);
    } catch (err) {
      if (version === requestVersion.current) setError(err);
    }
  }, [buildParams, items.length]);

  const sentinelRef = useInfiniteScroll(loadMoreTracks, hasMore);

  return (
    <div onClick={(e) => e.stopPropagation()} style={{
      position: 'fixed',
      left: 16,
      top: '50%',
      transform: 'translateY(-50%)',
      zIndex: 1000,
      width: sidebarOpen ? 300 : 'auto',
      maxHeight: 'calc(100vh - 320px)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Collapsed state: just a toggle button */}
      {!sidebarOpen && (
        <div className="island" style={{ padding: 'var(--space-2)' }}>
          <button
            className="icon-btn"
            onClick={() => setSidebarOpen(true)}
            title={t('tracks.show_sidebar')}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      {sidebarOpen && <Panel className="panel-animate-in-left" style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        maxHeight: 'calc(100vh - 320px)',
        padding: 0,
      }}>
        {/* Tabs */}
        <div style={{
          display: 'flex',
          padding: 'var(--space-2)',
          gap: 'var(--space-1)',
          borderBottom: '1px solid var(--border)',
        }}>
          <Button
            variant={currentTab === 'tracks' ? 'primary' : 'ghost'}
            onClick={() => handleSetCurrentTab('tracks')}
            style={{ flex: 1, background: currentTab === 'tracks' ? undefined : 'var(--surface)' }}
          >
            <Route size={14} /> Tracks
          </Button>
          <Button
            variant={currentTab === 'poi' ? 'primary' : 'ghost'}
            onClick={() => handleSetCurrentTab('poi')}
            style={{ flex: 1, background: currentTab === 'poi' ? undefined : 'var(--surface)' }}
          >
            <MapPin size={14} /> POI
          </Button>
        </div>

        {/* Tracks Tab */}
        <div style={{ display: currentTab === 'tracks' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        {/* Search bar */}
        <div style={{ padding: 'var(--space-3) var(--space-2) 0', display: 'flex', gap: 'var(--space-2)', flexShrink: 0 }}>
          <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
            <Input
              leftIcon={<Search size={14} />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('tracks.search')}
              style={{ borderRadius: 'var(--radius-search)', height: '34px', paddingRight: search ? 30 : undefined }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 'var(--space-2)', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex' }}>
                <X size={13} />
              </button>
            )}
          </div>
          <Button
            iconOnly
            variant="ghost"
            active={filterOpen}
            onClick={() => setActivePanel(filterOpen ? null : 'left:filter')}
            title="Filters"
          >
            <Filter size={15} />
          </Button>
          <button
            className="icon-btn"
            onClick={() => setSidebarOpen(false)}
            title={t('chart.collapse')}
          >
            <ChevronLeft size={15} />
          </button>
        </div>

        {/* Filter panel */}
        {filterOpen && (
          <div style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--border)', animation: 'fadeIn 0.3s ease-out', flexShrink: 0 }}>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 'var(--space-2)', textTransform: 'uppercase' }}>{t('tracks.sort')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)', marginBottom: 'var(--space-3)' }}>
              {(['newest', 'oldest', 'longest', 'shortest', 'fastest', 'slowest']).map((v) => (
                <Chip key={v} active={sort === v} onClick={() => setSort(v)}>{t(`sort.${v}`)}</Chip>
              ))}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 'var(--space-2)', textTransform: 'uppercase' }}>{t('tracks.format')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)', marginBottom: 'var(--space-3)' }}>
              {FORMAT_OPTIONS.map((f) => (
                <Chip key={f.value} active={formatFilter === f.value} onClick={() => setFormatFilter(f.value)}>{f.label}</Chip>
              ))}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 'var(--space-2)', textTransform: 'uppercase' }}>
              {t('tracks.avg_speed')}: {speedRange[0]}–{speedRange[1]} km/h
            </div>
            <Slider range min={0} max={200} value={speedRange} onChange={setSpeedRange} style={{ marginBottom: 'var(--space-2)' }} />
          </div>
        )}

        {/* Track list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-2) var(--space-3) var(--space-1)', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {error ? (
            <div style={{ textAlign: 'center', padding: 'var(--space-5) 0', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
              <div style={{ marginBottom: 'var(--space-2)' }}>{t('errors.tracks_load_failed')}</div>
              <button className="btn-secondary" onClick={handleRetry}>{t('errors.retry')}</button>
            </div>
          ) : loading || isLoading ? (
            [1, 2, 3].map((i) => <SkeletonCard key={i} />)
          ) : items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 'var(--space-5) 0', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
              {total === 0 && !search.trim() && formatFilter === 'all' && speedRange[0] === 0 && speedRange[1] === 200
                ? t('tracks.no_tracks')
                : t('tracks.no_results')}
            </div>
          ) : (
            items.map((track) => (
              <TrackCard
                key={track.id}
                track={track}
                isSelected={track.id === selectedTrackId}
                onClick={() => {
                  const isDeselecting = track.id === selectedTrackId;
                  setSelectedTrack(isDeselecting ? null : track.id);
                  if (showTrackCreator && !isDeselecting) toggleTrackCreator();

                  // Auto-zoom to track when selected
                  if (!isDeselecting && mapInstance) {
                    const pts = track.normalized_points || track.raw_points || [];
                    if (pts.length > 0) {
                      const bounds = pts.reduce((acc, p) => {
                        if (!acc) return [[p.lat, p.lon], [p.lat, p.lon]];
                        return [
                          [Math.min(acc[0][0], p.lat), Math.min(acc[0][1], p.lon)],
                          [Math.max(acc[1][0], p.lat), Math.max(acc[1][1], p.lon)],
                        ];
                      }, null);
                      if (bounds) {
                        mapInstance.fitBounds(bounds, { padding: [64, 64], duration: 0.8 });
                      }
                    } else {
                      // Load track details if points not available
                      getTrack(track.id)
                        .then((data) => {
                          const pts = data.normalized_points || data.raw_points || [];
                          if (pts.length > 0) {
                            const bounds = pts.reduce((acc, p) => {
                              if (!acc) return [[p.lat, p.lon], [p.lat, p.lon]];
                              return [
                                [Math.min(acc[0][0], p.lat), Math.min(acc[0][1], p.lon)],
                                [Math.max(acc[1][0], p.lat), Math.max(acc[1][1], p.lon)],
                              ];
                            }, null);
                            if (bounds) {
                              mapInstance.fitBounds(bounds, { padding: [64, 64], duration: 0.8 });
                            }
                          }
                        })
                        .catch(() => {});
                    }
                  }
                }}
              />
            ))
          )}
          {items.length > 0 && hasMore && <div ref={sentinelRef} style={{ height: 1 }} />}
          {items.length > 0 && (
            <div style={{ textAlign: 'center', padding: 'var(--space-2) 0 var(--space-1)', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>
              {t('tracks.count_of', { shown: items.length, total })}
            </div>
          )}
        </div>

        {/* Bottom actions - Tracks tab only */}
        <div style={{ padding: 'var(--space-2) var(--space-3) var(--space-3)', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <button
            className="btn-secondary"
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)', padding: 'var(--space-2)' }}
            onClick={onUploadClick}
          >
            <Plus size={14} /> {t('tracks.add_track')}
          </button>
        </div>
        </div>

        {/* POI Tab — always mounted, toggled via display (see POLISH.md) */}
        <div style={{ display: currentTab === 'poi' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <POITab onCollapse={handleCollapse} />
        </div>
      </Panel>}
    </div>
  );
}

export default React.memo(LeftIslandContent);
