// components/SimpleQRScanner.jsx
import React, { useState, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

const SimpleQRScanner = ({ onScanSuccess, onScanError }) => {
  const [procesando, setProcesando] = useState(false);
  const [archivoSeleccionado, setArchivoSeleccionado] = useState(null);
  const fileInputRef = useRef(null);

  const procesarImagen = async (file) => {
    if (!file) return;
    
    setProcesando(true);
    
    try {
      const html5QrCode = new Html5Qrcode("temp-qr-reader");
      
      // Escanear el archivo
      const decodedText = await html5QrCode.scanFile(file, true);
      
      if (decodedText) {
        onScanSuccess(decodedText);
      }
      
      // Limpiar
      html5QrCode.clear();
      setArchivoSeleccionado(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
    } catch (err) {
      console.error("Error leyendo QR:", err);
      onScanError("No se pudo leer el código QR. Asegúrate de que la imagen tenga un QR visible.");
    } finally {
      setProcesando(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setArchivoSeleccionado(file);
      procesarImagen(file);
    }
  };

  const tomarFoto = () => {
    // Crear input de tipo file que acepta captura de cámara
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment'; // Forzar cámara trasera
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        setArchivoSeleccionado(file);
        procesarImagen(file);
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
        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 px-4 rounded-xl mb-3 transition-all disabled:opacity-50"
      >
        {procesando ? '📷 PROCESANDO...' : '📷 SACAR FOTO AL QR'}
      </button>
      
      {/* O subir imagen */}
      <div className="relative">
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
      
      <div id="temp-qr-reader" style={{ display: 'none' }}></div>
    </div>
  );
};

export default SimpleQRScanner;