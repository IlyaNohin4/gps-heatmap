import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { notify as toast } from '../../utils/notify.js';
import Modal from '../../ui/Modal.jsx';
import Button from '../../ui/Button.jsx';

/** Deletes a batch of ids one at a time via `deleteFn`, tolerating individual
 * failures (already-deleted / network hiccup) rather than aborting the
 * whole batch on the first error — reports how many actually succeeded. */
export default function BulkDeleteModal({ isOpen, onClose, ids, deleteFn, onDeleted, title, itemLabel }) {
  const { t } = useTranslation();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    const succeeded = [];
    for (const id of ids) {
      try {
        await deleteFn(id);
        succeeded.push(id);
      } catch (err) {
        console.error(`Bulk delete failed for ${id}:`, err);
      }
    }
    setDeleting(false);
    onDeleted?.(succeeded);
    onClose();
    if (succeeded.length === ids.length) {
      toast.success(t('bulk.delete_success', { count: succeeded.length }));
    } else if (succeeded.length > 0) {
      toast.error(t('bulk.delete_partial', { done: succeeded.length, total: ids.length }));
    } else {
      toast.error(t('bulk.delete_failed'));
    }
  }

  if (!ids || ids.length === 0) return null;

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={title}
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={deleting} style={{ flex: 1 }}>
            {t('bulk.cancel')}
          </Button>
          <Button variant="danger" onClick={handleDelete} disabled={deleting} style={{ flex: 1 }}>
            {deleting ? t('bulk.deleting') : t('bulk.confirm_delete')}
          </Button>
        </>
      }
    >
      <p style={{ margin: 0, fontSize: 14, color: 'var(--text)', lineHeight: 1.5 }}>
        {t('bulk.delete_confirm', { count: ids.length, item: itemLabel })}
      </p>
      <p style={{ margin: 'var(--space-2) 0 0 0', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        {t('bulk.irreversible')}
      </p>
    </Modal>
  );
}
