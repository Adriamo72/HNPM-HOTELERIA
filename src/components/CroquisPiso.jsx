// components/CroquisPiso.jsx
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import ReactCrop from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

const CroquisPiso = ({ pisoId, pisoNombre, habitaciones }) => {
  // Estados principales
  const [croquis, setCroquis] = useState(null);
  const [coordenadas, setCoordenadas] = useState({});
  const [modoEdicion, setModoEdicion] = useState(false);
  const [ocupacion, setOcupacion] = useState({});
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState('');
  const [fechaSeleccionada, setFechaSeleccionada] = useState(new Date().toISOString().split('T')[0]);
  const [modoVisualizacion, setModoVisualizacion] = useState('cad'); // 'cad', 'original', 'vector'
  
  // Estados para recorte
  const [mostrarRecortador, setMostrarRecortador] = useState(false);
  const [imagenTemp, setImagenTemp] = useState(null);
  const [crop, setCrop] = useState({
    unit: '%',
    width: 100,
    height: 70,
    x: 0,
    y: 15
  });
  
  // Refs
  const imageRef = useRef(null);
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const imgElementRef = useRef(null);

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

  // Aplicar filtro CAD cuando cambia la imagen o modo de visualización
  useEffect(() => {
    if (croquis?.imagen_url && modoVisualizacion === 'cad' && canvasRef.current) {
      aplicarFiltroCAD();
    }
  }, [croquis, modoVisualizacion]);

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

  const aplicarFiltroCAD = () => {
    if (!canvasRef.current || !imgElementRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = imgElementRef.current;
    
    // Ajustar tamaño del canvas al de la imagen
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    
    // Dibujar imagen original
    ctx.drawImage(img, 0, 0);
    
    // Obtener datos de píxeles
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // Aplicar filtro estilo CAD (inversión + contraste)
    for (let i = 0; i < data.length; i += 4) {
      // Invertir colores (blanco se vuelve negro, negro se vuelve blanco)
      data[i] = 255 - data[i];     // R
      data[i+1] = 255 - data[i+1]; // G
      data[i+2] = 255 - data[i+2]; // B
      
      // Aumentar contraste para líneas más definidas
      const brightness = (data[i] + data[i+1] + data[i+2]) / 3;
      if (brightness > 128) {
        // Aclarar líneas (hacerlas más blancas)
        data[i] = Math.min(255, data[i] + 50);
        data[i+1] = Math.min(255, data[i+1] + 50);
        data[i+2] = Math.min(255, data[i+2] + 50);
      } else {
        // Oscurecer fondo
        data[i] = Math.max(0, data[i] - 40);
        data[i+1] = Math.max(0, data[i+1] - 40);
        data[i+2] = Math.max(0, data[i+2] - 40);
      }
    }
    
    ctx.putImageData(imageData, 0, 0);
  };

  const recortarImagen = async () => {
    if (!imagenTemp || !crop) return;
    
    setMensaje("✂️ Recortando imagen...");
    
    const canvas = document.createElement('canvas');
    const img = new Image();
    
    img.onload = async () => {
      const cropX = (crop.x / 100) * img.width;
      const cropY = (crop.y / 100) * img.height;
      const cropWidth = (crop.width / 100) * img.width;
      const cropHeight = (crop.height / 100) * img.height;
      
      canvas.width = cropWidth;
      canvas.height = cropHeight;
      
      const ctx = canvas.getContext('2d');
      ctx.drawImage(
        img,
        cropX, cropY, cropWidth, cropHeight,
        0, 0, cropWidth, cropHeight
      );
      
      // Convertir canvas a blob
      canvas.toBlob(async (blob) => {
        const fileName = `croquis_${pisoId}_${Date.now()}.png`;
        
        try {
          // Subir imagen recortada
          const { data, error } = await supabase.storage
            .from('croquis')
            .upload(fileName, blob);
          
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
              version: 1,
              activo: true,
              subido_en: new Date().toISOString()
            });
          
          if (insertError) throw insertError;
          
          setMensaje("✅ Croquis recortado y subido correctamente");
          setMostrarRecortador(false);
          setImagenTemp(null);
          cargarCroquis();
          
        } catch (error) {
          console.error("Error:", error);
          setMensaje("❌ Error al subir imagen recortada");
        } finally {
          setTimeout(() => setMensaje(''), 2000);
        }
      }, 'image/png');
    };
    
    img.src = imagenTemp;
  };

  const subirCroquis = async (file) => {
    if (!file) return;
    
    // Leer la imagen para mostrar en el recortador
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagenTemp(e.target.result);
      setMostrarRecortador(true);
    };
    reader.readAsDataURL(file);
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
    if (!modoEdicion || !croquis) return;
    
    let imgElement;
    let scaleX, scaleY;
    
    if (modoVisualizacion === 'cad' && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      imgElement = canvasRef.current;
      scaleX = imgElement.width / rect.width;
      scaleY = imgElement.height / rect.height;
    } else if (imageRef.current) {
      const rect = imageRef.current.getBoundingClientRect();
      imgElement = imageRef.current;
      scaleX = imgElement.naturalWidth / rect.width;
      scaleY = imgElement.naturalHeight / rect.height;
    } else {
      return;
    }
    
    const rect = imgElement.getBoundingClientRect();
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
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

  const getColorPorOcupacion = (pacientes, modo) => {
    if (modo === 'cad') {
      if (pacientes === 0) return 'bg-green-500/90 border-green-300 text-white';
      if (pacientes === 1) return 'bg-yellow-500/90 border-yellow-300 text-black';
      if (pacientes === 2) return 'bg-orange-500/90 border-orange-300 text-white';
      return 'bg-red-500/90 border-red-300 text-white';
    } else {
      if (pacientes === 0) return 'bg-green-500/80 border-green-400 text-white';
      if (pacientes === 1) return 'bg-yellow-500/80 border-yellow-400 text-black';
      if (pacientes === 2) return 'bg-orange-500/80 border-orange-400 text-white';
      return 'bg-red-500/80 border-red-400 text-white';
    }
  };

  const getFiltroImagen = () => {
    if (modoVisualizacion === 'vector') {
      return 'brightness(1.2) contrast(1.5) saturate(0) grayscale(1)';
    }
    return 'none';
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

  // Pantalla de recorte
  if (mostrarRecortador && imagenTemp) {
    return (
      <div className="bg-slate-800 rounded-xl p-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-blue-400">✂️ Recortar Croquis</h3>
          <button
            onClick={() => setMostrarRecortador(false)}
            className="text-slate-400 hover:text-white"
          >
            ✖️ Cancelar
          </button>
        </div>
        
        <p className="text-slate-400 text-sm mb-3">
          📐 Ajusta el área de recorte (elimina bordes superiores e inferiores)
        </p>
        
        <ReactCrop
          crop={crop}
          onChange={setCrop}
          aspect={undefined}
          className="max-h-[60vh] overflow-auto"
        >
          <img
            src={imagenTemp}
            alt="Croquis a recortar"
            className="max-w-full"
          />
        </ReactCrop>
        
        <div className="flex gap-3 mt-4">
          <button
            onClick={recortarImagen}
            className="bg-green-600 hover:bg-green-500 px-6 py-2 rounded-lg font-bold"
          >
            ✅ Aplicar recorte y subir
          </button>
          <button
            onClick={() => setMostrarRecortador(false)}
            className="bg-slate-700 hover:bg-slate-600 px-6 py-2 rounded-lg font-bold"
          >
            Cancelar
          </button>
        </div>
        
        {mensaje && (
          <p className="text-center text-sm mt-3 text-blue-400">{mensaje}</p>
        )}
      </div>
    );
  }

  // Pantalla cuando no hay croquis
  if (!croquis) {
    return (
      <div className="bg-slate-800 rounded-xl p-8 text-center border border-dashed border-slate-600">
        <div className="text-6xl mb-4">🗺️</div>
        <h3 className="text-xl font-bold text-white mb-2">Croquis no disponible</h3>
        <p className="text-slate-400 mb-4">Sube la imagen del croquis para comenzar</p>
        <p className="text-slate-500 text-sm mb-4">
          💡 Recomendación: La imagen debe ser horizontal (panorámica). Puedes recortarla después.
        </p>
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

  // Pantalla principal del croquis
  return (
    <div className="bg-slate-900 rounded-2xl overflow-hidden border border-slate-700">
      {/* Header con controles */}
      <div className="flex flex-wrap justify-between items-center p-4 border-b border-slate-700 gap-3">
        <div>
          <h3 className="text-xl font-bold text-blue-400">{pisoNombre}</h3>
          <p className="text-xs text-slate-500">
            {modoVisualizacion === 'cad' && '🎨 Modo CAD (Fondo oscuro)'}
            {modoVisualizacion === 'original' && '📷 Modo Original'}
            {modoVisualizacion === 'vector' && '📐 Modo Vectorial'}
            {' - '}
            {modoEdicion ? '✎ Modo Edición Activado' : '👁️ Modo Visualización'}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <select
            value={modoVisualizacion}
            onChange={(e) => setModoVisualizacion(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            <option value="cad">🎨 Modo CAD (Fondo oscuro)</option>
            <option value="original">📷 Original</option>
            <option value="vector">📐 Vectorial</option>
          </select>
          
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

      {/* Área del croquis */}
      <div 
        ref={containerRef}
        className="relative overflow-auto bg-slate-950"
        style={{ maxHeight: '70vh', cursor: modoEdicion ? 'crosshair' : 'default' }}
      >
        {modoVisualizacion === 'cad' ? (
          <canvas
            ref={canvasRef}
            className="w-full h-auto"
            onClick={handleImageClick}
            style={{ pointerEvents: modoEdicion ? 'auto' : 'none' }}
          />
        ) : (
          <img
            ref={(el) => {
              imageRef.current = el;
              if (el && modoVisualizacion === 'cad') {
                imgElementRef.current = el;
              }
            }}
            src={croquis.imagen_url}
            alt={`Croquis ${pisoNombre}`}
            className="w-full h-auto"
            style={{ filter: getFiltroImagen() }}
            onClick={handleImageClick}
            onLoad={() => {
              if (modoVisualizacion === 'cad' && imgElementRef.current) {
                setTimeout(aplicarFiltroCAD, 100);
              }
            }}
          />
        )}
        
        {/* Marcadores de habitaciones */}
        {habitaciones.map(hab => {
          const coord = coordenadas[hab.id];
          if (!coord) return null;
          
          const ocup = ocupacion[hab.id];
          const pacientes = ocup?.pacientes ?? 0;
          const estiloColor = getColorPorOcupacion(pacientes, modoVisualizacion);
          
          return (
            <div
              key={hab.id}
              className={`absolute rounded-lg border-2 ${estiloColor} flex flex-col items-center justify-center font-bold shadow-lg transition-all hover:scale-105 cursor-pointer`}
              style={{
                left: `${(coord.x / (imgElementRef.current?.naturalWidth || imageRef.current?.naturalWidth || 1)) * 100}%`,
                top: `${(coord.y / (imgElementRef.current?.naturalHeight || imageRef.current?.naturalHeight || 1)) * 100}%`,
                width: `${(coord.ancho / (imgElementRef.current?.naturalWidth || imageRef.current?.naturalWidth || 1)) * 100}%`,
                height: `${(coord.alto / (imgElementRef.current?.naturalHeight || imageRef.current?.naturalHeight || 1)) * 100}%`,
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
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-green-500"></div> 0 pacientes</span>
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-yellow-500"></div> 1 paciente</span>
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-orange-500"></div> 2 pacientes</span>
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-red-500"></div> 3 pacientes</span>
          </div>
          <div className="text-xs text-slate-500">
            {modoVisualizacion === 'cad' && '🎨 Fondo oscuro estilo CAD'}
            {modoVisualizacion === 'original' && '📷 Imagen original'}
            {modoVisualizacion === 'vector' && '📐 Modo vectorial (alto contraste)'}
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