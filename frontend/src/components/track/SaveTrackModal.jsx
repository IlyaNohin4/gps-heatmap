import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import Modal from '../../ui/Modal.jsx';
import Button from '../../ui/Button.jsx';
import Input from '../../ui/Input.jsx';

const FORMAT_OPTIONS = [
  { id: 'gpx', label: 'GPX (.gpx)' },
  { id: 'kml', label: 'KML (.kml)' },
  { id: 'geojson', label: 'GeoJSON (.geojson)' },
  { id: 'tcx', label: 'TCX (.tcx)' },
  { id: 'fit', label: 'FIT (.fit)' },
];

function normalizePoint(p) {
  if (Array.isArray(p)) return { lat: p[0], lon: p[1] };
  return { lat: p.lat, lon: p.lng || p.lon };
}

function generateGPX(trackName, points) {
  const header = '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">\n<metadata><name>' + trackName + '</name></metadata>\n<trk><name>' + trackName + '</name><trkseg>\n';
  const trkpts = points.map((p) => {
    const pt = normalizePoint(p);
    return `<trkpt lat="${pt.lat}" lon="${pt.lon}"><ele>0</ele></trkpt>`;
  }).join('\n');
  const footer = '\n</trkseg></trk>\n</gpx>';
  return header + trkpts + footer;
}

function generateKML(trackName, points) {
  const coords = points.map((p) => {
    const pt = normalizePoint(p);
    return `${pt.lon},${pt.lat},0`;
  }).join(' ');
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
  const coordinates = points.map((p) => {
    const pt = normalizePoint(p);
    return [pt.lon, pt.lat];
  });
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

function generateTCX(trackName, points) {
  const trackpoints = points.map((p) => {
    const pt = normalizePoint(p);
    return `    <Trackpoint><Position><LatitudeDegrees>${pt.lat}</LatitudeDegrees><LongitudeDegrees>${pt.lon}</LongitudeDegrees></Position><AltitudeMeters>0</AltitudeMeters><Time>2024-01-01T00:00:00Z</Time></Trackpoint>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <Activities>
    <Activity Sport="Other">
      <Lap StartTime="2024-01-01T00:00:00Z">
        <Track>
${trackpoints}
        </Track>
      </Lap>
    </Activity>
  </Activities>
</TrainingCenterDatabase>`;
}

function generateFIT(trackName, points) {
  const data = [];
  for (const p of points) {
    const pt = normalizePoint(p);
    data.push(Math.round(pt.lat * 1e7) & 0xFFFFFFFF);
    data.push(Math.round(pt.lon * 1e7) & 0xFFFFFFFF);
  }
  return JSON.stringify(data);
}

function generateFile(format, trackName, points) {
  if (format === 'gpx') return generateGPX(trackName, points);
  if (format === 'kml') return generateKML(trackName, points);
  if (format === 'geojson') return generateGeoJSON(trackName, points);
  if (format === 'tcx') return generateTCX(trackName, points);
  if (format === 'fit') return generateFIT(trackName, points);
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

  const handleDownload = () => {
    if (!trackName.trim()) {
      toast.error(t('validation.track_name_required'));
      return;
    }

    try {
      const content = generateFile(format, trackName, points);
      const ext = FORMAT_OPTIONS.find((f) => f.id === format)?.label.match(/\.(\w+)/)?.[1] || 'gpx';
      const mimeType = {
        gpx: 'application/gpx+xml',
        kml: 'application/vnd.google-earth.kml+xml',
        geojson: 'application/geo+json',
        tcx: 'application/vnd.garmin.tcx+xml',
        fit: 'application/octet-stream',
      }[format];

      downloadFile(content, `${trackName}.${ext}`, mimeType);
      toast.success(t('tracks.download_success'));
      onClose();
    } catch (err) {
      toast.error(t('tracks.download_failed'));
      console.error(err);
    }
  };

  const handleSaveToDb = async () => {
    if (!trackName.trim()) {
      toast.error(t('validation.track_name_required'));
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
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Save Track"
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={handleDownload}>
            Download
          </Button>
          <Button onClick={handleSaveToDb} disabled={isSaving || saving}>
            {isSaving || saving ? 'Saving...' : 'Save to DB'}
          </Button>
        </>
      }
    >
      {/* Track name input */}
      <div style={{ marginBottom: 'var(--space-3)' }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 'var(--space-1)' }}>
          Track name
        </label>
        <Input
          type="text"
          value={trackName}
          onChange={(e) => setTrackName(e.target.value)}
          placeholder="e.g., City Route"
        />
      </div>

      {/* Format select */}
      <div>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 'var(--space-1)' }}>
          File format
        </label>
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value)}
          style={{
            width: '100%',
            padding: 'var(--space-2) var(--space-3)',
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
    </Modal>
  );
}
