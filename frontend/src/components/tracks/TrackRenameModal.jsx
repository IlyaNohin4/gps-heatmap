import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { renameTrack } from '../../api/tracks.js';

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
      toast.error(err.response?.data?.detail || t('tracks.rename_failed'));
    } finally {
      setRenaming(false);
    }
  }

  if (!isOpen || !track) return null;

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
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Rename Track</h2>
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
            Enter new name for the track
          </p>
        </div>

        {/* Input */}
        <input
          type="text"
          value={nameValue}
          onChange={(e) => setNameValue(e.target.value)}
          placeholder="New track name"
          disabled={renaming}
          autoFocus
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--bg-input)',
            color: 'var(--text)',
            marginBottom: 20,
            boxSizing: 'border-box',
            fontSize: 13,
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleRename();
            if (e.key === 'Escape') onClose();
          }}
        />

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
            disabled={renaming || nameValue === track.name}
            className="btn-primary"
            style={{
              flex: 1,
              opacity: renaming || nameValue === track.name ? 0.6 : 1,
              cursor: renaming || nameValue === track.name ? 'not-allowed' : 'pointer',
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
