import React, { useState, useRef, useEffect, useCallback, Suspense, lazy } from 'react';
import { Plus, Upload, X as XIcon, Loader, Search, Filter, Eye, EyeOff } from 'lucide-react';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import useAppStore from '../../store/appStore.js';
import useAuthStore from '../../store/authStore.js';
import useMapStore from '../../store/mapStore.js';
import { fetchPOI, fetchPOIPage, fetchPOICategories, deletePOI, uploadPOI } from '../../api/poi.js';
import { apiErrorMessage } from '../../utils/apiError.js';
import POICard from '../poi/POICard.jsx';
import useInfiniteScroll from '../../hooks/useInfiniteScroll.js';
import Button from '../../ui/Button.jsx';
import Input from '../../ui/Input.jsx';
import Chip from '../../ui/Chip.jsx';
import SkeletonCard from '../shared/SkeletonCard.jsx';
import '../../styles/poi.css';
const POIRenameModal = lazy(() => import('../poi/POIRenameModal.jsx'));
const POIDeleteModal = lazy(() => import('../poi/POIDeleteModal.jsx'));

export default React.memo(function POITab() {
  const { t } = useTranslation();
  const { pois, setPOIs, setPoiCreationMode, poiCreationMode, mapInstance, showPOI, togglePOI } = useMapStore();
  const { isAuthenticated } = useAuthStore();
  const { activePanel, setActivePanel } = useAppStore();
  const filterOpen = activePanel === 'left:poi-filter';
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [categories, setCategories] = useState([]);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedPOI, setSelectedPOI] = useState(null);
  const fileInputRef = useRef(null);
  const requestVersion = useRef(0);

  useEffect(() => {
    if (!isAuthenticated) { setCategories([]); return; }
    fetchPOICategories().then(setCategories).catch((err) => console.error(err));
  }, [isAuthenticated]);

  // Локальный список для рендера в табе, пагинированный через сервер —
  // отдельно от mapStore.pois (который питает маркеры на карте всеми POI).
  const [listItems, setListItems] = useState([]);
  const [listTotal, setListTotal] = useState(0);
  const [listHasMore, setListHasMore] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  async function loadPOIs() {
    setLoading(true);
    try {
      const data = await fetchPOI();
      setPOIs(data);
    } catch (err) {
      toast.error(t('errors.poi_load_failed'));
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.match(/\.(kml|kmz)$/i)) {
      toast.error(t('validation.poi_format_only_kml'));
      return;
    }

    setUploading(true);
    try {
      await uploadPOI(file);
      toast.success(t('poi.imported_success'));
      await loadPOIs();
    } catch (err) {
      toast.error(apiErrorMessage(err, t('poi.import_failed')));
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
    if (categoryFilter !== 'all') params.category = categoryFilter;
    return params;
  }, [search, categoryFilter]);

  // Список в табе пагинирован через сервер (отдельно от mapStore.pois,
  // который карта получает целиком — см. loadPOIs выше, не трогать).
  useEffect(() => {
    if (!isAuthenticated) {
      setListItems([]);
      setListTotal(0);
      setListHasMore(false);
      setListError(null);
      setListLoading(false);
      return;
    }
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
          setListError(null);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled && version === requestVersion.current) setListError(err);
      } finally {
        if (!cancelled && version === requestVersion.current) setListLoading(false);
      }
    }, 300); // debounce для search
    return () => { cancelled = true; clearTimeout(timer); };
  }, [buildListParams, retryCount, isAuthenticated]);

  const handleListRetry = useCallback(() => {
    setListError(null);
    setRetryCount((c) => c + 1);
  }, []);

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
      <div style={{ padding: 'var(--space-3) var(--space-2) 0', display: 'flex', gap: 'var(--space-2)', flexShrink: 0 }}>
        <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
          <Input
            leftIcon={<Search size={14} />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search POI..."
            style={{ borderRadius: 'var(--radius-search)', height: '34px', paddingRight: search ? 30 : undefined }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 'var(--space-2)', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex' }}>
              <XIcon size={13} />
            </button>
          )}
        </div>
        <Button
          variant="ghost"
          iconOnly
          active={showPOI}
          onClick={togglePOI}
          title={showPOI ? 'Hide all POI' : 'Show all POI'}
        >
          {showPOI ? <Eye size={15} /> : <EyeOff size={15} />}
        </Button>
        <Button
          variant="ghost"
          iconOnly
          active={filterOpen}
          onClick={() => setActivePanel(filterOpen ? null : 'left:poi-filter')}
          title="Filters"
        >
          <Filter size={15} />
        </Button>
      </div>

      {/* Filter panel */}
      {filterOpen && (
        <div style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--border)', animation: 'fadeIn 0.3s ease-out', flexShrink: 0 }}>
          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 'var(--space-2)', textTransform: 'uppercase' }}>Category</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
            <Chip active={categoryFilter === 'all'} onClick={() => setCategoryFilter('all')}>All</Chip>
            {categories.map((c) => (
              <Chip key={c.name} active={categoryFilter === c.name} onClick={() => setCategoryFilter(c.name)}>
                {c.name} ({c.count})
              </Chip>
            ))}
          </div>
        </div>
      )}

      {/* POI List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-2) var(--space-3) var(--space-1)', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {listError ? (
          <div style={{ textAlign: 'center', padding: 'var(--space-5) 0', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
            <div style={{ marginBottom: 'var(--space-2)' }}>{t('errors.poi_load_failed')}</div>
            <button className="btn-secondary" onClick={handleListRetry}>{t('errors.retry')}</button>
          </div>
        ) : loading || listLoading ? (
          [1, 2, 3].map((i) => <SkeletonCard key={i} />)
        ) : pois.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 'var(--space-5) 0', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
            No POI yet<br />
            Click the + button then left-click on map
          </div>
        ) : listItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 'var(--space-5) 0', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
            No results found
          </div>
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
            <div style={{ textAlign: 'center', padding: 'var(--space-2) 0 var(--space-1)', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>
              {t('tracks.count_of', { shown: listItems.length, total: listTotal })}
            </div>
          </>
        )}
      </div>

      {/* Bottom actions */}
      <div style={{ padding: 'var(--space-2) var(--space-3) var(--space-3)', borderTop: '1px solid var(--border)', display: 'flex', gap: 'var(--space-2)', flexShrink: 0 }}>
        <Button
          variant="secondary"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          style={{ flex: 1, border: 'none' }}
          title="Import KML/KMZ file"
        >
          {uploading ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={14} />}
          Import
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".kml,.kmz"
          onChange={handleFileSelect}
          disabled={uploading}
          style={{ display: 'none' }}
        />
        <Button
          variant={poiCreationMode ? 'primary' : 'secondary'}
          onClick={handleToggleCreation}
          style={{ flex: 1, border: 'none' }}
          title="Create POI"
        >
          <Plus size={14} /> Create
        </Button>
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
