// components/CroquisPiso.jsx
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';

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
  const [estadisticas, setEstadisticas] = useState({ totalCamas: 0, camasOcupadas: 0, porcentaje: 0 });
  const [estadisticasGlobales, setEstadisticasGlobales] = useState({ totalCamas: 0, camasOcupadas: 0, porcentaje: 0 });
  
  // Estados para zoom y arrastre
  const [zoom, setZoom] = useState(1);
  const [posicion, setPosicion] = useState({ x: 0, y: 0 });
  const [arrastrando, setArrastrando] = useState(false);
  const [puntoInicio, setPuntoInicio] = useState({ x: 0, y: 0 });
  const [habitacionArrastrada, setHabitacionArrastrada] = useState(null);
  
  // Estado para forzar re-render de marcadores
  const [marcadoresKey, setMarcadoresKey] = useState(0);
  
  // Estado para tooltip táctil
  const [tooltipVisible, setTooltipVisible] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  
  // Detectar si es móvil
  const [isMobile, setIsMobile] = useState(false);
  
  const imageRef = useRef(null);
  const containerRef = useRef(null);

  // Detectar tamaño de pantalla
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
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
    setEstadisticas({ totalCamas: 0, camasOcupadas: 0, porcentaje: 0 });
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
  }, [normalizedPisoId, cargarCroquis, cargarEstadisticasGlobales]);

  // ==================== Cargar ocupación cuando cambia fecha ====================
  useEffect(() => {
    if (habitaciones.length > 0 && pisoId && croquis) {
      cargarOcupacion();
    }
  }, [fechaSeleccionada, habitaciones, croquis, cargarOcupacion]);

  // ==================== Calcular estadísticas cuando cambia ocupación ====================
  useEffect(() => {
    if (habitaciones.length > 0) {
      calcularEstadisticas();
    }
  }, [ocupacion, habitaciones, calcularEstadisticas]);

  // ==================== Sincronizar habitaciones cuando cambian externamente ====================
  useEffect(() => {
    if (habitaciones && habitaciones.length > 0 && croquis) {
      console.log(`📋 Sincronizando ${habitaciones.length} habitaciones para piso ${pisoId}`);
      calcularEstadisticas();
      // Verificar cuántas habitaciones tienen coordenadas
      const conCoordenadas = habitaciones.filter(hab => coordenadas[hab.id]).length;
      console.log(`📍 Habitaciones con coordenadas: ${conCoordenadas}/${habitaciones.length}`);
    }
  }, [habitaciones, croquis, calcularEstadisticas, coordenadas, pisoId]);

  // ==================== Forzar re-render cuando coordenadas estén listas ====================
  useEffect(() => {
    if (!cargando && !cargandoCoordenadas && croquis && habitaciones.length > 0) {
      console.log('✅ Todo listo - coordenadas:', Object.keys(coordenadas).length);
      // Forzar re-render de los marcadores
      setMarcadoresKey(prev => prev + 1);
    }
  }, [cargando, cargandoCoordenadas, croquis, habitaciones, coordenadas]);

  // ==================== Cargar estadísticas globales ====================
  const cargarEstadisticasGlobales = async () => {
    try {
      const { data: todasHabitaciones, error: habError } = await supabase
        .from('habitaciones_especiales')
        .select('id, piso_id, nombre');
      
      if (habError) throw habError;
      
      if (!todasHabitaciones || todasHabitaciones.length === 0) {
        setEstadisticasGlobales({ totalCamas: 0, camasOcupadas: 0, porcentaje: 0 });
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
      let camasOcupadasGlobal = 0;
      
      todasHabitaciones.forEach(hab => {
        const ocup = ocupMap[hab.id];
        if (ocup && ocup.tipo_habitacion === 'activa') {
          totalCamasGlobal += ocup.total_camas || 1;
          camasOcupadasGlobal += ocup.camas_ocupadas || 0;
        }
      });
      
      const porcentajeGlobal = totalCamasGlobal > 0 ? (camasOcupadasGlobal / totalCamasGlobal) * 100 : 0;
      
      setEstadisticasGlobales({
        totalCamas: totalCamasGlobal,
        camasOcupadas: camasOcupadasGlobal,
        porcentaje: porcentajeGlobal
      });
      
    } catch (error) {
      console.error("Error cargando estadísticas globales:", error);
    }
  };

  // ==================== Calcular estadísticas del piso ====================
  const calcularEstadisticas = () => {
    let totalCamas = 0;
    let camasOcupadas = 0;
    
    habitaciones.forEach(hab => {
      const ocup = ocupacion[hab.id];
      if (ocup && ocup.tipo_habitacion === 'activa') {
        totalCamas += ocup.total_camas || 1;
        camasOcupadas += ocup.camas_ocupadas || 0;
      }
    });
    
    const porcentaje = totalCamas > 0 ? (camasOcupadas / totalCamas) * 100 : 0;
    setEstadisticas({ totalCamas, camasOcupadas, porcentaje });
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

  // ==================== Manejo de tooltip táctil ====================
  const handleTouchStart = (e, hab, ocup, estilo) => {
    e.stopPropagation();
    if (modoEdicion) return;
    
    const touch = e.touches[0];
    setTooltipPosition({ x: touch.clientX, y: touch.clientY - 60 });
    setTooltipVisible(estilo.title);
    
    setTimeout(() => setTooltipVisible(null), 4000);
  };

  const handleCloseTooltip = () => {
    setTooltipVisible(null);
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
        const camasOcupadas = ocup.camas_ocupadas || 0;
        const camasDisponibles = totalCamas - camasOcupadas;
        const parpadeo = camasDisponibles > 0 && totalCamas > 0;
        
        const fechaActualizacion = ocup.actualizado_en || ocup.created_at;
        const fechaObj = new Date(fechaActualizacion);
        const fechaFormateada = fechaObj.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' });
        const horaFormateada = fechaObj.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
        
        const infoAmpliatoria = ocup.informacion_ampliatoria || 'Sin especialidad';
        
        let titleText = '';
        if (totalCamas === 0) {
          titleText = `${infoAmpliatoria}\n🚫 Sin camas asignadas\n📅 ${fechaFormateada} ${horaFormateada} hs`;
        } else {
          titleText = `${infoAmpliatoria}\n🛏️ ${camasOcupadas}/${totalCamas} camas ocupadas, ${camasDisponibles} disponibles\n📅 ${fechaFormateada} ${horaFormateada} hs`;
        }
        
        return {
          bg: 'border-green-400',
          text: 'text-white',
          blink: parpadeo,
          title: titleText,
          style: { backgroundColor: 'rgba(32, 205, 10, 0.9)' }
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

  // ==================== Context menu (click derecho) ====================
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
          <p className="text-slate-400">Cargando croquis...</p>
        </div>
      </div>
    );
  }

  if (!croquis) {
    return (
      <div className="bg-slate-800 rounded-xl p-8 text-center border border-dashed border-slate-600">
        <div className="text-6xl mb-4">🗺️</div>
        <h3 className="text-xl font-bold text-white mb-2">Croquis no disponible</h3>
        <p className="text-slate-400 mb-4">Sube la imagen del croquis para {pisoNombre}</p>
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
          <p className="text-xs text-slate-500">{esVisualizador ? '👁️ Modo Visualización' : (modoEdicion ? (modoMovimiento ? '🖱️ Modo Movimiento' : '✎ Modo Edición') : '👁️ Modo Visualización')}</p>
        </div>
        
        {/* Estadísticas HNPM Globales */}
        <div className="bg-slate-800/50 rounded-xl px-4 py-2 text-center md:order-2 flex-1 md:flex-none">
          <div className="flex gap-6 justify-center">
            <div>
              <p className="text-[10px] text-green-400 font-bold uppercase tracking-wider">TOTAL CAMAS HNPM</p>
              <p className="text-2xl font-black text-green-400">{estadisticasGlobales.totalCamas}</p>
            </div>
            <div className="border-l border-slate-700 pl-6">
              <p className="text-[10px] text-yellow-400 font-bold uppercase tracking-wider">CAMAS OCUPADAS HNPM</p>
              <p className="text-2xl font-black text-yellow-400">{estadisticasGlobales.camasOcupadas}</p>
            </div>
            <div className="border-l border-slate-700 pl-6">
              <p className="text-[10px] text-blue-400 font-bold uppercase tracking-wider">OCUPACIÓN GLOBAL</p>
              <p className="text-2xl font-black text-blue-400">{estadisticasGlobales.porcentaje.toFixed(0)}%</p>
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

      {/* Estadísticas del piso actual */}
      {estadisticas.totalCamas > 0 && (
        <div className="bg-slate-800/50 p-3 mx-4 mt-2 rounded-lg">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
            <div className="flex gap-4 text-sm">
              <span className="text-green-400">Camas en este piso: {estadisticas.totalCamas}</span>
              <span className="text-yellow-400">Ocupadas: {estadisticas.camasOcupadas}</span>
              <span className="text-blue-400">{estadisticas.porcentaje.toFixed(1)}% ocupación</span>
            </div>
            {ultimaActualizacion && (
              <div className="text-xs uppercase text-slate-400 tracking-[0.12em]">
                Última actualización: {ultimaActualizacion.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
          </div>
          <div className="w-full bg-slate-700 rounded-full h-2 mt-2">
            <div className="bg-green-500 h-2 rounded-full transition-all duration-500" style={{ width: `${estadisticas.porcentaje}%` }}></div>
          </div>
        </div>
      )}

      <div 
        ref={containerRef}
        className="relative overflow-auto bg-slate-950"
        style={{ 
          height: 'auto', 
          maxHeight: isMobile ? '70vh' : '80vh',
          minHeight: isMobile ? '300px' : '400px',
          WebkitOverflowScrolling: 'touch'
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
          />
          
          {/* Tooltip táctil para móvil */}
          {tooltipVisible && isMobile && (
            <div 
              className="fixed z-50 bg-slate-900 text-white text-xs rounded-lg p-2 shadow-xl border border-slate-600 max-w-[220px]"
              style={{ 
                left: `${tooltipPosition.x}px`, 
                top: `${tooltipPosition.y}px`,
                transform: 'translateX(-50%)'
              }}
            >
              <button 
                onClick={handleCloseTooltip}
                className="absolute top-0 right-1 text-slate-400 text-lg hover:text-white"
              >
                ×
              </button>
              <div className="whitespace-pre-line text-center mt-1">
                {tooltipVisible}
              </div>
            </div>
          )}
          
          {/* Marcadores de habitaciones - con key para forzar re-render */}
          <React.Fragment key={marcadoresKey}>
            {habitaciones.map(hab => {
              const coord = coordenadas[hab.id];
              if (!coord) return null;
              
              const ocup = ocupacion[hab.id];
              const estilo = getColorPorTipoYOcupacion(hab, ocup);
              
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
              
              // Tamaños responsive
              const markerWidth = isMobile ? 'min(4%, 50px)' : 'min(2.2%, 34px)';
              const markerHeight = isMobile ? 'min(10%, 70px)' : 'min(6.5%, 55px)';
              const minWidth = isMobile ? '45px' : '32px';
              const minHeight = isMobile ? '60px' : '48px';
              const fontSizeNumber = isMobile ? 'clamp(11px, 3vw, 16px)' : 'clamp(9px, 1.8vw, 14px)';
              const fontSizeCount = isMobile ? 'clamp(14px, 3.5vw, 18px)' : 'clamp(12px, 2.2vw, 18px)';
              
              return (
                <div
                  key={hab.id}
                  data-habitacion-id={hab.id}
                  className={`marcador-habitacion absolute rounded-md border-2 ${estilo.bg} ${estilo.text} flex flex-col items-center justify-center font-bold shadow-lg transition-all hover:scale-105 ${modoEdicion ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${estilo.blink ? 'animate-pulse' : ''}`}
                  style={{
                    left: `${(coord.x / (imageRef.current?.naturalWidth || 1)) * 100}%`,
                    top: `${(coord.y / (imageRef.current?.naturalHeight || 1)) * 100}%`,
                    width: markerWidth,
                    height: markerHeight,
                    transform: 'translate(-50%, -50%)',
                    minWidth: minWidth,
                    minHeight: minHeight,
                    padding: '2px 0',
                    ...estilo.style
                  }}
                  title={!isMobile ? estilo.title : ''}
                  onTouchStart={(e) => isMobile && handleTouchStart(e, hab, ocup, estilo)}
                  onClick={(e) => {
                    if (isMobile && !modoEdicion) {
                      handleTouchStart(e, hab, ocup, estilo);
                    }
                  }}
                  onContextMenu={(e) => handleContextMenu(e, hab.id, hab.nombre)}
                >
                  <span className="font-bold" style={{ fontSize: fontSizeNumber }}>{hab.nombre}</span>
                  <span className="font-black leading-none" style={{ fontSize: fontSizeCount }}>{displayTexto}</span>
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
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-green-500"></div> Ocupada</span>
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-yellow-500"></div> Reparación</span>
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-gray-500"></div> Otros</span>
          </div>
          <div className="text-xs text-slate-500">
            {esVisualizador ? '🔍 Solo visualización - Click derecho para ver detalles' : `🔍 Zoom: ${Math.round(zoom * 100)}% | 🖱️ ${modoMovimiento ? 'Arrastra marcadores' : (modoEdicion ? 'Click para posicionar' : 'Solo visualización')}`}
          </div>
        </div>
        {isMobile && !esVisualizador && (
          <p className="text-center text-xs text-blue-400 mt-2">
            💡 Toca una habitación para ver los detalles
          </p>
        )}
        {mensaje && <p className="text-center text-sm mt-2 text-blue-400">{mensaje}</p>}
      </div>
    </div>
  );
};

export default CroquisPiso;