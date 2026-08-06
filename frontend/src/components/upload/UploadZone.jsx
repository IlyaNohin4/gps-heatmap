import React, { useEffect, useRef, useState } from 'react';
import { notify as toast } from '../../utils/notify.js';
import { useTranslation } from 'react-i18next';
import { Upload, X } from 'lucide-react';
import useAppStore from '../../store/appStore.js';
import { uploadTrack, pollTaskStatus, fetchTracks } from '../../api/tracks.js';
import { sniffKmlKind, isKml } from '../../utils/fileSniff.js';

// appStore.tracks feeds the heatmap directly — must hold every track, not
// just the API's default 50-item page (see App.jsx's TRACKS_FETCH_LIMIT).
const TRACKS_FETCH_LIMIT = 500;

const TRACK_FORMATS = ['.gpx', '.kml', '.tcx', '.fit', '.geojson'];
const POI_FORMATS = ['.kml', '.kmz'];
const ACCEPTED = [...TRACK_FORMATS, ...POI_FORMATS];
// Must match backend/app/core/config.py's MAX_FILE_SIZE_MB — not exposed to
// the frontend via API/env, so this is the frontend's own source of truth.
const MAX_FILE_SIZE_MB = 20;
const MAX_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;

function getExt(filename) {
  const parts = filename.toLowerCase().split('.');
  return '.' + parts[parts.length - 1];
}

export default function UploadZone({ inputRef: externalInputRef, onTrackFiles, onPOIFiles, queueProgressBottom = 80 }) {
  const { t } = useTranslation();
  const { tracks, addTrack, addUploadingId, removeUploadingId, bumpTracksListVersion } = useAppStore();
  const [dragging, setDragging] = useState(false);
  // Queue progress: { current, total } | null
  const [queueProgress, setQueueProgress] = useState(null);
  const inputRef = useRef(null);
  const dragCounter = useRef(0);
  // Serialise calls: track whether the queue is already running
  const queueRunning = useRef(false);
  const pendingQueue = useRef([]);
  // Set by the queue progress indicator's cancel button — checked between
  // files (runQueue) and on every poll tick (pollUntilDone) so cancelling
  // stops the frontend from uploading/waiting on anything further. Doesn't
  // (can't, without a dedicated revoke endpoint) stop a track already
  // mid-processing on the backend — it just stops the frontend from
  // queuing more work and waiting on what's in flight.
  const cancelledRef = useRef(false);

  // Expose input ref to parent if needed
  useEffect(() => {
    if (externalInputRef) {
      externalInputRef.current = inputRef.current;
    }
  });

  async function processFiles(files) {
    const validFiles = [];
    // Blocks a track from being uploaded if its name collides with one
    // already loaded, or with another file in this same batch — silently
    // creating two tracks named identically was confusing (which is which
    // in the list?). Collected instead of toasted one-per-file so dropping
    // 10 clashing files fires one summary toast, not 10.
    const duplicateNames = [];
    const seenNames = new Set(tracks.map((tr) => tr.name?.toLowerCase()).filter(Boolean));
    for (const file of files) {
      const ext = getExt(file.name);
      if (!ACCEPTED.includes(ext)) {
        toast.error(t('validation.unsupported_format', { name: file.name }));
        continue;
      }
      if (file.size > MAX_SIZE) {
        toast.error(t('validation.file_too_large', { name: file.name, maxSize: MAX_FILE_SIZE_MB }));
        continue;
      }
      if (isKml(file.name)) {
        const kind = await sniffKmlKind(file).catch(() => 'unknown');
        if (kind === 'poi') {
          toast.error(t('validation.kml_looks_like_poi', { name: file.name }));
          continue;
        }
      }
      const baseName = file.name.replace(/\.[^.]+$/, '');
      const baseNameLower = baseName.toLowerCase();
      if (seenNames.has(baseNameLower)) {
        duplicateNames.push(baseName);
        continue;
      }
      seenNames.add(baseNameLower);
      validFiles.push(file);
    }
    if (duplicateNames.length > 0) {
      toast.error(t('validation.duplicate_track_names'));
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
    cancelledRef.current = false;
    // Snapshot total at queue start (more files may arrive during processing)
    let processed = 0;
    let successCount = 0;
    let failCount = 0;
    while (pendingQueue.current.length > 0) {
      if (cancelledRef.current) {
        pendingQueue.current = [];
        break;
      }
      const total = processed + pendingQueue.current.length;
      const file = pendingQueue.current.shift();
      processed++;
      setQueueProgress({ current: processed, total });
      const outcome = await processFile(file);
      if (outcome === 'success') successCount++;
      else if (outcome !== 'cancelled') failCount++;
    }
    const wasCancelled = cancelledRef.current;
    cancelledRef.current = false;
    setQueueProgress(null);
    // One summary toast for the whole queue instead of one per file — see
    // notification-reduction pass: no filenames, no per-file counts.
    if (successCount > 0) {
      toast.success(t(successCount === 1 ? 'tracks.upload_success' : 'tracks.upload_success_plural'));
    }
    if (failCount > 0) {
      toast.error(t('tracks.upload_failed'));
    }
    if (wasCancelled) {
      toast.info(t('tracks.processing_cancelled'));
    }
  }

  function handleCancelQueue() {
    cancelledRef.current = true;
  }

  async function processFile(file) {
    let taskId = null;
    try {
      const result = await uploadTrack(file, null);
      taskId = result.task_id;
      if (taskId) {
        addUploadingId(taskId);
        return await pollUntilDone(taskId);
      }
      if (result.track) {
        addTrack(result.track);
        bumpTracksListVersion();
      }
      return 'success';
    } catch (err) {
      if (taskId) removeUploadingId(taskId);
      return 'error';
    }
  }

  async function pollUntilDone(taskId) {
    const POLL_INTERVAL_MS = 2000;
    const MAX_ATTEMPTS = 150; // ~5 minutes — a stuck/PENDING-forever task shouldn't poll silently forever
    let attempts = 0;

    return new Promise((resolve) => {
      const interval = setInterval(async () => {
        if (cancelledRef.current) {
          clearInterval(interval);
          removeUploadingId(taskId);
          resolve('cancelled');
          return;
        }
        attempts++;
        try {
          const status = await pollTaskStatus(taskId);
          // A parser error is a *permanent* failure the task catches and
          // returns as {"status": "error", ...} — Celery still reports the
          // task itself as SUCCESS (it ran to completion without raising),
          // so the real outcome is nested in `result`, not the top-level
          // `state`. Checking `state === 'SUCCESS'` alone would report a
          // false "uploaded" outcome for a track that was actually rejected.
          if (status.state === 'SUCCESS' && status.result?.status === 'error') {
            clearInterval(interval);
            removeUploadingId(taskId);
            resolve('error');
          } else if (status.state === 'SUCCESS' || status.status === 'done' || status.status === 'completed') {
            clearInterval(interval);
            removeUploadingId(taskId);
            try {
              const data = await fetchTracks({ limit: TRACKS_FETCH_LIMIT });
              useAppStore.getState().setTracks(data);
            } catch {
              if (status.track) addTrack(status.track);
            }
            bumpTracksListVersion();
            resolve('success');
          } else if (status.state === 'FAILURE' || status.status === 'error' || status.status === 'failed') {
            clearInterval(interval);
            removeUploadingId(taskId);
            resolve('error');
          } else if (attempts >= MAX_ATTEMPTS) {
            clearInterval(interval);
            removeUploadingId(taskId);
            resolve('error'); // treated the same as a failure in the batch summary — no per-file specifics
          }
        } catch {
          clearInterval(interval);
          removeUploadingId(taskId);
          resolve('error');
        }
      }, POLL_INTERVAL_MS);
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

      // Route strictly by the zone the files were dropped on — don't silently
      // reroute to the other handler, that's how a GeoJSON dropped on the POI
      // side used to get uploaded as a track.
      const zoneFiles = isLeft ? trackFiles : poiFiles;
      const otherZoneFiles = isLeft ? poiFiles : trackFiles;

      if (zoneFiles.length) {
        if (isLeft) processFiles(zoneFiles);
        else onPOIFiles?.(zoneFiles);
      } else if (otherZoneFiles.length) {
        toast.error(t(isLeft ? 'validation.dropped_poi_on_tracks' : 'validation.dropped_track_on_poi'));
      } else {
        files.forEach((f) => toast.error(t('validation.unsupported_format', { name: f.name })));
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

      {/* Queue progress indicator — anchored at the same BottomIsland-aware
          offset as bottom-corner toasts (see App.jsx's legendBottom), so it
          sits at a consistent "below everything" level instead of a fixed
          80px that could still land under an expanded chart panel. */}
      {queueProgress && (
        <div style={{
          position: 'fixed',
          bottom: queueProgressBottom,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10001,
          transition: 'bottom 0.15s ease',
        }}>
          <div className="island" style={{
            padding: '10px 12px 10px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text)',
            whiteSpace: 'nowrap',
          }}>
            <Upload size={14} color="var(--accent)" style={{ animation: 'pulse 1s ease-in-out infinite' }} />
            {t('tracks.processing_progress', { current: queueProgress.current, total: queueProgress.total })}
            <button
              onClick={handleCancelQueue}
              title={t('tracks.cancel_processing')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 22,
                height: 22,
                padding: 0,
                marginLeft: 4,
                borderRadius: 6,
                border: 'none',
                background: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              <X size={14} />
            </button>
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
