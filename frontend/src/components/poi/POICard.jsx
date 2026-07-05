import React from 'react';
import { Trash2 } from 'lucide-react';

export default function POICard({ poi, isDeleting, onZoom, onDelete }) {
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
      }}
      onClick={onZoom}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'var(--surface)';
      }}
    >
      {/* Content row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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

        {/* Delete button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          disabled={isDeleting}
          style={{
            background: 'none',
            border: 'none',
            cursor: isDeleting ? 'not-allowed' : 'pointer',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4px',
            opacity: isDeleting ? 0.5 : 1,
            transition: 'color 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'rgb(255, 59, 48)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-secondary)';
          }}
          title={isDeleting ? 'Deleting...' : 'Delete POI'}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
