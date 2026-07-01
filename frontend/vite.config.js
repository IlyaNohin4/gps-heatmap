import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  envPrefix: ['VITE_'],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // Allow Docker service name as Host header (Vite 5.x blocks unknown hosts by default)
    allowedHosts: ['localhost', 'frontend'],
    // HMR config for Docker: browser connects to localhost:5173 for hot reload
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      port: 5173,
    },
    proxy: {
      '/api': 'http://backend:8000',
    },
  },
});
