import client from './client.js';

export async function createPOI(name, lat, lon, category, description = null, icon = null, color = null) {
  const { data } = await client.post('/api/poi/create', {
    name,
    lat,
    lon,
    category,
    description,
    icon,
    color,
  });
  return data;
}

export async function uploadPOI(file) {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await client.post('/api/poi/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function fetchPOIPage(params = {}) {
  const { data } = await client.get('/api/poi', { params });
  return data;
}

export async function fetchPOI(category = null) {
  const params = category ? { category, limit: 5000 } : { limit: 5000 };
  const data = await fetchPOIPage(params);
  return data.items;
}

export async function fetchPOICategories() {
  const { data } = await client.get('/api/poi/categories');
  return data;
}

export async function updatePOI(id, updates) {
  const { data } = await client.patch(`/api/poi/${id}`, updates);
  return data;
}

export async function deletePOI(id) {
  await client.delete(`/api/poi/${id}`);
}

export async function getImports() {
  const { data } = await client.get('/api/poi/imports');
  return data;
}

export async function renameImport(oldName, newName) {
  const { data } = await client.patch(`/api/poi/imports/${oldName}`, {
    new_name: newName,
  });
  return data;
}

export async function deleteImport(importName) {
  await client.delete(`/api/poi/imports/${importName}`);
}

export async function exportImport(importName) {
  const { data } = await client.get(`/api/poi/imports/${importName}/export`, {
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(new Blob([data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `${importName}.kml`);
  document.body.appendChild(link);
  link.click();
  link.parentNode.removeChild(link);
  window.URL.revokeObjectURL(url);
}
