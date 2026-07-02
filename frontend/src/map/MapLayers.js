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
  cyclosm: {
    url: 'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
    attribution: '<a href="https://www.cyclosm.org">CyclOSM</a> | © OpenStreetMap contributors',
    maxZoom: 20,
  },
  'carto-voyager': {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
    attribution: '© <a href="https://carto.com/attributions">CARTO</a> | © OpenStreetMap contributors',
    maxZoom: 20,
  },
  'stamen-terrain': {
    url: 'https://tile.openstreetmap.de/tiles/osmde/{z}/{x}/{y}.png',
    attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a> contributors | Map tiles by <a href="https://www.openstreetmap.de">OpenStreetMap.de</a>',
    maxZoom: 18,
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
  { id: 'cyclosm',        label: 'CyclOSM' },
  { id: 'carto-voyager',  label: 'CARTO Voyager' },
  { id: 'stamen-terrain', label: 'Stamen Terrain' },
  { id: 'google-street',  label: 'Google Street' },
  { id: 'google-satellite', label: 'Google Satellite' },
];
