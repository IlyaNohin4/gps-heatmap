import React from 'react';
import { Trash2, Pencil } from 'lucide-react';

export default React.memo(function POICard({ poi, isDeleting, onZoom, onDelete, onRename }) {
  return (
    <div
      style={{
        borderRadius: 12,
        padding: '8px 14px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        cursor: 'pointer',
        transition: 'all 0.15s',
        marginBottom: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
      onClick={onZoom}
    >
      {/* Icon + Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          📍 {poi.name}
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'var(--text-secondary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            marginTop: 2,
          }}
        >
          {poi.category || 'Other'}
        </div>
      </div>

      {/* Rename button */}
      <button
        className="icon-btn"
        onClick={(e) => {
          e.stopPropagation();
          onRename?.();
        }}
        disabled={isDeleting}
        title="Rename POI"
      >
        <Pencil size={14} />
      </button>

      {/* Delete button */}
      <button
        className="icon-btn"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        disabled={isDeleting}
        title={isDeleting ? 'Deleting...' : 'Delete POI'}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
});
