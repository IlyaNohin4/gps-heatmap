import React, { useEffect, useState } from 'react';
import { notify as toast } from '../../utils/notify.js';
import { useTranslation } from 'react-i18next';
import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';
import {
  ChevronDown, ChevronUp, Trash2, Globe, Lock, MapPin, Calendar,
  Gauge, Route, Download, Pencil, Loader2, AlertTriangle, RefreshCw,
} from 'lucide-react';
import useAppStore from '../../store/appStore.js';
import useMapStore from '../../store/mapStore.js';
import { togglePublish, rotatePublicLink, downloadTrackFile } from '../../api/tracks.js';
import { fetchPOICategories } from '../../api/poi.js';
import TrackDeleteModal from '../modals/TrackDeleteModal.jsx';
import TrackRenameModal from '../modals/TrackRenameModal.jsx';
import Card from '../../ui/Card.jsx';
import Button from '../../ui/Button.jsx';
import Modal from '../../ui/Modal.jsx';
import Chip from '../../ui/Chip.jsx';

const MIN_RADIUS_KM = 1;
const MAX_RADIUS_KM = 50;

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDurationSec(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
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

function elevationLabel(m, unitSystem) {
  if (m === null || m === undefined) return '—';
  if (unitSystem === 'imperial') return `${Math.round(m * 3.28084)} ft`;
  return `${Math.round(m)} m`;
}

function DownloadModal({
  open, onClose, unitSystem, poiRadiusKm, setPoiRadiusKm,
  categories, selectedCategories, onToggleCategory,
  onPlainDownload, onDownloadWithMarkers, t,
}) {
  const distanceLabelForKm = unitSystem === 'imperial'
    ? `${(poiRadiusKm * 0.621371).toFixed(1)} mi`
    : `${poiRadiusKm} km`;

  return (
    <Modal open={open} onClose={onClose} title={t('card.download')}>
      <Button variant="secondary" onClick={onPlainDownload} style={{ width: '100%', marginBottom: 'var(--space-3)' }}>
        {t('card.download')}
      </Button>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
        {t('card.download_poi_markers')}: {distanceLabelForKm}
      </div>
      <Slider
        min={MIN_RADIUS_KM}
        max={MAX_RADIUS_KM}
        value={poiRadiusKm}
        onChange={setPoiRadiusKm}
        style={{ marginBottom: 'var(--space-3)' }}
      />

      {categories.length > 0 && (
        <>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
            {t('card.download_categories')}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)', marginBottom: 'var(--space-3)' }}>
            {categories.map((c) => (
              <Chip key={c.name} active={selectedCategories.includes(c.name)} onClick={() => onToggleCategory(c.name)}>
                {c.name}
              </Chip>
            ))}
          </div>
        </>
      )}

      <Button onClick={onDownloadWithMarkers} style={{ width: '100%' }}>
        {t('card.download')}
      </Button>
    </Modal>
  );
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
  const [showDownloadPopover, setShowDownloadPopover] = useState(false);
  const [poiRadiusKm, setPoiRadiusKm] = useState(5);
  const [categories, setCategories] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);

  useEffect(() => {
    if (!showDownloadPopover) return;
    fetchPOICategories()
      .then((data) => setCategories(data.filter((c) => c.count > 0)))
      .catch((err) => console.error('Failed to load categories:', err));
  }, [showDownloadPopover]);

  function toggleCategory(name) {
    setSelectedCategories((prev) => (
      prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]
    ));
  }

  // Copies the link and returns whether the copy actually succeeded, so
  // callers can fold it into a single toast instead of showing their own
  // "done" toast plus a separate "link copied" one. On failure (clipboard
  // API blocked — no permission, insecure context), a persistent toast with
  // a "Copy" action button lets the user retry manually instead of just
  // dumping the raw URL as unclickable toast text.
  async function copyShareLink(publicToken) {
    const url = `${window.location.origin}/track/${publicToken}`;
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      const toastId = toast.info(t('toast.copy_manually'), {
        persist: true,
        action: {
          label: t('toast.copy_action'),
          onClick: async () => {
            try {
              await navigator.clipboard.writeText(url);
              toast.dismiss(toastId);
              toast.success(t('toast.link_copied'));
            } catch {
              // Still blocked — leave the persistent toast up for another try.
            }
          },
        },
      });
      return false;
    }
  }

  async function handlePublish(e) {
    e.stopPropagation();
    try {
      const result = await togglePublish(track.id);
      setPublished(result.is_public);
      if (result.is_public) {
        const copied = await copyShareLink(result.public_token);
        toast.success(copied ? t('toast.published_and_copied') : t('toast.published'));
      } else {
        toast.success(t('toast.unpublished'));
      }
    } catch {
      toast.error(t('toast.publish_failed'));
    }
  }

  async function handleRotateLink(e) {
    e.stopPropagation();
    try {
      const result = await rotatePublicLink(track.id);
      const copied = await copyShareLink(result.public_token);
      toast.success(copied ? t('toast.link_rotated_and_copied') : t('toast.link_rotated'));
    } catch {
      toast.error(t('toast.link_rotate_failed'));
    }
  }

  async function runDownload(poiRadiusM = null, downloadCategories = null) {
    try {
      const { blob, filename } = await downloadTrackFile(track.id, poiRadiusM, downloadCategories);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t('tracks.download_failed'));
    }
  }

  function handleDownload(e) {
    e.stopPropagation();
    setShowDownloadPopover((v) => !v);
  }

  function handlePlainDownload(e) {
    e.stopPropagation();
    setShowDownloadPopover(false);
    runDownload();
  }

  function handleDownloadWithMarkers(e) {
    e.stopPropagation();
    setShowDownloadPopover(false);
    runDownload(poiRadiusKm * 1000, selectedCategories);
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
    useMapStore.getState().renameTrackInCache(updatedTrack.id, updatedTrack.name);
    bumpTracksListVersion();
  }

  function handleDeleted(trackId) {
    removeTrack(trackId);
    useMapStore.getState().evictTrack(trackId);
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

        {track.status === 'processing' && (
          <span
            className="ui-badge"
            title={t('card.processing')}
            style={{ background: '#8e8e93', color: '#fff', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <Loader2 size={11} className="spin" /> {t('card.processing')}
          </span>
        )}
        {track.status === 'error' && (
          <span
            className="ui-badge"
            title={track.error_detail || t('card.processing_failed')}
            style={{ background: '#ff3b30', color: '#fff', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <AlertTriangle size={11} /> {t('card.processing_failed')}
          </span>
        )}

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
          {published && (
            <Button
              iconOnly
              variant="ghost"
              onClick={handleRotateLink}
              title={t('card.rotate_link')}
            >
              <RefreshCw size={14} />
            </Button>
          )}
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
            <Button iconOnly variant="ghost" onClick={handleDownload} title={t('card.download')}>
              <Download size={14} />
            </Button>
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
              <Button iconOnly variant="ghost" onClick={handleDownload} title={t('card.download')}>
                <Download size={14} />
              </Button>
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
                <div style={{ fontSize: 'var(--text-sm)' }}>{formatDurationSec(track.duration_sec)}</div>
              </div>
            )}
            {track.moving_time_sec != null && (
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>{t('card.moving_time')}</div>
                <div style={{ fontSize: 'var(--text-sm)' }}>{formatDurationSec(track.moving_time_sec)}</div>
              </div>
            )}
            {track.elevation_gain != null && (
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>{t('card.elev_gain')}</div>
                <div style={{ fontSize: 'var(--text-sm)' }}>{elevationLabel(track.elevation_gain, unitSystem)}</div>
              </div>
            )}
            {track.elevation_loss != null && (
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>{t('card.elev_loss')}</div>
                <div style={{ fontSize: 'var(--text-sm)' }}>{elevationLabel(track.elevation_loss, unitSystem)}</div>
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

      {/* Download Modal */}
      <DownloadModal
        open={showDownloadPopover}
        onClose={() => setShowDownloadPopover(false)}
        unitSystem={unitSystem}
        poiRadiusKm={poiRadiusKm}
        setPoiRadiusKm={setPoiRadiusKm}
        categories={categories}
        selectedCategories={selectedCategories}
        onToggleCategory={toggleCategory}
        onPlainDownload={handlePlainDownload}
        onDownloadWithMarkers={handleDownloadWithMarkers}
        t={t}
      />

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
