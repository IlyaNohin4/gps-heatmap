import React, { useState, useRef } from 'react';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import {
  ChevronDown, ChevronUp, Trash2, Globe, Lock, MapPin, Calendar,
  Gauge, Route, Download, Pencil, Check, X,
} from 'lucide-react';
import useAppStore from '../../store/appStore.js';
import { deleteTrack, togglePublish, renameTrack, getTrackDownloadUrl } from '../../api/tracks.js';
import { NOTIFICATIONS } from '../../config/notifications.js';

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function distanceLabel(km, unitSystem) {
  if (!km && km !== 0) return '—';
  if (unitSystem === 'imperial') return `${(km * 0.621371).toFixed(2)} mi`;
  return `${km.toFixed(2)} km`;
}

function speedLabel(kmh, unitSystem) {
  if (kmh === null || kmh === undefined) return '—';
  if (unitSystem === 'imperial') return `${(kmh * 0.621371).toFixed(1)} mph`;
  return `${kmh.toFixed(1)} km/h`;
}

const FORMAT_COLORS = {
  gpx: '#34c759',
  kml: '#ff9500',
  tcx: '#5856d6',
  fit: '#007aff',
  geojson: '#ff3b30',
};

export default function TrackCard({ track, isSelected, onClick }) {
  const { t } = useTranslation();
  const { unitSystem, expandedTrackInfo, removeTrack, updateTrack, selectedTrackId, setSelectedTrackId } = useAppStore();
  const [expanded, setExpanded] = useState(false);
  const [published, setPublished] = useState(track.is_public || false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameValue, setNameValue] = useState(track.name || '');
  const nameInputRef = useRef(null);

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
      if (selectedTrackId === track.id) {
        setSelectedTrackId(null);
      }
      toast.success(NOTIFICATIONS.TRACK_DELETED);
    } catch {
      toast.error(NOTIFICATIONS.TRACK_DELETE_ERROR);
      setDeleting(false);
    }
  }

  async function handlePublish(e) {
    e.stopPropagation();
    try {
      const result = await togglePublish(track.id);
      setPublished(result.is_public);
      toast.success(result.is_public ? t('toast.published') : t('toast.unpublished'));
    } catch {
      toast.error(t('toast.publish_failed'));
    }
  }

  function startRename(e) {
    e.stopPropagation();
    setNameValue(track.name || '');
    setRenaming(true);
    setTimeout(() => nameInputRef.current?.focus(), 0);
  }

  async function commitRename(e) {
    e?.stopPropagation();
    const trimmed = nameValue.trim();
    if (!trimmed || trimmed === track.name) {
      setRenaming(false);
      return;
    }
    try {
      const updated = await renameTrack(track.id, trimmed);
      updateTrack(updated);
      toast.success(NOTIFICATIONS.TRACK_RENAMED);
    } catch {
      toast.error(NOTIFICATIONS.TRACK_RENAME_ERROR);
    }
    setRenaming(false);
  }

  function cancelRename(e) {
    e.stopPropagation();
    setRenaming(false);
  }

  function shouldShowTrackInfo() {
    if (expandedTrackInfo === 'off') return false;
    if (expandedTrackInfo === 'partial') return isSelected;
    if (expandedTrackInfo === 'on') return true;
    return false;
  }

  const fmt = track.file_format?.toLowerCase();

  return (
    <div
      style={{
        borderRadius: 12,
        padding: '8px 14px',
        background: isSelected ? 'rgba(0,122,255,0.08)' : 'var(--surface)',
        border: `1px solid ${isSelected ? 'rgba(0,122,255,0.3)' : 'var(--border)'}`,
        cursor: 'pointer',
        transition: 'all 0.15s',
        marginBottom: 8,
      }}
      onClick={onClick}
    >
      {/* Row 1: format badge + name + publish + expand */}
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
          flexShrink: 0,
        }}>
          {fmt || '?'}
        </span>

        {renaming ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }} onClick={(e) => e.stopPropagation()}>
            <input
              ref={nameInputRef}
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') cancelRename(e); }}
              style={{ flex: 1, fontSize: 13, padding: '2px 6px', borderRadius: 6 }}
            />
            <button onClick={commitRename} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', display: 'flex', flexShrink: 0 }}>
              <Check size={13} />
            </button>
            <button onClick={cancelRename} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', flexShrink: 0 }}>
              <X size={13} />
            </button>
          </div>
        ) : (
          <span style={{
            flex: 1,
            minWidth: 0,
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {track.name || t('card.unnamed')}
          </span>
        )}

        {/* Publish + expand always visible, compact */}
        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
          <button
            className="icon-btn"
            onClick={(e) => { e.stopPropagation(); handlePublish(e); }}
            title={published ? t('card.unpublish') : t('card.publish')}
          >
            {published ? <Globe size={14} color="var(--accent)" /> : <Lock size={14} />}
          </button>
          <button
            className="icon-btn"
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            title={t('card.details')}
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Row 2: meta chips + action buttons (only when info is shown) */}
      {shouldShowTrackInfo() && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
            {track.recorded_at && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, color: 'var(--text-secondary)' }}>
                <Calendar size={11} /> {formatDate(track.recorded_at)}
              </span>
            )}
            {track.distance_km !== undefined && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, color: 'var(--text-secondary)' }}>
                <Route size={11} /> {distanceLabel(track.distance_km, unitSystem)}
              </span>
            )}
            {track.speed_avg !== undefined && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, color: 'var(--text-secondary)' }}>
                <Gauge size={11} /> {speedLabel(track.speed_avg, unitSystem)}
              </span>
            )}
          </div>

          {/* Action buttons: rename, download, delete */}
          <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
            <button className="icon-btn" onClick={startRename} title={t('card.rename')}>
              <Pencil size={13} />
            </button>
            <a
              href={getTrackDownloadUrl(track.id)}
              download
              onClick={(e) => e.stopPropagation()}
              className="icon-btn"
              title={t('card.download')}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', color: 'var(--text)' }}
            >
              <Download size={13} />
            </a>
            <button
              className="icon-btn"
              onClick={handleDelete}
              disabled={deleting}
              title={confirmDelete ? t('card.confirm_delete') : t('card.delete')}
              style={{ color: confirmDelete ? '#ff3b30' : undefined }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      )}

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
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>{t('card.uploaded')}</div>
              <div style={{ fontSize: 12 }}>{formatDate(track.uploaded_at)}</div>
            </div>
          )}
          {track.duration_sec != null && (
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>{t('card.duration')}</div>
              <div style={{ fontSize: 12 }}>
                {(() => {
                  const h = Math.floor(track.duration_sec / 3600);
                  const m = Math.floor((track.duration_sec % 3600) / 60);
                  return h > 0 ? `${h}h ${m}m` : `${m}m`;
                })()}
              </div>
            </div>
          )}
          {track.elevation_gain != null && (
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>{t('card.elev_gain')}</div>
              <div style={{ fontSize: 12 }}>{Math.round(track.elevation_gain)} m</div>
            </div>
          )}
          {track.elevation_loss != null && (
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>{t('card.elev_loss')}</div>
              <div style={{ fontSize: 12 }}>{Math.round(track.elevation_loss)} m</div>
            </div>
          )}
          {track.regions?.length > 0 && (
            <div style={{ gridColumn: '1/-1' }}>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 3 }}>
                <MapPin size={10} /> {t('card.regions')}
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

          {!shouldShowTrackInfo() && (
            <div style={{
              display: 'flex',
              gap: 2,
              marginTop: 12,
              paddingTop: 12,
              borderTop: '1px solid var(--border)',
            }}>
              <button className="icon-btn" onClick={startRename} title={t('card.rename')}>
                <Pencil size={14} />
              </button>
              <a
                href={getTrackDownloadUrl(track.id)}
                download
                onClick={(e) => e.stopPropagation()}
                className="icon-btn"
                title={t('card.download')}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', color: 'var(--text)' }}
              >
                <Download size={14} />
              </a>
              <button
                className="icon-btn"
                onClick={handleDelete}
                disabled={deleting}
                title={confirmDelete ? t('card.confirm_delete') : t('card.delete')}
                style={{ color: confirmDelete ? '#ff3b30' : undefined }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
