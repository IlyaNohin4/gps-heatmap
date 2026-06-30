import React, { useState, useRef } from 'react';
import {
  Plus, Minus, Compass, Search, Navigation, Layers, Info, X
} from 'lucide-react';
import useMapStore from '../../store/mapStore.js';

const LAYER_OPTIONS = [
  { id: 'osm', label: 'OpenStreetMap' },
  { id: 'satellite', label: 'Satellite' },
  { id: 'topo', label: 'Topographic' },
  { id: 'dark', label: 'Dark' },
];

export default function RightIsland() {
  const { mapInstance, activeLayer, setActiveLayer } = useMapStore();
  const [citySearch, setCitySearch] = useState('');
  const [cityResults, setCityResults] = useState([]);
  const [cityOpen, setCityOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [attrOpen, setAttrOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const searchTimeout = useRef(null);

  function zoomIn() { mapInstance?.zoomIn(); }
  function zoomOut() { mapInstance?.zoomOut(); }
  function resetBearing() {
    if (mapInstance?.setBearing) mapInstance.setBearing(0);
  }

  function geolocate() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        mapInstance?.flyTo([pos.coords.latitude, pos.coords.longitude], 14);
      },
      () => { import('react-toastify').then(m => m.toast.error('Geolocation denied')); }
    );
  }

  async function searchCity(q) {
    if (!q.trim()) { setCityResults([]); return; }
    setSearching(true);
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await resp.json();
      setCityResults(data);
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
    mapInstance?.flyTo([parseFloat(r.lat), parseFloat(r.lon)], 13);
    setCityOpen(false);
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

  return (
    <div style={{
      position: 'fixed',
      right: 16,
      top: '50%',
      transform: 'translateY(-50%)',
      zIndex: 1000,
    }}>
      <div className="island" style={{ padding: '6px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <button style={iconBtn()} onClick={zoomIn} title="Zoom in"><Plus size={16} /></button>
        <button style={iconBtn()} onClick={zoomOut} title="Zoom out"><Minus size={16} /></button>
        <div style={{ height: 1, background: 'var(--border)', margin: '4px 2px' }} />
        <button style={iconBtn()} onClick={resetBearing} title="Reset bearing"><Compass size={16} /></button>
        <div style={{ height: 1, background: 'var(--border)', margin: '4px 2px' }} />
        <button style={iconBtn(cityOpen)} onClick={() => { setCityOpen(!cityOpen); setLayersOpen(false); setAttrOpen(false); }} title="City search">
          <Search size={16} />
        </button>
        <button style={iconBtn()} onClick={geolocate} title="My location"><Navigation size={16} /></button>
        <div style={{ height: 1, background: 'var(--border)', margin: '4px 2px' }} />
        <button style={iconBtn(layersOpen)} onClick={() => { setLayersOpen(!layersOpen); setCityOpen(false); setAttrOpen(false); }} title="Layers">
          <Layers size={16} />
        </button>
        <button style={iconBtn(attrOpen)} onClick={() => { setAttrOpen(!attrOpen); setCityOpen(false); setLayersOpen(false); }} title="Attribution">
          <Info size={16} />
        </button>
      </div>

      {/* City search popover */}
      {cityOpen && (
        <div className="island" style={{
          position: 'absolute',
          right: 52,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 260,
          padding: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              value={citySearch}
              onChange={handleCityInput}
              placeholder="Search city or place…"
              autoFocus
              style={{ flex: 1 }}
            />
            <button onClick={() => { setCityOpen(false); setCitySearch(''); setCityResults([]); }} style={{ color: 'var(--text-secondary)', display: 'flex' }}>
              <X size={14} />
            </button>
          </div>
          {cityResults.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {cityResults.map((r) => (
                <button
                  key={r.place_id}
                  onClick={() => flyToResult(r)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '7px 8px',
                    borderRadius: 8,
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    fontSize: 12,
                    color: 'var(--text)',
                    lineHeight: 1.3,
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                >
                  {r.display_name}
                </button>
              ))}
            </div>
          )}
          {searching && (
            <div style={{ textAlign: 'center', padding: '8px', fontSize: 12, color: 'var(--text-secondary)' }}>Searching…</div>
          )}
        </div>
      )}

      {/* Layers popover */}
      {layersOpen && (
        <div className="island" style={{
          position: 'absolute',
          right: 52,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 180,
          padding: 10,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 8 }}>Map layers</div>
          {LAYER_OPTIONS.map((l) => (
            <button
              key={l.id}
              onClick={() => setActiveLayer(l.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: '7px 8px',
                borderRadius: 8,
                border: 'none',
                background: activeLayer === l.id ? 'rgba(0,122,255,0.1)' : 'none',
                color: activeLayer === l.id ? 'var(--accent)' : 'var(--text)',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: activeLayer === l.id ? 600 : 400,
              }}
            >
              {l.label}
            </button>
          ))}
        </div>
      )}

      {/* Attribution popover */}
      {attrOpen && (
        <div className="island" style={{
          position: 'absolute',
          right: 52,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 220,
          padding: '12px 14px',
        }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>OpenStreetMap</a> contributors.<br />
            Geocoding by <a href="https://nominatim.org" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>Nominatim</a>.
          </div>
        </div>
      )}
    </div>
  );
}
