import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Registrar service worker para PWA
serviceWorkerRegistration.register();

// Desbloquear rotación SOLO en modo PWA standalone (no afecta el navegador)
if (window.matchMedia('(display-mode: standalone)').matches) {
  if (window.screen?.orientation?.unlock) {
    try { window.screen.orientation.unlock(); } catch (_) {}
  }
}