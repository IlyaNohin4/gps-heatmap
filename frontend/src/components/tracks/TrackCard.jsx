import React, { useState } from 'react';
import { toast } from 'react-toastify';
import {
  ChevronDown, ChevronUp, Trash2, Globe, Lock, MapPin, Calendar,
  Gauge, Route, Clock, TrendingUp, TrendingDown,
} from 'lucide-react';
import useAppStore from '../../store/appStore.js';
import { deleteTrack, togglePublish } from '../../api/tracks.js';

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function distanceLabel(km, units) {
  if (!km && km !== 0) return '—';
  if (units.distance === 'mi') return `${(km * 0.621371).toFixed(2)} mi`;
  return `${km.toFixed(2)} km`;
}

function speedLabel(mps, units) {
  if (mps === null || mps === undefined) return '—';
  if (units.speed === 'kmh') return `${(mps * 3.6).toFixed(1)} km/h`;
  if (units.speed === 'knots') return `${(mps * 1.94384).toFixed(1)} kn`;
  return `${mps.toFixed(2)} m/s`;
}

const FORMAT_COLORS = {
  gpx: '#34c759',
  kml: '#ff9500',
  tcx: '#5856d6',
  fit: '#007aff',
  geojson: '#ff3b30',
};

export default function TrackCard({ track, isSelected, onClick }) {
  const { units, removeTrack, setSelectedTrack } = useAppStore();
  const [expanded, setExpanded] = useState(false);
  const [published, setPublished] = useState(track.is_public || false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleDelete(e) {
    e.stopPropagation();
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    setDeleting(true);
    try {
      await deleteTrack(track.id);
      removeTrack(track.id);
      toast.success('Track deleted');
    } catch {
      toast.error('Delete failed');
      setDeleting(false);
    }
  }

  async function handlePublish(e) {
    e.stopPropagation();
    try {
      const result = await togglePublish(track.id);
      setPublished(result.is_public);
      toast.success(result.is_public ? 'Track published' : 'Track unpublished');
    } catch {
      toast.error('Could not update publish status');
    }
  }

  const fmt = track.file_format?.toLowerCase();

  return (
    <div
      style={{
        borderRadius: 12,
        padding: '12px 14px',
        background: isSelected ? 'rgba(0,122,255,0.08)' : 'var(--surface)',
        border: `1px solid ${isSelected ? 'rgba(0,122,255,0.3)' : 'var(--border)'}`,
        cursor: 'pointer',
        transition: 'all 0.15s',
        marginBottom: 8,
      }}
      onClick={onClick}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: 5,
              background: FORMAT_COLORS[fmt] || '#8e8e93',
              color: '#fff',
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
            }}>
              {fmt || '?'}
            </span>
            <span style={{
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--text)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {track.name || 'Unnamed track'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {track.recorded_at && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, color: 'var(--text-secondary)' }}>
                <Calendar size={11} /> {formatDate(track.recorded_at)}
              </span>
            )}
            {track.distance_km !== undefined && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, color: 'var(--text-secondary)' }}>
                <Route size={11} /> {distanceLabel(track.distance_km, units)}
              </span>
            )}
            {track.speed_avg !== undefined && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, color: 'var(--text-secondary)' }}>
                <Gauge size={11} /> {speedLabel(track.speed_avg, units)}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
          <button
            className="icon-btn"
            onClick={(e) => { e.stopPropagation(); handlePublish(e); }}
            title={published ? 'Unpublish' : 'Publish'}
          >
            {published ? <Globe size={15} color="var(--accent)" /> : <Lock size={15} />}
          </button>
          <button
            className="icon-btn"
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            title="Details"
          >
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
          <button
            className="icon-btn"
            onClick={handleDelete}
            disabled={deleting}
            title={confirmDelete ? 'Click again to confirm' : 'Delete'}
            style={{ color: confirmDelete ? '#ff3b30' : undefined }}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {expanded && (
        <div style={{
          marginTop: 12,
          paddingTop: 12,
          borderTop: '1px solid var(--border)',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '6px 16px',
        }}>
          {track.uploaded_at && (
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Uploaded</div>
              <div style={{ fontSize: 12 }}>{formatDate(track.uploaded_at)}</div>
            </div>
          )}
          {track.speed_max !== undefined && (
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}><TrendingUp size={10} /> Max speed</div>
              <div style={{ fontSize: 12 }}>{speedLabel(track.speed_max, units)}</div>
            </div>
          )}
          {track.speed_min !== undefined && (
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}><TrendingDown size={10} /> Min speed</div>
              <div style={{ fontSize: 12 }}>{speedLabel(track.speed_min, units)}</div>
            </div>
          )}
          {track.regions?.length > 0 && (
            <div style={{ gridColumn: '1/-1' }}>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 3 }}>
                <MapPin size={10} /> Regions
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {track.regions.map((r, i) => (
                  <span key={i} style={{
                    fontSize: 11,
                    padding: '2px 7px',
                    background: 'var(--bg)',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                  }}>{r}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
