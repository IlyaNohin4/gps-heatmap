import React, { useState } from 'react';
import { toast } from 'react-toastify';
import { Trash2, X } from 'lucide-react';
import { deleteTrack, renameTrack } from '../../api/tracks.js';

export default function TrackManagementModal({ track, isOpen, onClose, onRenamed, onDeleted }) {
  const [nameValue, setNameValue] = useState(track?.name || '');
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!isOpen || !track) return null;

  async function handleRename() {
    if (!nameValue.trim()) {
      toast.error('Track name cannot be empty');
      return;
    }
    if (nameValue === track.name) {
      toast.info('No changes made');
      return;
    }

    setRenaming(true);
    try {
      await renameTrack(track.id, nameValue);
      toast.success('Track renamed');
      onRenamed?.({ ...track, name: nameValue });
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to rename track');
    } finally {
      setRenaming(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteTrack(track.id);
      toast.success('Track deleted');
      onDeleted?.(track.id);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete track');
    } finally {
      setDeleting(false);
    }
  }

  return (
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
          padding: '20px',
          maxWidth: 400,
          width: '90%',
          animation: 'fadeIn 0.2s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Manage Track</h2>
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
            <X size={18} />
          </button>
        </div>

        {/* Rename Section */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase' }}>
            Rename Track
          </label>
          <input
            type="text"
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            placeholder="Enter new name"
            disabled={renaming || deleting}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 'var(--radius-input)',
              border: '1px solid var(--border)',
              background: 'var(--bg-input)',
              color: 'var(--text)',
              marginBottom: 8,
              boxSizing: 'border-box',
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename();
            }}
          />
          <button
            onClick={handleRename}
            disabled={renaming || deleting || nameValue === track.name}
            className="btn-primary"
            style={{
              width: '100%',
              opacity: renaming || nameValue === track.name ? 0.6 : 1,
              cursor: renaming || nameValue === track.name ? 'not-allowed' : 'pointer',
            }}
          >
            {renaming ? 'Saving...' : 'Save Name'}
          </button>
        </div>

        {/* Divider */}
        <div style={{ height: 1, backgroundColor: 'var(--border)', marginBottom: 24 }} />

        {/* Delete Section */}
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase' }}>
            Danger Zone
          </label>
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={deleting || renaming}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 'var(--radius-input)',
                border: '1px solid rgba(255, 59, 48, 0.3)',
                background: 'rgba(255, 59, 48, 0.05)',
                color: 'rgb(255, 59, 48)',
                fontWeight: 600,
                fontSize: 13,
                cursor: deleting || renaming ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                opacity: deleting || renaming ? 0.6 : 1,
              }}
            >
              <Trash2 size={14} />
              Delete Track
            </button>
          ) : (
            <div style={{ padding: 12, backgroundColor: 'rgba(255, 59, 48, 0.1)', borderRadius: 8, marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 12, fontWeight: 500 }}>
                Are you sure? This cannot be undone.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                  className="btn-secondary"
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-input)',
                    border: 'none',
                    background: 'rgb(255, 59, 48)',
                    color: '#fff',
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: deleting ? 'not-allowed' : 'pointer',
                    opacity: deleting ? 0.7 : 1,
                  }}
                >
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
