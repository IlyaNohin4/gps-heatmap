import React, { useRef } from 'react';
import {
  Plus, Minus, Search, Navigation, Layers, Info, X,
  Flame, Gauge, MapPin, PenLine, ChevronRight,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import useMapStore from '../../store/mapStore.js';
import useAppStore from '../../store/appStore.js';
import { LAYER_OPTIONS } from '../../map/MapLayers.js';
import POIImportPanel from '../poi/POIImportPanel.jsx';

// Speed breakpoints: [max_kmh, label_km, label_mi, color]
const SPEED_LEGEND = [
  { maxKmh: 10,  labelKm: '0–10 km/h',   labelMi: '0–6 mph',   color: 'rgb(155,155,155)' },
  { maxKmh: 30,  labelKm: '10–30 km/h',  labelMi: '6–19 mph',  color: 'rgb(0,122,255)' },
  { maxKmh: 60,  labelKm: '30–60 km/h',  labelMi: '19–37 mph', color: 'rgb(52,199,89)' },
  { maxKmh: 90,  labelKm: '60–90 km/h',  labelMi: '37–56 mph', color: 'rgb(255,204,0)' },
  { maxKmh: 120, labelKm: '90–120 km/h', labelMi: '56–75 mph', color: 'rgb(255,149,0)' },
  { maxKmh: Infinity, labelKm: '120+ km/h', labelMi: '75+ mph', color: 'rgb(255,59,48)' },
];

export default function RightIsland() {
  const { t } = useTranslation();
  const {
    mapInstance, activeLayer, setActiveLayer,
    showHeatmap, toggleHeatmap,
    showSpeed, toggleSpeed,
    visibleImports,
    showTrackCreator, toggleTrackCreator,
  } = useMapStore();
  const { unitSystem, activePanel, setActivePanel, setSelectedTrackId } = useAppStore();

  const cityOpen   = activePanel === 'right:city';
  const layersOpen = activePanel === 'right:layers';
  const attrOpen   = activePanel === 'right:attr';
  const poiOpen    = activePanel === 'right:poi';

  function togglePanel(name) {
    setActivePanel(activePanel === name ? null : name);
  }

  const [citySearch, setCitySearch] = React.useState('');
  const [cityResults, setCityResults] = React.useState([]);
  const [searching, setSearching] = React.useState(false);
  const searchTimeout = useRef(null);

  function zoomIn() { mapInstance?.zoomIn(); }
  function zoomOut() { mapInstance?.zoomOut(); }

  function geolocate() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => mapInstance?.flyTo([pos.coords.latitude, pos.coords.longitude], 14, { animate: true, duration: 2.0 }),
      () => import('react-toastify').then((m) => m.toast.error('Geolocation denied'))
    );
  }

  async function searchCity(q) {
    if (!q.trim()) { setCityResults([]); return; }
    setSearching(true);
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5`,
        {
          headers: {
            'Accept-Language': 'en',
            'User-Agent': 'GPS-Heatmap/1.0 (ilyanogin4@gmail.com)'
          }
        }
      );
      setCityResults(await resp.json());
    } catch {
      setCityResults([]);
    } finally {
      setSearching(false);
    }
  }

  function handleCityInput(e) {
    const val = e.target.value;
    setCitySearch(val);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => searchCity(val), 400);
  }

  function flyToResult(r) {
    mapInstance?.flyTo([parseFloat(r.lat), parseFloat(r.lon)], 13, { animate: true, duration: 2.2 });
    setActivePanel(null);
    setCitySearch('');
    setCityResults([]);
  }

  const iconBtn = (active) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    borderRadius: 10,
    color: active ? 'var(--accent)' : 'var(--text)',
    background: active ? 'rgba(0,122,255,0.1)' : 'none',
    border: 'none',
    cursor: 'pointer',
    transition: 'background 0.15s',
  });

  const divider = <div style={{ height: 1, background: 'var(--border)', margin: '4px 2px' }} />;

  return (
    <div onClick={(e) => e.stopPropagation()} style={{ position: 'fixed', right: 16, top: '50%', transform: 'translateY(-50%)', zIndex: 1000 }}>
      <div className="island" style={{ padding: '6px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <button style={iconBtn()} onClick={zoomIn} title={t('map.zoom_in')}><Plus size={16} /></button>
        <button style={iconBtn()} onClick={zoomOut} title={t('map.zoom_out')}><Minus size={16} /></button>
        {divider}
        <button style={iconBtn(cityOpen)} onClick={() => togglePanel('right:city')} title={t('map.city_search')}>
          <Search size={16} />
        </button>
        <button style={iconBtn()} onClick={geolocate} title={t('map.my_location')}><Navigation size={16} /></button>
        {divider}
        <button style={iconBtn(layersOpen)} onClick={() => togglePanel('right:layers')} title={t('map.map_layers')}>
          <Layers size={16} />
        </button>
        {divider}
        <button style={iconBtn(showSpeed)} onClick={toggleSpeed} title={t('map.speed_mode')}>
          <Gauge size={16} />
        </button>
        <button style={iconBtn(showHeatmap)} onClick={toggleHeatmap} title={t('map.visit_heatmap')}>
          <Flame size={16} />
        </button>
        {divider}
        <button
          style={iconBtn(poiOpen)}
          onClick={() => togglePanel('right:poi')}
          title={t('map.poi')}
        >
          <MapPin size={16} />
        </button>
        {divider}
        <button
          style={iconBtn(showTrackCreator)}
          onClick={() => {
            toggleTrackCreator();
            if (!showTrackCreator) setSelectedTrackId(null);
          }}
          title={t('map.create_track')}
        >
          <PenLine size={16} />
        </button>
        {divider}
        <button style={iconBtn(attrOpen)} onClick={() => togglePanel('right:attr')} title={t('map.attribution')}>
          <Info size={16} />
        </button>
      </div>

      {/* City search popover */}
      {cityOpen && (
        <div className="island" style={{ position: 'absolute', right: 52, top: '50%', transform: 'translateY(-50%)', width: 260, padding: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              value={citySearch}
              onChange={handleCityInput}
              placeholder={t('map.search_city')}
              autoFocus
              style={{ flex: 1 }}
            />
            <button onClick={() => { setActivePanel(null); setCitySearch(''); setCityResults([]); }} style={{ color: 'var(--text-secondary)', display: 'flex', background: 'none', border: 'none', cursor: 'pointer' }}>
              <X size={14} />
            </button>
          </div>
          {searching && <div style={{ textAlign: 'center', padding: '8px', fontSize: 12, color: 'var(--text-secondary)' }}>{t('map.searching')}</div>}
          {cityResults.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {cityResults.map((r) => (
                <button key={r.place_id} onClick={() => flyToResult(r)} style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '7px 8px', borderRadius: 8, border: 'none',
                  background: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text)', lineHeight: 1.3,
                }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                >
                  {r.display_name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Layers popover */}
      {layersOpen && (
        <div className="island" style={{ position: 'absolute', right: 52, top: '50%', transform: 'translateY(-50%)', width: 200, padding: 10, maxHeight: '70vh', overflowY: 'auto' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 8 }}>{t('map.map_layers')}</div>
          {LAYER_OPTIONS.map((l) => (
            <button
              key={l.id}
              onClick={() => setActiveLayer(l.id)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%', padding: '7px 8px', borderRadius: 8, border: 'none',
                background: activeLayer === l.id ? 'rgba(0,122,255,0.1)' : 'none',
                color: activeLayer === l.id ? 'var(--accent)' : 'var(--text)',
                cursor: 'pointer', fontSize: 13,
                fontWeight: activeLayer === l.id ? 600 : 400,
              }}
            >
              {l.label}
              {activeLayer === l.id && <ChevronRight size={12} />}
            </button>
          ))}
        </div>
      )}

      {/* POI import panel */}
      {poiOpen && (
        <POIImportPanel onClose={() => togglePanel('right:poi')} />
      )}

      {/* Attribution popover */}
      {attrOpen && (
        <div className="island" style={{ position: 'absolute', right: 52, top: '50%', transform: 'translateY(-50%)', width: 240, padding: '12px 14px' }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>OpenStreetMap</a> contributors.<br />
            Geocoding by <a href="https://nominatim.org" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>Nominatim</a>.<br />
            POI via <a href="https://overpass-api.de" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>Overpass API</a>.<br />
            Routing by <a href="https://openrouteservice.org" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>OpenRouteService</a>.
          </div>
        </div>
      )}

    </div>
  );
}
