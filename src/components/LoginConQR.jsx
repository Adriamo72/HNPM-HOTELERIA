// components/LoginConQR.jsx
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import bcrypt from 'bcryptjs';
import LiveQRScanner from './LiveQRScanner';

const LoginConQR = ({ onLoginSuccess, modoAcceso }) => {
  const [usuario, setUsuario] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [verificando, setVerificando] = useState(false);
  const [bloqueado, setBloqueado] = useState(false);
  const [tiempoRestante, setTiempoRestante] = useState(0);
  const timerRef = useRef(null);

  const esModoAdmin = modoAcceso === null;

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Escaneo de QR para operadores (pañoleros)
  const handleScanSuccess = async (decodedText) => {
    if (verificando) return;
    
    setVerificando(true);
    
    try {
      if (decodedText.includes('/auth/')) {
        const token = decodedText.split('/auth/')[1];
        
        const { data: tokenData, error: tokenError } = await supabase
          .from('tokens_acceso')
          .select('dni, activo, expira_en')
          .eq('token', token)
          .eq('activo', true)
          .maybeSingle();
        
        if (tokenError || !tokenData) {
          setError("QR INVÁLIDO");
          setVerificando(false);
          return;
        }
        
        if (tokenData.expira_en && new Date(tokenData.expira_en) < new Date()) {
          setError("CREDENCIAL EXPIRADA");
          setVerificando(false);
          return;
        }
        
        const { data: usuario, error: userError } = await supabase
          .from('personal')
          .select('*')
          .eq('dni', tokenData.dni)
          .maybeSingle();
        
        if (userError || !usuario) {
          setError("USUARIO NO ENCONTRADO");
          setVerificando(false);
          return;
        }
        
        // Solo pañoleros pueden acceder por QR
        if (usuario.rol === 'ADMIN') {
          setError("ACCESO NO AUTORIZADO - Use panel de administración");
          setVerificando(false);
          return;
        }
        
        if (usuario.rol === 'visualizador') {
          setError("ACCESO NO AUTORIZADO - Use acceso con PIN");
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
        
        onLoginSuccess(usuario);
        
      } else {
        setError("❌ ESCANEA TU CREDENCIAL PERSONAL");
        setTimeout(() => {
          setError('');
          setVerificando(false);
        }, 2000);
      }
    } catch (err) {
      console.error("Error:", err);
      setError("ERROR AL VERIFICAR");
      setVerificando(false);
    }
  };

  const handleScanError = (err) => {
    console.warn("Error scanner:", err);
    if (err && typeof err === 'string' && err.includes("cámara")) {
      setError("No se pudo acceder a la cámara. Verifica permisos.");
    }
  };

  // Login para ADMIN o VISUALIZADOR (usuario + PIN)
  const handlePinLogin = async (e) => {
    e.preventDefault();
    
    if (bloqueado) {
      setError(`Demasiados intentos. Espera ${tiempoRestante} segundos.`);
      return;
    }
    
    if (!usuario.trim() || !pin.trim()) {
      setError("Ingrese usuario y PIN");
      return;
    }
    
    setVerificando(true);
    setError('');
    
    try {
      // Primero buscar en admin_acceso
      let { data: adminData, error: adminError } = await supabase
        .from('admin_acceso')
        .select('*')
        .eq('usuario', usuario.toLowerCase().trim())
        .eq('activo', true)
        .maybeSingle();
      
      let esAdmin = false;
      let esVisualizador = false;
      let userData = null;
      let tabla = '';
      
      if (adminError) {
        console.error("Error buscando admin:", adminError);
      }
      
      if (adminData) {
        // Es ADMIN
        esAdmin = true;
        tabla = 'admin_acceso';
        userData = adminData;
      } else {
        // Buscar en visualizador_acceso
        const { data: visualizadorData, error: visError } = await supabase
          .from('visualizador_acceso')
          .select('*')
          .eq('usuario', usuario.toLowerCase().trim())
          .eq('activo', true)
          .maybeSingle();
        
        if (visError) {
          console.error("Error buscando visualizador:", visError);
        }
        
        if (visualizadorData) {
          esVisualizador = true;
          tabla = 'visualizador_acceso';
          userData = visualizadorData;
        }
      }
      
      if (!userData) {
        setError("Credenciales inválidas.");
        setVerificando(false);
        return;
      }
      
      // Verificar bloqueo
      if (userData.bloqueado_hasta && new Date(userData.bloqueado_hasta) > new Date()) {
        const segundosRestantes = Math.ceil((new Date(userData.bloqueado_hasta) - new Date()) / 1000);
        setTiempoRestante(segundosRestantes);
        setBloqueado(true);
        iniciarContador(segundosRestantes);
        setError(`Cuenta bloqueada. Intenta nuevamente en ${Math.ceil(segundosRestantes / 60)} minutos.`);
        setVerificando(false);
        return;
      }
      
      if (!userData.pin_hash) {
        setError("PIN no configurado.");
        setVerificando(false);
        return;
      }
      
      const pinValido = bcrypt.compareSync(pin, userData.pin_hash);
      
      if (!pinValido) {
        const nuevosIntentos = (userData.intentos_fallidos || 0) + 1;
        
        if (nuevosIntentos >= 3) {
          const bloqueoHasta = new Date(Date.now() + 15 * 60 * 1000);
          await supabase
            .from(tabla)
            .update({ 
              intentos_fallidos: nuevosIntentos,
              bloqueado_hasta: bloqueoHasta.toISOString()
            })
            .eq('id', userData.id);
          
          setBloqueado(true);
          iniciarContador(900);
          setError(`PIN incorrecto. Cuenta bloqueada por 15 minutos.`);
        } else {
          await supabase
            .from(tabla)
            .update({ intentos_fallidos: nuevosIntentos })
            .eq('id', userData.id);
          setError(`PIN incorrecto. Intentos restantes: ${3 - nuevosIntentos}`);
        }
        setVerificando(false);
        return;
      }
      
      // Resetear intentos y actualizar último acceso
      await supabase
        .from(tabla)
        .update({ 
          intentos_fallidos: 0, 
          bloqueado_hasta: null,
          ultimo_acceso: new Date().toISOString()
        })
        .eq('id', userData.id);
      
      // Crear objeto de usuario según el tipo
      let usuarioFinal = {};
      
      if (esAdmin) {
        // Buscar admin en tabla personal o crear ficticio
        const { data: adminReal } = await supabase
          .from('personal')
          .select('*')
          .or('es_admin.eq.true,rol.eq.ADMIN')
          .maybeSingle();
        
        usuarioFinal = adminReal || {
          dni: 'admin',
          nombre: 'Administrador',
          apellido: 'Sistema',
          jerarquia: 'ADMINISTRADOR',
          rol: 'ADMIN',
          es_admin: true
        };
      } else if (esVisualizador) {
        usuarioFinal = {
          dni: `vis_${userData.usuario}`,
          nombre: 'Visualizador',
          apellido: userData.usuario.toUpperCase(),
          jerarquia: 'VISUALIZADOR',
          rol: 'visualizador',
          es_admin: false
        };
      }
      
      const sesion = {
        usuario: usuarioFinal,
        expira: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString()
      };
      localStorage.setItem('sesion_hnpm', JSON.stringify(sesion));
      
      onLoginSuccess(usuarioFinal);
      
    } catch (err) {
      console.error("Error:", err);
      setError("Error al verificar credenciales");
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

  // Pantalla de login para ADMIN/VISUALIZADOR (acceso directo a la raíz)
  if (esModoAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 flex items-center justify-center p-6">
        <div className="bg-slate-900/80 backdrop-blur-sm rounded-3xl p-8 max-w-md w-full shadow-2xl border border-slate-700">
          <div className="text-center mb-6">
            <div className="bg-gradient-to-r from-blue-600 to-blue-500 w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
            </div>
            <h1 className="text-2xl font-black text-white uppercase">HNPM HOTELERÍA</h1>
            <p className="text-blue-400 text-xs uppercase mt-2 font-semibold">Panel de Control</p>
          </div>
          
          <form onSubmit={handlePinLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-2">USUARIO</label>
              <input
                type="text"
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl p-4 text-white text-lg outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="usuario"
                required
                disabled={bloqueado}
              />
            </div>
            
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-2">PIN DE ACCESO</label>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl p-4 text-white text-2xl text-center tracking-[0.5em] outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="••••"
                maxLength="6"
                required
                disabled={bloqueado}
              />
            </div>
            
            {error && (
              <div className="p-3 bg-red-900/30 border border-red-800 rounded-xl">
                <p className="text-sm text-center text-red-400">{error}</p>
              </div>
            )}
            
            <button
              type="submit"
              disabled={verificando || bloqueado}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-500 text-white font-black py-4 rounded-xl shadow-lg active:scale-95 uppercase disabled:opacity-50"
            >
              {verificando ? 'VERIFICANDO...' : 'INGRESAR'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Pantalla para accesos específicos (desde QR de sector: recorrido, pañol, lavadero, habitación)
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 flex items-center justify-center p-6">
      <div className="bg-slate-900/80 backdrop-blur-sm rounded-3xl p-6 max-w-md w-full text-center shadow-2xl border border-blue-900/30">
        <div className="mb-4">
          <div className="bg-gradient-to-r from-blue-600 to-blue-500 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
          </div>
          <h1 className="text-xl font-black text-white uppercase">HNPM HOTELERÍA</h1>
          <p className="text-blue-400 text-[10px] uppercase mt-1 font-semibold">Acceso con Credencial</p>
        </div>

        <LiveQRScanner 
          onScanSuccess={handleScanSuccess}
          onScanError={handleScanError}
        />
        
        <p className="text-slate-400 text-xs mt-4">📱 Escanea el código QR de tu credencial personal</p>

        {error && (
          <div className="mt-4 p-3 bg-red-900/30 border border-red-800 rounded-xl">
            <p className="text-red-400 text-xs font-medium">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default LoginConQR;