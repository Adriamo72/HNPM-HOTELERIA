// App.js
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import LoginConQR from './components/LoginConQR';
import FormularioPiso from './components/FormularioPiso';
import AdminDashboard from './components/AdminDashboard';
import RecorridoOcupacion from './components/RecorridoOcupacion';

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
    
    // Ruta para RECORRIDO DE OCUPACIÓN (NUEVO - por piso)
    if (path.includes('/recorrido/')) {
      const slug = path.split('/recorrido/')[1];
      setModoAcceso('recorrido');
      setSlugCompleto(slug);
      console.log("📌 Modo RECORRIDO OCUPACIÓN (por piso):", slug);
    } 
    // Ruta para ocupación (antiguo - por habitación) - Se mantiene por compatibilidad
    else if (path.includes('/ocupacion/')) {
      const slug = path.split('/ocupacion/')[1];
      setModoAcceso('ocupacion');
      setSlugCompleto(slug);
      console.log("📌 Modo OCUPACION (por habitación - legacy):", slug);
    } 
    // Ruta para ropa blanca - piso
    else if (path.includes('/piso/')) {
      const slug = path.split('/piso/')[1];
      setModoAcceso('piso');
      setSlugCompleto(slug);
      console.log("📌 Modo PISO (pañol):", slug);
    } 
    // Ruta para ropa blanca - lavadero
    else if (path.includes('/lavadero/')) {
      const slug = path.split('/lavadero/')[1];
      setModoAcceso('lavadero');
      setSlugCompleto(slug);
      console.log("📌 Modo LAVADERO:", slug);
    } 
    // Ruta para ropa blanca - habitación especial
    else if (path.includes('/habitacion/')) {
      const slug = path.split('/habitacion/')[1];
      setModoAcceso('habitacion');
      setSlugCompleto(slug);
      console.log("📌 Modo HABITACION (ropa blanca):", slug);
    } 
    // Ruta para autenticación (login con QR personal)
    else if (path.includes('/auth/')) {
      // Esto lo maneja LoginConQR, no necesitamos hacer nada aquí
      console.log("📌 Ruta de autenticación detectada");
    }
    else {
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
      <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 flex items-center justify-center">
        <div className="animate-pulse text-center">
          <div className="w-16 h-16 bg-gradient-to-r from-blue-600 to-blue-500 rounded-2xl mx-auto mb-4 animate-bounce shadow-lg shadow-blue-900/40"></div>
          <p className="text-blue-500 font-black text-sm uppercase tracking-wider">SENTINEL HNPM</p>
          <p className="text-slate-600 text-xs mt-2 font-mono">Inicializando sistema...</p>
        </div>
      </div>
    );
  }

  if (!usuarioLogueado) {
    return <LoginConQR onLoginSuccess={manejarLogin} modoAcceso={modoAcceso} />;
  }

  return (
    <div className="App bg-slate-950 min-h-screen font-sans text-slate-200">
      <div className="flex flex-col min-h-screen">
        {/* Header */}
        <header className="bg-slate-900/90 backdrop-blur-sm border-b border-blue-900/50 p-3 flex justify-between items-center shadow-2xl sticky top-0 z-50">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-gradient-to-r from-blue-600 to-blue-500 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
            </div>
            <div>
              <h1 className="text-blue-500 font-black text-[10px] uppercase tracking-wider leading-none">
                HNPM HOTELERÍA
              </h1>
              <p className="text-[8px] text-slate-500 font-bold uppercase tracking-wider">
                SENTINEL
              </p>
            </div>
          </div>
          
          {/* Mostrar el sector actual si estamos en un modo específico */}
          <div className="text-center">
            {modoAcceso === 'recorrido' && (
              <>
                <p className="text-[8px] text-purple-400 uppercase tracking-wider">Recorrido</p>
                <p className="text-xs font-bold text-white">{slugCompleto?.replace(/-/g, ' ').toUpperCase() || 'PISO'}</p>
              </>
            )}
            {modoAcceso === 'piso' && (
              <>
                <p className="text-[8px] text-blue-400 uppercase tracking-wider">Pañol</p>
                <p className="text-xs font-bold text-white">{slugCompleto?.replace(/-/g, ' ').toUpperCase() || 'SECTOR'}</p>
              </>
            )}
            {modoAcceso === 'lavadero' && (
              <>
                <p className="text-[8px] text-green-400 uppercase tracking-wider">Lavadero</p>
                <p className="text-xs font-bold text-white">{slugCompleto?.replace(/-/g, ' ').toUpperCase() || 'SECTOR'}</p>
              </>
            )}
            {modoAcceso === 'habitacion' && (
              <>
                <p className="text-[8px] text-yellow-400 uppercase tracking-wider">Habitación</p>
                <p className="text-xs font-bold text-white">{slugCompleto?.replace(/-/g, ' ').toUpperCase() || 'HAB'}</p>
              </>
            )}
            {!modoAcceso && rol === 'admin' && (
              <p className="text-xs font-bold text-red-400">ADMIN</p>
            )}
          </div>
          
          <div className="flex gap-2 items-center">
            <button 
              onClick={cerrarSesion} 
              className="bg-red-950/40 text-red-400 border border-red-900/50 px-3 py-1 rounded-lg text-[9px] font-black uppercase hover:bg-red-600 hover:text-white transition-all"
            >
              Salir
            </button>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-grow">
          {rol === 'admin' ? (
            <AdminDashboard />
          ) : modoAcceso === 'recorrido' ? (
            <RecorridoOcupacion 
              perfilUsuario={datosUsuario}
              slugPiso={slugCompleto}
            />
          ) : modoAcceso === 'ocupacion' ? (
            // Legacy: modo antiguo de ocupación por habitación (se mantiene por compatibilidad)
            <RegistroOcupacionQR 
              perfilUsuario={datosUsuario}
              onRegistroCompleto={() => {}}
            />
          ) : (
            <FormularioPiso 
              perfilUsuario={datosUsuario} 
              slugPiso={slugCompleto}
              modoAcceso={modoAcceso}
            />
          )}
        </main>
        
        {/* Footer */}
        <footer className="p-3 text-center text-[8px] text-slate-600 uppercase tracking-widest bg-slate-950/80 border-t border-slate-900">
          Sistema de Trazabilidad Hospitalaria • HNPM Sentinel Hub v2.0
        </footer>
      </div>
    </div>
  );
}

export default App;