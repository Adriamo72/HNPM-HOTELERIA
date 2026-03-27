// components/SimpleQRScanner.jsx
import React, { useState, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

const SimpleQRScanner = ({ onScanSuccess, onScanError }) => {
  const [procesando, setProcesando] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  // Función para redimensionar la imagen
  const redimensionarImagen = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;
          const maxSize = 1024;
          
          if (width > maxSize || height > maxSize) {
            if (width > height) {
              height = (height * maxSize) / width;
              width = maxSize;
            } else {
              width = (width * maxSize) / height;
              height = maxSize;
            }
          }
          
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          
          canvas.toBlob((blob) => {
            resolve(new File([blob], 'qr.jpg', { type: 'image/jpeg', lastModified: Date.now() }));
          }, 'image/jpeg', 0.9);
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const procesarImagen = async (file) => {
    if (!file) return;
    
    setProcesando(true);
    setErrorMsg('');
    
    try {
      const imagenOptimizada = await redimensionarImagen(file);
      const html5QrCode = new Html5Qrcode("temp-qr-reader");
      
      const decodedText = await html5QrCode.scanFile(imagenOptimizada, true);
      
      if (decodedText) {
        onScanSuccess(decodedText);
      } else {
        setErrorMsg("No se encontró QR. Enfoca bien y vuelve a intentar.");
        onScanError("No se encontró QR");
      }
      
      await html5QrCode.clear();
      
    } catch (err) {
      console.error("Error:", err);
      setErrorMsg("No se pudo leer el QR. Asegúrate de enfocar bien.");
      onScanError("Error al leer QR");
    } finally {
      setProcesando(false);
    }
  };

  const tomarFoto = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    // No preguntar guardar, procesar inmediatamente
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (file) {
        await procesarImagen(file);
      }
      // Limpiar input para poder tomar otra foto
      input.value = '';
    };
    input.click();
  };

  return (
    <div className="w-full">
      <button
        onClick={tomarFoto}
        disabled={procesando}
        className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-600 text-white font-black py-5 px-4 rounded-xl transition-all disabled:opacity-50 text-xl shadow-lg"
      >
        {procesando ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            PROCESANDO QR...
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            📷 SACAR FOTO AL QR
          </span>
        )}
      </button>
      
      {errorMsg && (
        <div className="mt-4 p-3 bg-red-900/50 border border-red-700 rounded-xl">
          <p className="text-red-300 text-sm text-center">{errorMsg}</p>
          <p className="text-red-400 text-[10px] text-center mt-1">
            💡 Enfoca bien el código QR y mantén el celular firme
          </p>
        </div>
      )}
      
      <div id="temp-qr-reader" style={{ display: 'none' }}></div>
    </div>
  );
};

export default SimpleQRScanner;