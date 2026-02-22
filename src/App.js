import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import FormularioPiso from './components/FormularioPiso';
import AdminDashboard from './components/AdminDashboard';

function App() {
  const [usuarioLogueado, setUsuarioLogueado] = useState(null);
  const [rol, setRol] = useState(null);

  // Detectamos si el usuario entró directamente a través de un código QR
  const path = window.location.pathname;
  const esEscaneoQR = path.includes('/piso/');
  const slugDelQR = esEscaneoQR ? path.split('/piso/')[1] : null;

  const manejarLogin = (dni) => {
    // Tu DNI de Administrador para control de Jefatura
    if (dni === '22976371') { 
      setRol('admin');
    } else {
      setRol('pañolero');
    }
    setUsuarioLogueado(dni);
  };

  const cerrarSesion = () => {
    setUsuarioLogueado(null);
    setRol(null);
  };

  return (
    <div className="App bg-slate-950 min-h-screen font-sans text-slate-200">
      {!usuarioLogueado ? (
        <Login alLoguear={manejarLogin} />
      ) : (
        <div className="flex flex-col min-h-screen">
          {/* BARRA DE MANDO SUPERIOR */}
          <header className="bg-slate-900 border-b border-blue-900 p-4 flex justify-between items-center shadow-2xl">
            <div>
              <h1 className="text-blue-500 font-black text-xs uppercase tracking-widest">Sentinel HNPM</h1>
              <p className="text-[10px] text-slate-500 font-bold uppercase">
                {rol === 'admin' ? 'Jefatura de Hotelería' : 'Operativo Pañol'}
              </p>
            </div>
            <button 
              onClick={cerrarSesion}
              className="bg-red-950/30 text-red-500 border border-red-900/50 px-3 py-1 rounded-lg text-[10px] font-black uppercase hover:bg-red-600 hover:text-white transition-all"
            >
              Salir
            </button>
          </header>

          {/* VISTA SEGÚN ROL Y CONTEXTO (QR O DASHBOARD) */}
          <main className="flex-grow">
            {rol === 'admin' && !esEscaneoQR ? (
              /* Si eres Admin y entras por la URL principal, ves el Dashboard de control */
              <AdminDashboard />
            ) : (
              /* Si eres pañolero, o eres Admin pero escaneaste un QR en un piso, ves el formulario */
              <FormularioPiso 
                dniPañolero={usuarioLogueado} 
                slugPiso={slugDelQR || 'piso-1'} 
              />
            )}
          </main>
          
          <footer className="p-4 text-center text-[9px] text-slate-600 uppercase tracking-widest bg-slate-950">
            Sistema de Trazabilidad Hospitalaria - Sentinel AI Security Hub
          </footer>
        </div>
      )}
    </div>
  );
}

export default App;