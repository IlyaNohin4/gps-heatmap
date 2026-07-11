import React, { useState, useRef } from 'react';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import {
  ChevronDown, ChevronUp, Trash2, Globe, Lock, MapPin, Calendar,
  Gauge, Route, Download, Pencil,
} from 'lucide-react';
import useAppStore from '../../store/appStore.js';
import { togglePublish, getTrackDownloadUrl } from '../../api/tracks.js';
import TrackDeleteModal from './TrackDeleteModal.jsx';
import TrackRenameModal from './TrackRenameModal.jsx';
import Card from '../../ui/Card.jsx';
import Button from '../../ui/Button.jsx';

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

export default React.memo(function TrackCard({ track, isSelected, onClick }) {
  const { t } = useTranslation();
  const { unitSystem, expandedTrackInfo, removeTrack, updateTrack, selectedTrackId, setSelectedTrackId, bumpTracksListVersion } = useAppStore();
  const [expanded, setExpanded] = useState(false);
  const [published, setPublished] = useState(track.is_public || false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

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

  function handleOpenRenameModal(e) {
    e.stopPropagation();
    setShowRenameModal(true);
  }

  function handleOpenDeleteModal(e) {
    e.stopPropagation();
    setShowDeleteModal(true);
  }

  function handleRenamed(updatedTrack) {
    updateTrack(updatedTrack);
    bumpTracksListVersion();
  }

  function handleDeleted(trackId) {
    removeTrack(trackId);
    bumpTracksListVersion();
    if (selectedTrackId === trackId) {
      setSelectedTrackId(null);
    }
  }

  function shouldShowTrackInfo() {
    if (expandedTrackInfo === 'off') return false;
    if (expandedTrackInfo === 'partial') return isSelected;
    if (expandedTrackInfo === 'on') return true;
    return false;
  }

  const fmt = track.file_format?.toLowerCase();

  return (
    <Card
      style={{
        background: isSelected ? 'rgba(0,122,255,0.08)' : 'var(--surface)',
        border: `1px solid ${isSelected ? 'rgba(0,122,255,0.3)' : 'var(--border)'}`,
        cursor: 'pointer',
        transition: 'all 0.15s',
      }}
      onClick={onClick}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
      {/* Row 1: format badge + name + publish + expand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <span className="ui-badge" style={{
          background: FORMAT_COLORS[fmt] || '#8e8e93',
          color: '#fff',
          textTransform: 'uppercase',
          letterSpacing: '0.03em',
          flexShrink: 0,
        }}>
          {fmt || '?'}
        </span>

        <span style={{
          flex: 1,
          minWidth: 0,
          fontSize: 'var(--text-md)',
          fontWeight: 600,
          color: 'var(--text)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {track.name || t('card.unnamed')}
        </span>

        {/* Publish + expand always visible, compact */}
        <div style={{ display: 'flex', gap: 'var(--space-1)', flexShrink: 0 }}>
          <Button
            iconOnly
            variant="ghost"
            onClick={(e) => { e.stopPropagation(); handlePublish(e); }}
            title={published ? t('card.unpublish') : t('card.publish')}
          >
            {published ? <Globe size={14} color="var(--accent)" /> : <Lock size={14} />}
          </Button>
          <Button
            iconOnly
            variant="ghost"
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            title={t('card.details')}
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </Button>
        </div>
      </div>

      {/* Row 2: meta chips + action buttons (only when info is shown) */}
      {shouldShowTrackInfo() && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', minWidth: 0 }}>
            {track.recorded_at && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                <Calendar size={11} /> {formatDate(track.recorded_at)}
              </span>
            )}
            {track.distance_km !== undefined && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                <Route size={11} /> {distanceLabel(track.distance_km, unitSystem)}
              </span>
            )}
            {track.speed_avg !== undefined && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                <Gauge size={11} /> {speedLabel(track.speed_avg, unitSystem)}
              </span>
            )}
          </div>

          {/* Action buttons: rename, download, delete */}
          <div style={{ display: 'flex', gap: 'var(--space-1)', flexShrink: 0 }}>
            <Button iconOnly variant="ghost" onClick={handleOpenRenameModal} title={t('card.rename')}>
              <Pencil size={14} />
            </Button>
            <a
              href={getTrackDownloadUrl(track.id)}
              download
              onClick={(e) => e.stopPropagation()}
              className="ui-btn ui-btn--ghost ui-btn--icon-only"
              title={t('card.download')}
              style={{ textDecoration: 'none' }}
            >
              <Download size={14} />
            </a>
            <Button iconOnly variant="ghost" onClick={handleOpenDeleteModal} title={t('card.delete')}>
              <Trash2 size={14} />
            </Button>
          </div>
        </div>
      )}

      {expanded && (
        <div style={{ paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          {!shouldShowTrackInfo() && (
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              gap: 'var(--space-1)',
              marginBottom: 'var(--space-3)',
              paddingBottom: 'var(--space-3)',
              borderBottom: '1px solid var(--border)',
            }}>
              <Button iconOnly variant="ghost" onClick={handleOpenRenameModal} title={t('card.rename')}>
                <Pencil size={14} />
              </Button>
              <a
                href={getTrackDownloadUrl(track.id)}
                download
                onClick={(e) => e.stopPropagation()}
                className="ui-btn ui-btn--ghost ui-btn--icon-only"
                title={t('card.download')}
                style={{ textDecoration: 'none' }}
              >
                <Download size={14} />
              </a>
              <Button iconOnly variant="ghost" onClick={handleOpenDeleteModal} title={t('card.delete')}>
                <Trash2 size={14} />
              </Button>
            </div>
          )}

          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'var(--space-2) var(--space-4)',
          }}>
            {track.uploaded_at && (
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>{t('card.uploaded')}</div>
                <div style={{ fontSize: 'var(--text-sm)' }}>{formatDate(track.uploaded_at)}</div>
              </div>
            )}
            {track.duration_sec != null && (
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>{t('card.duration')}</div>
                <div style={{ fontSize: 'var(--text-sm)' }}>
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
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>{t('card.elev_gain')}</div>
                <div style={{ fontSize: 'var(--text-sm)' }}>{Math.round(track.elevation_gain)} m</div>
              </div>
            )}
            {track.elevation_loss != null && (
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>{t('card.elev_loss')}</div>
                <div style={{ fontSize: 'var(--text-sm)' }}>{Math.round(track.elevation_loss)} m</div>
              </div>
            )}
            {track.regions?.length > 0 && (
              <div style={{ gridColumn: '1/-1' }}>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 'var(--space-1)', display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                  <MapPin size={10} /> {t('card.regions')}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
                  {track.regions.map((r, i) => (
                    <span key={i} className="track-tag">{r}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      </div>

      {/* Rename Modal */}
      <TrackRenameModal
        track={track}
        isOpen={showRenameModal}
        onClose={() => setShowRenameModal(false)}
        onRenamed={handleRenamed}
      />

      {/* Delete Modal */}
      <TrackDeleteModal
        track={track}
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onDeleted={handleDeleted}
      />
    </Card>
  );
});
