import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import Login from './components/Login';
import FormularioPiso from './components/FormularioPiso';
import AdminDashboard from './components/AdminDashboard';

function App() {
  const [usuarioLogueado, setUsuarioLogueado] = useState(null);
  const [datosUsuario, setDatosUsuario] = useState(null);
  const [rol, setRol] = useState(null);
  const [modoAcceso, setModoAcceso] = useState(null);
  const [slugCompleto, setSlugCompleto] = useState(null);

  // Detectar el modo y slug al cargar la app
  useEffect(() => {
    const path = window.location.pathname;
    console.log("=== App.js ===");
    console.log("URL actual:", window.location.href);
    console.log("Path actual:", path);
    
    if (path.includes('/piso/')) {
      const slug = path.split('/piso/')[1];
      console.log("📌 MODO PISO detectado con slug:", slug);
      setModoAcceso('piso');
      setSlugCompleto(slug);
    } else if (path.includes('/lavadero/')) {
      const slug = path.split('/lavadero/')[1];
      console.log("📌 MODO LAVADERO detectado con slug:", slug);
      setModoAcceso('lavadero');
      setSlugCompleto(slug);
    } else if (path.includes('/habitacion/')) {
      const slug = path.split('/habitacion/')[1];
      console.log("📌 MODO HABITACION detectado con slug:", slug);
      setModoAcceso('habitacion');
      setSlugCompleto(slug);
    } else {
      console.log("📌 MODO NORMAL (sin QR)");
    }
  }, []);

  const manejarLogin = async (dni) => {
    console.log("Intentando login con DNI:", dni);
    
    const { data, error } = await supabase
      .from('personal')
      .select('*')
      .eq('dni', dni)
      .single();
    
    if (error || !data) {
      console.error("Error en login:", error);
      alert("DNI no registrado en la tripulación del HNPM");
      return;
    }

    console.log("Usuario encontrado:", data);

    // Verificar si es admin por DNI o por rol en la base de datos
    if (dni === '22976371' || data.rol === 'ADMIN') { 
      setRol('admin');
    } else {
      setRol('pañolero');
    }
    
    setDatosUsuario(data);
    setUsuarioLogueado(dni);
    
    console.log("Login exitoso. Rol:", rol, "Modo:", modoAcceso, "Slug:", slugCompleto);
  };

  const cerrarSesion = () => {
    setUsuarioLogueado(null);
    setRol(null);
    setDatosUsuario(null);
    // Redirigir al inicio
    window.location.href = '/';
  };

  // MOSTRAR LOGIN SIEMPRE QUE NO HAY USUARIO LOGUEADO
  if (!usuarioLogueado) {
    return <Login alLoguear={manejarLogin} />;
  }

  // Si está logueado, mostrar el contenido correspondiente
  return (
    <div className="App bg-slate-950 min-h-screen font-sans text-slate-200">
      <div className="flex flex-col min-h-screen">
        <header className="bg-slate-900 border-b border-blue-900 p-4 flex justify-between items-center shadow-2xl">
          <div>
            <h1 className="text-blue-500 font-black text-xs uppercase tracking-widest leading-none">Sentinel HNPM</h1>
            <p className="text-[10px] text-slate-300 font-black uppercase mt-1 tracking-widest">
              {datosUsuario?.jerarquia} {datosUsuario?.apellido} - {datosUsuario?.rol}
            </p>
          </div>
          <button 
            onClick={cerrarSesion} 
            className="bg-red-950/30 text-red-500 border border-red-900/50 px-3 py-1 rounded-lg text-[10px] font-black uppercase hover:bg-red-600 hover:text-white transition-all"
          >
            Salir
          </button>
        </header>

        <main className="flex-grow">
          {rol === 'admin' ? (
            <AdminDashboard />
          ) : (
            <FormularioPiso 
              perfilUsuario={datosUsuario} 
              slugPiso={slugCompleto}
              modoAcceso={modoAcceso}
            />
          )}
        </main>
        
        <footer className="p-4 text-center text-[9px] text-slate-600 uppercase tracking-widest bg-slate-950">
          Sistema de Trazabilidad Hospitalaria - HNPM Sentinel Hub
        </footer>
      </div>
    </div>
  );
}

export default App;