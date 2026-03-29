// components/CroquisPiso.jsx
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';

const CroquisPiso = ({ pisoId, pisoNombre, habitaciones }) => {
  // Estados principales
  const [croquis, setCroquis] = useState(null);
  const [coordenadas, setCoordenadas] = useState({});
  const [modoEdicion, setModoEdicion] = useState(false);
  const [ocupacion, setOcupacion] = useState({});
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState('');
  const [fechaSeleccionada, setFechaSeleccionada] = useState(new Date().toISOString().split('T')[0]);
  const [imagenInvertida, setImagenInvertida] = useState(false);
  const [mostrarGuia, setMostrarGuia] = useState(false);  // 👈 Estado para guías
  
  const imageRef = useRef(null);
  const containerRef = useRef(null);

  // Cargar ocupación al cambiar fecha
  useEffect(() => {
    if (habitaciones.length > 0) {
      cargarOcupacion();
    }
  }, [fechaSeleccionada, habitaciones]);

  // Cargar croquis al montar
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
        setImagenInvertida(false);
        
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
      data[i] = 255 - data[i];
      data[i+1] = 255 - data[i+1];
      data[i+2] = 255 - data[i+2];
    }
    
    ctx.putImageData(imageData, 0, 0);
    img.src = canvas.toDataURL('image/png');
    setImagenInvertida(true);
    setMensaje("✅ Colores invertidos");
    setTimeout(() => setMensaje(''), 2000);
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
          ancho: 45,
          alto: 42
        }, { onConflict: 'habitacion_id,croquis_id' });
      
      if (error) throw error;
      
      setCoordenadas(prev => ({ ...prev, [habitacionId]: { x, y, ancho: 45, alto: 42 } }));
      setMensaje(`✅ Posición guardada`);
      setTimeout(() => setMensaje(''), 1500);
      
    } catch (error) {
      console.error("Error:", error);
      setMensaje("❌ Error al guardar posición");
      setTimeout(() => setMensaje(''), 1500);
    }
  };

  const handleImageClick = async (e) => {
    if (!modoEdicion || !croquis || !imageRef.current) return;
    
    const rect = imageRef.current.getBoundingClientRect();
    const scaleX = imageRef.current.naturalWidth / rect.width;
    const scaleY = imageRef.current.naturalHeight / rect.height;
    
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    // Mostrar selector de habitaciones
    const habitacionNombre = prompt(
      `¿Qué habitación está en esta ubicación?\n\n` +
      `Habitaciones disponibles (36 total):\n` +
      `Izquierda (impares): 601,603,605,607,609,611,613,615,617,619,621,623,625,627,629,631,633,635\n` +
      `Derecha (pares): 602,604,606,608,610,612,614,616,618,620,622,624,626,628,630,632,634,636\n\n` +
      `Ingresa el número exacto:`
    );
    
    if (habitacionNombre) {
      const hab = habitaciones.find(h => h.nombre === habitacionNombre.trim());
      
      if (hab) {
        await guardarCoordenada(hab.id, x, y);
      } else {
        setMensaje(`❌ No se encontró la habitación "${habitacionNombre}"`);
        setTimeout(() => setMensaje(''), 2000);
      }
    }
  };

  const getColorPorOcupacion = (pacientes) => {
    if (pacientes === 0) return 'bg-green-500/90 border-green-300 text-white';
    if (pacientes === 1) return 'bg-yellow-500/90 border-yellow-300 text-black';
    if (pacientes === 2) return 'bg-orange-500/90 border-orange-300 text-white';
    return 'bg-red-500/90 border-red-300 text-white';
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
        <p className="text-slate-400 mb-4">Sube la imagen del PISO 6</p>
        <label className="cursor-pointer bg-blue-600 hover:bg-blue-500 px-6 py-3 rounded-xl text-sm font-bold inline-flex items-center gap-2">
          📤 Subir croquis (PNG/JPG)
          <input type="file" accept="image/png,image/jpeg,image/jpg" className="hidden" onChange={(e) => e.target.files[0] && subirCroquis(e.target.files[0])} />
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
            {modoEdicion ? '✎ Modo Edición - Click en el croquis para posicionar habitaciones' : '👁️ Modo Visualización'}
            {mostrarGuia && ' | 📐 Guías activas'}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input type="date" value={fechaSeleccionada} onChange={(e) => setFechaSeleccionada(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white" />
          
          <button
            onClick={() => setMostrarGuia(!mostrarGuia)}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              mostrarGuia ? 'bg-cyan-600 text-white' : 'bg-cyan-800 text-cyan-300 hover:bg-cyan-700'
            }`}
            title="Mostrar cuadrícula de alineación"
          >
            📐 {mostrarGuia ? 'Ocultar guías' : 'Mostrar guías'}
          </button>
          
          {croquis && !imagenInvertida && (
            <button onClick={invertirImagen} className="px-4 py-2 rounded-lg text-sm font-bold bg-purple-600 hover:bg-purple-500">
              🎨 Invertir colores
            </button>
          )}
          
          <button onClick={() => setModoEdicion(!modoEdicion)} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${modoEdicion ? 'bg-green-600' : 'bg-yellow-600'}`}>
            {modoEdicion ? '✓ Terminar Edición' : '✎ Editar posiciones'}
          </button>
          
          <button onClick={eliminarCroquis} className="px-4 py-2 rounded-lg text-sm font-bold bg-red-600 hover:bg-red-500">
            🗑️ Eliminar
          </button>
        </div>
      </div>

      {/* Área del croquis con guías */}
      <div 
        ref={containerRef}
        className="relative overflow-auto bg-slate-950"
        style={{ maxHeight: '70vh', cursor: modoEdicion ? 'crosshair' : 'default' }}
      >
        {/* Imagen del croquis */}
        <img
          ref={imageRef}
          src={croquis.imagen_url}
          alt={`Croquis ${pisoNombre}`}
          className="w-full h-auto"
          onClick={handleImageClick}
          style={{ pointerEvents: modoEdicion ? 'auto' : 'none' }}
        />
        
        {/* Cuadrícula de guías visuales */}
        {mostrarGuia && (
          <div className="absolute inset-0 pointer-events-none z-10">
            {/* Líneas verticales cada 50px */}
            {[...Array(40)].map((_, i) => (
              <div 
                key={`v-${i}`} 
                className="absolute top-0 bottom-0 w-px bg-cyan-400/30" 
                style={{ left: `${i * 50}px` }}
              ></div>
            ))}
            {/* Líneas horizontales cada 50px */}
            {[...Array(40)].map((_, i) => (
              <div 
                key={`h-${i}`} 
                className="absolute left-0 right-0 h-px bg-cyan-400/30" 
                style={{ top: `${i * 50}px` }}
              ></div>
            ))}
            {/* Líneas más destacadas cada 100px */}
            {[...Array(20)].map((_, i) => (
              <div 
                key={`v-bold-${i}`} 
                className="absolute top-0 bottom-0 w-px bg-cyan-500/60" 
                style={{ left: `${i * 100}px` }}
              ></div>
            ))}
            {[...Array(20)].map((_, i) => (
              <div 
                key={`h-bold-${i}`} 
                className="absolute left-0 right-0 h-px bg-cyan-500/60" 
                style={{ top: `${i * 100}px` }}
              ></div>
            ))}
          </div>
        )}
        
        {/* Marcadores rectangulares verticales */}
        {habitaciones.map(hab => {
          const coord = coordenadas[hab.id];
          if (!coord) return null;
          
          const ocup = ocupacion[hab.id];
          const pacientes = ocup?.pacientes ?? 0;
          const estiloColor = getColorPorOcupacion(pacientes);
          
          return (
            <div
              key={hab.id}
              className={`absolute rounded-md border-2 ${estiloColor} flex flex-col items-center justify-center font-bold shadow-lg transition-all hover:scale-105 cursor-pointer`}
              style={{
                left: `${(coord.x / (imageRef.current?.naturalWidth || 1)) * 100}%`,
                top: `${(coord.y / (imageRef.current?.naturalHeight || 1)) * 100}%`,
                width: 'min(3.2%, 48px)',
                height: 'min(6%, 52px)',
                transform: 'translate(0%, -50%)',
                minWidth: '42px',
                minHeight: '48px'
              }}
              title={`${hab.nombre}: ${pacientes} paciente${pacientes !== 1 ? 's' : ''}`}
            >
              <span className="text-[clamp(9px,1.4vw,12px)] font-bold leading-tight">{hab.nombre}</span>
              <span className="text-[clamp(14px,2vw,18px)] font-black leading-none mt-0.5">{pacientes}</span>
            </div>
          );
        })}
      </div>

      {/* Leyenda */}
      <div className="p-3 border-t border-slate-700">
        <div className="flex flex-wrap justify-between items-center gap-2">
          <div className="flex gap-4 text-xs">
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-green-500"></div> 0</span>
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-yellow-500"></div> 1</span>
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-orange-500"></div> 2</span>
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-red-500"></div> 3+</span>
          </div>
          <div className="text-xs text-slate-500">
            🏥 Total: {habitaciones.length} habitaciones | {mostrarGuia ? '📐 Guías activas - alinea en las intersecciones' : '💡 Activa "Mostrar guías" para alinear'}
          </div>
          {modoEdicion && (
            <p className="text-yellow-400 text-xs">✏️ Click en el croquis para posicionar habitaciones</p>
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