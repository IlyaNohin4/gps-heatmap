import React, { useEffect, useState } from 'react';
import { Edit2, Loader, Plus, Trash2, X as XIcon } from 'lucide-react';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import { fetchPOICategories, createCategory, renameCategory, deleteCategory } from '../../api/poi.js';
import { apiErrorMessage } from '../../utils/apiError.js';
import useAppStore from '../../store/appStore.js';
import Modal from '../../ui/Modal.jsx';

export default function CategoryManageModal({ open, onClose }) {
  const { t } = useTranslation();
  const { bumpPOIListVersion } = useAppStore();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(null);
  const [editingValue, setEditingValue] = useState('');
  const [deletingName, setDeletingName] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [savingNewCategory, setSavingNewCategory] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchPOICategories()
      .then(setCategories)
      .catch((err) => console.error('Failed to load categories:', err))
      .finally(() => setLoading(false));
  }, [open]);

  async function handleCreate() {
    if (!newCategoryName.trim()) {
      setCreating(false);
      return;
    }
    setSavingNewCategory(true);
    try {
      await createCategory(newCategoryName.trim());
      toast.success(t('poi.category_created'));
      const data = await fetchPOICategories();
      setCategories(data);
      setNewCategoryName('');
      setCreating(false);
      bumpPOIListVersion();
    } catch (err) {
      toast.error(apiErrorMessage(err, t('poi.category_create_failed')));
    } finally {
      setSavingNewCategory(false);
    }
  }

  async function handleRename(oldName) {
    if (!editingValue.trim() || editingValue.trim() === oldName) {
      setEditingName(null);
      return;
    }
    try {
      await renameCategory(oldName, editingValue.trim());
      toast.success(t('poi.category_renamed'));
      const data = await fetchPOICategories();
      setCategories(data);
      bumpPOIListVersion();
    } catch (err) {
      toast.error(apiErrorMessage(err, t('poi.category_rename_failed')));
    } finally {
      setEditingName(null);
    }
  }

  async function handleDelete(name) {
    setDeletingName(name);
    try {
      await deleteCategory(name);
      toast.success(t('poi.category_deleted'));
      const data = await fetchPOICategories();
      setCategories(data);
      bumpPOIListVersion();
    } catch (err) {
      toast.error(apiErrorMessage(err, t('poi.category_delete_failed')));
    } finally {
      setDeletingName(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('poi.manage_categories')}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 'var(--space-2)' }}>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 13, fontWeight: 600, padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <Plus size={14} /> {t('poi.new_category')}
          </button>
        )}
      </div>

      {creating && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', marginBottom: 'var(--space-2)' }}>
          <input
            autoFocus
            type="text"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') { setCreating(false); setNewCategoryName(''); }
            }}
            placeholder={t('poi.new_category_placeholder')}
            disabled={savingNewCategory}
            style={{ flex: 1, border: '1px solid var(--accent)', padding: '6px 8px', borderRadius: 6, fontSize: 13, background: 'var(--bg)', color: 'var(--text)' }}
          />
          <button
            onClick={handleCreate}
            disabled={savingNewCategory}
            style={{ background: 'none', border: 'none', cursor: savingNewCategory ? 'not-allowed' : 'pointer', color: 'var(--accent)', display: 'flex', padding: 0 }}
            title={t('poi.new_category')}
          >
            {savingNewCategory ? <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={16} />}
          </button>
          <button
            onClick={() => { setCreating(false); setNewCategoryName(''); }}
            disabled={savingNewCategory}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', padding: 0 }}
            title="Cancel"
          >
            <XIcon size={16} />
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 'var(--space-3) 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
          {t('poi.loading')}
        </div>
      ) : categories.length === 0 ? (
        <div style={{ padding: 'var(--space-3) 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
          {t('poi.no_categories')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          {categories.map((cat) => {
            const isEditing = editingName === cat.name;
            const isDeleting = deletingName === cat.name;
            return (
              <div
                key={cat.name}
                style={{
                  display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
                  padding: '8px 10px', borderRadius: 8,
                  background: 'var(--bg)', border: '1px solid var(--border)',
                  fontSize: 13,
                }}
              >
                {isEditing ? (
                  <input
                    autoFocus
                    type="text"
                    value={editingValue}
                    onChange={(e) => setEditingValue(e.target.value)}
                    onBlur={() => handleRename(cat.name)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRename(cat.name);
                      if (e.key === 'Escape') setEditingName(null);
                    }}
                    style={{ flex: 1, border: '1px solid var(--accent)', padding: '4px 6px', borderRadius: 4, fontSize: 13, background: 'var(--bg)', color: 'var(--text)' }}
                  />
                ) : (
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={cat.name}>
                    {cat.name}
                  </span>
                )}
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '2px 6px', background: 'rgba(0,0,0,0.1)', borderRadius: 4 }}>
                  {cat.count}
                </span>
                <button
                  onClick={() => { setEditingName(cat.name); setEditingValue(cat.name); }}
                  disabled={isEditing || isDeleting}
                  title={t('poi.rename')}
                  style={{ background: 'none', border: 'none', cursor: isEditing || isDeleting ? 'not-allowed' : 'pointer', color: 'var(--text-secondary)', display: 'flex', padding: 0, opacity: isEditing || isDeleting ? 0.5 : 1 }}
                >
                  <Edit2 size={14} />
                </button>
                <button
                  onClick={() => handleDelete(cat.name)}
                  disabled={isEditing || isDeleting || cat.name === 'other'}
                  title={cat.name === 'other' ? t('poi.category_other_protected') : t('poi.delete')}
                  style={{
                    background: 'none', border: 'none',
                    cursor: isEditing || isDeleting || cat.name === 'other' ? 'not-allowed' : 'pointer',
                    color: isDeleting ? 'var(--accent)' : 'var(--text-secondary)',
                    display: 'flex', padding: 0,
                    opacity: isEditing || cat.name === 'other' ? 0.5 : 1,
                  }}
                >
                  {isDeleting ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={14} />}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
