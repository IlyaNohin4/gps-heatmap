import React, { useState, useRef, useMemo, useCallback, Suspense, lazy } from 'react';
import { Plus, Upload, X as XIcon, Loader, Search, ChevronLeft, Eye, EyeOff } from 'lucide-react';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import useMapStore from '../../store/mapStore.js';
import { fetchPOI, deletePOI, uploadPOI } from '../../api/poi.js';
import POICard from '../poi/POICard.jsx';
const POIRenameModal = lazy(() => import('../poi/POIRenameModal.jsx'));
const POIDeleteModal = lazy(() => import('../poi/POIDeleteModal.jsx'));

export default React.memo(function POITab({ onCollapse }) {
  const { t } = useTranslation();
  const { pois, setPOIs, setPoiCreationMode, poiCreationMode, mapInstance, showPOI, togglePOI } = useMapStore();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState('');
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedPOI, setSelectedPOI] = useState(null);
  const fileInputRef = useRef(null);

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

  const handleToggleCreation = useCallback(() => {
    setPoiCreationMode(!poiCreationMode);
  }, [poiCreationMode, setPoiCreationMode]);

  const handleRenamed = useCallback((updatedPOI) => {
    const updated = pois.map((p) => (p.id === updatedPOI.id ? updatedPOI : p));
    setPOIs(updated);
  }, [pois, setPOIs]);

  const handleDeleted = useCallback((poiId) => {
    useMapStore.getState().removePOI(poiId);
  }, []);

  const handleZoomToPOI = useCallback((poi) => {
    if (!mapInstance) return;
    mapInstance.flyTo([poi.lat, poi.lon], 16, { duration: 1.2, easeLinearity: 0.25 });
  }, [mapInstance]);

  const handleOpenRenameModalCb = useCallback((poi) => {
    setSelectedPOI(poi);
    setShowRenameModal(true);
  }, []);

  const handleOpenDeleteModalCb = useCallback((poi) => {
    setSelectedPOI(poi);
    setShowDeleteModal(true);
  }, []);

  const handleCloseRenameModal = useCallback(() => setShowRenameModal(false), []);

  const handleCloseDeleteModal = useCallback(() => setShowDeleteModal(false), []);

  const filteredPOIs = useMemo(() => {
    return pois.filter((poi) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (poi.name || '').toLowerCase().includes(q) ||
             (poi.category || '').toLowerCase().includes(q);
    });
  }, [pois, search]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Search bar */}
      <div style={{ padding: '10px 10px 0', display: 'flex', gap: 6, flexShrink: 0 }}>
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
        <button
          className="icon-btn"
          onClick={togglePOI}
          title={showPOI ? 'Hide all POI' : 'Show all POI'}
        >
          {showPOI ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>
        {onCollapse && (
          <button
            className="icon-btn"
            onClick={onCollapse}
            title="Collapse sidebar"
          >
            <ChevronLeft size={15} />
          </button>
        )}
      </div>

      {/* POI List */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px 10px 4px' }}>
        {loading ? (
          <div style={{ padding: '16px 14px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12 }}>
            Loading POI...
          </div>
        ) : pois.length === 0 ? (
          <div style={{ padding: '20px 14px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12 }}>
            No POI yet<br />
            Click the + button then left-click on map
          </div>
        ) : filteredPOIs.length === 0 ? (
          <div style={{ padding: '20px 14px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12 }}>
            No results found
          </div>
        ) : (
          filteredPOIs.map((poi) => (
            <POICard
              key={poi.id}
              poi={poi}
              onZoom={() => handleZoomToPOI(poi)}
              onRename={() => handleOpenRenameModalCb(poi)}
              onDelete={() => handleOpenDeleteModalCb(poi)}
            />
          ))
        )}
      </div>

      {/* Bottom actions */}
      <div style={{ padding: '8px 10px 10px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, flexShrink: 0 }}>
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
          title="Create POI"
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
          flexShrink: 0,
        }}>
          ✓ Left-click on map to create
        </div>
      )}

      {/* Modals - lazy loaded */}
      <Suspense fallback={null}>
        <POIRenameModal
          poi={selectedPOI}
          isOpen={showRenameModal}
          onClose={handleCloseRenameModal}
          onRenamed={handleRenamed}
        />
      </Suspense>

      <Suspense fallback={null}>
        <POIDeleteModal
          poi={selectedPOI}
          isOpen={showDeleteModal}
          onClose={handleCloseDeleteModal}
          onDeleted={handleDeleted}
        />
      </Suspense>
    </div>
  );
});
