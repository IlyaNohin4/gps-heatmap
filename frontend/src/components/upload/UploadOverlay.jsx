import React, { useState, useEffect, useRef } from 'react';
import { Upload } from 'lucide-react';

const TRACK_FORMATS = ['.gpx', '.kml', '.tcx', '.fit', '.geojson'];
const POI_FORMATS = ['.kml', '.kmz'];

export default function UploadOverlay({ onTrackFiles, onPOIFiles }) {
  const [dragging, setDragging] = useState(false);
  const dragCounter = useRef(0);

  useEffect(() => {
    function onDragEnter(e) {
      e.preventDefault();
      dragCounter.current++;
      setDragging(true);
    }

    function onDragLeave(e) {
      e.preventDefault();
      dragCounter.current--;
      if (dragCounter.current <= 0) {
        dragCounter.current = 0;
        setDragging(false);
      }
    }

    function onDragOver(e) {
      e.preventDefault();
    }

    function onDrop(e) {
      e.preventDefault();
      dragCounter.current = 0;
      setDragging(false);

      const rect = document.body.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const half = window.innerWidth / 2;
      const isLeft = x < half;

      const files = Array.from(e.dataTransfer.files);
      if (!files.length) return;

      if (isLeft) {
        // Left half: Tracks
        const trackFiles = files.filter((f) => {
          const ext = '.' + f.name.toLowerCase().split('.').pop();
          return TRACK_FORMATS.includes(ext);
        });
        if (trackFiles.length) onTrackFiles(trackFiles);
      } else {
        // Right half: POI
        const poiFiles = files.filter((f) => {
          const ext = '.' + f.name.toLowerCase().split('.').pop();
          return POI_FORMATS.includes(ext);
        });
        if (poiFiles.length) onPOIFiles(poiFiles);
      }
    }

    if (dragging) {
      window.addEventListener('dragenter', onDragEnter);
      window.addEventListener('dragleave', onDragLeave);
      window.addEventListener('dragover', onDragOver);
      window.addEventListener('drop', onDrop);
      return () => {
        window.removeEventListener('dragenter', onDragEnter);
        window.removeEventListener('dragleave', onDragLeave);
        window.removeEventListener('dragover', onDragOver);
        window.removeEventListener('drop', onDrop);
      };
    }
  }, [dragging, onTrackFiles, onPOIFiles]);

  if (!dragging) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50000,
        display: 'flex',
        pointerEvents: 'none',
      }}
    >
      {/* Left half: Tracks */}
      <div
        style={{
          flex: 1,
          background: 'rgba(0, 122, 255, 0.15)',
          border: '3px dashed rgba(0, 122, 255, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <Upload size={48} color="rgba(0, 122, 255, 0.7)" />
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: 'rgba(0, 122, 255, 0.8)',
            textAlign: 'center',
          }}
        >
          Drop Tracks Here
        </div>
        <div
          style={{
            fontSize: 12,
            color: 'rgba(0, 122, 255, 0.6)',
          }}
        >
          GPX, KML, TCX, FIT, GeoJSON
        </div>
      </div>

      {/* Right half: POI */}
      <div
        style={{
          flex: 1,
          background: 'rgba(255, 149, 0, 0.15)',
          border: '3px dashed rgba(255, 149, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <Upload size={48} color="rgba(255, 149, 0, 0.7)" />
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: 'rgba(255, 149, 0, 0.8)',
            textAlign: 'center',
          }}
        >
          Drop POI Here
        </div>
        <div
          style={{
            fontSize: 12,
            color: 'rgba(255, 149, 0, 0.6)',
          }}
        >
          KML, KMZ
        </div>
      </div>
    </div>
  );
}
