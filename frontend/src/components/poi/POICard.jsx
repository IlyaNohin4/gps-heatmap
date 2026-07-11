import React from 'react';
import { Trash2, Pencil } from 'lucide-react';
import Card from '../../ui/Card.jsx';
import Button from '../../ui/Button.jsx';

export default React.memo(function POICard({ poi, isDeleting, onZoom, onDelete, onRename }) {
  return (
    <Card
      style={{
        cursor: 'pointer',
        transition: 'all 0.15s',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
      }}
      onClick={onZoom}
    >
      {/* Icon + Text */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        <div
          style={{
            fontSize: 'var(--text-sm)',
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
            fontSize: 'var(--text-xs)',
            color: 'var(--text-secondary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {poi.category || 'Other'}
        </div>
      </div>

      {/* Rename button */}
      <Button
        iconOnly
        variant="ghost"
        onClick={(e) => {
          e.stopPropagation();
          onRename?.();
        }}
        disabled={isDeleting}
        title="Rename POI"
      >
        <Pencil size={14} />
      </Button>

      {/* Delete button */}
      <Button
        iconOnly
        variant="ghost"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        disabled={isDeleting}
        title={isDeleting ? 'Deleting...' : 'Delete POI'}
      >
        <Trash2 size={14} />
      </Button>
    </Card>
  );
});
