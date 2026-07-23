import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import { updatePOI } from '../../api/poi.js';
import { apiErrorMessage } from '../../utils/apiError.js';
import Modal from '../../ui/Modal.jsx';
import Button from '../../ui/Button.jsx';
import Input from '../../ui/Input.jsx';
import IconPicker from './IconPicker.jsx';
import ColorPicker from './ColorPicker.jsx';

const CATEGORIES = [
  'Food', 'Medical', 'Transport', 'Accommodation', 'Tourism',
  'Amenities', 'Bicycle', 'Public Transport', 'Other'
];

export default function POIRenameModal({ poi, isOpen, onClose, onRenamed }) {
  const { t } = useTranslation();
  const [nameValue, setNameValue] = useState(poi?.name || '');
  const [categoryValue, setCategoryValue] = useState(poi?.category || '');
  const [iconValue, setIconValue] = useState(poi?.icon ?? null);
  const [colorValue, setColorValue] = useState(poi?.color ?? null);
  const [renaming, setRenaming] = useState(false);

  useEffect(() => {
    if (isOpen && poi) {
      setNameValue(poi.name || '');
      setCategoryValue(poi.category || '');
      setIconValue(poi.icon ?? null);
      setColorValue(poi.color ?? null);
    }
  }, [isOpen, poi]);

  async function handleRename() {
    if (!nameValue.trim()) {
      toast.error(t('validation.poi_name_empty'));
      return;
    }
    if (
      nameValue === poi.name &&
      categoryValue === poi.category &&
      iconValue === (poi.icon ?? null) &&
      colorValue === (poi.color ?? null)
    ) {
      toast.info(t('validation.no_changes'));
      return;
    }

    setRenaming(true);
    try {
      const updates = {};
      if (nameValue !== poi.name) updates.name = nameValue;
      if (categoryValue !== poi.category) updates.category = categoryValue;
      if (iconValue !== (poi.icon ?? null)) updates.icon = iconValue;
      if (colorValue !== (poi.color ?? null)) updates.color = colorValue;

      await updatePOI(poi.id, updates);
      toast.success(t('poi.updated_success'));
      onRenamed?.({ ...poi, name: nameValue, category: categoryValue, icon: iconValue, color: colorValue });
      onClose();
    } catch (err) {
      toast.error(apiErrorMessage(err, t('poi.update_failed')));
    } finally {
      setRenaming(false);
    }
  }

  if (!poi) return null;

  const unchanged =
    nameValue === poi.name &&
    categoryValue === poi.category &&
    iconValue === (poi.icon ?? null) &&
    colorValue === (poi.color ?? null);

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Rename POI"
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={renaming} style={{ flex: 1 }}>
            Cancel
          </Button>
          <Button onClick={handleRename} disabled={renaming || unchanged} style={{ flex: 1 }}>
            {renaming ? 'Saving...' : 'Save'}
          </Button>
        </>
      }
    >
      <p style={{ margin: '0 0 var(--space-3)', fontSize: 13, color: 'var(--text-secondary)' }}>
        Edit POI details
      </p>

      {/* Name Input */}
      <div style={{ marginBottom: 'var(--space-3)' }}>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, display: 'block', marginBottom: 'var(--space-1)' }}>
          Name
        </label>
        <Input
          type="text"
          value={nameValue}
          onChange={(e) => setNameValue(e.target.value)}
          placeholder="POI name"
          disabled={renaming}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleRename();
            if (e.key === 'Escape') onClose();
          }}
        />
      </div>

      {/* Category Select */}
      <div>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, display: 'block', marginBottom: 'var(--space-1)' }}>
          Category
        </label>
        <select
          value={categoryValue}
          onChange={(e) => setCategoryValue(e.target.value)}
          disabled={renaming}
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
        >
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </div>

      {/* Icon Picker */}
      <div style={{ marginTop: 'var(--space-3)' }}>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, display: 'block', marginBottom: 'var(--space-1)' }}>
          Icon
        </label>
        <IconPicker value={iconValue} onChange={setIconValue} disabled={renaming} />
      </div>

      {/* Color Picker */}
      <div style={{ marginTop: 'var(--space-3)' }}>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, display: 'block', marginBottom: 'var(--space-1)' }}>
          Color
        </label>
        <ColorPicker value={colorValue} onChange={setColorValue} disabled={renaming} />
      </div>
    </Modal>
  );
}
