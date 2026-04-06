// components/RecorridoOcupacion.jsx
import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const RecorridoOcupacion = ({ perfilUsuario, slugPiso }) => {
  const [piso, setPiso] = useState(null);
  const [habitaciones, setHabitaciones] = useState([]);
  const [ocupaciones, setOcupaciones] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (slugPiso) {
      cargarDatos();
    }
  }, [slugPiso]);

  const cargarDatos = async () => {
    setCargando(true);
    
    try {
      // 1. Obtener el piso por slug
      const { data: pisoData, error: pisoError } = await supabase
        .from('pisos')
        .select('*')
        .eq('slug', slugPiso)
        .single();
      
      if (pisoError) throw pisoError;
      setPiso(pisoData);
      
      // 2. Obtener TODAS las habitaciones del piso
      const { data: habitacionesData, error: habError } = await supabase
        .from('habitaciones_especiales')
        .select('*')
        .eq('piso_id', pisoData.id)
        .order('nombre');
      
      if (habError) throw habError;
      
      if (!habitacionesData || habitacionesData.length === 0) {
        setHabitaciones([]);
        setCargando(false);
        return;
      }
      
      // 3. Obtener la configuración de ocupación para la fecha actual
      const fecha = new Date().toISOString().split('T')[0];
      const { data: ocupacionesData, error: ocupError } = await supabase
        .from('ocupacion_habitaciones')
        .select('*')
        .in('habitacion_id', habitacionesData.map(h => h.id))
        .eq('fecha', fecha);
      
      if (ocupError) throw ocupError;
      
      // 4. Crear mapa de ocupaciones existentes
      const ocupMap = {};
      (ocupacionesData || []).forEach(ocup => {
        ocupMap[ocup.habitacion_id] = ocup;
      });
      
      // 5. FILTRAR SOLO habitaciones de INTERNACIÓN (tipo_habitacion = 'activa')
      const habitacionesInternacion = [];
      
      for (const hab of habitacionesData) {
        const ocupExistente = ocupMap[hab.id];
        
        // Determinar el tipo de habitación
        let tipoHabitacion = null;
        let totalCamas = 1;
        let camasOcupadas = 0;
        
        if (ocupExistente) {
          tipoHabitacion = ocupExistente.tipo_habitacion;
          totalCamas = ocupExistente.total_camas || 1;
          camasOcupadas = ocupExistente.camas_ocupadas || 0;
        } else {
          // Si no existe registro, buscar si hay configuración previa (último registro)
          const { data: ultimoRegistro } = await supabase
            .from('ocupacion_habitaciones')
            .select('tipo_habitacion, total_camas')
            .eq('habitacion_id', hab.id)
            .order('fecha', { ascending: false })
            .order('actualizado_en', { ascending: false })
            .limit(1)
            .maybeSingle();
          
          if (ultimoRegistro) {
            tipoHabitacion = ultimoRegistro.tipo_habitacion;
            totalCamas = ultimoRegistro.total_camas || 1;
          }
        }
        
        // SOLO agregar si es de tipo INTERNACIÓN (activa)
        if (tipoHabitacion === 'activa') {
          habitacionesInternacion.push({
            id: hab.id,
            nombre: hab.nombre,
            total_camas: totalCamas,
            camas_ocupadas: camasOcupadas
          });
        }
      }
      
      // 6. Guardar estado de ocupaciones para edición
      const ocupState = {};
      habitacionesInternacion.forEach(hab => {
        ocupState[hab.id] = {
          camas_ocupadas: hab.camas_ocupadas,
          total_camas: hab.total_camas
        };
      });
      
      setHabitaciones(habitacionesInternacion);
      setOcupaciones(ocupState);
      
    } catch (error) {
      console.error("Error cargando datos:", error);
      setMensaje("❌ Error al cargar el sector");
      setTimeout(() => setMensaje(''), 3000);
    } finally {
      setCargando(false);
    }
  };

  const actualizarCamasOcupadas = (habitacionId, nuevoValor) => {
    const habitacion = habitaciones.find(h => h.id === habitacionId);
    if (!habitacion) return;
    
    const maxCamas = habitacion.total_camas;
    const valor = Math.min(maxCamas, Math.max(0, nuevoValor));
    
    setOcupaciones(prev => ({
      ...prev,
      [habitacionId]: {
        ...prev[habitacionId],
        camas_ocupadas: valor
      }
    }));
  };

  const guardarTodas = async () => {
    if (habitaciones.length === 0) {
      setMensaje("⚠️ No hay habitaciones de internación para guardar");
      setTimeout(() => setMensaje(''), 2000);
      return;
    }
    
    setGuardando(true);
    const fecha = new Date().toISOString().split('T')[0];
    let guardados = 0;
    let errores = 0;
    
    try {
      for (const hab of habitaciones) {
        const ocupActual = ocupaciones[hab.id];
        if (!ocupActual) continue;
        
        const payload = {
          habitacion_id: hab.id,
          fecha: fecha,
          tipo_habitacion: 'activa',
          total_camas: hab.total_camas,
          camas_ocupadas: ocupActual.camas_ocupadas,
          observaciones: null,
          actualizado_por: perfilUsuario?.dni,
          actualizado_en: new Date().toISOString()
        };
        
        const { error } = await supabase
          .from('ocupacion_habitaciones')
          .upsert(payload, { onConflict: 'habitacion_id,fecha' });
        
        if (error) {
          console.error(`Error guardando ${hab.nombre}:`, error);
          errores++;
        } else {
          guardados++;
        }
      }
      
      if (errores === 0) {
        setMensaje(`✅ ${guardados} habitaciones guardadas - ${new Date().toLocaleTimeString()}`);
      } else {
        setMensaje(`⚠️ ${guardados} guardadas, ${errores} errores`);
      }
      
      setTimeout(() => setMensaje(''), 2500);
      
      // Recargar datos para mostrar los valores actualizados
      setTimeout(() => cargarDatos(), 500);
      
    } catch (error) {
      console.error("Error guardando:", error);
      setMensaje("❌ Error al guardar la ocupación");
      setTimeout(() => setMensaje(''), 3000);
    } finally {
      setGuardando(false);
    }
  };

  // Calcular estadísticas
  const totalCamas = habitaciones.reduce((sum, hab) => sum + (hab.total_camas || 1), 0);
  const totalOcupadas = habitaciones.reduce((sum, hab) => sum + (ocupaciones[hab.id]?.camas_ocupadas || 0), 0);
  const porcentaje = totalCamas > 0 ? (totalOcupadas / totalCamas) * 100 : 0;

  if (cargando) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 flex items-center justify-center">
        <div className="animate-pulse text-center">
          <div className="w-16 h-16 bg-purple-600 rounded-2xl mx-auto mb-4 animate-bounce"></div>
          <p className="text-slate-400 font-mono text-sm">Cargando recorrido...</p>
        </div>
      </div>
    );
  }

  if (!piso) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 flex items-center justify-center p-6">
        <div className="bg-red-900/20 rounded-2xl p-8 text-center max-w-md border border-red-800">
          <div className="text-6xl mb-4">❌</div>
          <h2 className="text-xl font-bold text-white mb-2">Sector no encontrado</h2>
          <p className="text-slate-400 text-sm">El código QR escaneado no corresponde a un sector válido.</p>
          <button 
            onClick={() => window.location.href = '/'}
            className="mt-6 bg-blue-600 px-6 py-2 rounded-xl text-sm font-bold"
          >
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  if (habitaciones.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 flex items-center justify-center p-6">
        <div className="bg-slate-900 rounded-2xl p-8 text-center max-w-md border border-slate-800">
          <div className="text-6xl mb-4">🏥</div>
          <h2 className="text-xl font-bold text-white mb-2">Sin habitaciones de internación</h2>
          <p className="text-slate-400 text-sm">
            El sector <span className="text-purple-400 font-bold">{piso.nombre_piso}</span> no tiene habitaciones configuradas para internación.
          </p>
          <p className="text-slate-500 text-xs mt-2">
            Contacte al administrador para configurar las habitaciones.
          </p>
          <button 
            onClick={() => window.location.href = '/'}
            className="mt-6 bg-blue-600 px-6 py-2 rounded-xl text-sm font-bold"
          >
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 pb-32">
      {/* Header fijo */}
      <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur-sm border-b border-purple-900/30">
        <div className="p-4">
          <div className="flex justify-between items-center mb-3">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-lg font-bold text-white">RECORRIDO OCUPACIÓN</h1>
                  <p className="text-xs text-purple-400 font-bold uppercase">{piso.nombre_piso}</p>
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-slate-500 uppercase">Operador</p>
              <p className="text-sm font-bold text-white">{perfilUsuario?.jerarquia} {perfilUsuario?.apellido}</p>
            </div>
          </div>
          
          {/* Tarjeta de resumen */}
          <div className="bg-slate-800/50 rounded-xl p-3">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-slate-400">
                🛏️ Total camas: <span className="text-white font-bold">{totalCamas}</span>
              </span>
              <span className="text-slate-400">
                👤 Ocupadas: <span className="text-yellow-400 font-bold">{totalOcupadas}</span>
              </span>
              <span className="text-slate-400">
                ✅ Disponibles: <span className="text-green-400 font-bold">{totalCamas - totalOcupadas}</span>
              </span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2.5">
              <div 
                className="bg-gradient-to-r from-purple-500 to-purple-400 h-2.5 rounded-full transition-all duration-500"
                style={{ width: `${porcentaje}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-500 mt-1.5">
              <span>{habitaciones.length} habitaciones</span>
              <span>{porcentaje.toFixed(0)}% ocupación</span>
              <span>{new Date().toLocaleDateString('es-AR')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Lista de habitaciones (SOLO INTERNACIÓN) */}
      <div className="p-4 space-y-3">
        {habitaciones.map(hab => {
          const ocupActual = ocupaciones[hab.id];
          const camasOcupadas = ocupActual?.camas_ocupadas || 0;
          const totalCamasHab = hab.total_camas || 1;
          
          let estado = '';
          let colorEstado = '';
          let iconoEstado = '';
          
          if (camasOcupadas === 0) {
            estado = 'VACÍA';
            colorEstado = 'bg-red-900/50 text-red-400 border-red-800/50';
            iconoEstado = '🔴';
          } else if (camasOcupadas === totalCamasHab) {
            estado = 'COMPLETA';
            colorEstado = 'bg-green-900/50 text-green-400 border-green-800/50';
            iconoEstado = '🟢';
          } else {
            estado = 'PARCIAL';
            colorEstado = 'bg-yellow-900/50 text-yellow-400 border-yellow-800/50';
            iconoEstado = '🟡';
          }
          
          return (
            <div 
              key={hab.id} 
              className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden hover:border-purple-700/50 transition-all"
            >
              <div className="p-4">
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-white">{hab.nombre}</span>
                    <span className="text-xs text-slate-500">({totalCamasHab} cama{totalCamasHab === 1 ? '' : 's'})</span>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${colorEstado} border`}>
                    {iconoEstado} {estado}
                  </span>
                </div>
                
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => actualizarCamasOcupadas(hab.id, camasOcupadas - 1)}
                    disabled={camasOcupadas === 0}
                    className="w-14 h-14 bg-red-900/30 rounded-xl text-3xl font-bold text-red-400 active:scale-95 transition-all disabled:opacity-30 disabled:active:scale-100"
                  >
                    -
                  </button>
                  
                  <div className="flex-1 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <input
                        type="number"
                        min="0"
                        max={totalCamasHab}
                        value={camasOcupadas}
                        onChange={(e) => actualizarCamasOcupadas(hab.id, parseInt(e.target.value) || 0)}
                        className="w-28 bg-slate-900 text-5xl font-black text-center text-purple-400 rounded-xl p-2 outline-none focus:ring-2 focus:ring-purple-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                      <span className="text-2xl text-slate-500 font-bold">/ {totalCamasHab}</span>
                    </div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">PACIENTES OCUPANDO CAMA</p>
                  </div>
                  
                  <button
                    onClick={() => actualizarCamasOcupadas(hab.id, camasOcupadas + 1)}
                    disabled={camasOcupadas === totalCamasHab}
                    className="w-14 h-14 bg-green-900/30 rounded-xl text-3xl font-bold text-green-400 active:scale-95 transition-all disabled:opacity-30 disabled:active:scale-100"
                  >
                    +
                  </button>
                </div>
              </div>
              
              {/* Barra de ocupación de la habitación */}
              <div className="h-1 bg-slate-700">
                <div 
                  className="h-full bg-purple-500 transition-all duration-300"
                  style={{ width: `${(camasOcupadas / totalCamasHab) * 100}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Botón guardar flotante */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-slate-950 via-slate-950 to-transparent pt-8">
        <button
          onClick={guardarTodas}
          disabled={guardando}
          className="w-full bg-gradient-to-r from-purple-600 to-purple-500 p-4 rounded-xl font-black text-white uppercase shadow-lg active:scale-95 disabled:opacity-50 disabled:active:scale-100 text-lg tracking-wider"
        >
          {guardando ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              GUARDANDO...
            </span>
          ) : (
            '✅ GUARDAR OCUPACIÓN'
          )}
        </button>
      </div>
      
      {/* Mensaje flotante */}
      {mensaje && (
        <div className="fixed top-20 left-4 right-4 bg-slate-900 border border-purple-600 text-white p-3 rounded-xl text-center shadow-2xl z-50 animate-in slide-in-from-top-5">
          <p className="font-bold text-sm">{mensaje}</p>
        </div>
      )}
    </div>
  );
};

export default RecorridoOcupacion;