// components/LiveQRScanner.jsx
import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

const LiveQRScanner = ({ onScanSuccess, onScanError }) => {
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState('');
  const scannerRef = useRef(null);
  const containerId = 'live-qr-reader';

  useEffect(() => {
    const startScanner = async () => {
      try {
        // Crear el escáner
        scannerRef.current = new Html5Qrcode(containerId);
        
        // Configuración para cámara trasera
        const config = {
          fps: 10,
          qrbox: { width: 350, height: 350 },
          aspectRatio: 1.0,
          showTorchButtonIfSupported: true,
          showZoomSliderIfSupported: true,
        };
        
        // Iniciar con cámara trasera
        await scannerRef.current.start(
          { facingMode: "environment" }, // Forzar cámara trasera
          config,
          (decodedText) => {
            // QR detectado exitosamente
            onScanSuccess(decodedText);
            // Opcional: detener escáner después de detectar
            // stopScanner();
          },
          (errorMessage) => {
            // Ignorar errores de "no QR found"
            if (!errorMessage.includes("No QR code found")) {
              console.warn("Error:", errorMessage);
            }
          }
        );
        
        setIsScanning(true);
        setError('');
        
      } catch (err) {
        console.error("Error iniciando escáner:", err);
        setError("No se pudo acceder a la cámara. Verifica permisos.");
        onScanError("Error de cámara");
      }
    };
    
    startScanner();
    
    return () => {
      if (scannerRef.current && isScanning) {
        scannerRef.current.stop().catch(console.error);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  return (
    <div className="w-full">
      <div 
        id={containerId} 
        className="bg-black rounded-2xl overflow-hidden"
        style={{ minHeight: '420px', width: '100%' }}
      ></div>
      
      {!isScanning && !error && (
        <p className="text-center text-yellow-400 text-xs mt-3 animate-pulse">
          📷 Iniciando cámara trasera...
        </p>
      )}
      
      {isScanning && (
        <p className="text-center text-green-400 text-xs mt-3">
          ✅ Cámara activa - Enfoca el código QR
        </p>
      )}
      
      {error && (
        <div className="mt-4 p-3 bg-red-900/50 border border-red-700 rounded-xl">
          <p className="text-red-300 text-sm text-center">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="mt-2 text-xs text-blue-400 underline block mx-auto"
          >
            Reintentar
          </button>
        </div>
      )}
    </div>
  );
};

export default LiveQRScanner;