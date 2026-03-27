// components/SimpleQRScanner.jsx
import React, { useState, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

const SimpleQRScanner = ({ onScanSuccess, onScanError }) => {
  const [procesando, setProcesando] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef(null);

  const procesarImagen = async (file) => {
    if (!file) return;
    
    setProcesando(true);
    setErrorMsg('');
    
    console.log("Procesando imagen:", file.name, file.type, file.size);
    
    try {
      const html5QrCode = new Html5Qrcode("temp-qr-reader");
      
      // Configuración para mejor detección
      const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
        disableFlip: false
      };
      
      // Escanear el archivo
      const decodedText = await html5QrCode.scanFile(file, true);
      
      console.log("QR decodificado:", decodedText);
      
      if (decodedText) {
        onScanSuccess(decodedText);
      } else {
        setErrorMsg("No se encontró un código QR en la imagen");
        onScanError("No se encontró QR");
      }
      
      // Limpiar
      await html5QrCode.clear();
      
    } catch (err) {
      console.error("Error leyendo QR:", err);
      setErrorMsg("Error al leer el QR: " + (err.message || "Imagen no válida"));
      onScanError("Error al leer QR");
    } finally {
      setProcesando(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      await procesarImagen(file);
    }
  };

  const tomarFoto = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (file) {
        await procesarImagen(file);
      }
    };
    input.click();
  };

  return (
    <div className="w-full">
      {/* Botón para tomar foto */}
      <button
        onClick={tomarFoto}
        disabled={procesando}
        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 px-4 rounded-xl mb-3 transition-all disabled:opacity-50 text-lg"
      >
        {procesando ? '⏳ PROCESANDO...' : '📷 SACAR FOTO AL QR'}
      </button>
      
      {/* O subir imagen */}
      <div className="relative mt-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          disabled={procesando}
        />
        <div className="w-full bg-slate-800 border border-slate-700 rounded-xl py-3 px-4 text-center text-slate-400 text-sm">
          📁 O selecciona una imagen de la galería
        </div>
      </div>
      
      {procesando && (
        <div className="mt-3 text-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto"></div>
          <p className="text-xs text-slate-400 mt-1">Leyendo código QR...</p>
        </div>
      )}
      
      {errorMsg && (
        <div className="mt-3 p-2 bg-red-900/50 border border-red-700 rounded-lg">
          <p className="text-red-300 text-xs text-center">{errorMsg}</p>
          <p className="text-red-400 text-[10px] text-center mt-1">
            💡 Asegúrate de que el QR esté bien enfocado y con buena iluminación
          </p>
        </div>
      )}
      
      <div id="temp-qr-reader" style={{ display: 'none' }}></div>
    </div>
  );
};

export default SimpleQRScanner;