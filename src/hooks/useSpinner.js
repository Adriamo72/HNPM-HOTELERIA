// hooks/useSpinner.js
import { useState, useCallback } from 'react';

const useSpinner = () => {
  const [spinner, setSpinner] = useState({ visible: false, mensaje: '', tipo: 'loading' });

  const showLoading = useCallback((mensaje = 'PROCESANDO...') => {
    setSpinner({ visible: true, mensaje, tipo: 'loading' });
  }, []);

  const showSuccess = useCallback((mensaje = '¡OPERACIÓN EXITOSA!', duration = 1500) => {
    setSpinner({ visible: true, mensaje, tipo: 'success' });
    setTimeout(() => {
      setSpinner({ visible: false, mensaje: '', tipo: 'loading' });
    }, duration);
  }, []);

  const showError = useCallback((mensaje = 'ERROR EN LA OPERACIÓN', duration = 2000) => {
    setSpinner({ visible: true, mensaje, tipo: 'error' });
    setTimeout(() => {
      setSpinner({ visible: false, mensaje: '', tipo: 'loading' });
    }, duration);
  }, []);

  const hideSpinner = useCallback(() => {
    setSpinner({ visible: false, mensaje: '', tipo: 'loading' });
  }, []);

  return {
    spinner,
    showLoading,
    showSuccess,
    showError,
    hideSpinner
  };
};

export default useSpinner;