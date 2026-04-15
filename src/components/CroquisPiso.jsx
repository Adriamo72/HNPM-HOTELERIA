// components/CroquisPiso.jsx
import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../supabaseClient';

const esAislamientoPatologia = (observaciones) =>
  String(observaciones || '').toUpperCase().includes('AISLAMIENTO');

const getCamasOcupadasEfectivas = (ocup) => {
  const totalCamas = ocup?.total_camas || 0;
  const camasOcupadas = ocup?.camas_ocupadas || 0;
  const aislamientoActivo = esAislamientoPatologia(ocup?.observaciones);

  if (aislamientoActivo && camasOcupadas > 0 && totalCamas > 0) {
    return totalCamas;
  }

  return Math.min(totalCamas, Math.max(0, camasOcupadas));
};

const getCamasOcupadasReales = (ocup) => {
  const totalCamas = ocup?.total_camas || 0;
  const camasOcupadas = ocup?.camas_ocupadas || 0;
  return Math.min(totalCamas, Math.max(0, camasOcupadas));
};

const getCamasNoUtilizadasPorAislamiento = (ocup) => {
  const totalCamas = ocup?.total_camas || 0;
  const camasOcupadasReales = getCamasOcupadasReales(ocup);
  const aislamientoActivo = esAislamientoPatologia(ocup?.observaciones);

  if (!aislamientoActivo || camasOcupadasReales <= 0 || totalCamas <= 0) {
    return 0;
  }

  return Math.max(0, totalCamas - camasOcupadasReales);
};

const CroquisPiso = ({ pisoId, pisoNombre, habitaciones, esVisualizador = false, fechaConsulta }) => {
  const normalizedPisoId = typeof pisoId === 'string' && pisoId.trim() !== '' && !Number.isNaN(Number(pisoId))
    ? Number(pisoId)
    : pisoId;

  // Estados principales
  const [croquis, setCroquis] = useState(null);
  const [coordenadas, setCoordenadas] = useState({});
  const [modoEdicion, setModoEdicion] = useState(false);
  const [modoMovimiento, setModoMovimiento] = useState(false);
  const [ocupacion, setOcupacion] = useState({});
  const [cargando, setCargando] = useState(true);
  const [cargandoCoordenadas, setCargandoCoordenadas] = useState(true);
  const [mensaje, setMensaje] = useState('');
  const [fechaSeleccionada] = useState(fechaConsulta || new Date().toISOString().split('T')[0]);
  const [ultimaActualizacion, setUltimaActualizacion] = useState(null);
  const [estadisticas, setEstadisticas] = useState({
    totalCamas: 0,
    camasOcupadasReales: 0,
    camasBloqueadasAislamiento: 0,
    camasDisponibles: 0,
    porcentajePractico: 0,
    habitacionesActivas: 0,
    habitacionesAisladas: 0,
  });
  const [estadisticasGlobales, setEstadisticasGlobales] = useState({
    totalCamas: 0,
    camasOcupadasReales: 0,
    camasNoUtilizadasPorAislamiento: 0,
    camasDisponibles: 0,
    porcentajePractico: 0,
  });
  
  // Estados para zoom y arrastre
  const [zoom, setZoom] = useState(1);
  const [posicion, setPosicion] = useState({ x: 0, y: 0 });
  const [arrastrando, setArrastrando] = useState(false);
  const [puntoInicio, setPuntoInicio] = useState({ x: 0, y: 0 });
  const [habitacionArrastrada, setHabitacionArrastrada] = useState(null);
  
  // Estado para forzar re-render de marcadores
  const [marcadoresKey, setMarcadoresKey] = useState(0);
  const [tooltipHabitacion, setTooltipHabitacion] = useState(null);
  const [imgRenderedWidth, setImgRenderedWidth] = useState(600);
  const [vp, setVp] = useState({ left: 0, top: 0, width: window.innerWidth, height: window.innerHeight, scale: 1 });
  
  const imageRef = useRef(null);
  const containerRef = useRef(null);

  // Trackear el viewport visual real (afectado por pinch-zoom del browser)
  useEffect(() => {
    const updateVp = () => {
      const v = window.visualViewport;
      setVp(v
        ? { left: v.offsetLeft, top: v.offsetTop, width: v.width, height: v.height, scale: v.scale || 1 }
        : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight, scale: 1 }
      );
    };
    updateVp();
    window.visualViewport?.addEventListener('resize', updateVp);
    window.visualViewport?.addEventListener('scroll', updateVp);
    return () => {
      window.visualViewport?.removeEventListener('resize', updateVp);
      window.visualViewport?.removeEventListener('scroll', updateVp);
    };
  }, []);

  // Re-render marcadores al rotar el dispositivo y actualizar ancho real de la imagen
  useEffect(() => {
    const handleResize = () => {
      if (imageRef.current) {
        const w = imageRef.current.getBoundingClientRect().width;
        if (w > 0) setImgRenderedWidth(w);
      }
      setMarcadoresKey(prev => prev + 1);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ==================== RESETEAR COMPLETO cuando cambia el pisoId ====================
  useEffect(() => {
    console.log(`🔄 Resetear croquis para pisoId: ${normalizedPisoId}`);
    
    // Resetear todos los estados
    setCroquis(null);
    setCoordenadas({});
    setOcupacion({});
    setUltimaActualizacion(null);
    setCargando(true);
    setCargandoCoordenadas(true);
    setZoom(1);
    setPosicion({ x: 0, y: 0 });
    setModoEdicion(false);
    setModoMovimiento(false);
    setEstadisticas({
      totalCamas: 0,
      camasOcupadasReales: 0,
      camasBloqueadasAislamiento: 0,
      camasDisponibles: 0,
      porcentajePractico: 0,
      habitacionesActivas: 0,
      habitacionesAisladas: 0,
    });
    setMarcadoresKey(prev => prev + 1);
    
    // Validar que tengamos un piso válido
    if (normalizedPisoId !== '' && normalizedPisoId !== null && normalizedPisoId !== undefined && normalizedPisoId !== 0) {
      console.log(`✅ Cargando croquis para piso ${normalizedPisoId}`);
      cargarCroquis();
      cargarEstadisticasGlobales();
    } else {
      console.warn(`⚠️ Piso inválido: ${normalizedPisoId}`);
      setCargando(false);
      setCargandoCoordenadas(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedPisoId]);

  // ==================== Cargar ocupación cuando cambia fecha ====================
  useEffect(() => {
    if (habitaciones.length > 0 && pisoId && croquis) {
      cargarOcupacion();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fechaSeleccionada, habitaciones, croquis]);

  // ==================== Calcular estadísticas cuando cambia ocupación ====================
  useEffect(() => {
    if (habitaciones.length > 0) {
      calcularEstadisticas();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ocupacion, habitaciones]);

  // ==================== Sincronizar habitaciones cuando cambian externamente ====================
  useEffect(() => {
    if (habitaciones && habitaciones.length > 0 && croquis) {
      console.log(`📋 Sincronizando ${habitaciones.length} habitaciones para piso ${pisoId}`);
      calcularEstadisticas();
      
      // Verificar cuántas habitaciones tienen coordenadas
      const conCoordenadas = habitaciones.filter(hab => coordenadas[hab.id]).length;
      console.log(`📍 Habitaciones con coordenadas: ${conCoordenadas}/${habitaciones.length}`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [habitaciones, croquis]);

  // ==================== Forzar re-render cuando coordenadas estén listas ====================
  useEffect(() => {
    if (!cargando && !cargandoCoordenadas && croquis && habitaciones.length > 0) {
      console.log('✅ Todo listo - coordenadas:', Object.keys(coordenadas).length);
      // Forzar re-render de los marcadores
      setMarcadoresKey(prev => prev + 1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargando, cargandoCoordenadas, croquis, habitaciones]);

  // ==================== Cargar estadísticas globales ====================
  const cargarEstadisticasGlobales = async () => {
    try {
      const { data: todasHabitaciones, error: habError } = await supabase
        .from('habitaciones_especiales')
        .select('id, piso_id, nombre');
      
      if (habError) throw habError;
      
      if (!todasHabitaciones || todasHabitaciones.length === 0) {
        setEstadisticasGlobales({
          totalCamas: 0,
          camasOcupadasReales: 0,
          camasNoUtilizadasPorAislamiento: 0,
          camasDisponibles: 0,
          porcentajePractico: 0,
        });
        return;
      }
      
      const fecha = fechaSeleccionada;
      const hoy = new Date().toISOString().split('T')[0];
      
      let query = supabase
        .from('ocupacion_habitaciones')
        .select('*')
        .in('habitacion_id', todasHabitaciones.map(h => h.id));
      
      if (fecha === hoy) {
        query = query.order('fecha', { ascending: false }).order('actualizado_en', { ascending: false });
      } else {
        query = query.eq('fecha', fecha).order('actualizado_en', { ascending: false });
      }
      
      const { data: ocupaciones, error: occError } = await query;
      
      if (occError) throw occError;
      
      const ocupMap = {};
      (ocupaciones || []).forEach(occ => {
        if (!ocupMap[occ.habitacion_id]) {
          ocupMap[occ.habitacion_id] = occ;
        }
      });
      
      let totalCamasGlobal = 0;
      let camasOcupadasRealesGlobal = 0;
      let camasNoUtilizadasPorAislamientoGlobal = 0;
      
      todasHabitaciones.forEach(hab => {
        const ocup = ocupMap[hab.id];
        if (ocup && ocup.tipo_habitacion === 'activa') {
          totalCamasGlobal += ocup.total_camas || 0;
          camasOcupadasRealesGlobal += getCamasOcupadasReales(ocup);
          camasNoUtilizadasPorAislamientoGlobal += getCamasNoUtilizadasPorAislamiento(ocup);
        }
      });
      
      const camasOcupadasPracticas = camasOcupadasRealesGlobal + camasNoUtilizadasPorAislamientoGlobal;
      const porcentajeGlobal = totalCamasGlobal > 0 ? (camasOcupadasPracticas / totalCamasGlobal) * 100 : 0;
      const camasDisponiblesGlobal = Math.max(0, totalCamasGlobal - camasOcupadasPracticas);
      
      setEstadisticasGlobales({
        totalCamas: totalCamasGlobal,
        camasOcupadasReales: camasOcupadasRealesGlobal,
        camasNoUtilizadasPorAislamiento: camasNoUtilizadasPorAislamientoGlobal,
        camasDisponibles: camasDisponiblesGlobal,
        porcentajePractico: porcentajeGlobal,
      });
      
    } catch (error) {
      console.error("Error cargando estadísticas globales:", error);
    }
  };

  // ==================== Calcular estadísticas del piso ====================
  const calcularEstadisticas = () => {
    let totalCamas = 0;
    let camasOcupadasReales = 0;
    let camasBloqueadasAislamiento = 0;
    let habitacionesActivas = 0;
    let habitacionesAisladas = 0;
    
    habitaciones.forEach(hab => {
      const ocup = ocupacion[hab.id];
      if (ocup && ocup.tipo_habitacion === 'activa') {
        habitacionesActivas += 1;
        totalCamas += ocup.total_camas > 0 ? ocup.total_camas : 0;
        
        const ocupadasReales = getCamasOcupadasReales(ocup);
        camasOcupadasReales += ocupadasReales;
        
        const bloqueadas = getCamasNoUtilizadasPorAislamiento(ocup);
        camasBloqueadasAislamiento += bloqueadas;
        
        if (esAislamientoPatologia(ocup.observaciones)) {
          habitacionesAisladas += 1;
        }
      }
    });
    
    const camasOcupadasPracticas = camasOcupadasReales + camasBloqueadasAislamiento;
    const porcentajePractico = totalCamas > 0 ? (camasOcupadasPracticas / totalCamas) * 100 : 0;
    const camasDisponibles = Math.max(0, totalCamas - camasOcupadasPracticas);
    
    setEstadisticas({
      totalCamas,
      camasOcupadasReales,
      camasBloqueadasAislamiento,
      camasDisponibles,
      porcentajePractico,
      habitacionesActivas,
      habitacionesAisladas,
    });
  };

  // ==================== Cargar ocupación ====================
  const cargarOcupacion = async () => {
    if (!habitaciones.length || !pisoId) return;
    
    try {
      const hoy = new Date().toISOString().split('T')[0];
      let query = supabase
        .from('ocupacion_habitaciones')
        .select('*')
        .in('habitacion_id', habitaciones.map(h => h.id));

      if (fechaSeleccionada === hoy) {
        query = query.order('fecha', { ascending: false }).order('actualizado_en', { ascending: false });
      } else {
        query = query.eq('fecha', fechaSeleccionada).order('actualizado_en', { ascending: false });
      }

      const { data, error } = await query;

      if (error) throw error;

      const ocupMap = {};
      let ultima = null;
      (data || []).forEach(occ => {
        if (!ocupMap[occ.habitacion_id]) {
          ocupMap[occ.habitacion_id] = occ;
        }
        const fecha = new Date(occ.actualizado_en || occ.created_at);
        console.log('CroquisPiso - Timestamp:', occ.actualizado_en, '-> Fecha local:', fecha);
        if (!ultima || fecha > ultima) ultima = fecha;
      });
      setOcupacion(ocupMap);
      setUltimaActualizacion(ultima);
    } catch (error) {
      console.error("Error cargando ocupación:", error);
    }
  };

  // ==================== Cargar croquis ====================
  const cargarCroquis = async () => {
    if (normalizedPisoId === '' || normalizedPisoId === null || normalizedPisoId === undefined || normalizedPisoId === 0) {
      console.warn('cargarCroquis: pisoId inválido');
      setCargando(false);
      setCargandoCoordenadas(false);
      return;
    }
    
    console.log(`📥 Cargando croquis para piso ${normalizedPisoId}`);
    setCargando(true);
    setCargandoCoordenadas(true);
    
    try {
      const { data: croquisData, error: croqError } = await supabase
        .from('croquis_pisos')
        .select('*')
        .eq('piso_id', normalizedPisoId)
        .eq('activo', true)
        .order('version', { ascending: false })
        .maybeSingle();

      if (croqError) {
        console.error('Error en consulta croquis:', croqError);
        setCroquis(null);
        setCargando(false);
        setCargandoCoordenadas(false);
        return;
      }

      if (croquisData) {
        console.log(`✅ Croquis encontrado: ${croquisData.id}`);
        setCroquis(croquisData);
        
        const { data: coords, error: coordError } = await supabase
          .from('habitacion_coordenadas')
          .select('*')
          .eq('croquis_id', croquisData.id);
        
        if (coordError) {
          console.error('Error cargando coordenadas:', coordError);
        }
        
        const coordsMap = {};
        coords?.forEach(c => {
          coordsMap[c.habitacion_id] = { x: c.x, y: c.y, ancho: c.ancho, alto: c.alto };
        });
        setCoordenadas(coordsMap);
        console.log(`📍 ${Object.keys(coordsMap).length} coordenadas cargadas`);
        // Forzar re-render de marcadores
        setMarcadoresKey(prev => prev + 1);
      } else {
        console.log(`📭 No hay croquis para piso ${normalizedPisoId}`);
        setCroquis(null);
        setCoordenadas({});
      }
    } catch (error) {
      console.error("Error cargando croquis:", error);
      setCroquis(null);
    } finally {
      setCargando(false);
      setCargandoCoordenadas(false);
    }
  };

  // ==================== Guardar coordenada ====================
  const guardarCoordenada = async (habitacionId, x, y) => {
    if (!croquis) return;
    
    try {
      const { error } = await supabase
        .from('habitacion_coordenadas')
        .upsert({
          habitacion_id: habitacionId,
          croquis_id: croquis.id,
          x: Math.round(x),
          y: Math.round(y),
          ancho: 40,
          alto: 40
        }, { onConflict: 'habitacion_id,croquis_id' });
      
      if (error) throw error;
      
      setCoordenadas(prev => ({ ...prev, [habitacionId]: { x, y, ancho: 40, alto: 40 } }));
      setMarcadoresKey(prev => prev + 1);
      
    } catch (error) {
      console.error("Error guardando coordenada:", error);
      throw error;
    }
  };

  // ==================== Subir croquis ====================
  const subirCroquis = async (file) => {
    if (!file) return;
    
    const isValid = file.type === 'image/png' || file.type === 'image/jpeg' || file.type === 'image/jpg';
    if (!isValid) {
      setMensaje("❌ Formato no soportado. Usa PNG o JPG");
      setTimeout(() => setMensaje(''), 2000);
      return;
    }
    
    setMensaje("📤 Subiendo croquis...");
    
    try {
      const fileName = `croquis_${pisoId}_${Date.now()}.png`;
      
      const { error } = await supabase.storage.from('croquis').upload(fileName, file);
      if (error) throw error;
      
      const { data: urlData } = supabase.storage.from('croquis').getPublicUrl(fileName);
      
      const { error: insertError } = await supabase.from('croquis_pisos').insert({
        piso_id: pisoId,
        nombre_archivo: fileName,
        imagen_url: urlData.publicUrl,
        version: 1,
        activo: true,
        subido_en: new Date().toISOString()
      });
      
      if (insertError) throw insertError;
      
      setMensaje("✅ Croquis subido correctamente");
      setTimeout(() => setMensaje(''), 2000);
      cargarCroquis();
      
    } catch (error) {
      console.error("Error:", error);
      setMensaje("❌ Error al subir croquis");
      setTimeout(() => setMensaje(''), 2000);
    }
  };

  // ==================== Eliminar croquis ====================
  const eliminarCroquis = async () => {
    if (!croquis) return;
    
    const confirmar = window.confirm(
      `⚠️ ¿ELIMINAR PLANO?\n\nPiso: ${pisoNombre}\nSe eliminarán también todas las coordenadas.\n\nEsta acción NO SE PUEDE DESHACER.`
    );
    
    if (!confirmar) return;
    
    setMensaje("🗑️ Eliminando plano...");
    
    try {
      await supabase.from('habitacion_coordenadas').delete().eq('croquis_id', croquis.id);
      await supabase.from('croquis_pisos').delete().eq('id', croquis.id);
      await supabase.storage.from('croquis').remove([croquis.nombre_archivo]);
      
      setMensaje("✅ Plano eliminado correctamente");
      setCroquis(null);
      setCoordenadas({});
      setTimeout(() => setMensaje(''), 2000);
      
    } catch (error) {
      console.error("Error:", error);
      setMensaje("❌ Error al eliminar croquis");
      setTimeout(() => setMensaje(''), 2000);
    }
  };

  // ==================== Click para posicionar habitación ====================
  const handleImageClick = async (e) => {
    if (!modoEdicion || modoMovimiento || arrastrando || !croquis) return;
    
    const rect = imageRef.current.getBoundingClientRect();
    const imgElement = imageRef.current;
    const scaleX = imgElement.naturalWidth / rect.width;
    const scaleY = imgElement.naturalHeight / rect.height;
    
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    const habitacionNombre = prompt(
      `¿Qué habitación está en esta ubicación?\n\n` +
      `Habitaciones disponibles:\n${habitaciones.map(h => `- ${h.nombre}`).join('\n')}\n\n` +
      `Ingresa el nombre exacto:`
    );
    
    if (habitacionNombre) {
      const hab = habitaciones.find(h => h.nombre === habitacionNombre.trim());
      
      if (hab) {
        await guardarCoordenada(hab.id, x, y);
        setMensaje(`✅ ${hab.nombre} posicionada`);
        setTimeout(() => setMensaje(''), 1500);
      } else {
        setMensaje(`❌ No se encontró la habitación "${habitacionNombre}"`);
        setTimeout(() => setMensaje(''), 2000);
      }
    }
  };

  // ==================== Obtener color según tipo y ocupación ====================
  const getColorPorTipoYOcupacion = (habitacion, ocup) => {
    if (!ocup) {
      return { 
        bg: 'border-gray-400', 
        text: 'text-white', 
        blink: false, 
        title: 'Sin registrar', 
        style: { backgroundColor: 'rgba(61, 65, 72, 0.8)' } 
      };
    }
    
    switch (ocup.tipo_habitacion) {
      case 'reparacion':
        return {
          bg: 'border-yellow-400',
          text: 'text-black',
          blink: false,
          title: '🔧 EN REPARACIÓN',
          style: { backgroundColor: 'rgba(255, 248, 24, 0.95)' }
        };
      case 'otros':
        return {
          bg: 'border-gray-400',
          text: 'text-white',
          blink: false,
          title: ocup.observaciones || 'Otros',
          style: { backgroundColor: 'rgba(61, 65, 72, 0.8)' }
        };
      case 'activa':
        const totalCamas = ocup.total_camas || 0;
        const camasOcupadas = getCamasOcupadasEfectivas(ocup);
        const camasDisponibles = totalCamas - camasOcupadas;
        const ocupacionCompleta = totalCamas > 0 && camasOcupadas >= totalCamas;
        const parpadeo = camasDisponibles > 0 && totalCamas > 0;
        const aislamientoActivo = esAislamientoPatologia(ocup.observaciones);
        
        const fechaActualizacion = ocup.actualizado_en || ocup.created_at;
        const fechaObj = new Date(fechaActualizacion);
        const fechaFormateada = fechaObj.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' });
        const horaFormateada = fechaObj.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
        
        const infoAmpliatoria = ocup.informacion_ampliatoria || 'Sin especialidad';
        
        let titleText = '';
        if (totalCamas === 0) {
          titleText = `${infoAmpliatoria}\nSin camas asignadas\n${fechaFormateada} ${horaFormateada} hs`;
        } else {
          const detalleAislamiento = aislamientoActivo ? '\nAislamiento por patología activo' : '';
          titleText = `${infoAmpliatoria}\n${camasOcupadas}/${totalCamas} camas ocupadas, ${camasDisponibles} disponibles${detalleAislamiento}\n${fechaFormateada} ${horaFormateada} hs`;
        }
        
        return {
          bg: ocupacionCompleta ? 'border-blue-400' : 'border-green-400',
          text: 'text-white',
          blink: parpadeo,
          title: titleText,
          style: { backgroundColor: ocupacionCompleta ? 'rgba(37, 99, 235, 0.9)' : 'rgba(32, 205, 10, 0.9)' }
        };

      default:
        return { 
          bg: 'border-gray-400', 
          text: 'text-white', 
          blink: false, 
          title: 'Sin estado', 
          style: { backgroundColor: 'rgba(61, 65, 72, 0.8)' } 
        };
    }
  };

  // ==================== Manejo de zoom ====================
  const handleWheel = (e) => {
    if (!modoEdicion) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom(prev => Math.min(Math.max(prev + delta, 0.5), 3));
  };

  // ==================== Manejo de arrastre ====================
  const handleMouseDown = (e) => {
    if (!modoEdicion || modoMovimiento) return;
    
    const target = e.target.closest('.marcador-habitacion');
    if (target && target.dataset.habitacionId) {
      setHabitacionArrastrada(target.dataset.habitacionId);
      setArrastrando(true);
      setPuntoInicio({ x: e.clientX, y: e.clientY });
      e.stopPropagation();
      return;
    }
    
    setArrastrando(true);
    setPuntoInicio({ x: e.clientX - posicion.x, y: e.clientY - posicion.y });
  };

  const handleMouseMove = (e) => {
    if (!arrastrando) return;
    
    if (habitacionArrastrada) {
      const rect = containerRef.current.getBoundingClientRect();
      const imgElement = imageRef.current;
      const scaleX = imgElement.naturalWidth / rect.width / zoom;
      const scaleY = imgElement.naturalHeight / rect.height / zoom;
      
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      
      setCoordenadas(prev => ({
        ...prev,
        [habitacionArrastrada]: { ...prev[habitacionArrastrada], x, y }
      }));
    } else {
      setPosicion({
        x: e.clientX - puntoInicio.x,
        y: e.clientY - puntoInicio.y
      });
    }
  };

  const handleMouseUp = async () => {
    if (arrastrando && habitacionArrastrada) {
      const coord = coordenadas[habitacionArrastrada];
      if (coord) {
        await guardarCoordenada(habitacionArrastrada, coord.x, coord.y);
        setMensaje(`✅ Posición actualizada`);
        setTimeout(() => setMensaje(''), 1500);
      }
    }
    setArrastrando(false);
    setHabitacionArrastrada(null);
  };

  // ==================== Editar habitación ====================
  const editarHabitacion = async (habitacionId, nombreActual) => {
    const nuevoNombre = prompt(`Editar habitación\n\nActual: ${nombreActual}\n\nIngresa el nuevo número:`, nombreActual);
    if (nuevoNombre && nuevoNombre !== nombreActual) {
      try {
        await supabase.from('habitaciones_especiales').update({ nombre: nuevoNombre }).eq('id', habitacionId);
        setMensaje(`✅ Habitación actualizada a ${nuevoNombre}`);
        setTimeout(() => setMensaje(''), 1500);
        window.location.reload();
      } catch (error) {
        setMensaje("❌ Error al actualizar");
        setTimeout(() => setMensaje(''), 2000);
      }
    }
  };

  // ==================== Eliminar posición de habitación ====================
  const eliminarHabitacionPos = async (habitacionId, nombre) => {
    if (window.confirm(`¿Eliminar la posición de "${nombre}"?`)) {
      try {
        await supabase.from('habitacion_coordenadas').delete().eq('habitacion_id', habitacionId).eq('croquis_id', croquis.id);
        setCoordenadas(prev => { const nuevas = { ...prev }; delete nuevas[habitacionId]; return nuevas; });
        setMensaje(`✅ Posición de ${nombre} eliminada`);
        setTimeout(() => setMensaje(''), 1500);
        setMarcadoresKey(prev => prev + 1);
      } catch (error) {
        setMensaje("❌ Error al eliminar");
        setTimeout(() => setMensaje(''), 2000);
      }
    }
  };

  // ==================== Tooltip táctil (móvil) ====================
  const handleMarkerClick = (e, hab, ocup, estilo) => {
    e.stopPropagation();
    if (modoEdicion) return;
    setTooltipHabitacion(prev => prev?.hab.id === hab.id ? null : { hab, ocup, estilo });
  };

  // ==================== Context menu (click derecho) ====================
  // eslint-disable-next-line no-unused-vars
  const handleContextMenu = (e, habId, nombre) => {
    e.preventDefault();
    if (!modoEdicion) return;
    const opcion = prompt(`Habitación: ${nombre}\n\n1 - Editar número\n2 - Eliminar posición\n\nIngresa 1 o 2:`);
    if (opcion === '1') editarHabitacion(habId, nombre);
    else if (opcion === '2') eliminarHabitacionPos(habId, nombre);
  };

  // ==================== RENDER ====================
  if (cargando) {
    return (
      <div className="bg-slate-800 rounded-xl p-12 text-center">
        <div className="animate-pulse">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-400">Cargando habitaciones...</p>
        </div>
      </div>
    );
  }

  if (!croquis) {
    return (
      <div className="bg-slate-800 rounded-xl p-8 text-center border border-dashed border-slate-600">
        <div className="text-6xl mb-4">🗺️</div>
        <h3 className="text-xl font-bold text-white mb-2">Plano no disponible</h3>
        <p className="text-slate-400 mb-4">Sube la imagen del plano para {pisoNombre}</p>
        {!esVisualizador && (
          <label className="cursor-pointer bg-blue-600 hover:bg-blue-500 px-6 py-3 rounded-xl text-sm font-bold inline-flex items-center gap-2 transition-all">
            📤 Subir plano (PNG/JPG)
            <input type="file" accept="image/png,image/jpeg,image/jpg" className="hidden" onChange={(e) => e.target.files[0] && subirCroquis(e.target.files[0])} />
          </label>
        )}
        {esVisualizador && (
          <p className="text-yellow-500 text-sm mt-2">Modo visualización - No se pueden subir croquis</p>
        )}
      </div>
    );
  }

  return (
    <div className="bg-slate-900 rounded-2xl overflow-hidden border border-slate-700">
      {/* Header con estadísticas HNPM */}
      <div className="flex flex-col md:flex-row justify-center md:justify-between items-center p-4 border-b border-slate-700 gap-3">
        <div className="md:order-1">
          <h3 className="text-xl font-bold text-blue-400">{pisoNombre}</h3>
          {!esVisualizador && (
            <p className="text-xs text-slate-500">{modoEdicion ? (modoMovimiento ? '🖱️ Modo Movimiento' : '✎ Modo Edición') : '👁️ Modo Visualización'}</p>
          )}
        </div>
        
        {/* Estadísticas HNPM Globales */}
        <div className="bg-slate-800/50 rounded-xl px-4 py-2 text-center md:order-2 flex-1 md:flex-none">
          <div className="flex gap-6 justify-center flex-wrap">
            <div>
              <p className="text-[10px] text-green-400 font-bold uppercase tracking-wider">TOTAL DE CAMAS HNPM</p>
              <p className="text-2xl font-black text-green-400">{estadisticasGlobales.totalCamas}</p>
            </div>
            <div className="border-l border-slate-700 pl-6">
              <p className="text-[10px] text-yellow-400 font-bold uppercase tracking-wider">CAMAS OCUPADAS POR PACIENTES</p>
              <p className="text-2xl font-black text-yellow-400">{estadisticasGlobales.camasOcupadasReales}</p>
            </div>
            <div className="border-l border-slate-700 pl-6">
              <p className="text-[10px] text-red-500 font-bold uppercase tracking-wider">CAMAS NO UTILIZADAS POR AISLACIÓN</p>
              <p className="text-2xl font-black text-red-500">{estadisticasGlobales.camasNoUtilizadasPorAislamiento}</p>
            </div>
            <div className="border-l border-slate-700 pl-6">
              <p className="text-[10px] text-blue-400 font-bold uppercase tracking-wider">OCUPACIÓN PRACTICA</p>
              <p className="text-2xl font-black text-blue-400">{estadisticasGlobales.porcentajePractico.toFixed(0)}%</p>
            </div>
            <div className="border-l border-slate-700 pl-6">
              <p className="text-[10px] text-emerald-300 font-bold uppercase tracking-wider">CAMAS DISPONIBLES</p>
              <p className="text-2xl font-black text-emerald-300">{estadisticasGlobales.camasDisponibles}</p>
            </div>
          </div>
        </div>
        
        <div className="flex gap-2 flex-wrap md:order-3">
          {!esVisualizador && (
            <>
              <button onClick={() => { setModoEdicion(!modoEdicion); setModoMovimiento(false); if (!modoEdicion) setPosicion({ x: 0, y: 0 }); }} className={`px-4 py-2 rounded-lg text-sm font-bold ${modoEdicion && !modoMovimiento ? 'bg-green-600' : 'bg-yellow-600'}`}>
                {modoEdicion && !modoMovimiento ? '✓ Terminar' : '✎ Editar'}
              </button>
              {modoEdicion && (<button onClick={() => setModoMovimiento(!modoMovimiento)} className={`px-4 py-2 rounded-lg text-sm font-bold ${modoMovimiento ? 'bg-blue-600' : 'bg-slate-700'}`}>🖱️ {modoMovimiento ? 'ON' : 'OFF'}</button>)}
              <button onClick={eliminarCroquis} className="px-4 py-2 rounded-lg text-sm font-bold bg-red-600 hover:bg-red-500 transition-all">🗑️ Eliminar</button>
            </>
          )}
        </div>
      </div>

      {/* Estadísticas del piso actual - NUEVO DISEÑO */}
      {estadisticas.totalCamas > 0 && (
        <div className="bg-slate-800/50 p-3 mx-4 mt-2 rounded-lg">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex gap-4 flex-wrap">
                <span className="text-green-400">Camas en piso: {estadisticas.totalCamas}</span>
                <span className="text-yellow-400">Camas ocupadas con pacientes: {estadisticas.camasOcupadasReales}</span>
                <span className="text-red-500">Camas bloqueadas por aislamiento: {estadisticas.camasBloqueadasAislamiento}</span>
                <span className="text-emerald-300">Disponibles en piso: {estadisticas.camasDisponibles}</span>
                <span className="text-blue-400">Ocupación práctica: {estadisticas.porcentajePractico.toFixed(1)}%</span>
              </div>
              {estadisticas.habitacionesActivas > 0 && (
                <div className="text-sm text-red-500">
                  {estadisticas.habitacionesAisladas} habitaciones aisladas de {estadisticas.habitacionesActivas} activas para internación
                </div>
              )}
            </div>
            {ultimaActualizacion && (
              <div className="text-xs uppercase text-slate-400 tracking-[0.12em]">
                Última actualización: {ultimaActualizacion.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }).toUpperCase()} {ultimaActualizacion.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })} hs
              </div>
            )}
          </div>
          <div className="w-full bg-slate-700 rounded-full h-2 mt-2">
            <div className="bg-green-500 h-2 rounded-full transition-all duration-500" style={{ width: `${estadisticas.porcentajePractico}%` }}></div>
          </div>
        </div>
      )}

      <div 
        ref={containerRef}
        className="relative overflow-auto bg-slate-950"
        style={{ 
          height: 'auto', 
          maxHeight: '80vh',
          minHeight: 'min(400px, 60vh)'
        }}
      >
        <div
          style={{
            transform: `translate(${posicion.x}px, ${posicion.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
            transition: arrastrando ? 'none' : 'transform 0.1s ease-out',
            width: 'fit-content',
            cursor: modoMovimiento ? 'grab' : (modoEdicion ? 'crosshair' : 'default')
          }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <img
            ref={imageRef}
            src={croquis.imagen_url}
            alt={`Croquis ${pisoNombre}`}
            className="w-auto h-auto"
            style={{ 
              maxWidth: '100%',
              pointerEvents: modoEdicion && !modoMovimiento ? 'auto' : 'none'
            }}
            onClick={handleImageClick}
            draggable={false}
            onLoad={() => {
              if (imageRef.current) {
                const w = imageRef.current.getBoundingClientRect().width;
                if (w > 0) setImgRenderedWidth(w);
              }
              setMarcadoresKey(prev => prev + 1);
            }}
          />
          
          {/* Marcadores de habitaciones - con key para forzar re-render */}
          <React.Fragment key={marcadoresKey}>
            {habitaciones.map(hab => {
              const coord = coordenadas[hab.id];
              if (!coord) return null;
              
              const ocup = ocupacion[hab.id];
              const estilo = getColorPorTipoYOcupacion(hab, ocup);
              const aislamientoActivo = ocup?.tipo_habitacion === 'activa' && esAislamientoPatologia(ocup?.observaciones);
              
              let displayTexto = '';
              if (!ocup) {
                displayTexto = '?';
              } else if (ocup.tipo_habitacion === 'activa') {
                const totalCamas = ocup.total_camas || 0;
                if (totalCamas === 0) {
                  displayTexto = '🚫';
                } else {
                  displayTexto = ocup.camas_ocupadas;
                }
              } else if (ocup.tipo_habitacion === 'reparacion') {
                displayTexto = '🔧';
              } else {
                displayTexto = '';
              }
              
              // Escalar el marcador proporcionalmente al ancho renderizado de la imagen.
              // Se renderiza a tamaño base (legible) y se reduce con scale() para
              // evitar el mínimo de fuente del browser en pantallas pequeñas.
              const BASE_W = 38;
              const BASE_H = 60;
              const markerScale = Math.min(1, Math.max(0.42, (imgRenderedWidth * 0.028) / BASE_W));

              return (
                <div
                  key={hab.id}
                  data-habitacion-id={hab.id}
                  className={`marcador-habitacion absolute rounded-md border-2 ${estilo.bg} ${estilo.text} flex flex-col items-center justify-center font-bold shadow-lg ${modoEdicion ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${estilo.blink ? 'animate-pulse' : ''}`}
                  style={{
                    left: `${(coord.x / (imageRef.current?.naturalWidth || 1)) * 100}%`,
                    top: `${(coord.y / (imageRef.current?.naturalHeight || 1)) * 100}%`,
                    width: `${BASE_W}px`,
                    height: `${BASE_H}px`,
                    transform: `translate(-50%, -50%) scale(${markerScale.toFixed(3)})`,
                    transformOrigin: 'center center',
                    padding: '2px 1px',
                    zIndex: aislamientoActivo ? 40 : 10,
                    ...estilo.style
                  }}
                  title={`${hab.nombre} - ${estilo.title}`}
                  onClick={(e) => handleMarkerClick(e, hab, ocup, estilo)}
                >
                  {aislamientoActivo && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-red-600 border border-red-300 text-[9px] leading-[14px] text-white font-black text-center shadow-lg">
                      !
                    </span>
                  )}
                  <span className="text-[9px] font-bold leading-none truncate w-full text-center px-0.5">{hab.nombre}</span>
                  <span className="text-[14px] font-black leading-none">{displayTexto}</span>
                </div>
              );
            })}
          </React.Fragment>
        </div>
      </div>

      <div className="p-3 border-t border-slate-700">
        <div className="flex flex-wrap justify-between items-center gap-2">
          <div className="flex gap-4 text-xs">
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></div> Disponible</span>
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-blue-500"></div> Ocupada</span>
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-red-500"></div> Aislamiento</span>
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-yellow-500"></div> Reparación</span>
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-gray-500"></div> Otros</span>
          </div>
          {!esVisualizador && (
            <div className="text-xs text-slate-500">
              {`🔍 Zoom: ${Math.round(zoom * 100)}% | 🖱️ ${modoMovimiento ? 'Arrastra marcadores' : (modoEdicion ? 'Click para posicionar' : 'Solo visualización')}`}
            </div>
          )}
        </div>
        {mensaje && <p className="text-center text-sm mt-2 text-blue-400">{mensaje}</p>}
      </div>

      {/* Tooltip táctil para móvil - renderizado via Portal, posicionado con VisualViewport para funcionar con pinch-zoom */}
      {tooltipHabitacion && ReactDOM.createPortal(
        <div
          style={{
            position: 'fixed',
            left: vp.left,
            top: vp.top,
            width: vp.width,
            height: vp.height,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'flex-end',
            touchAction: 'none',
          }}
          onClick={() => setTooltipHabitacion(null)}
        >
          <div
            className="bg-slate-800 border-t border-slate-600 rounded-t-2xl p-5 shadow-2xl"
            style={{
              width: `${vp.width * vp.scale}px`,
              transform: `scale(${1 / vp.scale})`,
              transformOrigin: 'bottom left',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">Habitación</p>
                <h4 className="text-white font-bold text-lg">
                  {tooltipHabitacion.hab.nombre}
                  {tooltipHabitacion.ocup?.tipo_habitacion === 'activa' && tooltipHabitacion.ocup?.informacion_ampliatoria
                    ? ` - ${tooltipHabitacion.ocup.informacion_ampliatoria}`
                    : ''}
                </h4>
              </div>
              <button
                onClick={() => setTooltipHabitacion(null)}
                className="w-8 h-8 bg-slate-700 rounded-full text-slate-300 text-xl font-bold flex items-center justify-center"
              >
                ×
              </button>
            </div>
            <p className="text-sm text-slate-300 whitespace-pre-line leading-relaxed">
              {tooltipHabitacion.ocup?.tipo_habitacion === 'activa'
                ? tooltipHabitacion.estilo.title.split('\n').slice(1).join('\n')
                : tooltipHabitacion.estilo.title}
            </p>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default CroquisPiso;