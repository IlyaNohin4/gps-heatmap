import axios from 'axios';

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
});

// Read token directly from localStorage to avoid timing issues with Zustand
// hydration. The persist middleware stores JSON under the 'gps_auth' key.
function getToken() {
  try {
    const raw = localStorage.getItem('gps_auth');
    if (!raw) return null;
    return JSON.parse(raw)?.state?.token ?? null;
  } catch {
    return null;
  }
}

client.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('gps_auth');
      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);

export default client;
