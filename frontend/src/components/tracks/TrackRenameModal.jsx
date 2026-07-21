import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import { renameTrack } from '../../api/tracks.js';
import { apiErrorMessage } from '../../utils/apiError.js';
import Modal from '../../ui/Modal.jsx';
import Button from '../../ui/Button.jsx';
import Input from '../../ui/Input.jsx';

export default function TrackRenameModal({ track, isOpen, onClose, onRenamed }) {
  const { t } = useTranslation();
  const [nameValue, setNameValue] = useState(track?.name || '');
  const [renaming, setRenaming] = useState(false);

  useEffect(() => {
    if (isOpen && track) {
      setNameValue(track.name || '');
    }
  }, [isOpen, track]);

  async function handleRename() {
    if (!nameValue.trim()) {
      toast.error(t('validation.track_name_empty'));
      return;
    }
    if (nameValue === track.name) {
      toast.info(t('validation.no_changes'));
      return;
    }

    setRenaming(true);
    try {
      await renameTrack(track.id, nameValue);
      toast.success(t('tracks.renamed_success'));
      onRenamed?.({ ...track, name: nameValue });
      onClose();
    } catch (err) {
      toast.error(apiErrorMessage(err, t('tracks.rename_failed')));
    } finally {
      setRenaming(false);
    }
  }

  if (!track) return null;

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Rename Track"
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={renaming} style={{ flex: 1 }}>
            Cancel
          </Button>
          <Button
            onClick={handleRename}
            disabled={renaming || nameValue === track.name}
            style={{ flex: 1 }}
          >
            {renaming ? 'Saving...' : 'Save'}
          </Button>
        </>
      }
    >
      <p style={{ margin: '0 0 var(--space-3)', fontSize: 13, color: 'var(--text-secondary)' }}>
        Enter new name for the track
      </p>

      <Input
        type="text"
        value={nameValue}
        onChange={(e) => setNameValue(e.target.value)}
        placeholder="New track name"
        disabled={renaming}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleRename();
          if (e.key === 'Escape') onClose();
        }}
      />
    </Modal>
  );
}
