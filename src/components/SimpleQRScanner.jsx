// components/SimpleQRScanner.jsx
import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

const SimpleQRScanner = ({ onScanSuccess, onScanError }) => {
  const [error, setError] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [cameras, setCameras] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState('');
  const scannerRef = useRef(null);
  const containerId = 'simple-qr-reader';

  // Detectar cámaras al inicio
  useEffect(() => {
    const detectCameras = async () => {
      try {
        // Solicitar permiso primero
        await navigator.mediaDevices.getUserMedia({ video: true });
        
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        
        const cameraList = videoDevices.map((device, idx) => ({
          id: device.deviceId,
          label: device.label || `Cámara ${idx + 1}`,
          isBack: device.label.toLowerCase().includes('back') || 
                   device.label.toLowerCase().includes('rear') ||
                   device.label.toLowerCase().includes('environment') ||
                   device.label.toLowerCase().includes('traseira') ||
                   device.label.toLowerCase().includes('trasera')
        }));
        
        setCameras(cameraList);
        
        // Buscar cámara trasera
        const backCam = cameraList.find(c => c.isBack);
        if (backCam) {
          setSelectedCamera(backCam.id);
          startScanner(backCam.id);
        } else if (cameraList.length > 0) {
          setSelectedCamera(cameraList[0].id);
          startScanner(cameraList[0].id);
        } else {
          setError("No se encontraron cámaras");
          onScanError("No hay cámaras disponibles");
        }
      } catch (err) {
        console.error("Error detectando cámaras:", err);
        setError("Error al acceder a la cámara. Verifica permisos.");
        onScanError("Permiso denegado");
      }
    };
    
    detectCameras();
    
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(console.error);
      }
    };
  }, []);

  const startScanner = async (cameraId) => {
    try {
      if (scannerRef.current) {
        await scannerRef.current.stop();
      }
      
      // Limpiar contenedor
      const container = document.getElementById(containerId);
      if (container) {
        container.innerHTML = '';
      }
      
      scannerRef.current = new Html5Qrcode(containerId);
      
      const config = {
        fps: 10,
        qrbox: { width: 280, height: 280 },
        aspectRatio: 1.0
      };
      
      await scannerRef.current.start(
        { deviceId: { exact: cameraId } },
        config,
        (decodedText) => {
          if (decodedText) {
            onScanSuccess(decodedText);
          }
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
      console.error("Error iniciando scanner:", err);
      setError("No se pudo iniciar la cámara");
      onScanError("Error de cámara");
    }
  };

  const switchCamera = (cameraId) => {
    if (scannerRef.current) {
      scannerRef.current.stop().then(() => {
        setSelectedCamera(cameraId);
        startScanner(cameraId);
      }).catch(console.error);
    }
  };

  return (
    <div className="w-full">
      {/* Selector de cámara */}
      {cameras.length > 1 && (
        <div className="mb-3">
          <select
            value={selectedCamera}
            onChange={(e) => switchCamera(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2 text-white text-sm outline-none focus:ring-2 focus:ring-blue-500"
          >
            {cameras.map((cam) => (
              <option key={cam.id} value={cam.id}>
                {cam.label.length > 30 ? cam.label.substring(0, 30) + '...' : cam.label} 
                {cam.isBack ? ' 📷' : ' 🤳'}
              </option>
            ))}
          </select>
        </div>
      )}
      
      {/* Contenedor del escáner */}
      <div 
        id={containerId} 
        className="bg-black rounded-2xl overflow-hidden"
        style={{ minHeight: '300px', width: '100%' }}
      ></div>
      
      {/* Estado */}
      {!isScanning && !error && (
        <p className="text-center text-yellow-400 text-xs mt-2 animate-pulse">
          📷 Iniciando cámara...
        </p>
      )}
      
      {isScanning && (
        <p className="text-center text-green-400 text-xs mt-2">
          ✅ Cámara activa - Enfoca el código QR
        </p>
      )}
    </div>
  );
};

export default SimpleQRScanner;