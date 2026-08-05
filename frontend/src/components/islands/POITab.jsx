import React, { useState, useRef, useEffect, useCallback, Suspense, lazy } from 'react';
import { Plus, Upload, X as XIcon, Loader, Search, Filter, ChevronLeft, FolderCog, Edit2, Download, Trash2, Eye, EyeOff } from 'lucide-react';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import useAppStore from '../../store/appStore.js';
import useAuthStore from '../../store/authStore.js';
import useMapStore from '../../store/mapStore.js';
import { fetchPOI, fetchPOIPage, fetchPOICategories, deletePOI, uploadPOI, getImports, createImport, renameImport, deleteImport, exportImport } from '../../api/poi.js';
import { apiErrorMessage } from '../../utils/apiError.js';
import POICard from '../poi/POICard.jsx';
import useInfiniteScroll from '../../hooks/useInfiniteScroll.js';
import Button from '../../ui/Button.jsx';
import Input from '../../ui/Input.jsx';
import Chip from '../../ui/Chip.jsx';
import SkeletonCard from '../shared/SkeletonCard.jsx';
import '../../styles/poi.css';
const POIRenameModal = lazy(() => import('../modals/POIRenameModal.jsx'));
const POIDeleteModal = lazy(() => import('../modals/POIDeleteModal.jsx'));

export default React.memo(function POITab({ setSidebarOpen }) {
  const { t } = useTranslation();
  const { pois, setPOIs, setPoiCreationMode, poiCreationMode, mapInstance, imports, setImports, hiddenImports, toggleImportVisibility } = useMapStore();
  const { isAuthenticated } = useAuthStore();
  const { activePanel, setActivePanel, poiListVersion, bumpPOIListVersion } = useAppStore();
  const filterOpen = activePanel === 'left:poi-filter';
  const importsOpen = activePanel === 'left:poi-imports';
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [categories, setCategories] = useState([]);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedPOI, setSelectedPOI] = useState(null);
  const [editingImportName, setEditingImportName] = useState(null);
  const [editingImportValue, setEditingImportValue] = useState('');
  const [deletingImportName, setDeletingImportName] = useState(null);
  const [creatingImport, setCreatingImport] = useState(false);
  const [newImportName, setNewImportName] = useState('');
  const [savingNewImport, setSavingNewImport] = useState(false);
  const fileInputRef = useRef(null);
  const requestVersion = useRef(0);

  // Imports panel — lazy-loaded on first open, not on every POITab mount.
  useEffect(() => {
    if (!importsOpen) return;
    getImports().then(setImports).catch((err) => console.error('Failed to load imports:', err));
  }, [importsOpen, setImports]);

  async function handleRenameImport(oldName) {
    if (!editingImportValue.trim()) {
      setEditingImportName(null);
      return;
    }
    try {
      await renameImport(oldName, editingImportValue);
      toast.success(t('poi.renamed'));
      const data = await getImports();
      setImports(data);
    } catch (err) {
      toast.error(t('poi.rename_failed'));
      console.error('Rename import error:', err);
    } finally {
      setEditingImportName(null);
    }
  }

  async function handleDeleteImport(name) {
    setDeletingImportName(name);
    try {
      await deleteImport(name);
      toast.success(t('poi.deleted'));
      const data = await getImports();
      setImports(data);
      // Deleting a list deletes its POI server-side too — refresh both the
      // map markers (mapStore.pois) and this tab's paginated list, or the
      // deleted points stay visible until a page reload.
      await loadPOIs();
      bumpPOIListVersion();
    } catch (err) {
      toast.error(t('poi.delete_failed'));
      console.error('Delete import error:', err);
    } finally {
      setDeletingImportName(null);
    }
  }

  async function handleCreateImport() {
    if (!newImportName.trim()) {
      setCreatingImport(false);
      return;
    }
    setSavingNewImport(true);
    try {
      await createImport(newImportName.trim());
      toast.success(t('poi.imported'));
      const data = await getImports();
      setImports(data);
      setNewImportName('');
      setCreatingImport(false);
    } catch (err) {
      toast.error(apiErrorMessage(err, t('poi.import_failed')));
      console.error('Create import error:', err);
    } finally {
      setSavingNewImport(false);
    }
  }

  async function handleExportImport(name) {
    try {
      await exportImport(name);
      toast.success(t('poi.exported'));
    } catch (err) {
      toast.error(t('poi.export_failed'));
      console.error('Export import error:', err);
    }
  }

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
      getImports().then(setImports).catch((err) => console.error('Failed to load imports:', err));
      bumpPOIListVersion();
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
    // Same 3-char floor as the Tracks tab's search — see LeftIsland.jsx.
    const trimmed = search.trim();
    if (trimmed.length >= 3) params.search = trimmed;
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
  }, [buildListParams, retryCount, poiListVersion, isAuthenticated]);

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

  const listContainerRef = useRef(null);
  const sentinelRef = useInfiniteScroll(loadMorePOIList, listHasMore, listContainerRef);

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
            style={{ borderRadius: 'var(--radius-search)', height: '34px', paddingRight: search ? 56 : 30 }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 30, background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex' }}>
              <XIcon size={13} />
            </button>
          )}
          <button
            onClick={() => setActivePanel(filterOpen ? null : 'left:poi-filter')}
            title="Filters"
            style={{
              position: 'absolute',
              right: 'var(--space-3)',
              background: 'none',
              border: 'none',
              color: filterOpen ? 'var(--accent)' : 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
            }}
          >
            <Filter size={14} />
          </button>
        </div>
        <Button
          iconOnly
          variant="ghost"
          onClick={() => setSidebarOpen?.(false)}
          title="Collapse"
        >
          <ChevronLeft size={15} />
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
      <div ref={listContainerRef} style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-2) var(--space-3) var(--space-1)', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
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

      {/* Imports panel — rename/delete/export/toggle-visibility per import.
          Sits right above the bottom action row, next to the Import/Manage
          buttons that trigger it — not up near the search bar, so the panel
          opens where the eye looks instead of jumping across the tab. */}
      {importsOpen && (
        <div style={{ padding: 'var(--space-3)', borderTop: '1px solid var(--border)', animation: 'fadeIn 0.3s ease-out', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
              Imports {imports.length > 0 && `(${imports.length})`}
            </div>
            {!creatingImport && (
              <button
                onClick={() => setCreatingImport(true)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 'var(--text-xs)', fontWeight: 600, padding: 0 }}
              >
                + New list
              </button>
            )}
          </div>
          {creatingImport && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', marginBottom: 'var(--space-2)' }}>
              <input
                autoFocus
                type="text"
                value={newImportName}
                onChange={(e) => setNewImportName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateImport();
                  if (e.key === 'Escape') { setCreatingImport(false); setNewImportName(''); }
                }}
                placeholder="List name"
                disabled={savingNewImport}
                style={{ flex: 1, border: '1px solid var(--accent)', padding: '4px 6px', borderRadius: 4, fontSize: 'var(--text-sm)', background: 'var(--bg)', color: 'var(--text)' }}
              />
              <button
                onClick={handleCreateImport}
                disabled={savingNewImport}
                style={{ background: 'none', border: 'none', cursor: savingNewImport ? 'not-allowed' : 'pointer', color: 'var(--accent)', display: 'flex', padding: 0 }}
                title="Save"
              >
                {savingNewImport ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={14} />}
              </button>
              <button
                onClick={() => { setCreatingImport(false); setNewImportName(''); }}
                disabled={savingNewImport}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', padding: 0 }}
                title="Cancel"
              >
                <XIcon size={14} />
              </button>
            </div>
          )}
          {imports.length === 0 ? (
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', padding: 'var(--space-2) 0' }}>
              {t('poi.no_data')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              {imports.map((imp) => {
                const isVisible = !hiddenImports.has(imp.name);
                const isEditing = editingImportName === imp.name;
                const isDeleting = deletingImportName === imp.name;
                return (
                  <div
                    key={imp.name}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 'var(--space-1)',
                      padding: '6px 8px', borderRadius: 6,
                      background: 'var(--bg)', border: '1px solid var(--border)',
                      fontSize: 'var(--text-sm)',
                    }}
                  >
                    <button
                      onClick={() => toggleImportVisibility(imp.name)}
                      title={isVisible ? 'Hide' : 'Show'}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: isVisible ? 'var(--accent)' : 'var(--text-secondary)', display: 'flex', padding: 0 }}
                    >
                      {isVisible ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                    {isEditing ? (
                      <input
                        autoFocus
                        type="text"
                        value={editingImportValue}
                        onChange={(e) => setEditingImportValue(e.target.value)}
                        onBlur={() => handleRenameImport(imp.name)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRenameImport(imp.name);
                          if (e.key === 'Escape') setEditingImportName(null);
                        }}
                        style={{ flex: 1, border: '1px solid var(--accent)', padding: '4px 6px', borderRadius: 4, fontSize: 'var(--text-sm)', background: 'var(--bg)', color: 'var(--text)' }}
                      />
                    ) : (
                      <span style={{ flex: 1, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={imp.name}>
                        {imp.name}
                      </span>
                    )}
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', padding: '2px 4px', background: 'rgba(0,0,0,0.1)', borderRadius: 3 }}>
                      {imp.count}
                    </span>
                    <button
                      onClick={() => { setEditingImportName(imp.name); setEditingImportValue(imp.name); }}
                      disabled={isEditing || isDeleting}
                      title="Rename"
                      style={{ background: 'none', border: 'none', cursor: isEditing || isDeleting ? 'not-allowed' : 'pointer', color: 'var(--text-secondary)', display: 'flex', padding: 0, opacity: isEditing || isDeleting ? 0.5 : 1 }}
                    >
                      <Edit2 size={13} />
                    </button>
                    <button
                      onClick={() => handleExportImport(imp.name)}
                      disabled={isEditing || isDeleting}
                      title="Export"
                      style={{ background: 'none', border: 'none', cursor: isEditing || isDeleting ? 'not-allowed' : 'pointer', color: 'var(--text-secondary)', display: 'flex', padding: 0, opacity: isEditing || isDeleting ? 0.5 : 1 }}
                    >
                      <Download size={13} />
                    </button>
                    <button
                      onClick={() => handleDeleteImport(imp.name)}
                      disabled={isEditing || isDeleting}
                      title="Delete"
                      style={{ background: 'none', border: 'none', cursor: isEditing || isDeleting ? 'not-allowed' : 'pointer', color: isDeleting ? 'var(--accent)' : 'var(--text-secondary)', display: 'flex', padding: 0, opacity: isEditing ? 0.5 : 1 }}
                    >
                      {isDeleting ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={13} />}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Bottom actions */}
      <div style={{ padding: 'var(--space-2) var(--space-3) var(--space-3)', borderTop: '1px solid var(--border)', display: 'flex', gap: 'var(--space-2)', flexShrink: 0 }}>
        <Button
          variant="secondary"
          active={importsOpen}
          onClick={() => setActivePanel(importsOpen ? null : 'left:poi-imports')}
          style={{ flex: 1, minWidth: 0, border: 'none' }}
          title="Manage imports"
        >
          <FolderCog size={14} />
        </Button>
        <Button
          variant="secondary"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          style={{ flex: 1, minWidth: 0, border: 'none' }}
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
          style={{ flex: 1, minWidth: 0, border: 'none' }}
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
