import React from 'react';
import ReactDOM from 'react-dom/client';
import './i18n/index.js';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

// Applied before render (not in index.html) so it works under CSP's
// script-src 'self' without needing 'unsafe-inline' or a nonce.
try {
  if (localStorage.getItem('gps_theme') === 'dark') {
    document.documentElement.dataset.theme = 'dark';
  }
} catch (e) {}

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <React.StrictMode>
      <App />
    </React.StrictMode>
  </ErrorBoundary>
);
