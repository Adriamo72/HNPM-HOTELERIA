// components/CroquisPiso.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import QuickPinchZoom, { make3dTransformValue } from 'react-quick-pinch-zoom'; // npm install react-quick-pinch-zoom

const CroquisPiso = ({ pisoId, pisoNombre, habitaciones }) => {
  // --- TUS ESTADOS ORIGINALES ---
  const [croquis, setCroquis] = useState(null);
  const [coordenadas, setCoordenadas] = useState({});
  const [modoEdicion, setModoEdicion] = useState(false);
  const [ocupacion, setOcupacion] = useState({});
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState('');
  const [fechaSeleccionada, setFechaSeleccionada] = useState(new Date().toISOString().split('T')[0]);
  const [imagenInvertida, setImagenInvertida] = useState(false);
  
  // --- NUEVOS ESTADOS PARA INTERACCIÓN ---
  const [draggingHabId, setDraggingHabId] = useState(null);

  // --- TUS REFS + REF PARA ZOOM ---
  const imageRef = useRef(null);
  const containerRef = useRef(null);
  const pinchZoomRef = useRef(null);

  // Función necesaria para que el zoom aplique la transformación visual
  const onUpdate = useCallback(({ x, y, scale }) => {
    if (containerRef.current) {
      const value = make3dTransformValue({ x, y, scale });
      containerRef.current.style.setProperty('transform', value);
    }
  }, []);

  // --- TUS USEEFFECTS ORIGINALES ---
  useEffect(() => {
    if (habitaciones.length > 0) {
      cargarOcupacion();
    }
  }, [fechaSeleccionada, habitaciones]);

  useEffect(() => {
    cargarCroquis();
  }, [pisoId]);

  // --- TODA TU LÓGICA DE SUPABASE (SIN TOCAR UNA COMA) ---
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
      data?.forEach(occ => { ocupMap[occ.habitacion_id] = occ; });
      setOcupacion(ocupMap);
    } catch (error) { console.error("Error cargando ocupación:", error); }
  };

  const cargarCroquis = async () => {
    setCargando(true);
    try {
      const { data: croquisData, error: croquisError } = await supabase
        .from('croquis_pisos')
        .select('*')
        .eq('piso_id', pisoId)
        .eq('activo', true)
        .order('version', { ascending: false })
        .maybeSingle();

      if (croquisError) throw croquisError;
      if (croquisData) {
        setCroquis(croquisData);
        setImagenInvertida(false);
        const { data: coords, error: coordsError } = await supabase
          .from('habitacion_coordenadas')
          .select('*')
          .eq('croquis_id', croquisData.id);
        if (coordsError) throw coordsError;
        const coordsMap = {};
        coords?.forEach(c => {
          coordsMap[c.habitacion_id] = { x: c.x, y: c.y, ancho: c.ancho, alto: c.alto };
        });
        setCoordenadas(coordsMap);
      } else {
        setCroquis(null);
        setCoordenadas({});
      }
    } catch (error) { console.error("Error cargando croquis:", error); } 
    finally { setCargando(false); }
  };

  // --- TUS FUNCIONES DE ELIMINAR E INVERTIR (MANTENIDAS) ---
  const eliminarCroquis = async () => {
    if (!croquis) return;
    const confirmar = window.confirm(`⚠️ ¿ELIMINAR ESTE CROQUIS?\n\nPiso: ${pisoNombre}`);
    if (!confirmar) return;
    setMensaje("🗑️ Eliminando...");
    try {
      await supabase.from('habitacion_coordenadas').delete().eq('croquis_id', croquis.id);
      await supabase.from('croquis_pisos').delete().eq('id', croquis.id);
      await supabase.storage.from('croquis').remove([croquis.nombre_archivo]);
      setMensaje("✅ Eliminado");
      setCroquis(null);
      setCoordenadas({});
      setTimeout(() => setMensaje(''), 2000);
    } catch (error) { setMensaje("❌ Error"); }
  };

  const invertirImagen = () => {
    if (!imageRef.current) return;
    const img = imageRef.current;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255 - data[i]; data[i+1] = 255 - data[i+1]; data[i+2] = 255 - data[i+2];
    }
    ctx.putImageData(imageData, 0, 0);
    img.src = canvas.toDataURL('image/png');
    setImagenInvertida(true);
    setMensaje("✅ Colores invertidos");
    setTimeout(() => setMensaje(''), 2000);
  };

  const subirCroquis = async (file) => {
    if (!file) return;
    setMensaje("📤 Subiendo...");
    try {
      const fileName = `croquis_${pisoId}_${Date.now()}.png`;
      await supabase.storage.from('croquis').upload(fileName, file);
      const { data: urlData } = supabase.storage.from('croquis').getPublicUrl(fileName);
      await supabase.from('croquis_pisos').insert({
        piso_id: pisoId, nombre_archivo: fileName, imagen_url: urlData.publicUrl, version: 1, activo: true, subido_en: new Date().toISOString()
      });
      cargarCroquis();
    } catch (error) { setMensaje("❌ Error"); }
  };

  // --- LÓGICA DE MOVIMIENTO Y CLICK (AQUÍ ESTÁ LA MAGIA) ---
  const guardarCoordenada = async (habitacionId, x, y) => {
    if (!croquis) return;
    try {
      await supabase.from('habitacion_coordenadas').upsert({
        habitacion_id: habitacionId, croquis_id: croquis.id, x: Math.round(x), y: Math.round(y), ancho: 40, alto: 40
      }, { onConflict: 'habitacion_id,croquis_id' });
      setCoordenadas(prev => ({ ...prev, [habitacionId]: { x, y, ancho: 40, alto: 40 } }));
    } catch (error) { console.error("Error guardando:", error); }
  };

  const handleMouseDownHab = (e, habId) => {
    if (!modoEdicion) return;
    e.stopPropagation();
    setDraggingHabId(habId);
  };

  const handleMouseMove = (e) => {
    if (!modoEdicion || !draggingHabId || !imageRef.current) return;
    const rect = imageRef.current.getBoundingClientRect();
    // Conversión de mouse a coordenada real del plano (nanoCAD scale)
    const x = (e.clientX - rect.left) * (imageRef.current.naturalWidth / rect.width);
    const y = (e.clientY - rect.top) * (imageRef.current.naturalHeight / rect.height);
    setCoordenadas(prev => ({ ...prev, [draggingHabId]: { ...prev[draggingHabId], x, y } }));
  };

  const handleMouseUp = () => {
    if (draggingHabId) {
      const coord = coordenadas[draggingHabId];
      guardarCoordenada(draggingHabId, coord.x, coord.y);
      setDraggingHabId(null);
      setMensaje("📍 Posición actualizada");
      setTimeout(() => setMensaje(''), 1000);
    }
  };

  const handleImageClick = async (e) => {
    if (!modoEdicion || draggingHabId || !imageRef.current) return;
    const rect = imageRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (imageRef.current.naturalWidth / rect.width);
    const y = (e.clientY - rect.top) * (imageRef.current.naturalHeight / rect.height);
    const nombre = prompt(`Nombre de la habitación:`);
    if (nombre) {
      const hab = habitaciones.find(h => h.nombre.toLowerCase().includes(nombre.toLowerCase()));
      if (hab) await guardarCoordenada(hab.id, x, y);
    }
  };

  const getColorPorOcupacion = (pacientes) => {
    if (pacientes === 0) return 'bg-green-500/90 border-green-300 text-white';
    if (pacientes === 1) return 'bg-yellow-500/90 border-yellow-300 text-black';
    if (pacientes === 2) return 'bg-orange-500/90 border-orange-300 text-white';
    return 'bg-red-500/90 border-red-300 text-white';
  };

  // --- RENDER (TU ESTRUCTURA ORIGINAL) ---
  if (cargando) return <div className="bg-slate-800 p-12 text-center text-slate-400">Cargando...</div>;
  if (!croquis) return (
    <div className="bg-slate-800 rounded-xl p-8 text-center border border-dashed border-slate-600">
      <h3 className="text-xl font-bold text-white mb-2">Croquis no disponible</h3>
      <label className="cursor-pointer bg-blue-600 px-6 py-3 rounded-xl text-sm font-bold">
        📤 Subir Croquis
        <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files[0] && subirCroquis(e.target.files[0])} />
      </label>
    </div>
  );

  return (
    <div className="bg-slate-900 rounded-2xl overflow-hidden border border-slate-700"
         onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}>
      
      {/* Tu Header Original */}
      <div className="flex flex-wrap justify-between items-center p-4 border-b border-slate-700 gap-3">
        <h3 className="text-xl font-bold text-blue-400">{pisoNombre}</h3>
        <div className="flex gap-2">
          <input type="date" value={fechaSeleccionada} onChange={(e) => setFechaSeleccionada(e.target.value)} className="bg-slate-800 border-slate-700 rounded-lg px-3 py-2 text-white" />
          <button onClick={() => setModoEdicion(!modoEdicion)} className={`px-4 py-2 rounded-lg text-sm font-bold ${modoEdicion ? 'bg-green-600' : 'bg-yellow-600'}`}>
            {modoEdicion ? '✓ Guardar' : '✎ Editar'}
          </button>
          {!imagenInvertida && <button onClick={invertirImagen} className="p-2 bg-slate-700 rounded-lg">🌗</button>}
          <button onClick={eliminarCroquis} className="px-3 py-2 bg-red-600 rounded-lg text-sm font-bold">🗑️</button>
        </div>
      </div>

      {/* ÁREA DEL MAPA CON ZOOM INTEGRADO */}
      <div className="relative overflow-hidden bg-slate-950" style={{ height: '70vh' }}>
        <QuickPinchZoom
          ref={pinchZoomRef}
          onUpdate={onUpdate}
          wheelScaleFactor={0.005}
          draggableUnZoomed={!modoEdicion}
          enabled={!draggingHabId}
        >
          <div ref={containerRef} className="origin-top-left">
            <img
              ref={imageRef}
              src={croquis.imagen_url}
              alt={pisoNombre}
              className="max-w-none"
              onClick={handleImageClick}
              style={{ display: 'block', userSelect: 'none', cursor: modoEdicion ? 'crosshair' : 'grab' }}
            />
            
            {habitaciones.map(hab => {
              const coord = coordenadas[hab.id];
              if (!coord) return null;
              const ocup = ocupacion[hab.id];
              const pacientes = ocup?.pacientes ?? 0;
              
              return (
                <div
                  key={hab.id}
                  onMouseDown={(e) => handleMouseDownHab(e, hab.id)}
                  className={`absolute rounded-md border-2 ${getColorPorOcupacion(pacientes)} flex flex-col items-center justify-center font-bold shadow-lg ${modoEdicion ? 'cursor-move scale-110 z-50 ring-2 ring-white' : 'cursor-pointer'}`}
                  style={{
                    left: `${(coord.x / (imageRef.current?.naturalWidth || 1)) * 100}%`,
                    top: `${(coord.y / (imageRef.current?.naturalHeight || 1)) * 100}%`,
                    width: 'clamp(32px, 4vw, 42px)', height: 'clamp(48px, 5vw, 58px)',
                    transform: 'translate(-50%, -50%)',
                    pointerEvents: 'auto'
                  }}
                >
                  <span className="text-[10px]">{hab.nombre}</span>
                  <span className="text-lg">{pacientes}</span>
                </div>
              );
            })}
          </div>
        </QuickPinchZoom>
      </div>

      {/* Tu Footer Original */}
      <div className="p-3 border-t border-slate-700 bg-slate-800/50">
        <div className="flex flex-wrap justify-between items-center gap-2">
          <div className="flex gap-4 text-xs">
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-green-500"></div> 0</span>
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-yellow-500"></div> 1</span>
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-orange-500"></div> 2</span>
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-red-500"></div> 3+</span>
          </div>
          {mensaje && <p className="text-sm text-blue-400 font-bold animate-pulse">{mensaje}</p>}
          <div className="text-xs text-slate-500 italic">
            {modoEdicion ? 'Arrastra las etiquetas para reubicarlas' : 'Usa la rueda del mouse para hacer zoom'}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CroquisPiso;