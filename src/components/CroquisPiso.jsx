// components/CroquisPiso.jsx
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';

const CroquisPiso = ({ pisoId, pisoNombre, habitaciones }) => {
  // Estados principales
  const [croquis, setCroquis] = useState(null);
  const [coordenadas, setCoordenadas] = useState({});
  const [modoEdicion, setModoEdicion] = useState(false);
  const [modoMovimiento, setModoMovimiento] = useState(false);
  const [ocupacion, setOcupacion] = useState({});
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState('');
  const [fechaSeleccionada, setFechaSeleccionada] = useState(new Date().toISOString().split('T')[0]);
  const [estadisticas, setEstadisticas] = useState({ totalCamas: 0, camasOcupadas: 0, porcentaje: 0 });
  const [mostrarEstadisticas, setMostrarEstadisticas] = useState(true);
  
  // Estados para zoom y arrastre
  const [zoom, setZoom] = useState(1);
  const [posicion, setPosicion] = useState({ x: 0, y: 0 });
  const [arrastrando, setArrastrando] = useState(false);
  const [puntoInicio, setPuntoInicio] = useState({ x: 0, y: 0 });
  const [habitacionArrastrada, setHabitacionArrastrada] = useState(null);
  
  const imageRef = useRef(null);
  const containerRef = useRef(null);

  // RESETEAR cuando cambia el piso
  useEffect(() => {
    // Resetear todos los estados cuando cambia el piso
    setCroquis(null);
    setCoordenadas({});
    setOcupacion({});
    setCargando(true);
    setZoom(1);
    setPosicion({ x: 0, y: 0 });
    setModoEdicion(false);
    setModoMovimiento(false);
    
    // Cargar nuevo croquis
    cargarCroquis();
  }, [pisoId]); // 👈 Dependencia en pisoId

  // Cargar ocupación al cambiar fecha o piso
  useEffect(() => {
    if (habitaciones.length > 0 && pisoId) {
      cargarOcupacion();
    }
  }, [fechaSeleccionada, pisoId, habitaciones]);

  // Calcular estadísticas cuando cambia ocupación
  useEffect(() => {
    if (Object.keys(ocupacion).length > 0 || habitaciones.length > 0) {
      calcularEstadisticas();
    }
  }, [ocupacion, habitaciones]);

  useEffect(() => {
  // Limpiar completamente cuando cambia el piso
  return () => {
    // Cleanup function que se ejecuta antes del próximo render
    setCroquis(null);
    setCoordenadas({});
    setOcupacion({});
    setCargando(true);
    setEstadisticas({ totalCamas: 0, camasOcupadas: 0, porcentaje: 0 });
  };
}, [pisoId]);

  // Calcular estadísticas de camas
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

  // Manejar zoom con rueda
  const handleWheel = (e) => {
    if (!modoEdicion) return;
    
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom(prev => Math.min(Math.max(prev + delta, 0.5), 3));
  };

  // Manejar inicio de arrastre
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

  // Editar número de habitación
  const editarHabitacion = async (habitacionId, nombreActual) => {
    const nuevoNombre = prompt(
      `Editar habitación\n\nActual: ${nombreActual}\n\nIngresa el nuevo número de habitación:`,
      nombreActual
    );
    
    if (nuevoNombre && nuevoNombre !== nombreActual) {
      const existe = habitaciones.some(h => h.nombre === nuevoNombre && h.id !== habitacionId);
      if (existe) {
        setMensaje(`❌ La habitación ${nuevoNombre} ya existe`);
        setTimeout(() => setMensaje(''), 2000);
        return;
      }
      
      try {
        const { error } = await supabase
          .from('habitaciones_especiales')
          .update({ 
            nombre: nuevoNombre,
            slug: `${pisoId}-${nuevoNombre.toLowerCase()}`
          })
          .eq('id', habitacionId);
        
        if (error) throw error;
        
        setMensaje(`✅ Habitación actualizada a ${nuevoNombre}`);
        setTimeout(() => setMensaje(''), 1500);
        
        // Recargar para actualizar
        window.location.reload();
        
      } catch (error) {
        console.error("Error:", error);
        setMensaje("❌ Error al actualizar habitación");
        setTimeout(() => setMensaje(''), 2000);
      }
    }
  };

  // Eliminar posición de habitación
  const eliminarHabitacion = async (habitacionId, nombre) => {
    if (window.confirm(`¿Eliminar la habitación "${nombre}" del croquis?\n\nSolo se eliminará su posición, no la habitación de la base de datos.`)) {
      try {
        const { error } = await supabase
          .from('habitacion_coordenadas')
          .delete()
          .eq('habitacion_id', habitacionId)
          .eq('croquis_id', croquis.id);
        
        if (error) throw error;
        
        setCoordenadas(prev => {
          const nuevas = { ...prev };
          delete nuevas[habitacionId];
          return nuevas;
        });
        
        setMensaje(`✅ Posición de ${nombre} eliminada`);
        setTimeout(() => setMensaje(''), 1500);
        
      } catch (error) {
        console.error("Error:", error);
        setMensaje("❌ Error al eliminar posición");
        setTimeout(() => setMensaje(''), 2000);
      }
    }
  };

  const cargarOcupacion = async () => {
    if (!habitaciones.length || !pisoId) return;
    
    try {
      const { data, error } = await supabase
        .from('ocupacion_habitaciones')
        .select('*')
        .eq('fecha', fechaSeleccionada)
        .in('habitacion_id', habitaciones.map(h => h.id));

      if (error) throw error;

      const ocupMap = {};
      data?.forEach(occ => {
        ocupMap[occ.habitacion_id] = occ;
      });
      setOcupacion(ocupMap);
    } catch (error) {
      console.error("Error cargando ocupación:", error);
    }
  };

  const cargarCroquis = async () => {
    if (!pisoId) return;
    
    setCargando(true);
    try {
      const { data: croquisData } = await supabase
        .from('croquis_pisos')
        .select('*')
        .eq('piso_id', pisoId)
        .eq('activo', true)
        .order('version', { ascending: false })
        .maybeSingle();

      if (croquisData) {
        setCroquis(croquisData);
        
        const { data: coords } = await supabase
          .from('habitacion_coordenadas')
          .select('*')
          .eq('croquis_id', croquisData.id);
        
        const coordsMap = {};
        coords?.forEach(c => {
          coordsMap[c.habitacion_id] = { x: c.x, y: c.y, ancho: c.ancho, alto: c.alto };
        });
        setCoordenadas(coordsMap);
      } else {
        setCroquis(null);
      }
    } catch (error) {
      console.error("Error cargando croquis:", error);
      setCroquis(null);
    } finally {
      setCargando(false);
    }
  };

  const eliminarCroquis = async () => {
    if (!croquis) return;
    
    const confirmar = window.confirm(
      `⚠️ ¿ELIMINAR CROQUIS?\n\nPiso: ${pisoNombre}\nSe eliminarán también todas las coordenadas.\n\nEsta acción NO SE PUEDE DESHACER.`
    );
    
    if (!confirmar) return;
    
    setMensaje("🗑️ Eliminando croquis...");
    
    try {
      await supabase.from('habitacion_coordenadas').delete().eq('croquis_id', croquis.id);
      await supabase.from('croquis_pisos').delete().eq('id', croquis.id);
      await supabase.storage.from('croquis').remove([croquis.nombre_archivo]);
      
      setMensaje("✅ Croquis eliminado correctamente");
      setCroquis(null);
      setCoordenadas({});
      setTimeout(() => setMensaje(''), 2000);
      
    } catch (error) {
      console.error("Error:", error);
      setMensaje("❌ Error al eliminar croquis");
      setTimeout(() => setMensaje(''), 2000);
    }
  };

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
      
    } catch (error) {
      console.error("Error guardando coordenada:", error);
      throw error;
    }
  };

  const handleImageClick = async (e) => {
    if (!modoEdicion || modoMovimiento || arrastrando) return;
    
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

  const getColorPorTipoYOcupacion = (habitacion, ocup) => {
    if (!ocup) return { bg: 'bg-gray-500/50 border-gray-400', text: 'text-white', blink: false, title: 'Sin registrar' };
    
    switch (ocup.tipo_habitacion) {
      case 'reparacion':
        return { 
          bg: 'bg-yellow-500/80 border-yellow-400', 
          text: 'text-black', 
          blink: false,
          title: 'En reparación'
        };
      case 'otros':
        return { 
          bg: 'bg-gray-500/80 border-gray-400', 
          text: 'text-white', 
          blink: false,
          title: ocup.observaciones || 'Otros'
        };
      case 'activa':
        const camasDisponibles = (ocup.total_camas || 1) - (ocup.camas_ocupadas || 0);
        const parpadeo = camasDisponibles > 0;
        return {
          bg: 'bg-green-500/80 border-green-400',
          text: 'text-white',
          blink: parpadeo,
          title: `${ocup.camas_ocupadas}/${ocup.total_camas} camas ocupadas, ${camasDisponibles} disponibles`
        };
      default:
        return { bg: 'bg-gray-500/50 border-gray-400', text: 'text-white', blink: false, title: 'Sin estado' };
    }
  };

  // Click derecho para editar/eliminar
  const handleContextMenu = (e, habId, nombre) => {
    e.preventDefault();
    if (!modoEdicion) return;
    
    const opcion = prompt(
      `Habitación: ${nombre}\n\n` +
      `Opciones:\n` +
      `1 - Editar número\n` +
      `2 - Eliminar posición\n\n` +
      `Ingresa 1 o 2:`
    );
    
    if (opcion === '1') {
      editarHabitacion(habId, nombre);
    } else if (opcion === '2') {
      eliminarHabitacion(habId, nombre);
    }
  };

  if (cargando) {
    return (
      <div className="bg-slate-800 rounded-xl p-12 text-center">
        <div className="animate-pulse">
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
        <label className="cursor-pointer bg-blue-600 hover:bg-blue-500 px-6 py-3 rounded-xl text-sm font-bold inline-flex items-center gap-2">
          📤 Subir croquis (PNG/JPG)
          <input type="file" accept="image/png,image/jpeg,image/jpg" className="hidden" onChange={(e) => e.target.files[0] && subirCroquis(e.target.files[0])} />
        </label>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 rounded-2xl overflow-hidden border border-slate-700">
      {/* Header con controles */}
      <div className="flex flex-wrap justify-between items-center p-4 border-b border-slate-700 gap-3">
        <div>
          <h3 className="text-xl font-bold text-blue-400">{pisoNombre}</h3>
          <p className="text-xs text-slate-500">
            {modoEdicion ? (
              modoMovimiento ? '🖱️ Modo Movimiento - Arrastra marcadores | Click derecho para editar/eliminar' : '✎ Modo Edición - Click para posicionar | Click derecho para editar/eliminar'
            ) : '👁️ Modo Visualización'}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input type="date" value={fechaSeleccionada} onChange={(e) => setFechaSeleccionada(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white" />
          
          <button
            onClick={() => {
              setModoEdicion(!modoEdicion);
              setModoMovimiento(false);
              if (!modoEdicion) setPosicion({ x: 0, y: 0 });
            }}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${modoEdicion && !modoMovimiento ? 'bg-green-600' : 'bg-yellow-600'}`}
          >
            {modoEdicion && !modoMovimiento ? '✓ Terminar Edición' : '✎ Editar posiciones'}
          </button>
          
          {modoEdicion && (
            <button
              onClick={() => setModoMovimiento(!modoMovimiento)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${modoMovimiento ? 'bg-blue-600' : 'bg-slate-700'}`}
            >
              🖱️ {modoMovimiento ? 'Modo Movimiento ON' : 'Modo Movimiento OFF'}
            </button>
          )}
          
          <button onClick={eliminarCroquis} className="px-4 py-2 rounded-lg text-sm font-bold bg-red-600 hover:bg-red-500">
            🗑️ Eliminar
          </button>
        </div>
      </div>

      {/* Panel de estadísticas */}
      {mostrarEstadisticas && estadisticas.totalCamas > 0 && (
        <div className="bg-slate-800/50 p-3 mx-4 mt-2 rounded-lg">
          <div className="flex justify-between items-center">
            <div className="flex gap-4 text-sm">
              <span className="text-green-400">🛏️ Total camas: {estadisticas.totalCamas}</span>
              <span className="text-yellow-400">👥 Ocupadas: {estadisticas.camasOcupadas}</span>
              <span className="text-blue-400">📊 Ocupación: {estadisticas.porcentaje.toFixed(1)}%</span>
            </div>
            <button
              onClick={() => setMostrarEstadisticas(false)}
              className="text-xs text-slate-500 hover:text-white"
            >
              ✖️
            </button>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-2 mt-2">
            <div 
              className="bg-green-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${estadisticas.porcentaje}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Área del croquis con zoom y arrastre */}
      <div 
        ref={containerRef}
        className="relative overflow-hidden bg-slate-950 mt-2"
        style={{ height: '70vh', cursor: modoMovimiento ? 'grab' : (modoEdicion ? 'crosshair' : 'default') }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          style={{
            transform: `translate(${posicion.x}px, ${posicion.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
            transition: arrastrando ? 'none' : 'transform 0.1s ease-out'
          }}
        >
          <img
            ref={imageRef}
            src={croquis.imagen_url}
            alt={`Croquis ${pisoNombre}`}
            className="w-full h-auto"
            onClick={handleImageClick}
            style={{ pointerEvents: modoEdicion && !modoMovimiento ? 'auto' : 'none' }}
            draggable={false}
          />
          
          {/* Marcadores de habitaciones */}
          {habitaciones.map(hab => {
            const coord = coordenadas[hab.id];
            if (!coord) return null;
            
            const ocup = ocupacion[hab.id];
            const estilo = getColorPorTipoYOcupacion(hab, ocup);
            
            let displayTexto = '';
            if (!ocup) {
              displayTexto = '?';
            } else if (ocup.tipo_habitacion === 'activa') {
              displayTexto = ocup.camas_ocupadas;
            } else if (ocup.tipo_habitacion === 'reparacion') {
              displayTexto = '🔧';
            } else {
              displayTexto = '⚪';
            }
            
            return (
              <div
                key={hab.id}
                data-habitacion-id={hab.id}
                className={`marcador-habitacion absolute rounded-md border-2 ${estilo.bg} ${estilo.text} flex flex-col items-center justify-center font-bold shadow-lg transition-all hover:scale-105 ${modoEdicion ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${estilo.blink ? 'animate-pulse' : ''}`}
                style={{
                  left: `${(coord.x / (imageRef.current?.naturalWidth || 1)) * 100}%`,
                  top: `${(coord.y / (imageRef.current?.naturalHeight || 1)) * 100}%`,
                  width: 'min(2.2%, 34px)',
                  height: 'min(6.5%, 55px)',
                  transform: 'translate(-50%, -50%)',
                  minWidth: '32px',
                  minHeight: '48px',
                  padding: '2px 0'
                }}
                title={estilo.title}
                onContextMenu={(e) => handleContextMenu(e, hab.id, hab.nombre)}
              >
                <span className="text-[clamp(9px,1.8vw,14px)] font-bold">{hab.nombre}</span>
                <span className="text-[clamp(12px,2.2vw,18px)] font-black leading-none">{displayTexto}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Leyenda */}
      <div className="p-3 border-t border-slate-700">
        <div className="flex flex-wrap justify-between items-center gap-2">
          <div className="flex gap-4 text-xs">
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></div> Disponible</span>
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-green-500"></div> Ocupada</span>
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-yellow-500"></div> Reparación</span>
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-gray-500"></div> Otros</span>
          </div>
          <div className="text-xs text-slate-500">
            🔍 Zoom: {Math.round(zoom * 100)}% | 🖱️ {modoMovimiento ? 'Arrastra marcadores' : (modoEdicion ? 'Click para posicionar' : 'Solo visualización')}
          </div>
          {modoEdicion && (
            <p className="text-yellow-400 text-xs">
              {modoMovimiento ? '🖱️ Arrastra cualquier marcador para moverlo' : '✏️ Click en el croquis para posicionar nuevas habitaciones'}
              {' | '}🖱️ Click derecho sobre marcador para editar número o eliminar posición
            </p>
          )}
        </div>
        {mensaje && (
          <p className="text-center text-sm mt-2 text-blue-400">{mensaje}</p>
        )}
      </div>
    </div>
  );
};

export default CroquisPiso;