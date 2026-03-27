// components/CroquisPiso.jsx
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';

const CroquisPiso = ({ pisoId, pisoNombre, habitaciones }) => {
  const [croquis, setCroquis] = useState(null);
  const [coordenadas, setCoordenadas] = useState({});
  const [modoEdicion, setModoEdicion] = useState(false);
  const [ocupacion, setOcupacion] = useState({});
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState('');
  const [fechaSeleccionada, setFechaSeleccionada] = useState(new Date().toISOString().split('T')[0]);
  const imageRef = useRef(null);
  const containerRef = useRef(null);

  // Cargar ocupación
  useEffect(() => {
    cargarOcupacion();
  }, [fechaSeleccionada]);

  // Cargar croquis
  useEffect(() => {
    cargarCroquis();
  }, [pisoId]);

  const cargarOcupacion = async () => {
    if (!habitaciones.length) return;
    
    try {
      const { data, error } = await supabase
        .from('ocupacion_habitaciones')
        .select('habitacion_id, pacientes, observaciones')
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
        
        // Cargar coordenadas guardadas
        const { data: coords } = await supabase
          .from('habitacion_coordenadas')
          .select('*')
          .eq('croquis_id', croquisData.id);
        
        const coordsMap = {};
        coords?.forEach(c => {
          coordsMap[c.habitacion_id] = { x: c.x, y: c.y, ancho: c.ancho, alto: c.alto };
        });
        setCoordenadas(coordsMap);
      }
    } catch (error) {
      console.error("Error cargando croquis:", error);
    } finally {
      setCargando(false);
    }
  };

  const subirCroquis = async (file) => {
    if (!file) return;
    
    setMensaje("📤 Subiendo croquis...");
    
    try {
      const fileName = `croquis_${pisoId}_${Date.now()}.png`;
      
      // Subir a Supabase Storage
      const { data, error } = await supabase.storage
        .from('croquis')
        .upload(fileName, file);
      
      if (error) throw error;
      
      const { data: urlData } = supabase.storage
        .from('croquis')
        .getPublicUrl(fileName);
      
      // Guardar referencia en BD
      const { error: insertError } = await supabase
        .from('croquis_pisos')
        .insert({
          piso_id: pisoId,
          nombre_archivo: fileName,
          imagen_url: urlData.publicUrl,
          subido_en: new Date().toISOString()
        });
      
      if (insertError) throw insertError;
      
      setMensaje("✅ Croquis subido correctamente");
      setTimeout(() => setMensaje(''), 2000);
      cargarCroquis();
      
    } catch (error) {
      console.error("Error subiendo:", error);
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
          ancho: 60,
          alto: 60
        }, { onConflict: 'habitacion_id,croquis_id' });
      
      if (error) throw error;
      
      setCoordenadas(prev => ({ ...prev, [habitacionId]: { x, y, ancho: 60, alto: 60 } }));
      setMensaje(`✅ Posición guardada para habitación`);
      setTimeout(() => setMensaje(''), 1500);
      
    } catch (error) {
      console.error("Error guardando coordenada:", error);
      setMensaje("❌ Error al guardar posición");
      setTimeout(() => setMensaje(''), 1500);
    }
  };

  const handleImageClick = async (e) => {
    if (!modoEdicion || !croquis || !imageRef.current) return;
    
    const rect = imageRef.current.getBoundingClientRect();
    const imgElement = imageRef.current;
    const scaleX = imgElement.naturalWidth / rect.width;
    const scaleY = imgElement.naturalHeight / rect.height;
    
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    // Mostrar selector de habitaciones
    const habitacionNombre = prompt(
      `¿Qué habitación está en esta ubicación?\n\nHabitaciones disponibles:\n${habitaciones.map(h => `- ${h.nombre}`).join('\n')}\n\nIngresa el nombre exacto:`
    );
    
    if (habitacionNombre) {
      const hab = habitaciones.find(h => 
        h.nombre.toLowerCase() === habitacionNombre.toLowerCase() ||
        h.nombre.toLowerCase().includes(habitacionNombre.toLowerCase())
      );
      
      if (hab) {
        await guardarCoordenada(hab.id, x, y);
      } else {
        setMensaje(`❌ No se encontró la habitación "${habitacionNombre}"`);
        setTimeout(() => setMensaje(''), 2000);
      }
    }
  };

  const getColorPorOcupacion = (pacientes) => {
    if (pacientes === 0) return 'bg-green-500/80 border-green-400';
    if (pacientes === 1) return 'bg-yellow-500/80 border-yellow-400';
    if (pacientes === 2) return 'bg-orange-500/80 border-orange-400';
    return 'bg-red-500/80 border-red-400';
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
        <p className="text-slate-400 mb-4">Sube la imagen del croquis para comenzar</p>
        <label className="cursor-pointer bg-blue-600 hover:bg-blue-500 px-6 py-3 rounded-xl text-sm font-bold inline-flex items-center gap-2 transition-all">
          📤 Subir croquis (PNG/JPG)
          <input
            type="file"
            accept="image/png,image/jpeg,image/jpg"
            className="hidden"
            onChange={(e) => e.target.files[0] && subirCroquis(e.target.files[0])}
          />
        </label>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 rounded-2xl overflow-hidden border border-slate-700">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center p-4 border-b border-slate-700 gap-3">
        <div>
          <h3 className="text-xl font-bold text-blue-400">{pisoNombre}</h3>
          <p className="text-xs text-slate-500">
            Croquis cargado - {modoEdicion ? 'Modo Edición ACTIVADO' : 'Modo Visualización'}
          </p>
        </div>
        <div className="flex gap-3">
          <input
            type="date"
            value={fechaSeleccionada}
            onChange={(e) => setFechaSeleccionada(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
          />
          <button
            onClick={() => setModoEdicion(!modoEdicion)}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              modoEdicion 
                ? 'bg-green-600 hover:bg-green-500' 
                : 'bg-yellow-600 hover:bg-yellow-500'
            }`}
          >
            {modoEdicion ? '✓ Terminar Edición' : '✎ Editar posiciones'}
          </button>
        </div>
      </div>

      {/* Imagen del croquis */}
      <div 
        ref={containerRef}
        className="relative overflow-auto bg-slate-950"
        style={{ maxHeight: '70vh', cursor: modoEdicion ? 'crosshair' : 'default' }}
      >
        <img
          ref={imageRef}
          src={croquis.imagen_url}
          alt={`Croquis ${pisoNombre}`}
          className="w-full h-auto"
          onClick={handleImageClick}
          style={{ pointerEvents: modoEdicion ? 'auto' : 'none' }}
        />
        
        {/* Marcadores de habitaciones */}
        {habitaciones.map(hab => {
          const coord = coordenadas[hab.id];
          if (!coord) return null;
          
          const ocup = ocupacion[hab.id];
          const pacientes = ocup?.pacientes ?? 0;
          
          return (
            <div
              key={hab.id}
              className={`absolute rounded-lg border-2 ${getColorPorOcupacion(pacientes)} flex flex-col items-center justify-center text-white font-bold shadow-lg transition-all hover:scale-105 cursor-pointer`}
              style={{
                left: `${(coord.x / (imageRef.current?.naturalWidth || 1)) * 100}%`,
                top: `${(coord.y / (imageRef.current?.naturalHeight || 1)) * 100}%`,
                width: `${(coord.ancho / (imageRef.current?.naturalWidth || 1)) * 100}%`,
                height: `${(coord.alto / (imageRef.current?.naturalHeight || 1)) * 100}%`,
                transform: 'translate(-50%, -50%)'
              }}
              title={`${hab.nombre}: ${pacientes} paciente${pacientes !== 1 ? 's' : ''}${ocup?.observaciones ? ` - ${ocup.observaciones}` : ''}`}
            >
              <span className="text-[10px] font-bold hidden sm:block">{hab.nombre.substring(0, 12)}</span>
              <span className="text-lg font-black">{pacientes}</span>
            </div>
          );
        })}
      </div>

      {/* Leyenda y mensajes */}
      <div className="p-3 border-t border-slate-700">
        <div className="flex flex-wrap justify-between items-center gap-2">
          <div className="flex gap-4 text-xs">
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-green-500"></div> 0</span>
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-yellow-500"></div> 1</span>
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-orange-500"></div> 2</span>
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-red-500"></div> 3+</span>
          </div>
          {modoEdicion && (
            <p className="text-yellow-400 text-xs">💡 Click en el croquis para posicionar habitaciones</p>
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