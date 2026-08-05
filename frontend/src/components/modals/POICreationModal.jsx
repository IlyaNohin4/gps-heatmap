import React, { useEffect, useState } from 'react';
import { Loader } from 'lucide-react';
import { notify as toast } from '../../utils/notify.js';
import { useTranslation } from 'react-i18next';
import { createPOI, createList, getLists } from '../../api/poi.js';
import { apiErrorMessage } from '../../utils/apiError.js';
import useMapStore from '../../store/mapStore.js';
import Modal from '../../ui/Modal.jsx';
import Button from '../../ui/Button.jsx';
import Input from '../../ui/Input.jsx';
import IconPicker from '../poi/IconPicker.jsx';
import ColorPicker from '../poi/ColorPicker.jsx';
import CategorySelect from '../poi/CategorySelect.jsx';

const NEW_LIST_VALUE = '__new__';

export default function POICreationModal({ lat, lon, onClose, onSuccess }) {
  const { t } = useTranslation();
  const { lists, setLists } = useMapStore();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Food');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState(null);
  const [color, setColor] = useState(null);
  const [visited, setVisited] = useState(false);
  const [saving, setSaving] = useState(false);
  // '' = not decided yet (still loading lists); NEW_LIST_VALUE = show the
  // "new list name" field; otherwise an existing list name. A POI always
  // belongs to a list — there is no "no list" option.
  const [listChoice, setListChoice] = useState('');
  const [newListName, setNewListName] = useState('');
  const [listsLoaded, setListsLoaded] = useState(false);

  useEffect(() => {
    getLists()
      .then((data) => {
        setLists(data);
        // No list is pre-selected — the user must actively pick one (or
        // "+ New list...") each time, except when there's nothing to pick
        // from at all, where the new-list field is the only option anyway.
        setListChoice((current) => {
          if (current) return current;
          if (data.length === 0) {
            setNewListName((name) => name || 'My Points');
            return NEW_LIST_VALUE;
          }
          return '';
        });
      })
      .catch((err) => console.error('Failed to load lists:', err))
      .finally(() => setListsLoaded(true));
  }, [setLists]);

  async function handleCreate(e) {
    e.preventDefault();

    if (!name.trim()) {
      toast.error(t('validation.name_required'));
      return;
    }
    if (listChoice === NEW_LIST_VALUE && !newListName.trim()) {
      toast.error(t('validation.name_required'));
      return;
    }
    if (!listChoice) {
      toast.error('Please select a list');
      return;
    }

    setSaving(true);
    try {
      let targetList = listChoice === NEW_LIST_VALUE ? newListName.trim() : listChoice;
      if (listChoice === NEW_LIST_VALUE) {
        await createList(targetList);
      }
      const poi = await createPOI(name, lat, lon, category, description || null, icon, color, visited, targetList);
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
          <CategorySelect value={category} onChange={setCategory} disabled={saving} />
        </div>

        <div style={{ marginBottom: 'var(--space-3)' }}>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, display: 'block', marginBottom: 'var(--space-1)' }}>
            List
          </label>
          <select
            value={listChoice}
            onChange={(e) => setListChoice(e.target.value)}
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
            disabled={saving || !listsLoaded}
          >
            {!listChoice && (
              <option value="" disabled>{listsLoaded ? 'Select a list…' : 'Loading…'}</option>
            )}
            {lists.map((list) => (
              <option key={list.name} value={list.name}>{list.name} ({list.count})</option>
            ))}
            <option value={NEW_LIST_VALUE}>+ New list…</option>
          </select>
          {listChoice === NEW_LIST_VALUE && (
            <Input
              type="text"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              placeholder="New list name"
              disabled={saving}
              autoFocus
              style={{ marginTop: 'var(--space-2)' }}
            />
          )}
        </div>

        <div style={{ marginBottom: 'var(--space-3)' }}>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, display: 'block', marginBottom: 'var(--space-1)' }}>
            Icon
          </label>
          <IconPicker value={icon} onChange={setIcon} disabled={saving} />
        </div>

        <div style={{ marginBottom: 'var(--space-3)' }}>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, display: 'block', marginBottom: 'var(--space-1)' }}>
            Color
          </label>
          <ColorPicker value={color} onChange={setColor} disabled={saving} />
        </div>

        <div style={{ marginBottom: 'var(--space-3)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={visited}
              onChange={(e) => setVisited(e.target.checked)}
              disabled={saving}
            />
            Visited
          </label>
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
          <Button type="submit" disabled={saving || !listsLoaded} style={{ flex: 1 }}>
            {saving && <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />}
            {saving ? 'Creating...' : 'Create'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
