import { create } from 'zustand';

const useMapStore = create((set) => ({
  mapInstance: null,
  activeLayer: 'osm',
  showHeatmap: false,
  showSpeed: false,
  visibleTrackIds: new Set(),

  setMapInstance: (mapInstance) => set({ mapInstance }),
  setActiveLayer: (activeLayer) => set({ activeLayer }),
  toggleHeatmap: () => set((s) => ({ showHeatmap: !s.showHeatmap })),
  toggleSpeed: () => set((s) => ({ showSpeed: !s.showSpeed })),
  toggleTrackVisibility: (id) =>
    set((s) => {
      const next = new Set(s.visibleTrackIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { visibleTrackIds: next };
    }),
}));

export default useMapStore;
