import React, { useState, useEffect } from 'react';
import { TrendingUp, Gauge, Route, Clock, Mountain, ChevronDown, ChevronUp, ZoomIn, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import L from 'leaflet';
import useAppStore from '../../store/appStore.js';
import useMapStore from '../../store/mapStore.js';
import { getTrack } from '../../api/tracks.js';
import { MAP_ANIMATIONS } from '../../config/mapAnimations.js';

const TABS = ['Elevation', 'Speed', 'Slope'];

function fmtDist(km, unitSystem) {
  if (km === null || km === undefined) return '—';
  if (unitSystem === 'imperial') return `${(km * 0.621371).toFixed(2)} mi`;
  return `${km.toFixed(2)} km`;
}

function fmtSpeed(kmh, unitSystem) {
  if (kmh === null || kmh === undefined) return '—';
  if (unitSystem === 'imperial') return `${(kmh * 0.621371).toFixed(1)} mph`;
  return `${kmh.toFixed(1)} km/h`;
}

function fmtDuration(seconds) {
  if (!seconds) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${Math.floor(seconds % 60)}s`;
}

function fmtElevation(m) {
  if (m === null || m === undefined) return '—';
  return `${Math.round(m)} m`;
}

function CustomTooltip({ active, payload, label, tab, unitSystem }) {
  if (!active || !payload?.length) return null;
  const val = payload[0]?.value;
  let display = val;
  if (tab === 'Speed') display = fmtSpeed(val, unitSystem);
  else if (tab === 'Elevation') display = fmtElevation(val);
  else if (tab === 'Slope') display = `${val?.toFixed(1)}°`;
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '6px 10px',
      fontSize: 12,
    }}>
      <div style={{ color: 'var(--text-secondary)' }}>{fmtDist(label, unitSystem)}</div>
      <div style={{ fontWeight: 600, color: 'var(--text)' }}>{display}</div>
    </div>
  );
}

export default function BottomIsland() {
  const { t } = useTranslation();
  const { selectedTrackId, unitSystem, setSelectedTrackId } = useAppStore();
  const { mapInstance, trackDetailCache } = useMapStore();
  const [trackData, setTrackData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('Elevation');
  const [expanded, setExpanded] = useState(false);


  useEffect(() => {
    if (!selectedTrackId) { setTrackData(null); return; }
    setLoading(true);
    getTrack(selectedTrackId)
      .then(setTrackData)
      .catch(() => setTrackData(null))
      .finally(() => setLoading(false));
  }, [selectedTrackId]);

  function handleZoomToTrack() {
    if (!mapInstance || !selectedTrackId) return;

    const trackData = trackDetailCache[selectedTrackId];
    if (!trackData?.normalized_points || trackData.normalized_points.length === 0) return;

    const bounds = trackData.normalized_points.reduce(
      (acc, pt) => {
        if (!pt.lat || !pt.lon) return acc;
        return acc.extend([pt.lat, pt.lon]);
      },
      L.latLngBounds(null)
    );

    if (bounds.isValid()) {
      mapInstance.flyToBounds(bounds, MAP_ANIMATIONS.trackSelection);
    }
  }

  function handleDeselectTrack() {
    setSelectedTrackId(null);
  }

  const track = trackData;

  const chartData = (() => {
    const points = track?.normalized_points || track?.raw_points || [];
    if (!points.length) return [];

    const speedByIdx = new Array(points.length).fill(null);
    const coordKey = (lat, lon) => `${lat},${lon}`;
    const ptIndex = new Map(points.map((p, i) => [coordKey(p.lat, p.lon), i]));
    for (const seg of track?.speed_segments || []) {
      const kmh = seg.speed_kmh ?? 0;
      if (seg.from_idx != null && seg.to_idx != null) {
        for (let j = seg.from_idx; j <= seg.to_idx; j++) speedByIdx[j] = kmh;
      } else if (seg.from && seg.to) {
        const fromIdx = ptIndex.get(coordKey(seg.from[0], seg.from[1]));
        const toIdx   = ptIndex.get(coordKey(seg.to[0],   seg.to[1]));
        if (fromIdx != null && toIdx != null) {
          for (let j = fromIdx; j <= toIdx; j++) speedByIdx[j] = kmh;
        }
      }
    }

    let cumDist = 0;
    return points.map((pt, i) => {
      let segDistKm = 0;
      if (i > 0) {
        const prev = points[i - 1];
        const dLat = (pt.lat - prev.lat) * 111139;
        const dLon = (pt.lon - prev.lon) * 111139 * Math.cos((pt.lat * Math.PI) / 180);
        segDistKm = Math.sqrt(dLat * dLat + dLon * dLon) / 1000;
        cumDist += segDistKm;
      }
      const elev = pt.elevation ?? pt.ele ?? null;
      const prevElev = i > 0 ? (points[i - 1].elevation ?? points[i - 1].ele ?? null) : null;
      let slope = null;
      if (i > 0 && elev !== null && prevElev !== null && segDistKm > 0) {
        slope = parseFloat(((elev - prevElev) / (segDistKm * 1000) * 100).toFixed(1));
        if (slope > 80) slope = 80;
        if (slope < -80) slope = -80;
      }
      return {
        dist: parseFloat(cumDist.toFixed(3)),
        elevation: elev,
        speed: speedByIdx[i],
        slope,
      };
    });
  })();

  const dataKey = activeTab === 'Elevation' ? 'elevation' : activeTab === 'Speed' ? 'speed' : 'slope';
  const colors = { Elevation: '#34c759', Speed: '#007aff', Slope: '#ff9500' };
  const color = colors[activeTab];

  const tabStyle = (active) => ({
    padding: '5px 14px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    background: active ? color : 'transparent',
    color: active ? '#fff' : 'var(--text-secondary)',
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.15s',
  });

  const stat = (label, value, icon) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-secondary)', fontSize: 11 }}>
        {icon} {label}
      </div>
      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{value}</div>
    </div>
  );

  return (
    <div onClick={(e) => e.stopPropagation()} style={{
      position: 'fixed',
      bottom: 16,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 1000,
      width: 'min(680px, calc(100vw - 32px))',
    }}>
      <div className="island" style={{ padding: 0, overflow: 'hidden' }}>

        {/* Header — always visible */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px 8px 16px',
          borderBottom: expanded ? '1px solid var(--border)' : 'none',
          minHeight: 40,
        }}>
          {/* Tabs — only when a track is selected */}
          {selectedTrackId ? (
            <div style={{ display: 'flex', gap: 4 }}>
              {TABS.map((tab) => (
                <button key={tab} style={tabStyle(activeTab === tab)} onClick={() => setActiveTab(tab)}>
                  {t(`chart.${tab.toLowerCase()}`)}
                </button>
              ))}
            </div>
          ) : (
            <div />
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {selectedTrackId && track && (
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                {track.name || 'Track'}
              </span>
            )}
            {selectedTrackId && (
              <>
                <button
                  onClick={handleZoomToTrack}
                  style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 8, padding: 4, transition: 'color 0.15s' }}
                  onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent)'}
                  onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
                  title={t('card.zoom_to_track') || 'Zoom to track'}
                >
                  <ZoomIn size={16} />
                </button>
                <button
                  onClick={handleDeselectTrack}
                  style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 8, padding: 4, transition: 'color 0.15s' }}
                  onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent)'}
                  onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
                  title={t('card.deselect') || 'Deselect track'}
                >
                  <X size={16} />
                </button>
              </>
            )}
            <button
              onClick={() => setExpanded((v) => !v)}
              style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 8, padding: 4 }}
              title={expanded ? t('chart.collapse') : t('chart.expand')}
            >
              {expanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
            </button>
          </div>
        </div>

        {/* Body — visible only when expanded */}
        {expanded && (
          <div style={{ padding: '12px 16px 14px', animation: 'fadeIn 0.3s ease-out' }}>
            {!selectedTrackId ? (
              <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
                {t('chart.select_track')}
              </div>
            ) : loading ? (
              <div style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
                {t('chart.loading')}
              </div>
            ) : chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={100}>
                <AreaChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }} isAnimationActive={true}>
                  <defs>
                    <linearGradient id={`grad-${activeTab}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={color} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="dist"
                    tick={{ fontSize: 10, fill: 'var(--text-secondary)' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => unitSystem === 'imperial' ? `${(v * 0.621371).toFixed(1)} mi` : `${v} km`}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'var(--text-secondary)' }}
                    tickLine={false}
                    axisLine={false}
                    width={36}
                  />
                  <Tooltip content={<CustomTooltip tab={activeTab} unitSystem={unitSystem} />} isAnimationActive={true} />
                  <Area
                    type="monotone"
                    dataKey={dataKey}
                    stroke={color}
                    strokeWidth={2}
                    fill={`url(#grad-${activeTab})`}
                    dot={false}
                    activeDot={{ r: 4, fill: color }}
                    isAnimationActive={true}
                    animationDuration={500}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
                {t('chart.no_data')}
              </div>
            )}

            {selectedTrackId && track && (
              <div style={{
                display: 'flex',
                justifyContent: 'space-around',
                marginTop: 12,
                paddingTop: 12,
                borderTop: '1px solid var(--border)',
                flexWrap: 'wrap',
                gap: 8,
              }}>
                {stat(t('chart.distance'), fmtDist(track.distance_km, unitSystem), <Route size={11} />)}
                {stat(t('chart.duration'), fmtDuration(track.duration_sec), <Clock size={11} />)}
                {stat(t('chart.avg_speed'), fmtSpeed(track.speed_avg, unitSystem), <Gauge size={11} />)}
                {stat(t('chart.max_speed'), fmtSpeed(track.speed_max, unitSystem), <TrendingUp size={11} />)}
                {stat(t('chart.elev_gain'), fmtElevation(track.elevation_gain), <Mountain size={11} />)}
                {stat(t('chart.elev_loss'), fmtElevation(track.elevation_loss), <ChevronDown size={11} />)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
