import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import Modal from '../../ui/Modal.jsx';
import Button from '../../ui/Button.jsx';
import Input from '../../ui/Input.jsx';
import { exportTrackFile } from '../../api/tracks.js';

const FORMAT_OPTIONS = [
  { id: 'gpx', label: 'GPX (.gpx)' },
  { id: 'kml', label: 'KML (.kml)' },
  { id: 'geojson', label: 'GeoJSON (.geojson)' },
  { id: 'tcx', label: 'TCX (.tcx)' },
  { id: 'fit', label: 'FIT (.fit)' },
];

function downloadBlob(blob, filename) {
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

  const handleDownload = async () => {
    if (!trackName.trim()) {
      toast.error(t('validation.track_name_required'));
      return;
    }

    try {
      const blob = await exportTrackFile(trackName, points, format);
      const ext = FORMAT_OPTIONS.find((f) => f.id === format)?.label.match(/\.(\w+)/)?.[1] || 'gpx';
      downloadBlob(blob, `${trackName}.${ext}`);
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
