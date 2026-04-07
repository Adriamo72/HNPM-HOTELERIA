// components/LoginConQR.jsx
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import bcrypt from 'bcryptjs';
import LiveQRScanner from './LiveQRScanner';

const LoginConQR = ({ onLoginSuccess, modoAcceso }) => {
  const [adminUser, setAdminUser] = useState('');
  const [adminPin, setAdminPin] = useState('');
  const [visualizadorUser, setVisualizadorUser] = useState('');
  const [visualizadorPin, setVisualizadorPin] = useState('');
  const [error, setError] = useState('');
  const [verificando, setVerificando] = useState(false);
  const [bloqueado, setBloqueado] = useState(false);
  const [tiempoRestante, setTiempoRestante] = useState(0);
  const [modoLogin, setModoLogin] = useState('qr'); // 'qr', 'admin', 'visualizador'
  const timerRef = useRef(null);

  const esModoAdmin = modoAcceso === null;

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

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
        
        // Permitir acceso a pañoleros y visualizadores por QR
        if (usuario.rol === 'ADMIN') {
          setError("ACCESO NO AUTORIZADO - Use panel de administración");
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

  // Login para ADMIN (usuario + PIN)
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
    
    try {
      const { data: admin, error: adminError } = await supabase
        .from('admin_acceso')
        .select('*')
        .eq('usuario', adminUser.toLowerCase().trim())
        .eq('activo', true)
        .maybeSingle();
      
      if (adminError || !admin) {
        setError("Usuario administrador no válido.");
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
        return;
      }
      
      if (!admin.pin_hash) {
        setError("PIN no configurado.");
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
          setError(`PIN incorrecto. Cuenta bloqueada por 15 minutos.`);
        } else {
          await supabase
            .from('admin_acceso')
            .update({ intentos_fallidos: nuevosIntentos })
            .eq('id', admin.id);
          setError(`PIN incorrecto. Intentos restantes: ${3 - nuevosIntentos}`);
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
      
      onLoginSuccess(adminData);
      
    } catch (err) {
      console.error("Error:", err);
      setError("Error al verificar credenciales");
      setVerificando(false);
    }
  };

  // Login para VISUALIZADOR (usuario + PIN)
  const handleVisualizadorLogin = async (e) => {
    e.preventDefault();
    
    if (bloqueado) {
      setError(`Demasiados intentos. Espera ${tiempoRestante} segundos.`);
      return;
    }
    
    if (!visualizadorUser.trim() || !visualizadorPin.trim()) {
      setError("Ingrese usuario y PIN");
      return;
    }
    
    setVerificando(true);
    setError('');
    
    try {
      const { data: visualizador, error: visError } = await supabase
        .from('visualizador_acceso')
        .select('*')
        .eq('usuario', visualizadorUser.toLowerCase().trim())
        .eq('activo', true)
        .maybeSingle();
      
      if (visError || !visualizador) {
        setError("Usuario visualizador no válido.");
        setVerificando(false);
        return;
      }
      
      if (visualizador.bloqueado_hasta && new Date(visualizador.bloqueado_hasta) > new Date()) {
        const segundosRestantes = Math.ceil((new Date(visualizador.bloqueado_hasta) - new Date()) / 1000);
        setTiempoRestante(segundosRestantes);
        setBloqueado(true);
        iniciarContador(segundosRestantes);
        setError(`Cuenta bloqueada. Intenta nuevamente en ${Math.ceil(segundosRestantes / 60)} minutos.`);
        setVerificando(false);
        return;
      }
      
      if (!visualizador.pin_hash) {
        setError("PIN no configurado.");
        setVerificando(false);
        return;
      }
      
      const pinValido = bcrypt.compareSync(visualizadorPin, visualizador.pin_hash);
      
      if (!pinValido) {
        const nuevosIntentos = (visualizador.intentos_fallidos || 0) + 1;
        
        if (nuevosIntentos >= 3) {
          const bloqueoHasta = new Date(Date.now() + 15 * 60 * 1000);
          await supabase
            .from('visualizador_acceso')
            .update({ 
              intentos_fallidos: nuevosIntentos,
              bloqueado_hasta: bloqueoHasta.toISOString()
            })
            .eq('id', visualizador.id);
          
          setBloqueado(true);
          iniciarContador(900);
          setError(`PIN incorrecto. Cuenta bloqueada por 15 minutos.`);
        } else {
          await supabase
            .from('visualizador_acceso')
            .update({ intentos_fallidos: nuevosIntentos })
            .eq('id', visualizador.id);
          setError(`PIN incorrecto. Intentos restantes: ${3 - nuevosIntentos}`);
        }
        setVerificando(false);
        return;
      }
      
      await supabase
        .from('visualizador_acceso')
        .update({ 
          intentos_fallidos: 0, 
          bloqueado_hasta: null,
          ultimo_acceso: new Date().toISOString()
        })
        .eq('id', visualizador.id);
      
      // Crear un objeto de usuario visualizador
      const visualizadorData = {
        dni: `vis_${visualizador.usuario}`,
        nombre: 'Visualizador',
        apellido: visualizador.usuario.toUpperCase(),
        jerarquia: 'VISUALIZADOR',
        rol: 'visualizador',
        es_admin: false
      };
      
      const sesion = {
        usuario: visualizadorData,
        expira: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString()
      };
      localStorage.setItem('sesion_hnpm', JSON.stringify(sesion));
      
      onLoginSuccess(visualizadorData);
      
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

  // Pantalla de selección de modo (cuando no hay modo de acceso específico)
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
            <p className="text-blue-400 text-xs uppercase mt-2 font-semibold">Sistema de Trazabilidad</p>
          </div>
          
          {/* Selector de modo de acceso */}
          <div className="flex gap-2 mb-6 bg-slate-800 p-1 rounded-xl">
            <button
              onClick={() => setModoLogin('qr')}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold uppercase transition-all ${modoLogin === 'qr' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}
            >
              📱 QR
            </button>
            <button
              onClick={() => setModoLogin('visualizador')}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold uppercase transition-all ${modoLogin === 'visualizador' ? 'bg-green-600 text-white' : 'text-slate-400'}`}
            >
              👁️ Visualizador
            </button>
            <button
              onClick={() => setModoLogin('admin')}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold uppercase transition-all ${modoLogin === 'admin' ? 'bg-red-600 text-white' : 'text-slate-400'}`}
            >
              ⚙️ Admin
            </button>
          </div>
          
          {/* Panel QR */}
          {modoLogin === 'qr' && (
            <div>
              <LiveQRScanner 
                onScanSuccess={handleScanSuccess}
                onScanError={handleScanError}
              />
              <p className="text-slate-400 text-xs mt-4 text-center">📱 Escanea el código QR de tu credencial personal</p>
              {error && (
                <div className="mt-4 p-3 bg-red-900/30 border border-red-800 rounded-xl">
                  <p className="text-red-400 text-xs font-medium">{error}</p>
                </div>
              )}
            </div>
          )}
          
          {/* Panel VISUALIZADOR */}
          {modoLogin === 'visualizador' && (
            <form onSubmit={handleVisualizadorLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">USUARIO VISUALIZADOR</label>
                <input
                  type="text"
                  value={visualizadorUser}
                  onChange={(e) => setVisualizadorUser(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-4 text-white text-lg outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="usuario"
                  required
                  disabled={bloqueado}
                />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">PIN DE ACCESO</label>
                <input
                  type="password"
                  value={visualizadorPin}
                  onChange={(e) => setVisualizadorPin(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-4 text-white text-2xl text-center tracking-[0.5em] outline-none focus:ring-2 focus:ring-green-500"
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
                className="w-full bg-gradient-to-r from-green-600 to-green-500 text-white font-black py-4 rounded-xl shadow-lg active:scale-95 uppercase disabled:opacity-50"
              >
                {verificando ? 'VERIFICANDO...' : 'INGRESAR COMO VISUALIZADOR'}
              </button>
            </form>
          )}
          
          {/* Panel ADMIN */}
          {modoLogin === 'admin' && (
            <form onSubmit={handleAdminLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">USUARIO ADMIN</label>
                <input
                  type="text"
                  value={adminUser}
                  onChange={(e) => setAdminUser(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-4 text-white text-lg outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="admin"
                  required
                  disabled={bloqueado}
                />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">PIN DE ACCESO</label>
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
                <div className="p-3 bg-red-900/30 border border-red-800 rounded-xl">
                  <p className="text-sm text-center text-red-400">{error}</p>
                </div>
              )}
              
              <button
                type="submit"
                disabled={verificando || bloqueado}
                className="w-full bg-gradient-to-r from-red-600 to-red-500 text-white font-black py-4 rounded-xl shadow-lg active:scale-95 uppercase disabled:opacity-50"
              >
                {verificando ? 'VERIFICANDO...' : 'INGRESAR AL PANEL'}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // Pantalla para accesos específicos (desde QR de sector)
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