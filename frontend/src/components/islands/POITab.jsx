import React, { useState, useRef, useEffect, useCallback, Suspense, lazy } from 'react';
import { Plus, Upload, X as XIcon, Loader, Search, ChevronLeft, Eye, EyeOff } from 'lucide-react';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import useMapStore from '../../store/mapStore.js';
import { fetchPOI, fetchPOIPage, deletePOI, uploadPOI } from '../../api/poi.js';
import POICard from '../poi/POICard.jsx';
import useInfiniteScroll from '../../hooks/useInfiniteScroll.js';
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
  const requestVersion = useRef(0);

  // Локальный список для рендера в табе, пагинированный через сервер —
  // отдельно от mapStore.pois (который питает маркеры на карте всеми POI).
  const [listItems, setListItems] = useState([]);
  const [listTotal, setListTotal] = useState(0);
  const [listHasMore, setListHasMore] = useState(false);
  const [listLoading, setListLoading] = useState(true);

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
    setListItems((prev) => prev.map((p) => (p.id === updatedPOI.id ? updatedPOI : p)));
  }, [pois, setPOIs]);

  const handleDeleted = useCallback((poiId) => {
    useMapStore.getState().removePOI(poiId);
    setListItems((prev) => prev.filter((p) => p.id !== poiId));
    setListTotal((prev) => Math.max(0, prev - 1));
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

  const buildListParams = useCallback((offset) => {
    const params = { limit: 50, offset };
    if (search.trim()) params.search = search.trim();
    return params;
  }, [search]);

  // Список в табе пагинирован через сервер (отдельно от mapStore.pois,
  // который карта получает целиком — см. loadPOIs выше, не трогать).
  useEffect(() => {
    let cancelled = false;
    const version = ++requestVersion.current;
    setListLoading(true);
    const timer = setTimeout(async () => {
      try {
        const page = await fetchPOIPage(buildListParams(0));
        if (!cancelled && version === requestVersion.current) {
          setListItems(page.items);
          setListTotal(page.total);
          setListHasMore(page.has_more);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled && version === requestVersion.current) setListLoading(false);
      }
    }, 300); // debounce для search
    return () => { cancelled = true; clearTimeout(timer); };
  }, [buildListParams]);

  const loadMorePOIList = useCallback(async () => {
    const version = requestVersion.current;
    try {
      const page = await fetchPOIPage(buildListParams(listItems.length));
      if (version !== requestVersion.current) return; // search сменился, отбрасываем
      setListItems((prev) => [...prev, ...page.items]);
      setListTotal(page.total);
      setListHasMore(page.has_more);
    } catch (err) {
      console.error(err);
    }
  }, [buildListParams, listItems.length]);

  const sentinelRef = useInfiniteScroll(loadMorePOIList, listHasMore);

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
        {loading || listLoading ? (
          <div className="poi-loading">Loading POI...</div>
        ) : pois.length === 0 ? (
          <div className="poi-empty-state">
            No POI yet<br />
            Click the + button then left-click on map
          </div>
        ) : listItems.length === 0 ? (
          <div className="poi-empty-state">No results found</div>
        ) : (
          <>
            {listItems.map((poi) => (
              <POICard
                key={poi.id}
                poi={poi}
                onZoom={() => handleZoomToPOI(poi)}
                onRename={() => handleOpenRenameModalCb(poi)}
                onDelete={() => handleOpenDeleteModalCb(poi)}
              />
            ))}
            {listHasMore && <div ref={sentinelRef} style={{ height: 1 }} />}
            <div style={{ textAlign: 'center', padding: '8px 0 2px', color: 'var(--text-secondary)', fontSize: 11 }}>
              {t('tracks.count_of', { shown: listItems.length, total: listTotal })}
            </div>
          </>
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
