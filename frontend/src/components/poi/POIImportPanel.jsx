import React, { useRef, useState, useEffect } from 'react';
import { Upload, X, Loader, Eye, EyeOff, Edit2, Download, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';

import useMapStore from '../../store/mapStore.js';
import { uploadPOI, getImports, renameImport, deleteImport, exportImport } from '../../api/poi.js';

export default function POIImportPanel({ onClose }) {
  const { t } = useTranslation();
  const { imports, setImports, visibleImports, toggleImportVisibility } = useMapStore();
  const [uploading, setUploading] = useState(false);
  const [editingName, setEditingName] = useState(null);
  const [editingValue, setEditingValue] = useState('');
  const [deleting, setDeleting] = useState(null);
  const fileInputRef = useRef(null);

  // Load imports on mount
  useEffect(() => {
    loadImports();
  }, []);

  async function loadImports() {
    try {
      const data = await getImports();
      setImports(data);
    } catch (err) {
      console.error('Failed to load imports:', err);
    }
  }

  async function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.match(/\.(kml|kmz)$/i)) {
      toast.error(t('poi.invalid_format'));
      return;
    }

    setUploading(true);
    try {
      await uploadPOI(file);
      toast.success(t('poi.imported'));
      await loadImports();
    } catch (err) {
      toast.error(t('poi.upload_failed'));
      console.error('POI upload error:', err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleRename(oldName) {
    if (!editingValue.trim()) {
      setEditingName(null);
      return;
    }

    try {
      await renameImport(oldName, editingValue);
      toast.success(t('poi.renamed'));
      await loadImports();
      setEditingName(null);
    } catch (err) {
      toast.error(t('poi.rename_failed'));
      console.error('Rename error:', err);
    }
  }

  async function handleDelete(name) {
    setDeleting(name);
    try {
      await deleteImport(name);
      toast.success(t('poi.deleted'));
      await loadImports();
    } catch (err) {
      toast.error(t('poi.delete_failed'));
      console.error('Delete error:', err);
    } finally {
      setDeleting(null);
    }
  }

  async function handleExport(name) {
    try {
      await exportImport(name);
      toast.success(t('poi.exported'));
    } catch (err) {
      toast.error(t('poi.export_failed'));
      console.error('Export error:', err);
    }
  }

  return (
    <div className="island" style={{
      position: 'absolute', right: 52, top: '50%', transform: 'translateY(-50%)',
      width: 260, maxHeight: '70vh', overflowY: 'auto', padding: 10
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
          color: 'var(--text-secondary)'
        }}>
          {t('poi.title')}
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-secondary)', display: 'flex'
          }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Upload Button */}
      <label style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        padding: '10px 12px', borderRadius: 8,
        background: uploading ? 'rgba(0,122,255,0.05)' : 'var(--bg)',
        border: '2px dashed var(--accent)',
        cursor: uploading ? 'not-allowed' : 'pointer',
        fontSize: 12, fontWeight: 600, color: 'var(--accent)',
        opacity: uploading ? 0.6 : 1,
        transition: 'all 0.2s',
      }}>
        {uploading ? (
          <>
            <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
            {t('poi.uploading')}
          </>
        ) : (
          <>
            <Upload size={14} />
            Upload KML
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".kml,.kmz"
          onChange={handleFileSelect}
          disabled={uploading}
          style={{ display: 'none' }}
        />
      </label>

      {/* Imports List */}
      {imports.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
            color: 'var(--text-secondary)', marginBottom: 8
          }}>
            {t('poi.categories')} ({imports.length})
          </div>

          {imports.map((imp) => {
            const isVisible = visibleImports.has(imp.name);
            const isEditing = editingName === imp.name;
            const isDeleting = deleting === imp.name;

            return (
              <div
                key={imp.name}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 8px', marginBottom: 6, borderRadius: 6,
                  background: 'var(--bg)', border: '1px solid var(--border)',
                  fontSize: 12
                }}
              >
                {/* Eye toggle */}
                <button
                  onClick={() => toggleImportVisibility(imp.name)}
                  title={isVisible ? 'Hide' : 'Show'}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: isVisible ? 'var(--accent)' : 'var(--text-secondary)',
                    display: 'flex', padding: 0
                  }}
                >
                  {isVisible ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>

                {/* Name */}
                {isEditing ? (
                  <input
                    autoFocus
                    type="text"
                    value={editingValue}
                    onChange={(e) => setEditingValue(e.target.value)}
                    onBlur={() => handleRename(imp.name)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRename(imp.name);
                      if (e.key === 'Escape') setEditingName(null);
                    }}
                    style={{
                      flex: 1, border: '1px solid var(--accent)', padding: '4px 6px',
                      borderRadius: 4, fontSize: 12, background: 'var(--bg)',
                      color: 'var(--text)'
                    }}
                  />
                ) : (
                  <span
                    style={{
                      flex: 1, cursor: 'pointer', overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                    }}
                    title={imp.name}
                  >
                    {imp.name}
                  </span>
                )}

                {/* Count */}
                <span style={{
                  fontSize: 10, color: 'var(--text-secondary)',
                  padding: '2px 4px', background: 'rgba(0,0,0,0.1)',
                  borderRadius: 3
                }}>
                  {imp.count}
                </span>

                {/* Rename button */}
                <button
                  onClick={() => {
                    setEditingName(imp.name);
                    setEditingValue(imp.name);
                  }}
                  disabled={isEditing || isDeleting}
                  title="Rename"
                  style={{
                    background: 'none', border: 'none', cursor: isEditing || isDeleting ? 'not-allowed' : 'pointer',
                    color: 'var(--text-secondary)', display: 'flex', padding: 0,
                    opacity: isEditing || isDeleting ? 0.5 : 1
                  }}
                >
                  <Edit2 size={13} />
                </button>

                {/* Export button */}
                <button
                  onClick={() => handleExport(imp.name)}
                  disabled={isEditing || isDeleting}
                  title="Export"
                  style={{
                    background: 'none', border: 'none', cursor: isEditing || isDeleting ? 'not-allowed' : 'pointer',
                    color: 'var(--text-secondary)', display: 'flex', padding: 0,
                    opacity: isEditing || isDeleting ? 0.5 : 1
                  }}
                >
                  <Download size={13} />
                </button>

                {/* Delete button */}
                <button
                  onClick={() => handleDelete(imp.name)}
                  disabled={isEditing || isDeleting}
                  title="Delete"
                  style={{
                    background: 'none', border: 'none', cursor: isEditing || isDeleting ? 'not-allowed' : 'pointer',
                    color: isDeleting ? 'var(--accent)' : 'var(--text-secondary)', display: 'flex', padding: 0,
                    opacity: isEditing ? 0.5 : 1
                  }}
                >
                  {isDeleting ? (
                    <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} />
                  ) : (
                    <Trash2 size={13} />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {imports.length === 0 && (
        <div style={{
          marginTop: 12, fontSize: 12, color: 'var(--text-secondary)',
          textAlign: 'center', padding: '16px 8px'
        }}>
          {t('poi.no_data')}
        </div>
      )}
    </div>
  );
}
