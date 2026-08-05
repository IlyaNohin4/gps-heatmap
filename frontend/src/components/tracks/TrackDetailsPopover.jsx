import React, { useState, useRef, useEffect } from 'react';
import { notify as toast } from '../../utils/notify.js';
import { useTranslation } from 'react-i18next';
import { X, MapPin, Pencil, Download, Trash2 } from 'lucide-react';
import useAppStore from '../../store/appStore.js';
import useMapStore from '../../store/mapStore.js';
import { downloadTrackFile } from '../../api/tracks.js';
import Panel from '../../ui/Panel.jsx';
import Button from '../../ui/Button.jsx';
import TrackRenameModal from '../modals/TrackRenameModal.jsx';
import TrackDeleteModal from '../modals/TrackDeleteModal.jsx';

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDurationSec(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function elevationLabel(m, unitSystem) {
  if (m === null || m === undefined) return '—';
  if (unitSystem === 'imperial') return `${Math.round(m * 3.28084)} ft`;
  return `${Math.round(m)} m`;
}

// Non-modal counterpart to TrackCard's inline expand — triggered by clicking
// a track's line on the map. Deliberately not a <Modal>: it must not block
// interaction with the map or the sidebar while it's open.
const PANEL_WIDTH = 260;
const PANEL_MAX_HEIGHT = 420;
const VIEWPORT_MARGIN = 16;
const CURSOR_OFFSET = 16;

export default function TrackDetailsPopover() {
  const unitSystem = useAppStore((s) => s.unitSystem);
  const detailsTrackId = useAppStore((s) => s.detailsTrackId);
  const setDetailsTrackId = useAppStore((s) => s.setDetailsTrackId);
  const detailsTrackPosition = useAppStore((s) => s.detailsTrackPosition);
  const setDetailsTrackPosition = useAppStore((s) => s.setDetailsTrackPosition);
  const tracks = useAppStore((s) => s.tracks);
  const trackDetailCache = useMapStore((s) => s.trackDetailCache);

  if (!detailsTrackId) return null;

  const track = trackDetailCache[detailsTrackId] || tracks.find((tr) => tr.id === detailsTrackId);
  return track ? (
    <PopoverBody
      track={track}
      unitSystem={unitSystem}
      position={detailsTrackPosition}
      onClose={() => {
        setDetailsTrackId(null);
        setDetailsTrackPosition(null);
      }}
    />
  ) : null;
}

function PopoverBody({ track, unitSystem, position, onClose }) {
  const { t } = useTranslation();
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const panelRef = useRef(null);

  // Click-away auto-close — non-modal, so unlike a real Modal there's no
  // overlay to catch outside clicks. Skipped while a real Modal (rename/
  // delete) is open: those render via a portal outside panelRef, so a click
  // inside them would otherwise register as "outside" and close this popup
  // out from under the modal.
  useEffect(() => {
    if (showRenameModal || showDeleteModal) return;
    function handlePointerDown(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [showRenameModal, showDeleteModal, onClose]);

  async function handleDownload() {
    try {
      const { blob, filename } = await downloadTrackFile(track.id);
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

  function handleRenamed(updatedTrack) {
    useAppStore.getState().updateTrack(updatedTrack);
    useMapStore.getState().renameTrackInCache(updatedTrack.id, updatedTrack.name);
    useAppStore.getState().bumpTracksListVersion();
  }

  function handleDeleted(trackId) {
    useAppStore.getState().removeTrack(trackId);
    useMapStore.getState().evictTrack(trackId);
    useAppStore.getState().bumpTracksListVersion();
    onClose();
  }

  // Anchor next to the cursor that clicked the track's line, clamped so the
  // panel never runs off the viewport edge. Falls back to a fixed corner if
  // no click position is known (e.g. opened some other way in the future).
  const fallback = { x: window.innerWidth - PANEL_WIDTH - VIEWPORT_MARGIN - CURSOR_OFFSET, y: VIEWPORT_MARGIN };
  const { x, y } = position || fallback;
  const left = Math.min(x + CURSOR_OFFSET, window.innerWidth - PANEL_WIDTH - VIEWPORT_MARGIN);
  const top = Math.min(Math.max(y, VIEWPORT_MARGIN), window.innerHeight - PANEL_MAX_HEIGHT - VIEWPORT_MARGIN);

  return (
    <Panel
      ref={panelRef}
      className="panel-animate-in-right"
      style={{
        position: 'fixed',
        left,
        top,
        width: PANEL_WIDTH,
        maxHeight: PANEL_MAX_HEIGHT,
        overflowY: 'auto',
        padding: 'var(--space-3)',
        zIndex: 1000,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {track.name || t('card.unnamed')}
        </div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', flexShrink: 0, marginLeft: 'var(--space-2)' }}
        >
          <X size={16} />
        </button>
      </div>

      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: 'var(--space-1)',
        marginBottom: 'var(--space-3)',
        paddingTop: 'var(--space-3)',
        paddingBottom: 'var(--space-3)',
        borderBottom: '1px solid var(--border)',
      }}>
        <Button iconOnly variant="ghost" onClick={() => setShowRenameModal(true)} title={t('card.rename')}>
          <Pencil size={14} />
        </Button>
        <Button iconOnly variant="ghost" onClick={handleDownload} title={t('card.download')}>
          <Download size={14} />
        </Button>
        <Button iconOnly variant="ghost" onClick={() => setShowDeleteModal(true)} title={t('card.delete')}>
          <Trash2 size={14} />
        </Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2) var(--space-4)' }}>
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

      <TrackRenameModal
        track={track}
        isOpen={showRenameModal}
        onClose={() => setShowRenameModal(false)}
        onRenamed={handleRenamed}
      />
      <TrackDeleteModal
        track={track}
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onDeleted={handleDeleted}
      />
    </Panel>
  );
}
