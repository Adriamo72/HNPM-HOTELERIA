// components/LoginConQR.jsx
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';

const LoginConQR = ({ onLoginSuccess }) => {
  const [scaneando, setScaneando] = useState(true);
  const [error, setError] = useState('');
  const [verificando, setVerificando] = useState(false);
  const scannerRef = useRef(null);

  // Cargar scanner cuando el componente se monta
  useEffect(() => {
    if (!scaneando) return;
    
    // Usar html5-qrcode (más estable)
    const loadScanner = async () => {
      try {
        const { Html5QrcodeScanner } = await import('html5-qrcode');
        
        scannerRef.current = new Html5QrcodeScanner(
          "qr-reader",
          {
            fps: 10,
            qrbox: { width: 280, height: 280 },
            aspectRatio: 1.0,
            showTorchButtonIfSupported: true,
            showZoomSliderIfSupported: true,
          },
          false
        );
        
        scannerRef.current.render(onScanSuccess, onScanError);
      } catch (err) {
        console.error("Error cargando scanner:", err);
        setError("Error al iniciar la cámara. Verifica permisos.");
      }
    };
    
    loadScanner();
    
    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear();
      }
    };
  }, [scaneando]);

  const onScanSuccess = async (decodedText) => {
    if (verificando) return;
    setVerificando(true);
    
    try {
      // Verificar si es un QR personal válido
      if (decodedText.includes('/auth/')) {
        const token = decodedText.split('/auth/')[1];
        
        // Buscar token en la base de datos
        const { data: tokenData, error: tokenError } = await supabase
          .from('tokens_acceso')
          .select('dni, activo, expira_en')
          .eq('token', token)
          .eq('activo', true)
          .single();
        
        if (tokenError || !tokenData) {
          setError("QR inválido. Contacta al administrador.");
          setVerificando(false);
          return;
        }
        
        // Verificar expiración
        if (tokenData.expira_en && new Date(tokenData.expira_en) < new Date()) {
          setError("Credencial expirada. Solicita renovación.");
          setVerificando(false);
          return;
        }
        
        // Obtener datos del usuario
        const { data: usuario, error: userError } = await supabase
          .from('personal')
          .select('*')
          .eq('dni', tokenData.dni)
          .single();
        
        if (userError || !usuario) {
          setError("Usuario no encontrado.");
          setVerificando(false);
          return;
        }
        
        // Actualizar último uso del token
        await supabase
          .from('tokens_acceso')
          .update({ ultimo_uso: new Date().toISOString() })
          .eq('token', token);
        
        // Guardar sesión (expira en 8 horas)
        const sesion = {
          usuario: usuario,
          expira: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString()
        };
        localStorage.setItem('sesion_hnpm', JSON.stringify(sesion));
        
        // Detener scanner
        if (scannerRef.current) {
          scannerRef.current.clear();
        }
        
        onLoginSuccess(usuario);
        
      } else {
        setError("Escanea tu CREDENCIAL PERSONAL, no el código del sector.");
        setTimeout(() => {
          setError('');
          setVerificando(false);
        }, 2000);
      }
    } catch (err) {
      console.error("Error:", err);
      setError("Error al verificar credencial.");
      setVerificando(false);
    }
  };

  const onScanError = (err) => {
    console.warn("Error de escaneo:", err);
    // No mostrar error para no molestar al usuario
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="bg-slate-900 rounded-3xl p-8 max-w-md w-full text-center">
        <div className="mb-6">
          <div className="bg-blue-600 w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
          </div>
          <h1 className="text-2xl font-black text-white uppercase tracking-wider">
            HNPM HOTELERÍA
          </h1>
          <p className="text-slate-500 text-xs uppercase tracking-wider mt-2">
            Acceso con Credencial
          </p>
        </div>

        {scaneando ? (
          <>
            <div id="qr-reader" className="bg-black rounded-2xl overflow-hidden mb-4"></div>
            <p className="text-slate-400 text-sm">
              📱 Escanea el código QR de tu credencial personal
            </p>
            <p className="text-slate-600 text-xs mt-2">
              (El QR está en tu carnet de identificación)
            </p>
          </>
        ) : verificando ? (
          <div className="py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
            <p className="text-white mt-4">Verificando credencial...</p>
          </div>
        ) : null}

        {error && (
          <div className="mt-4 p-3 bg-red-900/30 border border-red-800 rounded-xl">
            <p className="text-red-400 text-sm">{error}</p>
            <button 
              onClick={() => {
                setError('');
                setScaneando(true);
                setVerificando(false);
                window.location.reload();
              }}
              className="mt-2 text-xs text-blue-400 underline"
            >
              Intentar de nuevo
            </button>
          </div>
        )}

        <p className="text-slate-700 text-[10px] uppercase mt-6">
          Subdirección Administrativa - Departamento Hotelería
        </p>
      </div>
    </div>
  );
};

export default LoginConQR;