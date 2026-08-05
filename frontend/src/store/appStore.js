import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useAppStore = create(
  persist(
    (set, get) => ({
      theme: 'light',
      unitSystem: 'metric', // 'metric' (km + km/h) | 'imperial' (mi + mph)
      language: 'en',
      selectedTrackId: null,
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
      // Which screen corner toast notifications stack in — a client-only UI
      // preference (like theme used to be before server sync), so it's the
      // one field this store actually persists (see partialize below).
      toastPosition: 'top-right', // 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'

      setTheme: (theme) => set({ theme }),
      setToastPosition: (toastPosition) => set({ toastPosition }),
      setUnitSystem: (system) => set({ unitSystem: system }),
      setLanguage: (language) => set({ language }),
      setSelectedTrack: (id) => set({ selectedTrackId: id, activePanel: null }),
      setSelectedTrackId: (id) => set({ selectedTrackId: id }),
      setDetailsTrackId: (id) => set({ detailsTrackId: id }),
      setDetailsTrackPosition: (pos) => set({ detailsTrackPosition: pos }),
      setActivePanel: (panel) => set({ activePanel: panel }),
      setTracks: (tracks) => set({ tracks }),
      setExpandedTrackInfo: (mode) => set({ expandedTrackInfo: mode }),
      addTrack: (track) => set((s) => ({ tracks: [track, ...s.tracks] })),
      bumpTracksListVersion: () => set((s) => ({ tracksListVersion: s.tracksListVersion + 1 })),
      bumpPOIListVersion: () => set((s) => ({ poiListVersion: s.poiListVersion + 1 })),
      removeTrack: (id) =>
        set((s) => ({ tracks: s.tracks.filter((t) => t.id !== id) })),
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
      resetUserData: () => set({ selectedTrackId: null, detailsTrackId: null, detailsTrackPosition: null, isUploadingIds: new Set() }),
    }),
    {
      name: 'gps_app',
      // Persist nothing except toastPosition — theme/units/language come
      // from server via getMe(), selectedTrackId and everything else here
      // is session-only state. toastPosition has no server-side field, it's
      // a purely local UI preference.
      partialize: (state) => ({ toastPosition: state.toastPosition }),
    }
  )
);

export default useAppStore;
