import React, { useState, useEffect, useCallback, useRef, useTransition } from 'react';
import { Search, Filter, Plus, X, ChevronLeft, ChevronRight, MapPin, Route, Eye, EyeOff, Upload, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { notify as toast } from '../../utils/notify.js';
import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';
import TrackCard from '../tracks/TrackCard.jsx';
import POITab from './POITab.jsx';
import useAppStore from '../../store/appStore.js';
import useAuthStore from '../../store/authStore.js';
import useMapStore from '../../store/mapStore.js';
import { getTrack, fetchTracksPage, fetchTracks, createTrackFromPoints, deleteTrack } from '../../api/tracks.js';
import { TrackCreatorPanel } from '../../map/TrackCreator.jsx';
import SaveTrackModal from '../modals/SaveTrackModal.jsx';
import BulkDeleteModal from '../modals/BulkDeleteModal.jsx';
import useInfiniteScroll from '../../hooks/useInfiniteScroll.js';
import Input from '../../ui/Input.jsx';
import Chip from '../../ui/Chip.jsx';
import Button from '../../ui/Button.jsx';
import Panel from '../../ui/Panel.jsx';
import SkeletonCard from '../shared/SkeletonCard.jsx';

// Mirrors App.jsx's TRACKS_FETCH_LIMIT — appStore.tracks feeds the heatmap
// directly, so any refetch after creating a track must hold every track.
const TRACKS_FETCH_LIMIT = 500;

const FORMAT_OPTIONS = [
  { value: 'all',     label: 'All' },
  { value: 'gpx',     label: 'GPX' },
  { value: 'kml',     label: 'KML' },
  { value: 'tcx',     label: 'TCX' },
  { value: 'fit',     label: 'FIT' },
  { value: 'geojson', label: 'GeoJSON' },
];

function LeftIslandContent({ onUploadClick, loading, allTracksVisible, onToggleVisibility }) {
  const { t } = useTranslation();
  const {
    selectedTrackId, setSelectedTrack, isUploadingIds, activePanel, setActivePanel,
    tracksListVersion, setTracks, bumpTracksListVersion,
    selectedTrackIds, toggleTrackSelection, clearTrackSelection, removeTrack,
  } = useAppStore();
  const {
    showTrackCreator, toggleTrackCreator, mapInstance,
    trackCreatorState, setTrackCreatorState, undoWaypoint, redoWaypoint, clearTrackCreatorState, clearTrackCreatorPoints,
    mapBounds, filterByMapBounds, showPOI, togglePOI,
  } = useMapStore();
  const { isAuthenticated } = useAuthStore();
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [savingTrack, setSavingTrack] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [currentTab, setCurrentTab] = useState('tracks'); // 'tracks' or 'poi'
  const [search, setSearch] = useState('');
  const filterOpen = activePanel === 'left:filter';
  const [sort, setSort] = useState('newest');
  const [formatFilter, setFormatFilter] = useState('all');
  const [speedRange, setSpeedRange] = useState([0, 200]);
  const [publicFilter, setPublicFilter] = useState('all'); // 'all' | 'published'
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const requestVersion = useRef(0);

  const handleSetCurrentTab = useCallback((tab) => {
    startTransition(() => setCurrentTab(tab));
  }, []);

  const buildParams = useCallback((offset) => {
    const params = { sort, limit: 50, offset };
    // Don't fire a search until there's enough to actually narrow anything
    // down — 1-2 characters match almost every track name and just thrash
    // the backend on every keystroke. Substring matching (already the
    // backend's ilike('%...%')) needs no change here.
    const trimmed = search.trim();
    if (trimmed.length >= 3) params.search = trimmed;
    if (formatFilter !== 'all') params.file_format = formatFilter;
    if (speedRange[0] > 0) params.speed_avg_min = speedRange[0];
    if (speedRange[1] < 200) params.speed_avg_max = speedRange[1];
    if (publicFilter === 'published') params.is_public = true;
    if (filterByMapBounds && mapBounds) params.bbox = mapBounds;
    return params;
  }, [search, sort, formatFilter, speedRange, publicFilter, filterByMapBounds, mapBounds]);

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

  const listContainerRef = useRef(null);
  const sentinelRef = useInfiniteScroll(loadMoreTracks, hasMore, listContainerRef);

  return (
    <>
    <div onClick={(e) => e.stopPropagation()} style={{
      position: 'fixed',
      left: 16,
      top: '50%',
      transform: 'translateY(-50%)',
      zIndex: 1000,
      width: sidebarOpen ? 300 : 0,
      maxHeight: 'calc(100vh - 320px)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Always mounted, hidden via the wrapper's width:0/overflow:hidden
          above — not `{sidebarOpen && <Panel>}` — collapsing/expanding the
          sidebar chevron used to fully unmount this, which orphaned the
          tracks list's IntersectionObserver on its old (now-detached)
          sentinel node: infinite scroll silently stopped working for the
          rest of the session after any chevron toggle (see POLISH.md). */}
      <Panel className="panel-animate-in-left" style={{
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
          <div style={{ position: 'relative', flex: 1, display: 'flex' }}>
            <Button
              variant="ghost"
              active={currentTab === 'tracks'}
              onClick={() => handleSetCurrentTab('tracks')}
              style={{ flex: 1 }}
            >
              <Route size={14} /> Tracks
            </Button>
            <button
              onClick={(e) => { e.stopPropagation(); onToggleVisibility(); }}
              title={allTracksVisible ? 'Hide all tracks' : 'Show all tracks'}
              style={{
                position: 'absolute',
                left: 'var(--space-2)',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: allTracksVisible ? 'var(--accent)' : 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'flex',
                padding: 0,
              }}
            >
              {allTracksVisible ? <Eye size={15} /> : <EyeOff size={15} />}
            </button>
          </div>
          <div style={{ position: 'relative', flex: 1, display: 'flex' }}>
            <Button
              variant="ghost"
              active={currentTab === 'poi'}
              onClick={() => handleSetCurrentTab('poi')}
              style={{ flex: 1 }}
            >
              <MapPin size={14} /> POI
            </Button>
            <button
              onClick={(e) => { e.stopPropagation(); togglePOI(); }}
              title={showPOI ? 'Hide all POI' : 'Show all POI'}
              style={{
                position: 'absolute',
                right: 'var(--space-2)',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: showPOI ? 'var(--accent)' : 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'flex',
                padding: 0,
              }}
            >
              {showPOI ? <Eye size={15} /> : <EyeOff size={15} />}
            </button>
          </div>
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
              style={{ borderRadius: 'var(--radius-search)', height: '34px', paddingRight: search ? 56 : 30 }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 30, background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex' }}>
                <X size={13} />
              </button>
            )}
            <button
              onClick={() => setActivePanel(filterOpen ? null : 'left:filter')}
              title="Filters"
              style={{
                position: 'absolute',
                right: 'var(--space-3)',
                background: 'none',
                border: 'none',
                color: filterOpen ? 'var(--accent)' : 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'flex',
              }}
            >
              <Filter size={14} />
            </button>
          </div>
          <Button
            iconOnly
            variant="ghost"
            onClick={() => setSidebarOpen(false)}
            title={t('chart.collapse')}
          >
            <ChevronLeft size={15} />
          </Button>
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
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 'var(--space-2)', textTransform: 'uppercase' }}>{t('tracks.publication')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
              {(['all', 'published']).map((v) => (
                <Chip key={v} active={publicFilter === v} onClick={() => setPublicFilter(v)}>{t(`publication.${v}`)}</Chip>
              ))}
            </div>
          </div>
        )}

        {/* Track list */}
        <div ref={listContainerRef} style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-2) var(--space-3) var(--space-1)', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {error ? (
            <div style={{ textAlign: 'center', padding: 'var(--space-5) 0', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
              <div style={{ marginBottom: 'var(--space-2)' }}>{t('errors.tracks_load_failed')}</div>
              <button className="btn-secondary" onClick={handleRetry}>{t('errors.retry')}</button>
            </div>
          ) : loading || isLoading ? (
            [1, 2, 3].map((i) => <SkeletonCard key={i} />)
          ) : items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 'var(--space-5) 0', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
              {total === 0 && !search.trim() && formatFilter === 'all' && speedRange[0] === 0 && speedRange[1] === 200 && publicFilter === 'all'
                ? t('tracks.no_tracks')
                : t('tracks.no_results')}
            </div>
          ) : (
            items.map((track) => (
              <TrackCard
                key={track.id}
                track={track}
                isSelected={track.id === selectedTrackId || selectedTrackIds.has(track.id)}
                onClick={(e) => {
                  if (e.ctrlKey || e.metaKey) {
                    e.stopPropagation();
                    toggleTrackSelection(track.id);
                    return;
                  }
                  if (selectedTrackIds.size > 0) clearTrackSelection();
                  const isDeselecting = track.id === selectedTrackId;
                  setSelectedTrack(isDeselecting ? null : track.id);
                  if (showTrackCreator && !isDeselecting) toggleTrackCreator();

                  // Auto-zoom to track when selected
                  if (!isDeselecting && mapInstance) {
                    const pts = track.normalized_points || [];
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
                          const pts = data.normalized_points || [];
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

        {/* Bulk selection bar — Ctrl/Cmd+click on a track adds it here */}
        {selectedTrackIds.size > 0 && (
          <div style={{
            padding: 'var(--space-2) var(--space-3)', borderTop: '1px solid var(--border)',
            flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)',
          }}>
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text)' }}>
              {t('bulk.selected', { count: selectedTrackIds.size })}
            </span>
            <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
              <Button variant="ghost" onClick={clearTrackSelection} title={t('bulk.clear_selection')}>
                <X size={14} />
              </Button>
              <Button variant="danger" onClick={() => setShowBulkDeleteModal(true)}>
                <Trash2 size={14} /> {t('bulk.delete_selected')}
              </Button>
            </div>
          </div>
        )}

        {/* Bottom actions - Tracks tab only */}
        <div style={{ padding: 'var(--space-2) var(--space-3) var(--space-3)', borderTop: '1px solid var(--border)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <Button
              variant="secondary"
              style={{ flex: 1, minWidth: 0 }}
              onClick={onUploadClick}
            >
              <Upload size={14} /> {t('tracks.import_track')}
            </Button>
            <Button
              variant="secondary"
              active={showTrackCreator}
              style={{ flex: 1, minWidth: 0 }}
              onClick={() => {
                if (!showTrackCreator) setSelectedTrack(null);
                toggleTrackCreator();
              }}
            >
              <Plus size={14} /> {t('tracks.create_track')}
            </Button>
          </div>

          {showTrackCreator && (
            <TrackCreatorPanel
              mode={trackCreatorState.mode}
              setMode={(m) => setTrackCreatorState({ mode: m })}
              profile={trackCreatorState.profile}
              setProfile={(p) => setTrackCreatorState({ profile: p })}
              onUndo={undoWaypoint}
              onRedo={redoWaypoint}
              onClear={clearTrackCreatorPoints}
              onSave={() => setShowSaveModal(true)}
              onCancel={() => {
                clearTrackCreatorState();
                toggleTrackCreator();
              }}
            />
          )}
        </div>
        </div>

        <SaveTrackModal
          isOpen={showSaveModal}
          trackName="New Track"
          points={
            trackCreatorState.mode === 'auto'
              ? trackCreatorState.routePoints
              : trackCreatorState.waypoints
          }
          onClose={() => setShowSaveModal(false)}
          onSaveToDb={async (trackName, format, points) => {
            setSavingTrack(true);
            try {
              const created = await createTrackFromPoints(
                trackName,
                trackCreatorState.mode === 'auto' ? trackCreatorState.routePoints : trackCreatorState.waypoints,
                format
              );

              // /api/tracks/create queues the same Celery process_track task
              // as file upload — it returns while status is still
              // "processing", so poll the track itself until that resolves,
              // otherwise the card shows "processing" forever until some
              // unrelated action happens to refetch the list.
              const POLL_INTERVAL_MS = 2000;
              const MAX_ATTEMPTS = 150; // ~5 minutes
              for (let attempts = 0; attempts < MAX_ATTEMPTS; attempts++) {
                const current = await getTrack(created.id);
                if (current.status !== 'processing') break;
                await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
              }

              const updatedTracks = await fetchTracks({ limit: TRACKS_FETCH_LIMIT });
              setTracks(updatedTracks);
              bumpTracksListVersion();

              clearTrackCreatorState();
              toggleTrackCreator();
              setShowSaveModal(false);

              toast.success(t('tracks.saved_success'));
            } catch (err) {
              toast.error(t('tracks.save_failed'));
              console.error(err);
            } finally {
              setSavingTrack(false);
            }
          }}
          saving={savingTrack}
        />

        {/* POI Tab — always mounted, toggled via display (see POLISH.md) */}
        <div style={{ display: currentTab === 'poi' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <POITab setSidebarOpen={setSidebarOpen} />
        </div>

        <BulkDeleteModal
          isOpen={showBulkDeleteModal}
          onClose={() => setShowBulkDeleteModal(false)}
          ids={[...selectedTrackIds]}
          deleteFn={deleteTrack}
          title={t('bulk.delete_selected')}
          itemLabel={t('bulk.tracks_label')}
          onDeleted={(succeededIds) => {
            succeededIds.forEach((id) => {
              removeTrack(id);
              useMapStore.getState().evictTrack(id);
              if (selectedTrackId === id) setSelectedTrack(null);
            });
            clearTrackSelection();
            bumpTracksListVersion();
          }}
        />
      </Panel>
    </div>

    {/* Floating expand toggle — collapsing now happens from the button in
        the search row (see above), so this only needs to exist once the
        island is actually collapsed and that row isn't on screen to click.
        Smaller than the old dual-purpose button since it's a single icon
        with a single job. */}
    {!sidebarOpen && (
    <Panel
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        left: 16 + 8,
        top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 1000,
        padding: 'var(--space-1)',
      }}
    >
      <Button
        variant="ghost"
        iconOnly
        onClick={() => setSidebarOpen(true)}
        title={t('tracks.show_sidebar')}
      >
        <ChevronRight size={15} />
      </Button>
    </Panel>
    )}
    </>
  );
}

export default React.memo(LeftIslandContent);
