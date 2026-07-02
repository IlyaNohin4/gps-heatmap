import client from './client.js';

export async function uploadPOI(file) {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await client.post('/api/poi/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function fetchPOI(category = null) {
  const params = category ? { category } : {};
  const { data } = await client.get('/api/poi', { params });
  return data;
}

export async function fetchPOICategories() {
  const { data } = await client.get('/api/poi/categories');
  return data;
}

export async function deletePOI(id) {
  await client.delete(`/api/poi/${id}`);
}
