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
  hiking: {
    url: 'https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png',
    attribution: '© <a href="https://hiking.waymarkedtrails.org">Waymarked Trails</a> | © OpenStreetMap contributors',
    maxZoom: 19,
  },
  'carto-light': {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '© <a href="https://carto.com/attributions">CARTO</a> | © OpenStreetMap contributors',
    maxZoom: 20,
  },
  'carto-dark': {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '© <a href="https://carto.com/attributions">CARTO</a> | © OpenStreetMap contributors',
    maxZoom: 20,
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
  'esri-satellite': {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '© Esri, DigitalGlobe, GeoEye, Earthstar Geographics',
    maxZoom: 18,
    subdomains: [],
  },
};

export const LAYER_OPTIONS = [
  { id: 'osm',            label: 'OpenStreetMap',    group: 'Street' },
  { id: 'topo',           label: 'OpenTopoMap',      group: 'Street' },
  { id: 'cyclosm',        label: 'CyclOSM',          group: 'Street' },
  { id: 'hiking',         label: 'Hiking Trails',    group: 'Street' },
  { id: 'carto-light',    label: 'CartoDB Light',    group: 'Style' },
  { id: 'carto-dark',     label: 'CartoDB Dark',     group: 'Style' },
  { id: 'google-street',  label: 'Google Street',    group: 'Google' },
  { id: 'google-satellite', label: 'Google Satellite', group: 'Google' },
  { id: 'esri-satellite', label: 'Esri Satellite',   group: 'Satellite' },
];
