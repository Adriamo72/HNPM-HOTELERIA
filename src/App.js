import React, { useState } from 'react';
import Login from './components/Login';
import FormularioPiso from './components/FormularioPiso';
import AdminDashboard from './components/AdminDashboard';

function App() {
  const [usuarioLogueado, setUsuarioLogueado] = useState(null);
  const [rol, setRol] = useState(null);

  const manejarLogin = (dni) => {
    // REEMPLAZA '12345678' por tu DNI real para entrar como Jefe
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

          {/* VISTA SEGÚN ROL */}
          <main className="flex-grow">
            {rol === 'admin' ? (
            <AdminDashboard />
          ) : (
            <FormularioPiso 
              dniPañolero={usuarioLogueado} 
              slugPiso={window.location.pathname.split('/')[2] || 'piso-1'} // Toma el slug de la URL
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