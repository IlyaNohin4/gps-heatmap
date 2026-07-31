import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useAppStore = create(
  persist(
    (set, get) => ({
      theme: 'light',
      unitSystem: 'metric', // 'metric' (km + km/h) | 'imperial' (mi + mph)
      language: 'en',
      selectedTrackId: null,
      activePanel: null,
      tracks: [],
      isUploadingIds: new Set(),
      tracksListVersion: 0,
      poiListVersion: 0,
      expandedTrackInfo: 'partial', // 'off' | 'partial' | 'on'

      setTheme: (theme) => set({ theme }),
      setUnitSystem: (system) => set({ unitSystem: system }),
      setLanguage: (language) => set({ language }),
      setSelectedTrack: (id) => set({ selectedTrackId: id, activePanel: null }),
      setSelectedTrackId: (id) => set({ selectedTrackId: id }),
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
      resetUserData: () => set({ selectedTrackId: null, isUploadingIds: new Set() }),
    }),
    {
      name: 'gps_app',
      // Persist nothing — theme/units/language come from server via getMe(),
      // selectedTrackId and everything else here is session-only state.
      partialize: () => ({}),
    }
  )
);

export default useAppStore;
