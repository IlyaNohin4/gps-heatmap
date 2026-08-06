import { create } from 'zustand';
import i18n from '../i18n/index.js';
import { notify } from '../utils/notify.js';
import { getTrack, fetchTrackGeometries } from '../api/tracks.js';

// Nothing here is persisted to localStorage — activeLayer/showHeatmap/
// showSpeed/showPOI reset to these defaults on every load rather than
// being restored from a prior session.
const useMapStore = create((set, get) => ({
  mapInstance: null,
  activeLayer: 'osm',
  showHeatmap: false,
  showSpeed: false,
  showPOI: false,
  showStartEndMarkers: true,
  poiCategories: [],
  poiCreationMode: false,
  pois: [],
  showTrackCreator: false,
  visibleTrackIds: new Set(),
  // "Show tracks on map" filter — a one-shot snapshot of the map bounds
  // taken when "Find in this area" is clicked, not live-tracked on every
  // pan (that caused the list to keep re-filtering itself as you moved
  // the map, which was surprising). filterByMapBounds gates whether the
  // list actually applies mapBounds.
  mapBounds: null,
  filterByMapBounds: false,
  // Cache of full track details keyed by track id (includes normalized_points, speed_segments)
  trackDetailCache: {},
  // User-uploaded POI lists (backend/wire concept is still "import" —
  // this is a frontend-only rename, see POITab.jsx). hiddenLists is opt-out
  // (starts empty, i.e. everything visible by default) rather than opt-in,
  // so POI stay visible even before/without the list ever being fetched.
  lists: [],
  hiddenLists: new Set(),

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
  setMapBounds: (mapBounds) => set({ mapBounds }),
  setFilterByMapBounds: (filterByMapBounds) => set({ filterByMapBounds }),
  setActiveLayer: (activeLayer) => set({ activeLayer }),
  toggleHeatmap: () => set((s) => ({ showHeatmap: !s.showHeatmap, showSpeed: false })),
  toggleSpeed: () => set((s) => ({ showSpeed: !s.showSpeed, showHeatmap: false })),
  togglePOI: () => set((s) => ({ showPOI: !s.showPOI })),
  toggleStartEndMarkers: () => set((s) => ({ showStartEndMarkers: !s.showStartEndMarkers })),
  setShowStartEndMarkers: (showStartEndMarkers) => set({ showStartEndMarkers }),
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

  // User-uploaded POI lists
  setLists: (lists) => set({ lists }),
  toggleListVisibility: (listName) =>
    set((s) => {
      const next = new Set(s.hiddenLists);
      if (next.has(listName)) {
        next.delete(listName);
      } else {
        next.add(listName);
      }
      return { hiddenLists: next };
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

  // Remove a deleted track from map-side caches so it stops rendering.
  evictTrack: (id) =>
    set((s) => {
      if (!s.trackDetailCache[id] && !s.visibleTrackIds.has(id)) return s;
      const trackDetailCache = { ...s.trackDetailCache };
      delete trackDetailCache[id];
      const visibleTrackIds = new Set(s.visibleTrackIds);
      visibleTrackIds.delete(id);
      return { trackDetailCache, visibleTrackIds };
    }),

  // Patch a renamed track's cached detail (map tooltip reads from trackDetailCache).
  renameTrackInCache: (id, name) =>
    set((s) => {
      const cached = s.trackDetailCache[id];
      if (!cached) return s;
      return { trackDetailCache: { ...s.trackDetailCache, [id]: { ...cached, name } } };
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
        notify.error(i18n.t('errors.geometries_load_failed'));
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

  // Used by the panel's own "Clear" button (points only) — unlike
  // clearTrackCreatorState, must NOT reset mode/profile: the user is still
  // in the panel and didn't ask to switch Manual/Auto or the routing profile.
  clearTrackCreatorPoints: () =>
    set((s) => ({
      trackCreatorState: {
        ...s.trackCreatorState,
        waypoints: [],
        redoStack: [],
        routePoints: [],
        error: null,
        routing: false,
      },
    })),

  // Called on logout / auth switch (App.jsx): clears data belonging to the previous
  // user. Does NOT touch UI settings (activeLayer, showHeatmap/Speed/POI, poiCategories,
  // showTrackCreator, poiCreationMode) — those are not per-user data (see T21).
  resetMapData: () =>
    set({
      pois: [],
      visibleTrackIds: new Set(),
      trackDetailCache: {},
      lists: [],
      hiddenLists: new Set(),
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

  // Right-click in TrackCreator — inserts at an arbitrary position instead
  // of always appending at the end (see addWaypoint). Undo still only pops
  // the last waypoint (simple append-only history, unchanged) rather than
  // specifically reverting an insert — a minor inconsistency accepted for
  // not having to make the undo stack position-aware.
  insertWaypoint: (index, latlng) =>
    set((s) => {
      const waypoints = [...s.trackCreatorState.waypoints];
      waypoints.splice(index, 0, latlng);
      return {
        trackCreatorState: {
          ...s.trackCreatorState,
          waypoints,
          redoStack: [],
        },
      };
    }),

  // QA#8: dragging an existing waypoint to reposition it (Manual mode) —
  // route recompute for Auto mode is already keyed off `waypoints` identity
  // via TrackCreator's fetch-route effect, so clearing routePoints here
  // isn't needed (unlike undo/redo, this doesn't touch redoStack).
  updateWaypoint: (index, latlng) =>
    set((s) => ({
      trackCreatorState: {
        ...s.trackCreatorState,
        waypoints: s.trackCreatorState.waypoints.map((w, i) => (i === index ? latlng : w)),
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
