import React, { useState, useEffect } from 'react';
import { Plus, MapPin, Trash2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import useMapStore from '../../store/mapStore.js';
import { fetchPOI, deletePOI } from '../../api/poi.js';

export default function POITab() {
  const { t } = useTranslation();
  const { pois, setPOIs, setPoiCreationMode, poiCreationMode, mapInstance } = useMapStore();
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(null);

  useEffect(() => {
    loadPOIs();
  }, []);

  async function loadPOIs() {
    setLoading(true);
    try {
      const data = await fetchPOI();
      setPOIs(data);
    } catch (err) {
      toast.error('Failed to load POI');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function handleToggleCreation() {
    setPoiCreationMode(!poiCreationMode);
  }

  async function handleDeletePOI(id) {
    setDeleting(id);
    try {
      await deletePOI(id);
      toast.success('POI deleted');
      await loadPOIs();
    } catch (err) {
      toast.error('Failed to delete POI');
    } finally {
      setDeleting(null);
    }
  }

  function handleZoomToPOI(poi) {
    if (!mapInstance) return;
    mapInstance.flyTo([poi.lat, poi.lon], 16, { duration: 1.2, easeLinearity: 0.25 });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header with Create button */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 14px',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <MapPin size={16} color="var(--accent)" />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>POI</span>
        </div>
        <button
          onClick={handleToggleCreation}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            height: 32,
            background: poiCreationMode ? 'var(--accent)' : 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            cursor: 'pointer',
            color: poiCreationMode ? '#fff' : 'var(--text)',
            transition: 'all 0.15s',
          }}
          title="Create POI (right-click on map)"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* POI List */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '8px 0',
      }}>
        {loading ? (
          <div style={{ padding: '16px 14px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12 }}>
            Loading POI...
          </div>
        ) : pois.length === 0 ? (
          <div style={{
            padding: '20px 14px',
            textAlign: 'center',
            color: 'var(--text-secondary)',
            fontSize: 12,
          }}>
            No POI yet<br />
            Click the + button then right-click on map
          </div>
        ) : (
          pois.map((poi) => (
            <div
              key={poi.id}
              style={{
                padding: '8px 14px',
                marginBottom: 4,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              onClick={() => handleZoomToPOI(poi)}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--text)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {poi.name}
                </div>
                <div style={{
                  fontSize: 11,
                  color: 'var(--text-secondary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {poi.category}
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeletePOI(poi.id);
                }}
                disabled={deleting === poi.id}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: deleting === poi.id ? 'not-allowed' : 'pointer',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  opacity: deleting === poi.id ? 0.5 : 1,
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Status indicator */}
      {poiCreationMode && (
        <div style={{
          padding: '8px 14px',
          background: 'rgba(0, 122, 255, 0.1)',
          borderTop: '1px solid var(--border)',
          fontSize: 11,
          color: 'var(--accent)',
          fontWeight: 600,
          textAlign: 'center',
        }}>
          ✓ Creation mode active - right-click on map
        </div>
      )}
    </div>
  );
}
