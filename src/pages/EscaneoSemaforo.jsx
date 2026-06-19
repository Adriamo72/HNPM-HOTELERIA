// pages/EscaneoSemaforo.jsx
import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabaseClient';

const EscaneoSemaforo = () => {
  const [estado, setEstado] = useState('cargando');
  const [semaforo, setSemaforo] = useState(null);
  const [nombre, setNombre] = useState('');
  const [hora, setHora] = useState('');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (!token) { setEstado('error'); return; }

    const cargar = async () => {
      try {
        const { data, error } = await supabase
          .from('semaforos')
          .select('id, nombre, pin')
          .eq('qr_token', token)
          .single();
        if (error || !data) { setEstado('error'); return; }
        setSemaforo(data);
        if (!data.pin) {
          await registrar(data);
        } else {
          setEstado('pin');
        }
      } catch { setEstado('error'); }
    };
    cargar();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const registrar = useCallback(async (sem) => {
    const ahora = new Date().toISOString();
    await supabase.from('semaforos').update({ ultimo_escaneo_at: ahora }).eq('id', sem.id);
    await supabase.from('semaforo_escaneos').insert({ semaforo_id: sem.id, escaneado_at: ahora });
    setNombre(sem.nombre);
    setHora(new Date(ahora).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }));
    setEstado('ok');
  }, []);

  const handlePin = async () => {
    if (pin !== semaforo.pin) {
      setPinError(true);
      setPin('');
      setTimeout(() => setPinError(false), 1500);
      return;
    }
    setEstado('cargando');
    await registrar(semaforo);
  };

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

      {estado === 'pin' && semaforo && (
        <div className="text-center max-w-xs w-full">
          <div className="text-5xl mb-3">🔐</div>
          <h1 className="text-xl font-black text-white mb-1">Ingresá el PIN</h1>
          <p className="text-slate-400 text-sm mb-5">{semaforo.nombre}</p>
          <div className={`flex justify-center gap-3 mb-5 transition-all ${pinError ? 'animate-bounce' : ''}`}>
            {[0,1,2,3].map(i => (
              <div key={i} className={`w-12 h-14 rounded-xl border-2 flex items-center justify-center text-2xl font-black transition-all ${pin.length > i ? (pinError ? 'border-red-500 text-red-400' : 'border-green-500 text-white') : 'border-slate-600 text-slate-700'}`}>
                {pin.length > i ? '●' : ''}
              </div>
            ))}
          </div>
          {pinError && <p className="text-red-400 text-sm mb-3 font-bold">PIN incorrecto</p>}
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[1,2,3,4,5,6,7,8,9].map(n => (
              <button key={n} onClick={() => pin.length < 4 && setPin(p => p + n)} className="bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-white text-2xl font-bold py-4 rounded-xl transition-all">
                {n}
              </button>
            ))}
            <button onClick={() => setPin('')} className="bg-slate-800 hover:bg-red-900/50 text-slate-400 text-sm font-bold py-4 rounded-xl transition-all">C</button>
            <button onClick={() => pin.length < 4 && setPin(p => p + '0')} className="bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-white text-2xl font-bold py-4 rounded-xl transition-all">0</button>
            <button onClick={() => setPin(p => p.slice(0,-1))} className="bg-slate-800 hover:bg-slate-700 text-slate-400 text-xl font-bold py-4 rounded-xl transition-all">⌫</button>
          </div>
          <button
            onClick={handlePin}
            disabled={pin.length !== 4}
            className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-black py-4 rounded-xl text-lg transition-all"
          >Validar limpieza</button>
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
