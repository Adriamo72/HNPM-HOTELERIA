import React, { useState } from 'react';

const Login = ({ alLoguear }) => {
  const [dni, setDni] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (dni.length >= 7) {
      alLoguear(dni); // Pasamos el DNI al componente principal
    } else {
      alert("Por favor, ingrese un DNI válido.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-slate-900 rounded-3xl border border-slate-800 p-8 shadow-2xl">
        <div className="text-center mb-10">
          <div className="bg-blue-600 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-900/40">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8-8H4a4 4 0 00-8 8v4h10z" />
            </svg>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tighter uppercase">HNPM HOTELERIA</h1>
          <p className="text-slate-500 text-xs uppercase tracking-[3px] mt-2">Acceso de Pañoleros</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-2">DNI del responsable</label>
            <input 
              type="text" 
              inputMode="numeric"
              pattern="[0-9]*" 
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-xl p-4 text-white text-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              placeholder="Ingrese su documento..."
              value={dni}
              onChange={(e) => setDni(e.target.value)}
            />
          </div>

          <button 
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-xl shadow-lg transition-all active:scale-95 uppercase"
          >
            Iniciar Turno
          </button>
        </form>

        <p className="mt-8 text-center text-slate-600 text-[10px] uppercase">
          Subdirección Administrativa - Departamento Hotelería
        </p>
      </div>
    </div>
  );
};

export default Login;