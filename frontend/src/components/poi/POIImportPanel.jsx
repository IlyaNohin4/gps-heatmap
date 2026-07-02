import React, { useRef, useState } from 'react';
import { Upload, X, Loader } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';

import useMapStore from '../../store/mapStore.js';
import { uploadPOI, fetchPOI, fetchPOICategories } from '../../api/poi.js';

export default function POIImportPanel({ onClose }) {
  const { t } = useTranslation();
  const {
    userPOI, uploadedPOICategories, setUserPOI, setUploadedPOICategories,
    togglePOICategory, poiCategories, togglePOI, showPOI
  } = useMapStore();
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  async function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.match(/\.(kml|kmz)$/i)) {
      toast.error(t('poi.invalid_format'));
      return;
    }

    setUploading(true);
    try {
      // Upload file
      const uploadData = await uploadPOI(file);
      toast.success(t('poi.imported', { count: uploadData.imported }));

      // Update categories
      setUploadedPOICategories(uploadData.categories || []);

      // Refresh POI list
      const poiData = await fetchPOI();
      setUserPOI(poiData);

      // Auto-enable POI if not already
      if (!showPOI) togglePOI();
    } catch (err) {
      toast.error(t('poi.upload_failed'));
      console.error('POI upload error:', err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div className="island" style={{
      position: 'absolute', right: 52, top: '50%', transform: 'translateY(-50%)',
      width: 240, maxHeight: '70vh', overflowY: 'auto', padding: 10
    }}>
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
            {t('poi.upload_kml_kmz')}
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

      {/* Categories List */}
      {uploadedPOICategories.length > 0 && (
        <div style={{ marginTop: 10, maxHeight: 200, overflowY: 'auto' }}>
          <div style={{
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
            color: 'var(--text-secondary)', marginBottom: 6
          }}>
            {t('poi.categories')}
          </div>
          {uploadedPOICategories.map((cat) => {
            const active = poiCategories.includes(cat.name);
            return (
              <button
                key={cat.name}
                onClick={() => {
                  togglePOICategory(cat.name);
                  if (!showPOI) togglePOI();
                }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', padding: '7px 8px', borderRadius: 6,
                  background: active ? 'rgba(0,122,255,0.1)' : 'none',
                  border: 'none', cursor: 'pointer', fontSize: 12,
                  color: active ? 'var(--accent)' : 'var(--text)',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = active ? 'rgba(0,122,255,0.1)' : 'var(--bg)'}
                onMouseLeave={(e) => e.currentTarget.style.background = active ? 'rgba(0,122,255,0.1)' : 'none'}
              >
                <span>{cat.name}</span>
                <span style={{ fontSize: 11, opacity: 0.6 }}>({cat.count})</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {uploadedPOICategories.length === 0 && (
        <div style={{
          marginTop: 10, fontSize: 12, color: 'var(--text-secondary)',
          textAlign: 'center', padding: '20px 10px'
        }}>
          {t('poi.no_data')}
        </div>
      )}

      {/* Toggle visibility */}
      {uploadedPOICategories.length > 0 && (
        <label style={{
          display: 'flex', alignItems: 'center', gap: 6, marginTop: 10,
          fontSize: 12, cursor: 'pointer'
        }}>
          <input
            type="checkbox"
            checked={showPOI}
            onChange={() => togglePOI()}
            style={{ width: 14, height: 14, accentColor: 'var(--accent)', cursor: 'pointer' }}
          />
          {showPOI ? t('map.on') : t('map.off')}
        </label>
      )}
    </div>
  );
}
