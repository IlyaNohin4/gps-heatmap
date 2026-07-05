import React from 'react';
import { Copy, X } from 'lucide-react';
import { toast } from 'react-toastify';

export default function CoordinatesContextMenu({ lat, lon, x, y, onClose }) {
  const coordsText = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;

  function handleCopy() {
    navigator.clipboard.writeText(coordsText);
    toast.success('Coordinates copied to clipboard');
    onClose();
  }

  return (
    <div
      style={{
        position: 'fixed',
        left: `${x}px`,
        top: `${y}px`,
        background: '#ffffff',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '12px',
        zIndex: 2000,
        minWidth: 220,
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
          Coordinates
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            display: 'flex',
            padding: 0,
          }}
        >
          <X size={14} />
        </button>
      </div>

      <div style={{
        fontSize: 13,
        color: 'var(--text)',
        fontFamily: 'monospace',
        marginBottom: 12,
        padding: '8px',
        background: 'var(--bg)',
        borderRadius: 4,
        border: '1px solid var(--border)',
      }}>
        {coordsText}
      </div>

      <button
        onClick={handleCopy}
        className="btn-primary"
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          padding: '8px',
          fontSize: 13,
        }}
      >
        <Copy size={14} /> Copy
      </button>
    </div>
  );
}
