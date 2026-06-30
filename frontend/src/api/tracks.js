import client from './client.js';

export async function fetchTracks(params = {}) {
  const { data } = await client.get('/api/tracks', { params });
  return data;
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

export async function pollTaskStatus(taskId) {
  const { data } = await client.get(`/api/tasks/${taskId}/status`);
  return data;
}
