// pages/EscaneoSemaforo.jsx
import React, { useEffect, useState } from 'react';

const EscaneoSemaforo = () => {
  const [estado, setEstado] = useState('cargando');
  const [nombre, setNombre] = useState('');
  const [hora, setHora] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    if (!token) {
      setEstado('error');
      return;
    }

    const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;

    fetch(`${SUPABASE_URL}/functions/v1/escanear-semaforo?token=${token}`, {
      method: 'GET',
    })
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          setNombre(data.semaforo);
          setHora(new Date(data.escaneado_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }));
          setEstado('ok');
        } else {
          setEstado('error');
        }
      })
      .catch(() => setEstado('error'));
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      {estado === 'cargando' && (
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-400 text-lg">Registrando limpieza...</p>
        </div>
      )}

      {estado === 'ok' && (
        <div className="text-center max-w-sm w-full">
          <div className="w-24 h-24 rounded-full bg-green-500 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-green-500/30">
            <svg className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-3xl font-black text-white mb-2">¡Registrado!</h1>
          <p className="text-green-400 text-xl font-bold mb-1">{nombre}</p>
          <p className="text-slate-400 text-sm mb-6">Limpieza validada a las <span className="text-white font-bold">{hora} hs</span></p>
          <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700">
            <p className="text-slate-500 text-xs">El semáforo se reinició a verde en el panel de hotelería del hospital.</p>
          </div>
        </div>
      )}

      {estado === 'error' && (
        <div className="text-center max-w-sm w-full">
          <div className="w-24 h-24 rounded-full bg-red-500 flex items-center justify-center mx-auto mb-6">
            <svg className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-black text-white mb-2">QR no válido</h1>
          <p className="text-slate-400 text-sm">Este código QR no corresponde a ningún semáforo activo.</p>
        </div>
      )}
    </div>
  );
};

export default EscaneoSemaforo;
