import client from './client.js';

export async function fetchTracksPage(params = {}) {
  const { data } = await client.get('/api/tracks', { params });
  return data;
}

export async function fetchTracks(params = {}) {
  const data = await fetchTracksPage(params);
  return data.items;
}

export async function uploadTrack(file, onProgress) {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await client.post('/api/tracks/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => {
      if (onProgress && e.total) {
        onProgress(Math.round((e.loaded * 100) / e.total));
      }
    },
  });
  return data;
}

export async function getTrack(id) {
  const { data } = await client.get(`/api/tracks/${id}`);
  return data;
}

export async function fetchTrackGeometries() {
  const { data } = await client.get('/api/tracks/geometries');
  return data;
}

export async function deleteTrack(id) {
  const { data } = await client.delete(`/api/tracks/${id}`);
  return data;
}

export async function togglePublish(id) {
  const { data } = await client.patch(`/api/tracks/${id}/publish`);
  return data;
}

export async function renameTrack(id, name) {
  const { data } = await client.patch(`/api/tracks/${id}/rename`, { name });
  return data;
}

export function getTrackDownloadUrl(id) {
  const base = import.meta.env.VITE_API_URL || '';
  return `${base}/api/tracks/${id}/download`;
}

export async function getPublicTrack(token) {
  const { data } = await client.get(`/api/tracks/public/${token}`);
  return data;
}

function normalizePoint(p) {
  if (Array.isArray(p)) return { lat: p[0], lon: p[1] };
  return { lat: p.lat, lon: p.lng || p.lon };
}

export async function createTrackFromPoints(name, points, format = 'gpx') {
  const { data } = await client.post('/api/tracks/create', {
    name,
    points: points.map(normalizePoint),
    format,
  });
  return data;
}

/** Convert waypoints straight to a downloadable file, without saving a
 * track (Track Creator's "Download" button). Returns a Blob — the caller
 * triggers the browser download. Reuses the backend's _points_to_* (T28),
 * so TCX/FIT stay correct in one place instead of being duplicated in JS. */
export async function exportTrackFile(name, points, format = 'gpx') {
  const { data } = await client.post(
    '/api/tracks/export',
    { name, points: points.map(normalizePoint), format },
    { responseType: 'blob' },
  );
  return data;
}

export async function pollTaskStatus(taskId) {
  const { data } = await client.get(`/api/tasks/${taskId}/status`);
  return data;
}
