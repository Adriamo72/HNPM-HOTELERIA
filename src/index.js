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

// Desbloquear rotación programáticamente (tiene prioridad sobre el manifest)
if (screen.orientation && screen.orientation.unlock) {
  try { screen.orientation.unlock(); } catch (_) {}
}