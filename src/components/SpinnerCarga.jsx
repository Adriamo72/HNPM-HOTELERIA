// components/SpinnerCarga.jsx
import React from 'react';

const SpinnerCarga = ({ mensaje = 'CARGANDO...' }) => {
  return (
    <div className="flex flex-col items-center justify-center p-12 bg-slate-900/50 rounded-xl">
      <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-4"></div>
      <p className="text-purple-400 text-sm font-bold uppercase tracking-wider">{mensaje}</p>
      <p className="text-slate-500 text-xs mt-2 animate-pulse">Por favor espera...</p>
    </div>
  );
};

export default SpinnerCarga;