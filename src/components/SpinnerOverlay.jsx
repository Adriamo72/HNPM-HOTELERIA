// components/SpinnerOverlay.jsx
import React from 'react';

const SpinnerOverlay = ({ mensaje, tipo = 'loading' }) => {
  // tipo: 'loading', 'success', 'error'
  
  const configuraciones = {
    loading: {
      bg: 'bg-blue-600',
      icono: (
        <svg className="animate-spin h-12 w-12 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      ),
      texto: mensaje || 'PROCESANDO...'
    },
    success: {
      bg: 'bg-green-600',
      icono: (
        <svg className="h-12 w-12 text-white animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ),
      texto: mensaje || '¡OPERACIÓN EXITOSA!'
    },
    error: {
      bg: 'bg-red-600',
      icono: (
        <svg className="h-12 w-12 text-white animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      ),
      texto: mensaje || 'ERROR EN LA OPERACIÓN'
    }
  };
  
  const config = configuraciones[tipo];
  
  return (
    <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-md flex items-center justify-center z-[200]">
      <div className={`${config.bg} rounded-2xl p-8 text-center shadow-2xl min-w-[280px] animate-in zoom-in-95 duration-200`}>
        <div className="flex justify-center mb-4">
          {config.icono}
        </div>
        <p className="text-white font-black uppercase text-sm tracking-wider">
          {config.texto}
        </p>
      </div>
    </div>
  );
};

export default SpinnerOverlay;