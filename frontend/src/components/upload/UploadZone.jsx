import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { Upload } from 'lucide-react';
import useAppStore from '../../store/appStore.js';
import { uploadTrack, pollTaskStatus, fetchTracks } from '../../api/tracks.js';

const ACCEPTED = ['.gpx', '.kml', '.tcx', '.fit', '.geojson'];
const MAX_SIZE = 20 * 1024 * 1024; // 20MB

function getExt(filename) {
  const parts = filename.toLowerCase().split('.');
  return '.' + parts[parts.length - 1];
}

export default function UploadZone({ inputRef: externalInputRef }) {
  const { addTrack, addUploadingId, removeUploadingId } = useAppStore();
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);
  const dragCounter = useRef(0);

  // Expose input ref to parent if needed
  useEffect(() => {
    if (externalInputRef) {
      externalInputRef.current = inputRef.current;
    }
  });

  async function processFiles(files) {
    const validFiles = [];
    for (const file of files) {
      const ext = getExt(file.name);
      if (!ACCEPTED.includes(ext)) {
        toast.error(`Unsupported format: ${file.name}`);
        continue;
      }
      if (file.size > MAX_SIZE) {
        toast.error(`File too large (max 20MB): ${file.name}`);
        continue;
      }
      validFiles.push(file);
    }
    if (!validFiles.length) return;

    for (const file of validFiles) {
      processFile(file);
    }
  }

  async function processFile(file) {
    let taskId = null;
    try {
      const result = await uploadTrack(file, null);
      taskId = result.task_id;
      if (taskId) {
        addUploadingId(taskId);
        toast.info(`Processing ${file.name}…`);
        await pollUntilDone(taskId, file.name);
      } else if (result.track) {
        addTrack(result.track);
        toast.success(`Uploaded: ${file.name}`);
      }
    } catch (err) {
      toast.error(`Upload failed: ${file.name} — ${err.response?.data?.detail || err.message}`);
      if (taskId) removeUploadingId(taskId);
    }
  }

  async function pollUntilDone(taskId, filename) {
    return new Promise((resolve) => {
      const interval = setInterval(async () => {
        try {
          const status = await pollTaskStatus(taskId);
          if (status.state === 'SUCCESS' || status.status === 'done' || status.status === 'completed') {
            clearInterval(interval);
            removeUploadingId(taskId);
            try {
              const data = await fetchTracks({});
              useAppStore.getState().setTracks(data.tracks || data);
            } catch {
              if (status.track) addTrack(status.track);
            }
            toast.success(`Done: ${filename}`);
            resolve();
          } else if (status.state === 'FAILURE' || status.status === 'error' || status.status === 'failed') {
            clearInterval(interval);
            removeUploadingId(taskId);
            toast.error(`Processing failed: ${filename}`);
            resolve();
          }
        } catch {
          clearInterval(interval);
          removeUploadingId(taskId);
          toast.error(`Status check failed for ${filename}`);
          resolve();
        }
      }, 2000);
    });
  }

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
      const files = Array.from(e.dataTransfer.files);
      if (files.length) processFiles(files);
    }

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
  }, []);

  function handleInputChange(e) {
    const files = Array.from(e.target.files);
    if (files.length) processFiles(files);
    e.target.value = '';
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(',')}
        multiple
        style={{ display: 'none' }}
        onChange={handleInputChange}
      />
      {dragging && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10000,
          background: 'rgba(0,122,255,0.12)',
          backdropFilter: 'blur(2px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <div className="island" style={{
            padding: '40px 60px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
          }}>
            <Upload size={40} color="var(--accent)" />
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
              Drop GPS files here
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              GPX, KML, TCX, FIT, GeoJSON · max 20MB
            </div>
          </div>
        </div>
      )}
    </>
  );
}
