import React, { useState, useMemo, useCallback } from 'react';
import { Search, Filter, Plus, X, ChevronLeft, ChevronRight, MapPin, Route } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';
import TrackCard from '../tracks/TrackCard.jsx';
import POITab from './POITab.jsx';
import useAppStore from '../../store/appStore.js';
import useMapStore from '../../store/mapStore.js';
import { getTrack } from '../../api/tracks.js';

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
      padding: '12px 14px',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      marginBottom: 8,
    }}>
      {[80, 50, 60].map((w, i) => (
        <div key={i} style={{
          height: 12,
          width: `${w}%`,
          borderRadius: 6,
          background: 'var(--border)',
          marginBottom: i < 2 ? 8 : 0,
          animation: 'pulse 1.4s ease-in-out infinite',
        }} />
      ))}
    </div>
  );
}

function LeftIslandContent({ onUploadClick, loading }) {
  const { t } = useTranslation();
  const { tracks, selectedTrackId, setSelectedTrack, isUploadingIds, activePanel, setActivePanel } = useAppStore();
  const { showTrackCreator, toggleTrackCreator, mapInstance } = useMapStore();
  const [open, setOpen] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [currentTab, setCurrentTab] = useState('tracks'); // 'tracks' or 'poi'
  const [search, setSearch] = useState('');
  const filterOpen = activePanel === 'left:filter';
  const [sort, setSort] = useState('newest');
  const [formatFilter, setFormatFilter] = useState('all');
  const [speedRange, setSpeedRange] = useState([0, 200]);

  const handleSetCurrentTab = useCallback((tab) => setCurrentTab(tab), []);
  const handleCollapse = useCallback(() => setSidebarOpen(false), []);

  const filtered = useMemo(() => {
    let list = [...tracks];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((t) => (t.name || '').toLowerCase().includes(q));
    }
    if (formatFilter !== 'all') {
      list = list.filter((t) => t.file_format?.toLowerCase() === formatFilter);
    }
    list = list.filter((t) => {
      const kmh = t.speed_avg ?? 0;
      return kmh >= speedRange[0] && kmh <= speedRange[1];
    });
    switch (sort) {
      case 'oldest': list.sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at)); break;
      case 'longest': list.sort((a, b) => (b.distance_km ?? 0) - (a.distance_km ?? 0)); break;
      case 'fastest': list.sort((a, b) => (b.speed_avg ?? 0) - (a.speed_avg ?? 0)); break;
      case 'slowest': list.sort((a, b) => (a.speed_avg ?? 0) - (b.speed_avg ?? 0)); break;
      case 'shortest': list.sort((a, b) => (a.distance_km ?? 0) - (b.distance_km ?? 0)); break;
      default: list.sort((a, b) => new Date(b.recorded_at || b.uploaded_at) - new Date(a.recorded_at || a.uploaded_at));
    }
    return list;
  }, [tracks, search, formatFilter, sort, speedRange]);

  const chip = (active) => ({
    padding: '4px 10px',
    borderRadius: 8,
    fontSize: 11,
    fontWeight: 600,
    background: active ? 'var(--accent)' : 'var(--bg)',
    color: active ? '#fff' : 'var(--text-secondary)',
    border: 'none',
    cursor: 'pointer',
  });

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
        <div className="island" style={{ padding: '6px' }}>
          <button
            className="icon-btn"
            onClick={() => setSidebarOpen(true)}
            title={t('tracks.show_sidebar')}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      {sidebarOpen && <div className="island panel-animate-in-left" style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        maxHeight: 'calc(100vh - 320px)',
      }}>
        {/* Tabs */}
        <div style={{
          display: 'flex',
          padding: '8px 8px 8px',
          gap: 4,
          borderBottom: '1px solid var(--border)',
        }}>
          <button
            onClick={() => handleSetCurrentTab('tracks')}
            style={{
              flex: 1,
              padding: '8px 10px',
              border: 'none',
              borderRadius: '8px',
              background: currentTab === 'tracks' ? 'var(--accent)' : 'var(--bg)',
              color: currentTab === 'tracks' ? '#fff' : 'var(--text-secondary)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              transition: 'all 0.15s',
            }}
          >
            <Route size={14} /> Tracks
          </button>
          <button
            onClick={() => handleSetCurrentTab('poi')}
            style={{
              flex: 1,
              padding: '8px 10px',
              border: 'none',
              borderRadius: '8px',
              background: currentTab === 'poi' ? 'var(--accent)' : 'var(--bg)',
              color: currentTab === 'poi' ? '#fff' : 'var(--text-secondary)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              transition: 'all 0.15s',
            }}
          >
            <MapPin size={14} /> POI
          </button>
        </div>

        {/* Tracks Tab */}
        {currentTab === 'tracks' && (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        {/* Search bar */}
        <div style={{ padding: '10px 10px 0', display: 'flex', gap: 6, flexShrink: 0 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('tracks.search')}
              style={{ borderRadius: 'var(--radius-search)', paddingLeft: 30, paddingRight: search ? 30 : 12 }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex' }}>
                <X size={13} />
              </button>
            )}
          </div>
          <button
            className="icon-btn"
            onClick={() => setActivePanel(filterOpen ? null : 'left:filter')}
            title="Filters"
            style={{ background: filterOpen ? 'rgba(0,122,255,0.1)' : undefined, color: filterOpen ? 'var(--accent)' : undefined }}
          >
            <Filter size={15} />
          </button>
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
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', animation: 'fadeIn 0.3s ease-out', flexShrink: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase' }}>{t('tracks.sort')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
              {(['newest', 'oldest', 'longest', 'shortest', 'fastest', 'slowest']).map((v) => (
                <button key={v} style={chip(sort === v)} onClick={() => setSort(v)}>{t(`sort.${v}`)}</button>
              ))}
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase' }}>{t('tracks.format')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
              {FORMAT_OPTIONS.map((f) => (
                <button key={f.value} style={chip(formatFilter === f.value)} onClick={() => setFormatFilter(f.value)}>{f.label}</button>
              ))}
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase' }}>
              {t('tracks.avg_speed')}: {speedRange[0]}–{speedRange[1]} km/h
            </div>
            <Slider range min={0} max={200} value={speedRange} onChange={setSpeedRange} style={{ marginBottom: 8 }} />
          </div>
        )}

        {/* Track list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px 4px', minHeight: 0 }}>
          {loading ? (
            [1, 2, 3].map((i) => <SkeletonCard key={i} />)
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-secondary)', fontSize: 13 }}>
              {tracks.length === 0 ? t('tracks.no_tracks') : t('tracks.no_results')}
            </div>
          ) : (
            filtered.map((track) => (
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
        </div>

        {/* Bottom actions - Tracks tab only */}
        <div style={{ padding: '8px 10px 10px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <button
            className="btn-secondary"
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px' }}
            onClick={onUploadClick}
          >
            <Plus size={14} /> {t('tracks.add_track')}
          </button>
        </div>
        </div>
        )}

        {/* POI Tab */}
        <div style={{ display: currentTab === 'poi' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <POITab onCollapse={handleCollapse} />
        </div>
      </div>}
    </div>
  );
}

export default React.memo(LeftIslandContent);
