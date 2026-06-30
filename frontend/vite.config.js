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
    proxy: {
      '/api': 'http://backend:8000',
    },
  },
});
