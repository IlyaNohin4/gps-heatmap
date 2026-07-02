import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';

const FORMAT_OPTIONS = [
  { id: 'gpx', label: 'GPX (.gpx)' },
  { id: 'kml', label: 'KML (.kml)' },
  { id: 'geojson', label: 'GeoJSON (.geojson)' },
];

function generateGPX(trackName, points) {
  const header = '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">\n<metadata><name>' + trackName + '</name></metadata>\n<trk><name>' + trackName + '</name><trkseg>\n';
  const trkpts = points.map((p) => `<trkpt lat="${p.lat}" lon="${p.lng || p.lon}"><ele>0</ele></trkpt>`).join('\n');
  const footer = '\n</trkseg></trk>\n</gpx>';
  return header + trkpts + footer;
}

function generateKML(trackName, points) {
  const coords = points.map((p) => `${p.lng || p.lon},${p.lat},0`).join(' ');
  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>${trackName}</name>
      <LineString>
        <coordinates>${coords}</coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>`;
  return kml;
}

function generateGeoJSON(trackName, points) {
  const coordinates = points.map((p) => [p.lng || p.lon, p.lat]);
  return JSON.stringify({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { name: trackName },
        geometry: {
          type: 'LineString',
          coordinates,
        },
      },
    ],
  }, null, 2);
}

function generateFile(format, trackName, points) {
  if (format === 'gpx') return generateGPX(trackName, points);
  if (format === 'kml') return generateKML(trackName, points);
  if (format === 'geojson') return generateGeoJSON(trackName, points);
  return '';
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function SaveTrackModal({
  isOpen,
  trackName: initialName,
  points,
  onClose,
  onSaveToDb,
  saving,
}) {
  const { t } = useTranslation();
  const [trackName, setTrackName] = useState(initialName || 'New Track');
  const [format, setFormat] = useState('gpx');
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const handleDownload = () => {
    if (!trackName.trim()) {
      toast.error('Track name required');
      return;
    }

    try {
      const content = generateFile(format, trackName, points);
      const ext = FORMAT_OPTIONS.find((f) => f.id === format)?.label.match(/\.(\w+)/)?.[1] || 'gpx';
      const mimeType = {
        gpx: 'application/gpx+xml',
        kml: 'application/vnd.google-earth.kml+xml',
        geojson: 'application/geo+json',
      }[format];

      downloadFile(content, `${trackName}.${ext}`, mimeType);
      toast.success('Track downloaded');
      onClose();
    } catch (err) {
      toast.error('Download failed');
      console.error(err);
    }
  };

  const handleSaveToDb = async () => {
    if (!trackName.trim()) {
      toast.error('Track name required');
      return;
    }

    try {
      setIsSaving(true);
      await onSaveToDb(trackName, format, points);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          boxShadow: 'var(--shadow)',
          padding: 24,
          maxWidth: 400,
          width: '90%',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 20,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Save Track</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              display: 'flex',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Track name input */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
            Track name
          </label>
          <input
            type="text"
            value={trackName}
            onChange={(e) => setTrackName(e.target.value)}
            placeholder="e.g., City Route"
            style={{
              width: '100%',
              padding: '8px 12px',
              fontSize: 14,
              border: '1px solid var(--border)',
              borderRadius: 8,
              background: 'var(--surface)',
              color: 'var(--text)',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Format select */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
            File format
          </label>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              fontSize: 14,
              border: '1px solid var(--border)',
              borderRadius: 8,
              background: 'var(--surface)',
              color: 'var(--text)',
              boxSizing: 'border-box',
            }}
          >
            {FORMAT_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Buttons */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            justifyContent: 'flex-end',
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              fontSize: 12,
              fontWeight: 600,
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              color: 'var(--text)',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>

          <button
            onClick={handleDownload}
            style={{
              padding: '8px 16px',
              fontSize: 12,
              fontWeight: 600,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text)',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            Download
          </button>

          <button
            onClick={handleSaveToDb}
            disabled={isSaving || saving}
            style={{
              padding: '8px 16px',
              fontSize: 12,
              fontWeight: 600,
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: isSaving || saving ? 'not-allowed' : 'pointer',
              opacity: isSaving || saving ? 0.6 : 1,
            }}
          >
            {isSaving || saving ? 'Saving...' : 'Save to DB'}
          </button>
        </div>
      </div>
    </div>
  );
}
