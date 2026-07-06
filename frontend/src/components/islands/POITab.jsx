import React, { useState, useRef, useMemo, useCallback, Suspense, lazy, useDeferredValue } from 'react';
import { Plus, Upload, X as XIcon, Loader, Search, ChevronLeft, Eye, EyeOff } from 'lucide-react';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import useMapStore from '../../store/mapStore.js';
import { fetchPOI, deletePOI, uploadPOI } from '../../api/poi.js';
import POICard from '../poi/POICard.jsx';
import '../../styles/poi.css';
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

  // Defer rendering of list to keep UI responsive
  const deferredFilteredPOIs = useDeferredValue(filteredPOIs);

  return (
    <div className="poi-tab">
      {/* Search bar */}
      <div className="poi-header">
        <div className="poi-search-wrapper">
          <Search size={14} className="poi-search-icon" />
          <input
            className="poi-search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search POI..."
          />
          {search && (
            <button className="poi-search-clear" onClick={() => setSearch('')}>
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
      <div className="poi-list-container">
        {loading ? (
          <div className="poi-loading">Loading POI...</div>
        ) : pois.length === 0 ? (
          <div className="poi-empty-state">
            No POI yet<br />
            Click the + button then left-click on map
          </div>
        ) : deferredFilteredPOIs.length === 0 ? (
          <div className="poi-empty-state">No results found</div>
        ) : (
          deferredFilteredPOIs.map((poi) => (
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
      <div className="poi-actions">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className={`btn-secondary poi-action-btn ${uploading ? 'uploading' : ''}`}
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
          className={`poi-action-btn ${poiCreationMode ? 'btn-primary' : 'btn-secondary'}`}
          title="Create POI"
        >
          <Plus size={14} /> Create
        </button>
      </div>

      {/* Status indicator */}
      {poiCreationMode && (
        <div className="poi-status">
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
