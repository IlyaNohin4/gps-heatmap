import React, { useState, useEffect, useRef } from 'react';
import { Plus, MapPin, Trash2, Upload, X as XIcon, Loader, Search } from 'lucide-react';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import useMapStore from '../../store/mapStore.js';
import { fetchPOI, deletePOI, uploadPOI } from '../../api/poi.js';

export default function POITab() {
  const { t } = useTranslation();
  const { pois, setPOIs, setPoiCreationMode, poiCreationMode, mapInstance } = useMapStore();
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadPOIs();
  }, []);

  async function loadPOIs() {
    setLoading(true);
    try {
      const data = await fetchPOI();
      setPOIs(data);
    } catch (err) {
      toast.error('Failed to load POI');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.match(/\.(kml|kmz)$/i)) {
      toast.error('Only KML and KMZ files are supported');
      return;
    }

    setUploading(true);
    try {
      await uploadPOI(file);
      toast.success('POI imported successfully');
      await loadPOIs();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to import POI');
      console.error(err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function handleToggleCreation() {
    setPoiCreationMode(!poiCreationMode);
  }

  async function handleDeletePOI(id) {
    setDeleting(id);
    try {
      await deletePOI(id);
      toast.success('POI deleted');
      await loadPOIs();
    } catch (err) {
      toast.error('Failed to delete POI');
    } finally {
      setDeleting(null);
    }
  }

  function handleZoomToPOI(poi) {
    if (!mapInstance) return;
    mapInstance.flyTo([poi.lat, poi.lon], 16, { duration: 1.2, easeLinearity: 0.25 });
  }

  const filteredPOIs = pois.filter((poi) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (poi.name || '').toLowerCase().includes(q) ||
           (poi.category || '').toLowerCase().includes(q);
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Search bar */}
      <div style={{ padding: '10px 10px 0', display: 'flex', gap: 6 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search POI..."
            style={{ borderRadius: 'var(--radius-search)', paddingLeft: 30, paddingRight: search ? 30 : 12 }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex' }}>
              <XIcon size={13} />
            </button>
          )}
        </div>
      </div>

      {/* POI List */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '8px 0',
      }}>
        {loading ? (
          <div style={{ padding: '16px 14px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12 }}>
            Loading POI...
          </div>
        ) : pois.length === 0 ? (
          <div style={{
            padding: '20px 14px',
            textAlign: 'center',
            color: 'var(--text-secondary)',
            fontSize: 12,
          }}>
            No POI yet<br />
            Click the + button then right-click on map
          </div>
        ) : filteredPOIs.length === 0 ? (
          <div style={{
            padding: '20px 14px',
            textAlign: 'center',
            color: 'var(--text-secondary)',
            fontSize: 12,
          }}>
            No results found
          </div>
        ) : (
          filteredPOIs.map((poi) => (
            <div
              key={poi.id}
              style={{
                padding: '8px 14px',
                marginBottom: 4,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              onClick={() => handleZoomToPOI(poi)}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--text)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  📍 {poi.name}
                </div>
                <div style={{
                  fontSize: 11,
                  color: 'var(--text-secondary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {poi.category}
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeletePOI(poi.id);
                }}
                disabled={deleting === poi.id}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: deleting === poi.id ? 'not-allowed' : 'pointer',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  opacity: deleting === poi.id ? 0.5 : 1,
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Bottom actions */}
      <div style={{ padding: '8px 10px 10px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="btn-secondary"
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px', opacity: uploading ? 0.6 : 1 }}
          title="Import KML/KMZ file"
        >
          {uploading ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={14} />}
          Import
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".kml,.kmz"
          onChange={handleFileSelect}
          disabled={uploading}
          style={{ display: 'none' }}
        />
        <button
          onClick={handleToggleCreation}
          className={poiCreationMode ? 'btn-primary' : 'btn-secondary'}
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px' }}
          title="Create POI (right-click on map)"
        >
          <Plus size={14} /> Create
        </button>
      </div>

      {/* Status indicator */}
      {poiCreationMode && (
        <div style={{
          padding: '6px 14px',
          background: 'rgba(0, 122, 255, 0.1)',
          fontSize: 10,
          color: 'var(--accent)',
          fontWeight: 600,
          textAlign: 'center',
        }}>
          ✓ Right-click on map to create
        </div>
      )}
    </div>
  );
}
