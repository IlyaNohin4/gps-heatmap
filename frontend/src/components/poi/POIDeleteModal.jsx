import React, { useState } from 'react';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import { deletePOI } from '../../api/poi.js';
import Modal from '../../ui/Modal.jsx';
import Button from '../../ui/Button.jsx';

export default function POIDeleteModal({ poi, isOpen, onClose, onDeleted }) {
  const { t } = useTranslation();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await deletePOI(poi.id);
      toast.success(t('poi.deleted_success'));
      onDeleted?.(poi.id);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || t('poi.delete_failed'));
    } finally {
      setDeleting(false);
    }
  }

  if (!poi) return null;

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Delete POI"
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={deleting} style={{ flex: 1 }}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDelete} disabled={deleting} style={{ flex: 1 }}>
            {deleting ? 'Deleting...' : 'Yes'}
          </Button>
        </>
      }
    >
      <p style={{ margin: 0, fontSize: 14, color: 'var(--text)', lineHeight: 1.5 }}>
        You want to delete <strong>{poi.name}</strong>?
      </p>
      <p style={{ margin: 'var(--space-2) 0 0 0', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        This action cannot be undone.
      </p>
    </Modal>
  );
}
