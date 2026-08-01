import React, { useEffect, useState } from 'react';
import { fetchPOICategories } from '../../api/poi.js';
import { POI_CATEGORIES } from '../../utils/poiCategories.js';

const selectStyle = {
  width: '100%',
  padding: 'var(--space-2) var(--space-3)',
  fontSize: 13,
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--surface)',
  color: 'var(--text)',
  boxSizing: 'border-box',
};

// Category is free text on the backend. Every account is seeded with the
// same suggested categories at registration (see api/auth.py), so the
// account's real category list IS the suggested list — no separate local
// fallback to merge in. New categories are created in "Manage categories",
// not inline here — see CategoryManageModal.jsx.
export default function CategorySelect({ value, onChange, disabled }) {
  // POI_CATEGORIES only fills the gap before the fetch below resolves.
  const [options, setOptions] = useState(POI_CATEGORIES);

  useEffect(() => {
    fetchPOICategories()
      .then((data) => setOptions(data.map((c) => c.name).filter(Boolean)))
      .catch((err) => console.error('Failed to load categories:', err));
  }, []);

  // Safety net: if the POI's current category isn't in the merged list for
  // some reason, keep it selectable instead of silently jumping to the
  // first option.
  const displayOptions = value && !options.includes(value) ? [value, ...options] : options;

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      style={selectStyle}
    >
      {displayOptions.map((cat) => (
        <option key={cat} value={cat}>{cat}</option>
      ))}
    </select>
  );
}
