import React, { useState, useRef, useEffect } from 'react';
import { X, Pencil, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Panel from '../../ui/Panel.jsx';
import Button from '../../ui/Button.jsx';
import POIRenameModal from '../modals/POIRenameModal.jsx';
import POIDeleteModal from '../modals/POIDeleteModal.jsx';

// Non-modal counterpart to TrackDetailsPopover, for POI markers — a small
// name + Rename/Delete popup instead of jumping straight into the full
// edit modal on click. Rename opens the existing POIRenameModal (name/
// category/icon/color/visited); Delete opens the existing POIDeleteModal.
//
// PANEL_WIDTH is the minimum/positioning width; the panel grows up to
// MAX_PANEL_WIDTH so long names (up to ~100 chars) wrap onto a couple of
// lines instead of being clipped with an ellipsis. Position clamping uses
// MAX_PANEL_WIDTH (the worst case) so the panel never overflows the
// viewport even before its actual (content-dependent) width is known.
const PANEL_WIDTH = 220;
const MAX_PANEL_WIDTH = 420;
const VIEWPORT_MARGIN = 16;
const CURSOR_OFFSET = 16;

export default function POIDetailsPopover({ poi, position, onClose, onRenamed, onDeleted }) {
  const { t } = useTranslation();
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const panelRef = useRef(null);

  // Click-away auto-close — skipped while a real Modal (rename/delete) is
  // open: those render via a portal outside panelRef, so a click inside
  // them would otherwise register as "outside" and close this popup out
  // from under the modal (same reasoning as TrackDetailsPopover).
  useEffect(() => {
    if (!poi || showRenameModal || showDeleteModal) return;
    function handlePointerDown(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [poi, showRenameModal, showDeleteModal, onClose]);

  if (!poi) return null;

  const fallback = { x: window.innerWidth - MAX_PANEL_WIDTH - VIEWPORT_MARGIN - CURSOR_OFFSET, y: VIEWPORT_MARGIN };
  const { x, y } = position || fallback;
  const left = Math.min(x + CURSOR_OFFSET, window.innerWidth - MAX_PANEL_WIDTH - VIEWPORT_MARGIN);
  const top = Math.min(Math.max(y, VIEWPORT_MARGIN), window.innerHeight - 140 - VIEWPORT_MARGIN);

  return (
    <>
      <Panel
        ref={panelRef}
        className="panel-animate-in-right"
        style={{
          position: 'fixed',
          left,
          top,
          minWidth: PANEL_WIDTH,
          maxWidth: MAX_PANEL_WIDTH,
          width: 'max-content',
          padding: 'var(--space-3)',
          zIndex: 1000,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
          <div style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text)', wordBreak: 'break-word' }}>
            {poi.name || t('card.unnamed')}
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', flexShrink: 0, marginLeft: 'var(--space-2)' }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
          <Button variant="secondary" onClick={() => setShowRenameModal(true)} style={{ flex: 1 }}>
            <Pencil size={14} /> {t('card.edit')}
          </Button>
          <Button variant="secondary" onClick={() => setShowDeleteModal(true)} style={{ flex: 1 }}>
            <Trash2 size={14} /> {t('card.delete')}
          </Button>
        </div>
      </Panel>

      <POIRenameModal
        poi={poi}
        isOpen={showRenameModal}
        onClose={() => setShowRenameModal(false)}
        onRenamed={(updated) => {
          setShowRenameModal(false);
          onRenamed?.(updated);
        }}
      />

      <POIDeleteModal
        poi={poi}
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onDeleted={(id) => {
          setShowDeleteModal(false);
          onDeleted?.(id);
          onClose();
        }}
      />
    </>
  );
}
