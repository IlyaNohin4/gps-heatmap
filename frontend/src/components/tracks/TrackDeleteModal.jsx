import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'react-toastify';
import { X } from 'lucide-react';
import { deleteTrack } from '../../api/tracks.js';

export default function TrackDeleteModal({ track, isOpen, onClose, onDeleted }) {
  const [deleting, setDeleting] = useState(false);

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
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Delete Track</h2>
          <button
            onClick={onClose}
            disabled={deleting}
            style={{
              background: 'none',
              border: 'none',
              cursor: deleting ? 'not-allowed' : 'pointer',
              color: 'var(--text-secondary)',
              display: 'flex',
              opacity: deleting ? 0.5 : 1,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Message */}
        <div style={{ marginBottom: 24 }}>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text)', lineHeight: 1.5 }}>
            You want to delete <strong>{track.name}</strong>?
          </p>
          <p style={{ margin: '8px 0 0 0', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            This action cannot be undone.
          </p>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onClose}
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
            {deleting ? 'Deleting...' : 'Yes'}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
