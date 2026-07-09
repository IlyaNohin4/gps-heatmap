import { create } from 'zustand';
import { getTrack, fetchTrackGeometries } from '../api/tracks.js';

const useMapStore = create((set, get) => ({
  mapInstance: null,
  activeLayer: 'osm',
  showHeatmap: false,
  showSpeed: false,
  showPOI: false,
  poiCategories: [],
  poiCreationMode: false,
  pois: [],
  showTrackCreator: false,
  visibleTrackIds: new Set(),
  // Cache of full track details keyed by track id (includes normalized_points, speed_segments)
  trackDetailCache: {},
  // User-uploaded POI imports
  imports: [],
  visibleImports: new Set(),

  // Track creator state
  trackCreatorState: {
    waypoints: [],
    redoStack: [],
    routePoints: [],
    mode: 'manual',
    profile: 'cycling-regular',
    error: null,
    routing: false,
  },

  setMapInstance: (mapInstance) => set({ mapInstance }),
  setActiveLayer: (activeLayer) => set({ activeLayer }),
  toggleHeatmap: () => set((s) => ({ showHeatmap: !s.showHeatmap, showSpeed: false })),
  toggleSpeed: () => set((s) => ({ showSpeed: !s.showSpeed, showHeatmap: false })),
  togglePOI: () => set((s) => ({ showPOI: !s.showPOI })),
  toggleTrackCreator: () => set((s) => ({ showTrackCreator: !s.showTrackCreator })),
  setPoiCreationMode: (mode) => set({ poiCreationMode: mode }),
  setPOIs: (pois) => set({ pois }),
  addPOI: (poi) => set((s) => ({ pois: [poi, ...s.pois] })),
  removePOI: (id) => set((s) => ({ pois: s.pois.filter((p) => p.id !== id) })),
  setPOICategories: (poiCategories) => set({ poiCategories }),
  togglePOICategory: (id) =>
    set((s) => {
      const next = s.poiCategories.includes(id)
        ? s.poiCategories.filter((c) => c !== id)
        : [...s.poiCategories, id];
      return { poiCategories: next };
    }),

  // User-uploaded POI imports
  setImports: (imports) => set({ imports }),
  toggleImportVisibility: (importName) =>
    set((s) => {
      const next = new Set(s.visibleImports);
      if (next.has(importName)) {
        next.delete(importName);
      } else {
        next.add(importName);
      }
      return { visibleImports: next };
    }),

  toggleTrackVisibility: (id) =>
    set((s) => {
      const next = new Set(s.visibleTrackIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        // Lazy-load full track detail if not cached, or only a partial (bulk) record so far
        const cached = s.trackDetailCache[id];
        if (!cached || cached.partial) {
          getTrack(id)
            .then((data) => {
              useMapStore.setState((prev) => ({
                trackDetailCache: { ...prev.trackDetailCache, [id]: data },
              }));
            })
            .catch(() => {});
        }
      }
      return { visibleTrackIds: next };
    }),

  // Ensure a track's detail is loaded (called when track selected in BottomIsland, etc.)
  ensureTrackDetail: (id) => {
    const cached = get().trackDetailCache[id];
    if (!id || (cached && !cached.partial)) return;
    getTrack(id)
      .then((data) => {
        useMapStore.setState((prev) => ({
          trackDetailCache: { ...prev.trackDetailCache, [id]: data },
        }));
      })
      .catch(() => {});
  },

  // Bulk-load geometry (normalized_points only) for all of the user's tracks in one request.
  // Records that already have a full detail (speed_segments, from ensureTrackDetail) are kept as-is;
  // everything else is stored as a `partial` record that ensureTrackDetail will upgrade on demand.
  loadAllGeometries: () => {
    fetchTrackGeometries()
      .then((geometries) => {
        useMapStore.setState((prev) => {
          const trackDetailCache = { ...prev.trackDetailCache };
          geometries.forEach((geo) => {
            const existing = trackDetailCache[geo.id];
            if (existing && !existing.partial) return;
            trackDetailCache[geo.id] = { ...geo, partial: true };
          });
          return { trackDetailCache };
        });
      })
      .catch((err) => {
        console.error('Failed to load track geometries', err);
        import('react-toastify').then(({ toast }) => toast.error('Failed to load track geometries'));
      });
  },

  // Track creator methods
  setTrackCreatorState: (newState) =>
    set((s) => ({
      trackCreatorState: { ...s.trackCreatorState, ...newState },
    })),

  clearTrackCreatorState: () =>
    set({
      trackCreatorState: {
        waypoints: [],
        redoStack: [],
        routePoints: [],
        mode: 'manual',
        profile: 'cycling-regular',
        error: null,
        routing: false,
      },
    }),

  addWaypoint: (latlng) =>
    set((s) => ({
      trackCreatorState: {
        ...s.trackCreatorState,
        waypoints: [...s.trackCreatorState.waypoints, latlng],
        redoStack: [], // Clear redo stack on new waypoint
      },
    })),

  undoWaypoint: () =>
    set((s) => {
      if (s.trackCreatorState.waypoints.length === 0) return s;
      const waypoints = s.trackCreatorState.waypoints.slice(0, -1);
      const redoStack = [...s.trackCreatorState.redoStack, s.trackCreatorState.waypoints[s.trackCreatorState.waypoints.length - 1]];
      return {
        trackCreatorState: {
          ...s.trackCreatorState,
          waypoints,
          redoStack,
          routePoints: [], // Will be recalculated
        },
      };
    }),

  redoWaypoint: () =>
    set((s) => {
      if (s.trackCreatorState.redoStack.length === 0) return s;
      const redoStack = s.trackCreatorState.redoStack.slice(0, -1);
      const waypoints = [...s.trackCreatorState.waypoints, s.trackCreatorState.redoStack[s.trackCreatorState.redoStack.length - 1]];
      return {
        trackCreatorState: {
          ...s.trackCreatorState,
          waypoints,
          redoStack,
          routePoints: [], // Will be recalculated
        },
      };
    }),
}));

export default useMapStore;
