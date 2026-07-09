import React, { useState } from 'react';
import { X, Loader } from 'lucide-react';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import { createPOI } from '../../api/poi.js';

const CATEGORIES = [
  'Food', 'Medical', 'Transport', 'Accommodation', 'Tourism',
  'Amenities', 'Bicycle', 'Public Transport', 'Other'
];

export default function POICreationModal({ lat, lon, onClose, onSuccess }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Food');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleCreate(e) {
    e.preventDefault();

    if (!name.trim()) {
      toast.error(t('validation.name_required'));
      return;
    }

    setSaving(true);
    try {
      const poi = await createPOI(name, lat, lon, category, description || null);
      toast.success(t('poi.created_success'));
      onSuccess?.(poi);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || t('poi.create_failed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10001,
    }} onClick={onClose}>
      <div
        style={{
          background: 'var(--surface)',
          borderRadius: 12,
          padding: 20,
          width: '90%',
          maxWidth: 400,
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Create POI</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              display: 'flex',
            }}
          >
            <X size={20} />
          </button>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, fontWeight: 600 }}>
            Coordinates
          </div>
          <div style={{ fontSize: 13, color: 'var(--text)', fontFamily: 'monospace' }}>
            {lat.toFixed(4)}, {lon.toFixed(4)}
          </div>
        </div>

        <form onSubmit={handleCreate}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, display: 'block', marginBottom: 4 }}>
              Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Coffee Shop"
              style={{
                width: '100%',
                padding: '8px 10px',
                fontSize: 13,
                border: '1px solid var(--border)',
                borderRadius: 6,
                background: 'var(--bg)',
                color: 'var(--text)',
                boxSizing: 'border-box',
              }}
              disabled={saving}
              autoFocus
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, display: 'block', marginBottom: 4 }}>
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                fontSize: 13,
                border: '1px solid var(--border)',
                borderRadius: 6,
                background: 'var(--bg)',
                color: 'var(--text)',
                boxSizing: 'border-box',
              }}
              disabled={saving}
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, display: 'block', marginBottom: 4 }}>
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add notes..."
              style={{
                width: '100%',
                padding: '8px 10px',
                fontSize: 13,
                border: '1px solid var(--border)',
                borderRadius: 6,
                background: 'var(--bg)',
                color: 'var(--text)',
                boxSizing: 'border-box',
                minHeight: 80,
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
              disabled={saving}
            />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{
                flex: 1,
                padding: '10px',
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                cursor: saving ? 'not-allowed' : 'pointer',
                color: 'var(--text)',
                fontSize: 13,
                fontWeight: 600,
                opacity: saving ? 0.5 : 1,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                flex: 1,
                padding: '10px',
                background: 'var(--accent)',
                border: 'none',
                borderRadius: 6,
                cursor: saving ? 'not-allowed' : 'pointer',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving && <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />}
              {saving ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
