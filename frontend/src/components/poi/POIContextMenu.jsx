import React from 'react';
import { Copy, MapPin, X } from 'lucide-react';
import { notify as toast } from '../../utils/notify.js';
import { useTranslation } from 'react-i18next';

// Small map-click menu — the single entry point for POI creation from the
// map, opened both by a plain right-click and by a left-click while POI
// creation mode is on (POITab's "+ Create" toggle). See MapContainer.jsx.
export default function POIContextMenu({ lat, lon, x, y, onCreateClick, onCancel }) {
  const { t } = useTranslation();

  function handleCopy() {
    navigator.clipboard.writeText(`${lat.toFixed(6)}, ${lon.toFixed(6)}`);
    toast.success(t('map.coordinates_copied'));
    onCancel();
  }

  return (
    <div
      style={{
        position: 'fixed',
        left: `${x}px`,
        top: `${y}px`,
        zIndex: 10000,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '4px 0',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{
        padding: '6px 12px',
        fontSize: 12,
        color: 'var(--text-secondary)',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
          <MapPin size={12} /> Lat: {lat.toFixed(4)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <MapPin size={12} /> Lon: {lon.toFixed(4)}
        </div>
      </div>

      <button
        onClick={handleCopy}
        style={{
          width: '100%',
          padding: '6px 12px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text)',
          fontSize: 13,
          textAlign: 'left',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          transition: 'background 0.15s',
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg)'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
      >
        <Copy size={14} /> Copy coordinates
      </button>

      <button
        onClick={onCreateClick}
        style={{
          width: '100%',
          padding: '6px 12px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--accent)',
          fontSize: 13,
          fontWeight: 600,
          textAlign: 'left',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          transition: 'background 0.15s',
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0, 122, 255, 0.1)'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
      >
        <MapPin size={14} /> {t('map.create_poi_here')}
      </button>

      <button
        onClick={onCancel}
        style={{
          width: '100%',
          padding: '6px 12px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-secondary)',
          fontSize: 13,
          textAlign: 'left',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          transition: 'background 0.15s',
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg)'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
      >
        <X size={14} /> Cancel
      </button>
    </div>
  );
}
