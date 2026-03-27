// App.js
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient'; // 👈 IMPORTANTE: agregar esta línea
import LoginConQR from './components/LoginConQR';
import FormularioPiso from './components/FormularioPiso';
import AdminDashboard from './components/AdminDashboard';

function App() {
  const [usuarioLogueado, setUsuarioLogueado] = useState(null);
  const [datosUsuario, setDatosUsuario] = useState(null);
  const [rol, setRol] = useState(null);
  const [modoAcceso, setModoAcceso] = useState(null);
  const [slugCompleto, setSlugCompleto] = useState(null);
  const [cargandoSesion, setCargandoSesion] = useState(true);

  // Verificar sesión guardada al cargar
  useEffect(() => {
    const sesionGuardada = localStorage.getItem('sesion_hnpm');
    if (sesionGuardada) {
      try {
        const sesion = JSON.parse(sesionGuardada);
        if (new Date(sesion.expira) > new Date()) {
          setUsuarioLogueado(sesion.usuario.dni);
          setDatosUsuario(sesion.usuario);
          setRol(sesion.usuario.rol === 'ADMIN' || sesion.usuario.dni === '22976371' ? 'admin' : 'pañolero');
        } else {
          localStorage.removeItem('sesion_hnpm');
        }
      } catch (e) {
        console.error("Error parseando sesión:", e);
        localStorage.removeItem('sesion_hnpm');
      }
    }
    setCargandoSesion(false);
  }, []);

  // Detectar QR de sector al cargar o cuando cambia la URL
  useEffect(() => {
    const path = window.location.pathname;
    console.log("📍 Path actual:", path);
    
    if (path.includes('/piso/')) {
      const slug = path.split('/piso/')[1];
      setModoAcceso('piso');
      setSlugCompleto(slug);
      console.log("📌 Modo PISO:", slug);
    } else if (path.includes('/lavadero/')) {
      const slug = path.split('/lavadero/')[1];
      setModoAcceso('lavadero');
      setSlugCompleto(slug);
      console.log("📌 Modo LAVADERO:", slug);
    } else if (path.includes('/habitacion/')) {
      const slug = path.split('/habitacion/')[1];
      setModoAcceso('habitacion');
      setSlugCompleto(slug);
      console.log("📌 Modo HABITACION:", slug);
    } else {
      setModoAcceso(null);
      setSlugCompleto(null);
    }
  }, []);

  const manejarLogin = (usuario) => {
    console.log("✅ Usuario autenticado:", usuario.apellido);
    setUsuarioLogueado(usuario.dni);
    setDatosUsuario(usuario);
    setRol(usuario.rol === 'ADMIN' || usuario.dni === '22976371' ? 'admin' : 'pañolero');
  };

  const cerrarSesion = () => {
    localStorage.removeItem('sesion_hnpm');
    setUsuarioLogueado(null);
    setDatosUsuario(null);
    setRol(null);
    window.location.href = '/';
  };

  if (cargandoSesion) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-pulse text-center">
          <div className="w-12 h-12 bg-blue-600 rounded-full mx-auto mb-4 animate-bounce"></div>
          <p className="text-slate-500 text-sm font-mono">SENTINEL HNPM</p>
          <p className="text-slate-600 text-xs mt-2">Cargando sistema...</p>
        </div>
      </div>
    );
  }

  if (!usuarioLogueado) {
    return <LoginConQR onLoginSuccess={manejarLogin} supabase={supabase} />;
  }

  return (
    <div className="App bg-slate-950 min-h-screen font-sans text-slate-200">
      <div className="flex flex-col min-h-screen">
        <header className="bg-slate-900/90 backdrop-blur-sm border-b border-blue-900/50 p-4 flex justify-between items-center shadow-2xl sticky top-0 z-50">
          <div>
            <h1 className="text-blue-500 font-black text-xs uppercase tracking-widest leading-none">
              SENTINEL HNPM
            </h1>
            <p className="text-[11px] text-slate-300 font-bold uppercase mt-1 tracking-wider">
              {datosUsuario?.jerarquia} {datosUsuario?.apellido}, {datosUsuario?.nombre}
            </p>
          </div>
          <div className="flex gap-3 items-center">
            <div className="bg-slate-800 px-3 py-1.5 rounded-lg">
              <span className="text-[10px] font-black uppercase text-blue-400">
                {rol === 'admin' ? '🔐 ADMINISTRADOR' : '👤 OPERADOR'}
              </span>
            </div>
            <button 
              onClick={cerrarSesion} 
              className="bg-red-950/40 text-red-400 border border-red-900/50 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase hover:bg-red-600 hover:text-white transition-all duration-200"
            >
              Salir
            </button>
          </div>
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
        
        <footer className="p-3 text-center text-[8px] text-slate-600 uppercase tracking-widest bg-slate-950/80 border-t border-slate-900">
          Sistema de Trazabilidad Hospitalaria • HNPM Sentinel Hub v2.0
        </footer>
      </div>
    </div>
  );
}

export default App;