import React, { useState, useMemo } from 'react';
import { Search, Filter, Plus, X, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import TrackCard from '../tracks/TrackCard.jsx';
import useAppStore from '../../store/appStore.js';

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

export default function LeftIsland({ onUploadClick, loading }) {
  const { t } = useTranslation();
  const { tracks, selectedTrackId, setSelectedTrack, isUploadingIds } = useAppStore();
  const [open, setOpen] = useState(true);
  const [search, setSearch] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [sort, setSort] = useState('newest');
  const [formatFilter, setFormatFilter] = useState('all');
  const [speedRange, setSpeedRange] = useState([0, 100]);

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
      const mps = t.speed_avg ?? 0;
      const kmh = mps * 3.6;
      return kmh >= speedRange[0] && kmh <= speedRange[1];
    });
    switch (sort) {
      case 'oldest': list.sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at)); break;
      case 'longest': list.sort((a, b) => (b.distance_km ?? 0) - (a.distance_km ?? 0)); break;
      case 'fastest': list.sort((a, b) => (b.speed_avg ?? 0) - (a.speed_avg ?? 0)); break;
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
    <div style={{
      position: 'fixed',
      left: 16,
      top: '50%',
      transform: 'translateY(-50%)',
      zIndex: 1000,
      width: 300,
      maxHeight: 'calc(100vh - 120px)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div className="island" style={{
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        maxHeight: 'calc(100vh - 120px)',
      }}>
        {/* Search bar */}
        <div style={{ padding: '10px 10px 0', display: 'flex', gap: 6 }}>
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
            onClick={() => setFilterOpen(!filterOpen)}
            title="Filters"
            style={{ background: filterOpen ? 'rgba(0,122,255,0.1)' : undefined, color: filterOpen ? 'var(--accent)' : undefined }}
          >
            <Filter size={15} />
          </button>
        </div>

        {/* Filter panel */}
        {filterOpen && (
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase' }}>{t('tracks.sort')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
              {(['newest', 'oldest', 'longest', 'fastest']).map((v) => (
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
              {t('tracks.avg_speed')}: {speedRange[0]}–{speedRange[1]}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="range" min={0} max={100} value={speedRange[0]} onChange={(e) => setSpeedRange([+e.target.value, speedRange[1]])} style={{ flex: 1, padding: 0, border: 'none', background: 'transparent' }} />
              <input type="range" min={0} max={100} value={speedRange[1]} onChange={(e) => setSpeedRange([speedRange[0], +e.target.value])} style={{ flex: 1, padding: 0, border: 'none', background: 'transparent' }} />
            </div>
          </div>
        )}

        {/* Track list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px 4px' }}>
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
                onClick={() => setSelectedTrack(track.id === selectedTrackId ? null : track.id)}
              />
            ))
          )}
          {isUploadingIds.size > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 4px', color: 'var(--text-secondary)', fontSize: 12 }}>
              <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
              {t('tracks.processing', { count: isUploadingIds.size })}
            </div>
          )}
        </div>

        {/* Bottom actions */}
        <div style={{ padding: '8px 10px 10px', borderTop: '1px solid var(--border)' }}>
          <button
            className="btn-secondary"
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px' }}
            onClick={onUploadClick}
          >
            <Plus size={14} /> {t('tracks.add_track')}
          </button>
        </div>
      </div>
    </div>
  );
}
