export const TILE_LAYERS = {
  osm: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',
    maxZoom: 19,
  },
  topo: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '© <a href="https://opentopomap.org">OpenTopoMap</a> | © OpenStreetMap contributors',
    maxZoom: 17,
  },
  'esri-satellite': {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '© <a href="https://www.esri.com">Esri</a>',
    maxZoom: 19,
    subdomains: [],
  },
  'google-street': {
    url: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
    attribution: '© Google',
    maxZoom: 22,
    subdomains: [],
  },
  'google-satellite': {
    url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    attribution: '© Google',
    maxZoom: 22,
    subdomains: [],
  },
};

export const LAYER_OPTIONS = [
  { id: 'osm',            label: 'OpenStreetMap' },
  { id: 'topo',           label: 'OpenTopoMap' },
  { id: 'google-street',  label: 'Google Street' },
  { id: 'google-satellite', label: 'Google Satellite' },
  { id: 'esri-satellite', label: 'Esri Satellite' },
];
