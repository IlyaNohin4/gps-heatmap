import { create } from 'zustand';

// Nothing in this store is persisted to localStorage — theme/unitSystem/
// language/toastPosition are all server-synced (getMe()/updatePrefs, see
// App.jsx and TopIsland.jsx) and reset to these defaults on load until
// that resolves, rather than caching a local copy. Everything else here is
// session-only UI state by nature (selection, upload progress, etc).
const useAppStore = create(
    (set, get) => ({
      theme: 'light',
      unitSystem: 'metric', // 'metric' (km + km/h) | 'imperial' (mi + mph)
      language: 'en',
      selectedTrackId: null,
      // Ctrl/Cmd+click multi-select for bulk actions (delete) — independent
      // of selectedTrackId, which drives single-select behaviors like
      // map fit-bounds and the details popover.
      selectedTrackIds: new Set(),
      selectedPOIIds: new Set(),
      // Track whose details popover should be open, set when clicking the
      // track's line on the map. detailsTrackPosition is the click's screen
      // coordinates so the popover can appear next to the cursor.
      detailsTrackId: null,
      detailsTrackPosition: null,
      activePanel: null,
      tracks: [],
      isUploadingIds: new Set(),
      tracksListVersion: 0,
      poiListVersion: 0,
      expandedTrackInfo: 'partial', // 'off' | 'partial' | 'on'
      // Which screen corner toast notifications stack in — server-synced
      // like theme/unitSystem/language (see TopIsland.jsx's handler).
      toastPosition: 'top-right', // 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'

      setTheme: (theme) => set({ theme }),
      setToastPosition: (toastPosition) => set({ toastPosition }),
      setUnitSystem: (system) => set({ unitSystem: system }),
      setLanguage: (language) => set({ language }),
      setSelectedTrack: (id) => set({ selectedTrackId: id, activePanel: null }),
      setSelectedTrackId: (id) => set({ selectedTrackId: id }),
      toggleTrackSelection: (id) =>
        set((s) => {
          const next = new Set(s.selectedTrackIds);
          next.has(id) ? next.delete(id) : next.add(id);
          return { selectedTrackIds: next };
        }),
      clearTrackSelection: () => set({ selectedTrackIds: new Set() }),
      togglePOISelection: (id) =>
        set((s) => {
          const next = new Set(s.selectedPOIIds);
          next.has(id) ? next.delete(id) : next.add(id);
          return { selectedPOIIds: next };
        }),
      clearPOISelection: () => set({ selectedPOIIds: new Set() }),
      setDetailsTrackId: (id) => set({ detailsTrackId: id }),
      setDetailsTrackPosition: (pos) => set({ detailsTrackPosition: pos }),
      setActivePanel: (panel) => set({ activePanel: panel }),
      setTracks: (tracks) => set({ tracks }),
      setExpandedTrackInfo: (mode) => set({ expandedTrackInfo: mode }),
      addTrack: (track) => set((s) => ({ tracks: [track, ...s.tracks] })),
      bumpTracksListVersion: () => set((s) => ({ tracksListVersion: s.tracksListVersion + 1 })),
      bumpPOIListVersion: () => set((s) => ({ poiListVersion: s.poiListVersion + 1 })),
      removeTrack: (id) =>
        set((s) => {
          if (!s.selectedTrackIds.has(id)) return { tracks: s.tracks.filter((t) => t.id !== id) };
          const next = new Set(s.selectedTrackIds);
          next.delete(id);
          return { tracks: s.tracks.filter((t) => t.id !== id), selectedTrackIds: next };
        }),
      updateTrack: (updated) =>
        set((s) => ({ tracks: s.tracks.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)) })),
      addUploadingId: (taskId) =>
        set((s) => {
          const next = new Set(s.isUploadingIds);
          next.add(taskId);
          return { isUploadingIds: next };
        }),
      removeUploadingId: (taskId) =>
        set((s) => {
          const next = new Set(s.isUploadingIds);
          next.delete(taskId);
          return { isUploadingIds: next };
        }),
      // Called on logout / auth switch (App.jsx). tracksListVersion (T19 bump
      // mechanism) is intentionally left untouched (see T21).
      resetUserData: () => set({
        selectedTrackId: null,
        selectedTrackIds: new Set(),
        selectedPOIIds: new Set(),
        detailsTrackId: null,
        detailsTrackPosition: null,
        isUploadingIds: new Set(),
      }),
    })
);

export default useAppStore;
