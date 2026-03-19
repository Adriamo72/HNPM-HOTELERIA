import React, { useState } from 'react';
import { supabase } from './supabaseClient';
import Login from './components/Login';
import FormularioPiso from './components/FormularioPiso';
import AdminDashboard from './components/AdminDashboard';

function App() {
  const [usuarioLogueado, setUsuarioLogueado] = useState(null);
  const [datosUsuario, setDatosUsuario] = useState(null);
  const [rol, setRol] = useState(null);

  const manejarLogin = async (dni) => {
    const { data, error } = await supabase.from('personal').select('*').eq('dni', dni).single();
    
    if (error || !data) {
      alert("DNI no registrado en la tripulación del HNPM");
      return;
    }

    if (dni === '22976371') { 
      setRol('admin');
    } else {
      setRol('pañolero');
    }
    
    setDatosUsuario(data);
    setUsuarioLogueado(dni);
  };

  const cerrarSesion = () => {
    setUsuarioLogueado(null);
    setRol(null);
    setDatosUsuario(null);
  };

  return (
    <div className="App bg-slate-950 min-h-screen font-sans text-slate-200">
      {!usuarioLogueado ? (
        <Login alLoguear={manejarLogin} />
      ) : (
        <div className="flex flex-col min-h-screen">
          <header className="bg-slate-900 border-b border-blue-900 p-4 flex justify-between items-center shadow-2xl">
            <div>
              <h1 className="text-blue-500 font-black text-xs uppercase tracking-widest leading-none">Sentinel HNPM</h1>
              <p className="text-[10px] text-slate-300 font-black uppercase mt-1 tracking-widest">
                {/* Esto unirá CCTE + MORENO + ADMIN automáticamente */}
                {`${datosUsuario?.jerarquia} ${datosUsuario?.apellido} ${datosUsuario?.rol}`}
              </p>
            </div>
            <button onClick={cerrarSesion} className="bg-red-950/30 text-red-500 border border-red-900/50 px-3 py-1 rounded-lg text-[10px] font-black uppercase hover:bg-red-600 hover:text-white transition-all">
              Salir
            </button>
          </header>

          <main className="flex-grow">
            {rol === 'admin' ? (
              <AdminDashboard />
            ) : (
              <FormularioPiso 
                perfilUsuario={datosUsuario} 
                slugPiso={
                  // Esta lógica detecta el slug sin importar si es piso, lavadero o habitación
                  window.location.pathname.includes('/piso/') ? window.location.pathname.split('/piso/')[1] :
                  window.location.pathname.includes('/lavadero/') ? window.location.pathname.split('/lavadero/')[1] :
                  window.location.pathname.includes('/habitacion/') ? window.location.pathname.split('/habitacion/')[1] :
                  'piso-1'
                } 
              />
            )}
          </main>
          
          <footer className="p-4 text-center text-[9px] text-slate-600 uppercase tracking-widest bg-slate-950">
            Sistema de Trazabilidad Hospitalaria - HNPM Sentinel Hub
          </footer>
        </div>
      )}
    </div>
  );
}

export default App;