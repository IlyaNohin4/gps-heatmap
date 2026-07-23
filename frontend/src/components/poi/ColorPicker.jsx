import React from 'react';
import { POI_COLOR_SWATCHES } from '../../utils/poiIcons.js';

export default function ColorPicker({ value, onChange, disabled }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
      <button
        type="button"
        onClick={() => onChange(null)}
        disabled={disabled}
        title="Auto (by category)"
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          border: value == null ? '2px solid var(--accent)' : '1px solid var(--border)',
          background: 'var(--surface)',
          cursor: disabled ? 'default' : 'pointer',
          fontSize: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        —
      </button>
      {POI_COLOR_SWATCHES.map((hex) => (
        <button
          type="button"
          key={hex}
          onClick={() => onChange(hex)}
          disabled={disabled}
          title={hex}
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            border: value === hex ? '2px solid var(--accent)' : '2px solid transparent',
            boxShadow: value === hex ? 'none' : '0 0 0 1px var(--border)',
            background: hex,
            cursor: disabled ? 'default' : 'pointer',
          }}
        />
      ))}
    </div>
  );
}
