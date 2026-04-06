// components/LoginConQR.jsx
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import bcrypt from 'bcryptjs';
import LiveQRScanner from './LiveQRScanner';
import useSpinner from '../hooks/useSpinner';
import SpinnerOverlay from './SpinnerOverlay';

const LoginConQR = ({ onLoginSuccess, modoAcceso }) => {
  const [adminUser, setAdminUser] = useState('');
  const [adminPin, setAdminPin] = useState('');
  const [error, setError] = useState('');
  const [verificando, setVerificando] = useState(false);
  const [bloqueado, setBloqueado] = useState(false);
  const [tiempoRestante, setTiempoRestante] = useState(0);
  const timerRef = useRef(null);
  const { spinner, showLoading, showSuccess, showError, hideSpinner } = useSpinner();

  // Determinar si estamos en modo admin (solo en raíz)
  const esModoAdmin = modoAcceso === null;

  // Limpiar timer al desmontar
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handleScanSuccess = async (decodedText) => {
    console.log("=== QR ESCANEADO ===");
    console.log("Texto decodificado:", decodedText);
    console.log("Longitud:", decodedText?.length);
    console.log("Contiene /auth/?", decodedText?.includes('/auth/'));
    
    if (verificando) {
      console.log("Ya está verificando, ignorando...");
      return;
    }
    
    setVerificando(true);
    showLoading('VERIFICANDO CREDENCIAL...');
    
    try {
      if (decodedText.includes('/auth/')) {
        const token = decodedText.split('/auth/')[1];
        console.log("Token extraído:", token);
        
        const { data: tokenData, error: tokenError } = await supabase
          .from('tokens_acceso')
          .select('dni, activo, expira_en')
          .eq('token', token)
          .eq('activo', true)
          .maybeSingle();
        
        console.log("TokenData:", tokenData);
        console.log("TokenError:", tokenError);
        
        if (tokenError || !tokenData) {
          showError("QR INVÁLIDO. CONTACTA AL ADMINISTRADOR.");
          setVerificando(false);
          return;
        }
        
        if (tokenData.expira_en && new Date(tokenData.expira_en) < new Date()) {
          showError("CREDENCIAL EXPIRADA. SOLICITA RENOVACIÓN.");
          setVerificando(false);
          return;
        }
        
        const { data: usuario, error: userError } = await supabase
          .from('personal')
          .select('*')
          .eq('dni', tokenData.dni)
          .maybeSingle();
        
        console.log("Usuario encontrado:", usuario);
        console.log("UserError:", userError);
        
        if (userError || !usuario) {
          showError("USUARIO NO ENCONTRADO.");
          setVerificando(false);
          return;
        }
        
        if (usuario.es_admin || usuario.rol === 'ADMIN') {
          showError("ACCESO NO AUTORIZADO.");
          setVerificando(false);
          return;
        }
        
        await supabase
          .from('tokens_acceso')
          .update({ ultimo_uso: new Date().toISOString() })
          .eq('token', token);
        
        const sesion = {
          usuario: usuario,
          expira: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString()
        };
        localStorage.setItem('sesion_hnpm', JSON.stringify(sesion));
        
        console.log("✅ Login exitoso para:", usuario.apellido);
        showSuccess(`BIENVENIDO ${usuario.jerarquia} ${usuario.apellido}`);
        
        setTimeout(() => {
          onLoginSuccess(usuario);
        }, 500);
        
      } else {
        console.log("❌ No es un QR de autenticación");
        showError("❌ ESCANEA TU CREDENCIAL PERSONAL (debe contener /auth/)");
        setTimeout(() => {
          hideSpinner();
          setVerificando(false);
        }, 2000);
      }
    } catch (err) {
      console.error("Error en handleScanSuccess:", err);
      showError("ERROR AL VERIFICAR CREDENCIAL: " + err.message);
      setVerificando(false);
    }
  };

  const handleScanError = (err) => {
    console.warn("Error scanner:", err);
    if (err && typeof err === 'string' && err.includes("cámara")) {
      setError("No se pudo acceder a la cámara. Verifica permisos.");
    }
  };

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    
    if (bloqueado) {
      setError(`Demasiados intentos. Espera ${tiempoRestante} segundos.`);
      return;
    }
    
    if (!adminUser.trim() || !adminPin.trim()) {
      setError("Ingrese usuario y PIN");
      return;
    }
    
    setVerificando(true);
    setError('');
    showLoading('VERIFICANDO ACCESO ADMIN...');
    
    try {
      const { data: admin, error: adminError } = await supabase
        .from('admin_acceso')
        .select('*')
        .eq('usuario', adminUser.toLowerCase().trim())
        .eq('activo', true)
        .maybeSingle();
      
      if (adminError || !admin) {
        showError("USUARIO ADMINISTRADOR NO VÁLIDO.");
        setVerificando(false);
        return;
      }
      
      if (admin.bloqueado_hasta && new Date(admin.bloqueado_hasta) > new Date()) {
        const segundosRestantes = Math.ceil((new Date(admin.bloqueado_hasta) - new Date()) / 1000);
        setTiempoRestante(segundosRestantes);
        setBloqueado(true);
        iniciarContador(segundosRestantes);
        setError(`Cuenta bloqueada. Intenta nuevamente en ${Math.ceil(segundosRestantes / 60)} minutos.`);
        setVerificando(false);
        hideSpinner();
        return;
      }
      
      if (!admin.pin_hash) {
        showError("PIN NO CONFIGURADO. CONTACTA AL ADMINISTRADOR DEL SISTEMA.");
        setVerificando(false);
        return;
      }
      
      const pinValido = bcrypt.compareSync(adminPin, admin.pin_hash);
      
      if (!pinValido) {
        const nuevosIntentos = (admin.intentos_fallidos || 0) + 1;
        
        if (nuevosIntentos >= 3) {
          const bloqueoHasta = new Date(Date.now() + 15 * 60 * 1000);
          await supabase
            .from('admin_acceso')
            .update({ 
              intentos_fallidos: nuevosIntentos,
              bloqueado_hasta: bloqueoHasta.toISOString()
            })
            .eq('id', admin.id);
          
          setBloqueado(true);
          iniciarContador(900);
          showError(`PIN INCORRECTO. CUENTA BLOQUEADA POR 15 MINUTOS.`);
        } else {
          await supabase
            .from('admin_acceso')
            .update({ intentos_fallidos: nuevosIntentos })
            .eq('id', admin.id);
          showError(`PIN INCORRECTO. INTENTOS RESTANTES: ${3 - nuevosIntentos}`);
        }
        setVerificando(false);
        return;
      }
      
      await supabase
        .from('admin_acceso')
        .update({ 
          intentos_fallidos: 0, 
          bloqueado_hasta: null,
          ultimo_acceso: new Date().toISOString()
        })
        .eq('id', admin.id);
      
      const { data: usuarioAdmin, error: userError } = await supabase
        .from('personal')
        .select('*')
        .or('es_admin.eq.true,rol.eq.ADMIN')
        .maybeSingle();
      
      const adminData = usuarioAdmin || {
        dni: 'admin',
        nombre: 'Administrador',
        apellido: 'Sistema',
        jerarquia: 'ADMINISTRADOR',
        rol: 'ADMIN',
        es_admin: true
      };
      
      const sesion = {
        usuario: adminData,
        expira: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString()
      };
      localStorage.setItem('sesion_hnpm', JSON.stringify(sesion));
      
      showSuccess(`BIENVENIDO ADMINISTRADOR ${adminUser.toUpperCase()}`);
      
      setTimeout(() => {
        onLoginSuccess(adminData);
      }, 500);
      
    } catch (err) {
      console.error("Error:", err);
      showError("ERROR AL VERIFICAR CREDENCIALES");
      setVerificando(false);
    }
  };
  
  const iniciarContador = (segundos) => {
    if (timerRef.current) clearInterval(timerRef.current);
    
    timerRef.current = setInterval(() => {
      setTiempoRestante((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          setBloqueado(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Mostrar spinner si está visible
  if (spinner.visible) {
    return <SpinnerOverlay mensaje={spinner.mensaje} tipo={spinner.tipo} />;
  }

  // ========== PANTALLA ADMIN (RAÍZ) ==========
  if (esModoAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 flex items-center justify-center p-6">
        <div className="bg-slate-900/80 backdrop-blur-sm rounded-3xl p-8 max-w-md w-full shadow-2xl border border-red-900/30">
          <div className="text-center mb-6">
            <div className="bg-gradient-to-r from-red-600 to-red-500 w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-red-900/40">
              <svg className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
            </div>
            <h1 className="text-2xl font-black text-white uppercase tracking-wider">
              HNPM HOTELERÍA
            </h1>
            <p className="text-red-400 text-xs uppercase tracking-wider mt-2 font-semibold">
              Panel de Administración
            </p>
            <p className="text-slate-500 text-[10px] mt-2">
              Acceso restringido a administradores
            </p>
          </div>
          
          <form onSubmit={handleAdminLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-2">
                USUARIO ADMIN
              </label>
              <input
                type="text"
                value={adminUser}
                onChange={(e) => setAdminUser(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl p-4 text-white text-lg outline-none focus:ring-2 focus:ring-red-500"
                placeholder="admin"
                required
                disabled={bloqueado}
                autoCapitalize="none"
              />
            </div>
            
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-2">
                PIN DE ACCESO
              </label>
              <input
                type="password"
                value={adminPin}
                onChange={(e) => setAdminPin(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl p-4 text-white text-2xl text-center tracking-[0.5em] outline-none focus:ring-2 focus:ring-red-500"
                placeholder="••••"
                maxLength="6"
                required
                disabled={bloqueado}
              />
            </div>
            
            {error && (
              <div className={`p-3 rounded-xl ${error.includes('bloqueada') || error.includes('Intentos') ? 'bg-orange-900/30 border-orange-800' : 'bg-red-900/30 border-red-800'} border`}>
                <p className={`text-sm text-center ${error.includes('bloqueada') || error.includes('Intentos') ? 'text-orange-400' : 'text-red-400'}`}>
                  {error}
                </p>
              </div>
            )}
            
            {tiempoRestante > 0 && (
              <div className="text-center">
                <p className="text-orange-400 text-sm font-mono">
                  Desbloqueo en: {Math.floor(tiempoRestante / 60)}:{String(tiempoRestante % 60).padStart(2, '0')}
                </p>
              </div>
            )}
            
            <button
              type="submit"
              disabled={verificando || bloqueado}
              className="w-full bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-600 text-white font-black py-4 rounded-xl shadow-lg transition-all active:scale-95 uppercase disabled:opacity-50 disabled:active:scale-100"
            >
              {verificando ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  VERIFICANDO...
                </span>
              ) : (
                'INGRESAR AL PANEL'
              )}
            </button>
          </form>
          
          <p className="text-slate-600 text-[10px] uppercase text-center mt-6">
            Sistema de Trazabilidad Hospitalaria - HNPM
          </p>
        </div>
      </div>
    );
  }

  // ========== PANTALLA OPERADOR (QR) ==========
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 flex items-center justify-center p-6">
      <div className="bg-slate-900/80 backdrop-blur-sm rounded-3xl p-6 max-w-md w-full text-center shadow-2xl border border-blue-900/30">
        <div className="mb-4">
          <div className="bg-gradient-to-r from-blue-600 to-blue-500 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-blue-900/40">
            <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
          </div>
          <h1 className="text-xl font-black text-white uppercase tracking-wider">
            HNPM HOTELERÍA
          </h1>
          <p className="text-blue-400 text-[10px] uppercase tracking-wider mt-1 font-semibold">
            Acceso con Credencial
          </p>
        </div>

        {/* Indicador del sector */}
        <div className="mb-3">
          <span className="inline-block bg-blue-600/20 text-blue-400 px-3 py-1 rounded-full text-[10px] font-semibold uppercase">
            {modoAcceso === 'piso' ? '📦 PAÑOL' : modoAcceso === 'lavadero' ? '🧺 LAVADERO' : modoAcceso === 'habitacion' ? '🏠 HABITACIÓN' : modoAcceso === 'recorrido' ? '🏥 RECORRIDO' : '🔐 ACCESO'}
          </span>
        </div>

        {/* Scanner QR */}
        <LiveQRScanner 
          onScanSuccess={handleScanSuccess}
          onScanError={handleScanError}
        />
        
        <p className="text-slate-400 text-xs mt-4">
          📱 Escanea el código QR de tu credencial personal
        </p>
        <p className="text-slate-500 text-[10px] mt-1">
          (El QR está en tu carnet de identificación)
        </p>

        {error && (
          <div className="mt-4 p-3 bg-red-900/30 border border-red-800 rounded-xl">
            <p className="text-red-400 text-xs font-medium">{error}</p>
            <button 
              onClick={() => {
                setError('');
              }}
              className="mt-2 text-[10px] text-blue-400 hover:text-blue-300 underline font-semibold"
            >
              Reintentar
            </button>
          </div>
        )}

        <p className="text-slate-600 text-[9px] uppercase mt-4 tracking-wider">
          Subdirección Administrativa - Departamento Hotelería
        </p>
      </div>
    </div>
  );
};

export default LoginConQR;