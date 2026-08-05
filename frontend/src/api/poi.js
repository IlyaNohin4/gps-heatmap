import client from './client.js';

export async function createPOI(name, lat, lon, category, description = null, icon = null, color = null, visited = false, listName = null) {
  const { data } = await client.post('/api/poi/create', {
    name,
    lat,
    lon,
    category,
    description,
    icon,
    color,
    visited,
    import_name: listName,
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

export async function createCategory(name) {
  const { data } = await client.post('/api/poi/categories', { name });
  return data;
}

export async function renameCategory(oldName, newName) {
  const { data } = await client.patch(`/api/poi/categories/${encodeURIComponent(oldName)}`, {
    new_name: newName,
  });
  return data;
}

export async function deleteCategory(name) {
  const { data } = await client.delete(`/api/poi/categories/${encodeURIComponent(name)}`);
  return data;
}

export async function updatePOI(id, updates) {
  const { data } = await client.patch(`/api/poi/${id}`, updates);
  return data;
}

export async function deletePOI(id) {
  await client.delete(`/api/poi/${id}`);
}

// Named "list" in the UI/frontend code — the backend concept and wire
// contract (endpoint path, import_name field) are still "import", unchanged
// deliberately (see the "List" rename decision: frontend-only, not backend).
export async function getLists() {
  const { data } = await client.get('/api/poi/imports');
  return data;
}

export async function createList(name) {
  const { data } = await client.post('/api/poi/imports', { name });
  return data;
}

export async function renameList(oldName, newName) {
  const { data } = await client.patch(`/api/poi/imports/${encodeURIComponent(oldName)}`, {
    new_name: newName,
  });
  return data;
}

export async function deleteList(listName) {
  await client.delete(`/api/poi/imports/${encodeURIComponent(listName)}`);
}

export async function exportList(listName) {
  const { data } = await client.get(`/api/poi/imports/${encodeURIComponent(listName)}/export`, {
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(new Blob([data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `${listName}.kml`);
  document.body.appendChild(link);
  link.click();
  link.parentNode.removeChild(link);
  window.URL.revokeObjectURL(url);
}
