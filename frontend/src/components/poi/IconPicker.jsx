import React from 'react';
import { POI_ICONS } from '../../utils/poiIcons.js';

export default function IconPicker({ value, onChange, disabled }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
      <button
        type="button"
        onClick={() => onChange(null)}
        disabled={disabled}
        title="Auto (by category)"
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          border: value == null ? '2px solid var(--accent)' : '1px solid var(--border)',
          background: 'var(--surface)',
          cursor: disabled ? 'default' : 'pointer',
          fontSize: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        —
      </button>
      {POI_ICONS.map(({ slug, emoji, label }) => (
        <button
          type="button"
          key={slug}
          onClick={() => onChange(slug)}
          disabled={disabled}
          title={label}
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            border: value === slug ? '2px solid var(--accent)' : '1px solid var(--border)',
            background: 'var(--surface)',
            cursor: disabled ? 'default' : 'pointer',
            fontSize: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
