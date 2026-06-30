import axios from 'axios';

// Use VITE_API_URL if explicitly set, otherwise empty string so all /api/*
// requests go to the same origin and are intercepted by the Vite proxy
// (proxy: { '/api': 'http://backend:8000' } in vite.config.js).
const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '',
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
    // Only force-logout when the user HAD a valid session (token present) that
    // the server rejected. Don't redirect on 401 from login/register attempts
    // where no token exists yet — those errors belong to the calling component.
    if (error.response?.status === 401) {
      try {
        const raw = localStorage.getItem('gps_auth');
        const hasToken = raw ? JSON.parse(raw)?.state?.token : false;
        if (hasToken) {
          localStorage.removeItem('gps_auth');
          window.location.href = '/';
        }
      } catch (_) {}
    }
    return Promise.reject(error);
  }
);

export default client;
