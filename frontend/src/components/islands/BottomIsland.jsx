import React, { useState, useEffect, useRef, forwardRef } from 'react';
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
import Panel from '../../ui/Panel.jsx';
import Button from '../../ui/Button.jsx';

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

function fmtElevation(m, unitSystem) {
  if (m === null || m === undefined) return '—';
  if (unitSystem === 'imperial') return `${Math.round(m * 3.28084)} ft`;
  return `${Math.round(m)} m`;
}

function CustomTooltip({ active, payload, label, tab, unitSystem }) {
  if (!active || !payload?.length) return null;
  const val = payload[0]?.value;
  let display = val;
  if (tab === 'Speed') display = fmtSpeed(val, unitSystem);
  else if (tab === 'Elevation') display = fmtElevation(val, unitSystem);
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

export default forwardRef(function BottomIsland(_props, ref) {
  const { t } = useTranslation();
  const { selectedTrackId, unitSystem, setSelectedTrackId, tracks } = useAppStore();
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

  // Name comes from the list (kept in sync on rename via appStore.updateTrack) —
  // trackData is fetched once on selection and doesn't otherwise pick up renames.
  const listTrack = tracks.find((t) => t.id === selectedTrackId);
  const track = trackData ? { ...trackData, name: listTrack?.name ?? trackData.name } : trackData;

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
        // rise/run ratio, clamped to suppress GPS noise outliers before
        // converting to a real angle (atan), not just labelling % as "°".
        let ratio = (elev - prevElev) / (segDistKm * 1000);
        if (ratio > 0.8) ratio = 0.8;
        if (ratio < -0.8) ratio = -0.8;
        slope = parseFloat((Math.atan(ratio) * (180 / Math.PI)).toFixed(1));
      }
      return {
        dist: parseFloat(cumDist.toFixed(3)),
        elevation: elev,
        speed: speedByIdx[i],
        slope,
        lat: pt.lat,
        lon: pt.lon,
      };
    });
  })();

  const hoverMarkerRef = useRef(null);

  function showHoverMarker(lat, lon) {
    if (!mapInstance || lat == null || lon == null) return;
    if (!hoverMarkerRef.current) {
      hoverMarkerRef.current = L.circleMarker([lat, lon], {
        radius: 6,
        color: '#fff',
        weight: 2,
        fillColor: color,
        fillOpacity: 1,
      }).addTo(mapInstance);
    } else {
      hoverMarkerRef.current.setLatLng([lat, lon]);
      hoverMarkerRef.current.setStyle({ fillColor: color });
    }
  }

  function hideHoverMarker() {
    if (hoverMarkerRef.current) {
      hoverMarkerRef.current.remove();
      hoverMarkerRef.current = null;
    }
  }

  useEffect(() => hideHoverMarker, [selectedTrackId, activeTab]);

  const dataKey = activeTab === 'Elevation' ? 'elevation' : activeTab === 'Speed' ? 'speed' : 'slope';
  const colors = { Elevation: '#34c759', Speed: '#007aff', Slope: '#ff9500' };
  const color = colors[activeTab];

  const stat = (label, value, icon) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-1)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', color: 'var(--text-secondary)', fontSize: 11 }}>
        {icon} {label}
      </div>
      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{value}</div>
    </div>
  );

  return (
    <div ref={ref} onClick={(e) => e.stopPropagation()} style={{
      position: 'fixed',
      bottom: 16,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 1000,
      width: 'min(680px, calc(100vw - 32px))',
    }}>
      <Panel style={{ padding: 0, overflow: 'hidden' }}>

        {/* Header — always visible */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--space-2) var(--space-3) var(--space-2) var(--space-4)',
          borderBottom: expanded ? '1px solid var(--border)' : 'none',
          minHeight: 40,
        }}>
          {/* Tabs — only when a track is selected */}
          {selectedTrackId ? (
            <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
              {TABS.map((tab) => (
                <Button
                  key={tab}
                  variant="ghost"
                  active={activeTab === tab}
                  style={activeTab === tab ? { background: colors[tab], color: '#fff' } : undefined}
                  onClick={() => setActiveTab(tab)}
                >
                  {t(`chart.${tab.toLowerCase()}`)}
                </Button>
              ))}
            </div>
          ) : (
            <div />
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            {selectedTrackId && track && (
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                {track.name || 'Track'}
              </span>
            )}
            {selectedTrackId && (
              <>
                <Button
                  variant="ghost"
                  iconOnly
                  size="sm"
                  onClick={handleZoomToTrack}
                  title={t('card.zoom_to_track') || 'Zoom to track'}
                >
                  <ZoomIn size={16} />
                </Button>
                <Button
                  variant="ghost"
                  iconOnly
                  size="sm"
                  onClick={handleDeselectTrack}
                  title={t('card.deselect') || 'Deselect track'}
                >
                  <X size={16} />
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              iconOnly
              size="sm"
              onClick={() => setExpanded((v) => !v)}
              title={expanded ? t('chart.collapse') : t('chart.expand')}
            >
              {expanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
            </Button>
          </div>
        </div>

        {/* Body — visible only when expanded */}
        {expanded && (
          <div style={{ padding: 'var(--space-3) var(--space-4)', animation: 'fadeIn 0.3s ease-out' }}>
            {!selectedTrackId ? (
              <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
                {t('chart.select_track')}
              </div>
            ) : loading ? (
              <div style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
                {t('chart.loading')}
              </div>
            ) : chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={100} style={{ userSelect: 'none' }}>
                <AreaChart
                  data={chartData}
                  margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
                  isAnimationActive={true}
                  onMouseMove={(state) => {
                    if (state?.isTooltipActive && state.activePayload?.length) {
                      const pt = state.activePayload[0].payload;
                      showHoverMarker(pt.lat, pt.lon);
                    } else {
                      hideHoverMarker();
                    }
                  }}
                  onMouseLeave={hideHoverMarker}
                >
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
                marginTop: 'var(--space-3)',
                paddingTop: 'var(--space-3)',
                borderTop: '1px solid var(--border)',
                flexWrap: 'wrap',
                gap: 'var(--space-2)',
              }}>
                {stat(t('chart.distance'), fmtDist(track.distance_km, unitSystem), <Route size={11} />)}
                {stat(t('chart.duration'), fmtDuration(track.duration_sec), <Clock size={11} />)}
                {stat(t('chart.avg_speed'), fmtSpeed(track.speed_avg, unitSystem), <Gauge size={11} />)}
                {stat(t('chart.max_speed'), fmtSpeed(track.speed_max, unitSystem), <TrendingUp size={11} />)}
                {stat(t('chart.elev_gain'), fmtElevation(track.elevation_gain, unitSystem), <Mountain size={11} />)}
                {stat(t('chart.elev_loss'), fmtElevation(track.elevation_loss, unitSystem), <ChevronDown size={11} />)}
              </div>
            )}
          </div>
        )}
      </Panel>
    </div>
  );
});
