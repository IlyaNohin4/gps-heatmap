import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'react-toastify';
import { X } from 'lucide-react';
import { updatePOI } from '../../api/poi.js';

const CATEGORIES = [
  'Food', 'Medical', 'Transport', 'Accommodation', 'Tourism',
  'Amenities', 'Bicycle', 'Public Transport', 'Other'
];

export default function POIRenameModal({ poi, isOpen, onClose, onRenamed }) {
  const [nameValue, setNameValue] = useState(poi?.name || '');
  const [categoryValue, setCategoryValue] = useState(poi?.category || '');
  const [renaming, setRenaming] = useState(false);

  useEffect(() => {
    if (isOpen && poi) {
      setNameValue(poi.name || '');
      setCategoryValue(poi.category || '');
    }
  }, [isOpen, poi]);

  async function handleRename() {
    if (!nameValue.trim()) {
      toast.error('POI name cannot be empty');
      return;
    }
    if (nameValue === poi.name && categoryValue === poi.category) {
      toast.info('No changes made');
      return;
    }

    setRenaming(true);
    try {
      const updates = {};
      if (nameValue !== poi.name) updates.name = nameValue;
      if (categoryValue !== poi.category) updates.category = categoryValue;

      await updatePOI(poi.id, updates);
      toast.success('POI updated');
      onRenamed?.({ ...poi, name: nameValue, category: categoryValue });
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update POI');
    } finally {
      setRenaming(false);
    }
  }

  if (!isOpen || !poi) return null;

  const content = (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2000,
    }} onClick={onClose}>
      <div
        className="island"
        style={{
          padding: '24px',
          maxWidth: 360,
          width: '90%',
          animation: 'fadeIn 0.2s ease-out',
          background: '#ffffff',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Rename POI</h2>
          <button
            onClick={onClose}
            disabled={renaming}
            style={{
              background: 'none',
              border: 'none',
              cursor: renaming ? 'not-allowed' : 'pointer',
              color: 'var(--text-secondary)',
              display: 'flex',
              opacity: renaming ? 0.5 : 1,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Message */}
        <div style={{ marginBottom: 16 }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
            Edit POI details
          </p>
        </div>

        {/* Name Input */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, display: 'block', marginBottom: 4 }}>
            Name
          </label>
          <input
            type="text"
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            placeholder="POI name"
            disabled={renaming}
            autoFocus
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg-input)',
              color: 'var(--text)',
              boxSizing: 'border-box',
              fontSize: 13,
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename();
              if (e.key === 'Escape') onClose();
            }}
          />
        </div>

        {/* Category Select */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, display: 'block', marginBottom: 4 }}>
            Category
          </label>
          <select
            value={categoryValue}
            onChange={(e) => setCategoryValue(e.target.value)}
            disabled={renaming}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg-input)',
              color: 'var(--text)',
              boxSizing: 'border-box',
              fontSize: 13,
            }}
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onClose}
            disabled={renaming}
            className="btn-secondary"
            style={{ flex: 1 }}
          >
            Cancel
          </button>
          <button
            onClick={handleRename}
            disabled={renaming || (nameValue === poi.name && categoryValue === poi.category)}
            className="btn-primary"
            style={{
              flex: 1,
              opacity: renaming || (nameValue === poi.name && categoryValue === poi.category) ? 0.6 : 1,
              cursor: renaming || (nameValue === poi.name && categoryValue === poi.category) ? 'not-allowed' : 'pointer',
            }}
          >
            {renaming ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
