import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useAppStore = create(
  persist(
    (set, get) => ({
      theme: 'light',
      units: { distance: 'km', speed: 'kmh' },
      language: 'en',
      selectedTrackId: null,
      tracks: [],
      isUploadingIds: new Set(),

      setTheme: (theme) => set({ theme }),
      setUnits: (units) => set((s) => ({ units: { ...s.units, ...units } })),
      setLanguage: (language) => set({ language }),
      setSelectedTrack: (id) => set({ selectedTrackId: id }),
      setTracks: (tracks) => set({ tracks }),
      addTrack: (track) => set((s) => ({ tracks: [track, ...s.tracks] })),
      removeTrack: (id) =>
        set((s) => ({ tracks: s.tracks.filter((t) => t.id !== id) })),
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
      partialize: (state) => ({
        theme: state.theme,
        units: state.units,
        language: state.language,
      }),
    }
  )
);

export default useAppStore;
