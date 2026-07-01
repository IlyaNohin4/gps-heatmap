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

      setTheme: (theme) => set({ theme }),
      setUnitSystem: (system) => set({ unitSystem: system }),
      setLanguage: (language) => set({ language }),
      setSelectedTrack: (id) => set({ selectedTrackId: id, activePanel: null }),
      setActivePanel: (panel) => set({ activePanel: panel }),
      setTracks: (tracks) => set({ tracks }),
      addTrack: (track) => set((s) => ({ tracks: [track, ...s.tracks] })),
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
    }),
    {
      name: 'gps_app',
      // Only persist selectedTrackId — theme/units/language come from server via getMe()
      partialize: () => ({}),
    }
  )
);

export default useAppStore;
