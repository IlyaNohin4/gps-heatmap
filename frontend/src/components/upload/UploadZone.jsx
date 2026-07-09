import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import { Upload } from 'lucide-react';
import useAppStore from '../../store/appStore.js';
import { uploadTrack, pollTaskStatus, fetchTracks } from '../../api/tracks.js';

const TRACK_FORMATS = ['.gpx', '.kml', '.tcx', '.fit', '.geojson'];
const POI_FORMATS = ['.kml', '.kmz'];
const ACCEPTED = [...TRACK_FORMATS, ...POI_FORMATS];
const MAX_SIZE = 20 * 1024 * 1024; // 20MB

function getExt(filename) {
  const parts = filename.toLowerCase().split('.');
  return '.' + parts[parts.length - 1];
}

export default function UploadZone({ inputRef: externalInputRef, onTrackFiles, onPOIFiles }) {
  const { t } = useTranslation();
  const { addTrack, addUploadingId, removeUploadingId } = useAppStore();
  const [dragging, setDragging] = useState(false);
  // Queue progress: { current, total } | null
  const [queueProgress, setQueueProgress] = useState(null);
  const inputRef = useRef(null);
  const dragCounter = useRef(0);
  // Serialise calls: track whether the queue is already running
  const queueRunning = useRef(false);
  const pendingQueue = useRef([]);

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
        toast.error(t('validation.unsupported_format', { name: file.name }));
        continue;
      }
      if (file.size > MAX_SIZE) {
        toast.error(t('validation.file_too_large', { name: file.name }));
        continue;
      }
      validFiles.push(file);
    }
    if (!validFiles.length) return;

    // Append to the shared queue
    pendingQueue.current.push(...validFiles);

    // Only start the runner once; subsequent calls just enqueue
    if (!queueRunning.current) {
      queueRunning.current = true;
      await runQueue();
      queueRunning.current = false;
    }
  }

  async function runQueue() {
    // Snapshot total at queue start (more files may arrive during processing)
    let processed = 0;
    while (pendingQueue.current.length > 0) {
      const total = processed + pendingQueue.current.length;
      const file = pendingQueue.current.shift();
      processed++;
      setQueueProgress({ current: processed, total });
      await processFile(file);
    }
    setQueueProgress(null);
  }

  async function processFile(file) {
    let taskId = null;
    try {
      const result = await uploadTrack(file, null);
      taskId = result.task_id;
      if (taskId) {
        addUploadingId(taskId);
        await pollUntilDone(taskId, file.name);
      } else if (result.track) {
        addTrack(result.track);
        toast.success(t('tracks.upload_success', { name: file.name }));
      }
    } catch (err) {
      toast.error(t('tracks.upload_failed', { name: file.name }));
      if (taskId) removeUploadingId(taskId);
      // Continue to next file — don't rethrow
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
              useAppStore.getState().setTracks(data);
            } catch {
              if (status.track) addTrack(status.track);
            }
            toast.success(t('tracks.upload_success', { name: filename }));
            resolve();
          } else if (status.state === 'FAILURE' || status.status === 'error' || status.status === 'failed') {
            clearInterval(interval);
            removeUploadingId(taskId);
            toast.error(t('tracks.upload_failed', { name: filename }));
            resolve();
          }
        } catch {
          clearInterval(interval);
          removeUploadingId(taskId);
          toast.error(t('tracks.upload_failed', { name: filename }));
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
    function onDragOver(e) { e.preventDefault(); }
    function onDrop(e) {
      e.preventDefault();
      dragCounter.current = 0;
      setDragging(false);
      const files = Array.from(e.dataTransfer.files);
      if (!files.length) return;

      // Determine drop zone (left half = tracks, right half = POI)
      const x = e.clientX;
      const half = window.innerWidth / 2;
      const isLeft = x < half;

      // Filter files by type
      const trackFiles = files.filter(f => {
        const ext = getExt(f.name);
        return TRACK_FORMATS.includes(ext);
      });
      const poiFiles = files.filter(f => {
        const ext = getExt(f.name);
        return POI_FORMATS.includes(ext);
      });

      // Route to appropriate handlers
      if (isLeft && trackFiles.length) {
        processFiles(trackFiles);
      } else if (!isLeft && poiFiles.length) {
        onPOIFiles?.(poiFiles);
      } else if (trackFiles.length) {
        // If no zone determined or POI zone but track files, process tracks
        processFiles(trackFiles);
      } else if (poiFiles.length) {
        // If no zone determined or track zone but POI files, process POI
        onPOIFiles?.(poiFiles);
      }
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
        accept={[...TRACK_FORMATS, ...POI_FORMATS].join(',')}
        multiple
        style={{ display: 'none' }}
        onChange={handleInputChange}
      />

      {/* Queue progress indicator */}
      {queueProgress && (
        <div style={{
          position: 'fixed',
          bottom: 80,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10001,
        }}>
          <div className="island" style={{
            padding: '10px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text)',
            whiteSpace: 'nowrap',
          }}>
            <Upload size={14} color="var(--accent)" style={{ animation: 'pulse 1s ease-in-out infinite' }} />
            Uploading {queueProgress.current} of {queueProgress.total}…
          </div>
        </div>
      )}

      {/* Drag-and-drop overlay — 50/50 split */}
      {dragging && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10000,
          display: 'flex',
          pointerEvents: 'none',
        }}>
          {/* Left half: Tracks */}
          <div
            style={{
              flex: 1,
              background: 'rgba(0, 122, 255, 0.15)',
              border: '3px dashed rgba(0, 122, 255, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 12,
                background: 'rgba(255, 255, 255, 0.85)',
                padding: '40px 60px',
                borderRadius: 12,
              }}
            >
              <Upload size={48} color="rgba(0, 122, 255, 0.9)" />
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: 'var(--text)',
                  textAlign: 'center',
                }}
              >
                Drop Tracks Here
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--text)',
                }}
              >
                GPX, KML, TCX, FIT, GeoJSON
              </div>
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
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 12,
                background: 'rgba(255, 255, 255, 0.85)',
                padding: '40px 60px',
                borderRadius: 12,
              }}
            >
              <Upload size={48} color="rgba(255, 149, 0, 0.9)" />
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: 'var(--text)',
                  textAlign: 'center',
                }}
              >
                Drop POI Here
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--text)',
                }}
              >
                KML, KMZ
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
