// components/SimpleQRScanner.jsx
import React, { useState, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

const SimpleQRScanner = ({ onScanSuccess, onScanError }) => {
  const [procesando, setProcesando] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [textoManual, setTextoManual] = useState('');
  const fileInputRef = useRef(null);

  const procesarImagen = async (file) => {
    if (!file) return;
    
    setProcesando(true);
    setErrorMsg('');
    
    try {
      const html5QrCode = new Html5Qrcode("temp-qr-reader");
      
      const decodedText = await html5QrCode.scanFile(file, true);
      
      if (decodedText) {
        onScanSuccess(decodedText);
      } else {
        setErrorMsg("No se encontró un código QR en la imagen");
        onScanError("No se encontró QR");
      }
      
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

  const handleTextoManual = () => {
    if (textoManual.trim()) {
      onScanSuccess(textoManual.trim());
      setTextoManual('');
    } else {
      setErrorMsg("Ingresa el texto del QR");
    }
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
      
      {/* Divisor */}
      <div className="relative my-4">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-700"></div>
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-slate-900 px-2 text-slate-500">O prueba manualmente</span>
        </div>
      </div>
      
      {/* Campo para pegar texto manual */}
      <div className="flex gap-2">
        <input
          type="text"
          value={textoManual}
          onChange={(e) => setTextoManual(e.target.value)}
          placeholder="Pega aquí la URL del QR"
          className="flex-1 bg-slate-800 border border-slate-700 rounded-xl p-3 text-white text-sm outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={handleTextoManual}
          className="bg-green-600 hover:bg-green-500 text-white font-bold px-4 rounded-xl transition-all"
        >
          Validar
        </button>
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
        </div>
      )}
      
      <div id="temp-qr-reader" style={{ display: 'none' }}></div>
    </div>
  );
};

export default SimpleQRScanner;