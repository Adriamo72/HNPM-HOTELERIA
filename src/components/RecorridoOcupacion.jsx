// components/RecorridoOcupacion.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';

const RecorridoOcupacion = ({ perfilUsuario, slugPiso }) => {
  const [piso, setPiso] = useState(null);
  const [habitaciones, setHabitaciones] = useState([]);
  const [ocupaciones, setOcupaciones] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [mensajeExito, setMensajeExito] = useState(null);

  // Función para cargar datos - memoizada para evitar loops
  const cargarDatos = useCallback(async () => {
    if (!slugPiso) {
      setError("Sector no identificado");
      setCargando(false);
      return;
    }
    
    setCargando(true);
    setError(null);
    
    try {
      // 1. Obtener el piso por slug
      const { data: pisoData, error: pisoError } = await supabase
        .from('pisos')
        .select('*')
        .eq('slug', slugPiso)
        .single();
      
      if (pisoError) throw new Error("Sector no encontrado");
      setPiso(pisoData);
      
      // 2. Obtener TODAS las habitaciones del piso
      const { data: habitacionesData, error: habError } = await supabase
        .from('habitaciones_especiales')
        .select('*')
        .eq('piso_id', pisoData.id)
        .order('nombre');
      
      if (habError) throw new Error("Error al cargar habitaciones");
      
      if (!habitacionesData || habitacionesData.length === 0) {
        setHabitaciones([]);
        setCargando(false);
        return;
      }
      
      // 3. Obtener la configuración de ocupación para la fecha actual
      const fecha = new Date().toISOString().split('T')[0];
      const { data: ocupacionesData } = await supabase
        .from('ocupacion_habitaciones')
        .select('*')
        .in('habitacion_id', habitacionesData.map(h => h.id))
        .eq('fecha', fecha);
      
      // 4. Crear mapa de ocupaciones existentes
      const ocupMap = {};
      (ocupacionesData || []).forEach(ocup => {
        ocupMap[ocup.habitacion_id] = ocup;
      });
      
      // 5. FILTRAR SOLO habitaciones de INTERNACIÓN
      const habitacionesInternacion = [];
      const ocupState = {};
      
      for (const hab of habitacionesData) {
        const ocupExistente = ocupMap[hab.id];
        
        // Si no tiene configuración, buscar la última
        let tipoHabitacion = null;
        let totalCamas = 1;
        let camasOcupadas = 0;
        
        if (ocupExistente) {
          tipoHabitacion = ocupExistente.tipo_habitacion;
          totalCamas = ocupExistente.total_camas || 1;
          camasOcupadas = ocupExistente.camas_ocupadas || 0;
        } else {
          const { data: ultimoRegistro } = await supabase
            .from('ocupacion_habitaciones')
            .select('tipo_habitacion, total_camas')
            .eq('habitacion_id', hab.id)
            .order('fecha', { ascending: false })
            .limit(1)
            .maybeSingle();
          
          if (ultimoRegistro) {
            tipoHabitacion = ultimoRegistro.tipo_habitacion;
            totalCamas = ultimoRegistro.total_camas || 1;
          }
        }
        
        // Solo agregar si es INTERNACIÓN (activa)
        if (tipoHabitacion === 'activa') {
          habitacionesInternacion.push({
            id: hab.id,
            nombre: hab.nombre,
            total_camas: totalCamas
          });
          ocupState[hab.id] = { camas_ocupadas: camasOcupadas };
        }
      }
      
      setHabitaciones(habitacionesInternacion);
      setOcupaciones(ocupState);
      
    } catch (err) {
      console.error("Error:", err);
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, [slugPiso]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  const actualizarCamas = (habitacionId, nuevoValor) => {
    const habitacion = habitaciones.find(h => h.id === habitacionId);
    if (!habitacion) return;
    
    const maxCamas = habitacion.total_camas;
    const valor = Math.min(maxCamas, Math.max(0, nuevoValor));
    
    setOcupaciones(prev => ({
      ...prev,
      [habitacionId]: { camas_ocupadas: valor }
    }));
  };

  const guardarTodas = async () => {
    if (habitaciones.length === 0) {
      setError("No hay habitaciones para guardar");
      setTimeout(() => setError(null), 2000);
      return;
    }
    
    setGuardando(true);
    const fecha = new Date().toISOString().split('T')[0];
    let guardados = 0;
    let errores = 0;
    
    try {
      for (const hab of habitaciones) {
        const ocupActual = ocupaciones[hab.id];
        
        const payload = {
          habitacion_id: hab.id,
          fecha: fecha,
          tipo_habitacion: 'activa',
          total_camas: hab.total_camas,
          camas_ocupadas: ocupActual?.camas_ocupadas || 0,
          observaciones: null,
          actualizado_por: perfilUsuario?.dni,
          actualizado_en: new Date().toISOString()
        };
        
        const { error } = await supabase
          .from('ocupacion_habitaciones')
          .upsert(payload, { onConflict: 'habitacion_id,fecha' });
        
        if (error) {
          errores++;
        } else {
          guardados++;
        }
      }
      
      if (errores === 0) {
        setMensajeExito(`✅ ${guardados} habitaciones guardadas`);
        setTimeout(() => setMensajeExito(null), 2000);
        // Recargar datos
        cargarDatos();
      } else {
        setError(`⚠️ ${guardados} guardadas, ${errores} errores`);
        setTimeout(() => setError(null), 3000);
      }
      
    } catch (err) {
      setError("Error al guardar");
      setTimeout(() => setError(null), 3000);
    } finally {
      setGuardando(false);
    }
  };

  // Calcular estadísticas
  const totalCamas = habitaciones.reduce((sum, hab) => sum + (hab.total_camas || 1), 0);
  const totalOcupadas = habitaciones.reduce((sum, hab) => sum + (ocupaciones[hab.id]?.camas_ocupadas || 0), 0);
  const porcentaje = totalCamas > 0 ? (totalOcupadas / totalCamas) * 100 : 0;

  // Pantalla de carga
  if (cargando) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-purple-400 text-sm font-bold">Cargando sector...</p>
        </div>
      </div>
    );
  }

  // Error
  if (error && !cargando && habitaciones.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 flex items-center justify-center p-6">
        <div className="bg-red-900/20 rounded-2xl p-8 text-center max-w-md border border-red-800">
          <div className="text-5xl mb-4">❌</div>
          <h2 className="text-xl font-bold text-white mb-2">Error</h2>
          <p className="text-slate-400 text-sm">{error}</p>
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

  // Sin habitaciones
  if (habitaciones.length === 0 && !cargando) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 flex items-center justify-center p-6">
        <div className="bg-slate-900 rounded-2xl p-8 text-center max-w-md border border-slate-800">
          <div className="text-5xl mb-4">🏥</div>
          <h2 className="text-xl font-bold text-white mb-2">Sin habitaciones de internación</h2>
          <p className="text-slate-400 text-sm">
            Este sector no tiene habitaciones configuradas para internación.
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

  // Pantalla principal
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 pb-28">
      {/* Header del recorrido */}
      <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur-sm border-b border-purple-900/30">
        <div className="p-4">
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div>
                <p className="text-[10px] text-purple-400 font-bold uppercase">RECORRIDO</p>
                <h1 className="text-xl font-bold text-white">{piso?.nombre_piso}</h1>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[8px] text-slate-500 uppercase">Operador</p>
              <p className="text-xs font-bold text-white">{perfilUsuario?.apellido}</p>
            </div>
          </div>
          
          {/* Resumen */}
          <div className="bg-slate-800/50 rounded-xl p-3">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-slate-400">Total camas: <span className="text-white font-bold">{totalCamas}</span></span>
              <span className="text-slate-400">Ocupadas: <span className="text-yellow-400 font-bold">{totalOcupadas}</span></span>
              <span className="text-slate-400">Disponibles: <span className="text-green-400 font-bold">{totalCamas - totalOcupadas}</span></span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2">
              <div className="bg-purple-500 h-2 rounded-full transition-all" style={{ width: `${porcentaje}%` }} />
            </div>
            <div className="flex justify-between text-[10px] text-slate-500 mt-1">
              <span>{habitaciones.length} habitaciones</span>
              <span>{porcentaje.toFixed(0)}% ocupación</span>
            </div>
          </div>
        </div>
      </div>

      {/* Lista de habitaciones */}
      <div className="p-4 space-y-3">
        {habitaciones.map(hab => {
          const camasOcupadas = ocupaciones[hab.id]?.camas_ocupadas || 0;
          const totalCamasHab = hab.total_camas;
          
          let estado = '';
          let colorBg = '';
          if (camasOcupadas === 0) {
            estado = 'VACÍA';
            colorBg = 'bg-red-900/30 border-red-800/50';
          } else if (camasOcupadas === totalCamasHab) {
            estado = 'COMPLETA';
            colorBg = 'bg-green-900/30 border-green-800/50';
          } else {
            estado = 'PARCIAL';
            colorBg = 'bg-yellow-900/30 border-yellow-800/50';
          }
          
          return (
            <div key={hab.id} className={`rounded-xl border p-4 ${colorBg}`}>
              <div className="flex justify-between items-center mb-3">
                <div>
                  <span className="text-lg font-bold text-white">{hab.nombre}</span>
                  <span className="text-xs text-slate-400 ml-2">({totalCamasHab} camas)</span>
                </div>
                <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-slate-800/50">
                  {estado}
                </span>
              </div>
              
              <div className="flex items-center gap-4">
                <button
                  onClick={() => actualizarCamas(hab.id, camasOcupadas - 1)}
                  disabled={camasOcupadas === 0}
                  className="w-12 h-12 bg-red-900/50 rounded-xl text-2xl font-bold text-red-400 active:scale-95 disabled:opacity-30"
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
                      onChange={(e) => actualizarCamas(hab.id, parseInt(e.target.value) || 0)}
                      className="w-24 bg-slate-900 text-4xl font-black text-center text-purple-400 rounded-xl p-2 outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <span className="text-xl text-slate-500">/ {totalCamasHab}</span>
                  </div>
                  <p className="text-[9px] text-slate-500 uppercase mt-1">PACIENTES</p>
                </div>
                
                <button
                  onClick={() => actualizarCamas(hab.id, camasOcupadas + 1)}
                  disabled={camasOcupadas === totalCamasHab}
                  className="w-12 h-12 bg-green-900/50 rounded-xl text-2xl font-bold text-green-400 active:scale-95 disabled:opacity-30"
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Botón guardar */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-slate-950 to-transparent">
        <button
          onClick={guardarTodas}
          disabled={guardando}
          className="w-full bg-gradient-to-r from-purple-600 to-purple-500 p-4 rounded-xl font-bold text-white uppercase shadow-lg active:scale-95 disabled:opacity-50"
        >
          {guardando ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              GUARDANDO...
            </span>
          ) : (
            '✅ GUARDAR OCUPACIÓN'
          )}
        </button>
      </div>

      {/* Mensajes flotantes */}
      {mensajeExito && (
        <div className="fixed top-20 left-4 right-4 bg-green-600 text-white p-3 rounded-xl text-center shadow-xl z-50">
          {mensajeExito}
        </div>
      )}
      
      {error && (
        <div className="fixed top-20 left-4 right-4 bg-red-600 text-white p-3 rounded-xl text-center shadow-xl z-50">
          {error}
        </div>
      )}
    </div>
  );
};

export default RecorridoOcupacion;