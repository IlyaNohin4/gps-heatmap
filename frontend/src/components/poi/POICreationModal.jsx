import React, { useState } from 'react';
import { Loader } from 'lucide-react';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import { createPOI } from '../../api/poi.js';
import { apiErrorMessage } from '../../utils/apiError.js';
import Modal from '../../ui/Modal.jsx';
import Button from '../../ui/Button.jsx';
import Input from '../../ui/Input.jsx';

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
      toast.error(apiErrorMessage(err, t('poi.create_failed')));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="Create POI"
    >
      <div style={{ marginBottom: 'var(--space-3)' }}>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 'var(--space-1)', fontWeight: 600 }}>
          Coordinates
        </div>
        <div style={{ fontSize: 13, color: 'var(--text)', fontFamily: 'monospace' }}>
          {lat.toFixed(4)}, {lon.toFixed(4)}
        </div>
      </div>

      <form onSubmit={handleCreate}>
        <div style={{ marginBottom: 'var(--space-3)' }}>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, display: 'block', marginBottom: 'var(--space-1)' }}>
            Name *
          </label>
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Coffee Shop"
            disabled={saving}
            autoFocus
          />
        </div>

        <div style={{ marginBottom: 'var(--space-3)' }}>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, display: 'block', marginBottom: 'var(--space-1)' }}>
            Category
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{
              width: '100%',
              padding: 'var(--space-2) var(--space-3)',
              fontSize: 13,
              border: '1px solid var(--border)',
              borderRadius: 8,
              background: 'var(--surface)',
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

        <div style={{ marginBottom: 'var(--space-4)' }}>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, display: 'block', marginBottom: 'var(--space-1)' }}>
            Description (optional)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add notes..."
            style={{
              width: '100%',
              padding: 'var(--space-2) var(--space-3)',
              fontSize: 13,
              border: '1px solid var(--border)',
              borderRadius: 8,
              background: 'var(--surface)',
              color: 'var(--text)',
              boxSizing: 'border-box',
              minHeight: 80,
              fontFamily: 'inherit',
              resize: 'vertical',
            }}
            disabled={saving}
          />
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving} style={{ flex: 1 }}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving} style={{ flex: 1 }}>
            {saving && <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />}
            {saving ? 'Creating...' : 'Create'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
