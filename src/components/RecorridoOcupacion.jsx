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
  const [progreso, setProgreso] = useState({ actual: 0, total: 0 });

  // Función para cargar datos - optimizada
  const cargarDatos = useCallback(async () => {
    if (!slugPiso) {
      setError("Sector no identificado");
      setCargando(false);
      return;
    }
    
    setCargando(true);
    setError(null);
    
    try {
      // 1. Obtener el piso por slug (más rápido)
      const { data: pisoData, error: pisoError } = await supabase
        .from('pisos')
        .select('id, nombre_piso')
        .eq('slug', slugPiso)
        .single();
      
      if (pisoError) throw new Error("Sector no encontrado");
      setPiso(pisoData);
      
      // 2. Obtener habitaciones y sus configuraciones en UNA sola consulta
      const fecha = new Date().toISOString().split('T')[0];
      
      // Consulta optimizada: obtener habitaciones con su última configuración
      const { data: habitacionesData, error: habError } = await supabase
        .from('habitaciones_especiales')
        .select(`
          id, 
          nombre,
          ocupacion_habitaciones!left (
            tipo_habitacion,
            total_camas,
            camas_ocupadas,
            fecha,
            actualizado_en
          )
        `)
        .eq('piso_id', pisoData.id)
        .order('nombre');
      
      if (habError) throw new Error("Error al cargar habitaciones");
      
      if (!habitacionesData || habitacionesData.length === 0) {
        setHabitaciones([]);
        setCargando(false);
        return;
      }
      
      // 3. Procesar los datos - filtrar SOLO internación activa
      const habitacionesInternacion = [];
      const ocupState = {};
      
      for (const hab of habitacionesData) {
        // Ordenar ocupaciones por fecha y actualización (más reciente primero)
        const ocupacionesList = hab.ocupacion_habitaciones || [];
        const ocupReciente = ocupacionesList
          .filter(o => o.tipo_habitacion === 'activa')
          .sort((a, b) => {
            if (a.fecha !== b.fecha) return b.fecha.localeCompare(a.fecha);
            return new Date(b.actualizado_en) - new Date(a.actualizado_en);
          })[0];
        
        if (ocupReciente) {
          habitacionesInternacion.push({
            id: hab.id,
            nombre: hab.nombre,
            total_camas: ocupReciente.total_camas || 1
          });
          ocupState[hab.id] = {
            camas_ocupadas: ocupReciente.camas_ocupadas || 0
          };
        }
      }
      
      setHabitaciones(habitacionesInternacion);
      setOcupaciones(ocupState);
      setProgreso({ actual: 0, total: habitacionesInternacion.length });
      
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
      mostrarNotificacion("No hay habitaciones para guardar", 'error');
      return;
    }
    
    setGuardando(true);
    mostrarNotificacion("Guardando ocupación...", 'loading');
    
    const fechaISO = new Date().toISOString();
    const fechaSoloDia = fechaISO.split('T')[0];
    let guardados = 0;
    let errores = 0;
    
    try {
      // 1. Guardar el estado individual de cada habitación en ocupacion_habitaciones
      for (const hab of habitaciones) {
        const ocupActual = ocupaciones[hab.id];
        
        const payload = {
          habitacion_id: hab.id,
          fecha: fechaSoloDia,
          tipo_habitacion: 'activa',
          total_camas: hab.total_camas,
          camas_ocupadas: ocupActual?.camas_ocupadas || 0,
          observaciones: null,
          actualizado_por: perfilUsuario?.dni,
          actualizado_en: fechaISO
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

      // 2. REGISTRO EN EL LOG DE RECORRIDOS (Auditoría de todo el piso)
      if (guardados > 0) {
        // Calculamos totales para el log
        const totalCamasPiso = habitaciones.reduce((sum, h) => sum + (h.total_camas || 0), 0);
        const totalOcupadasPiso = habitaciones.reduce((sum, h) => sum + (ocupaciones[h.id]?.camas_ocupadas || 0), 0);
        const totalLibresPiso = totalCamasPiso - totalOcupadasPiso;

        const { error: logError } = await supabase
          .from('log_recorridos')
          .insert([{
            piso_id: piso.id,
            dni_responsible: perfilUsuario?.dni,
            jerarquia_hist: perfilUsuario?.jerarquia,
            apellido_hist: perfilUsuario?.apellido,
            nombre_hist: perfilUsuario?.nombre,
            camas_ocupadas: totalOcupadasPiso,
            camas_libres: totalLibresPiso,
            fecha_registro: fechaISO
          }]);

        if (logError) console.error("Error al registrar en Log de Recorridos:", logError);
      }
      
      // 3. Notificaciones finales
      if (errores === 0) {
        mostrarNotificacion(`Recorrido registrado en el Log y habitaciones guardadas`, 'success');
        setTimeout(() => cargarDatos(), 1000);
      } else {
        mostrarNotificacion(`⚠️ ${guardados} guardadas, ${errores} errores en habitaciones`, 'error');
      }
      
    } catch (err) {
      console.error("Error crítico en el proceso de guardado:", err);
      mostrarNotificacion("Error al procesar el recorrido", 'error');
    } finally {
      setGuardando(false);
    }
  };

  const mostrarNotificacion = (mensaje, tipo) => {
    if (tipo === 'success') {
      setMensajeExito(mensaje);
      setTimeout(() => setMensajeExito(null), 2500);
    } else if (tipo === 'error') {
      setError(mensaje);
      setTimeout(() => setError(null), 3000);
    } else if (tipo === 'loading') {
      // Para loading no mostramos mensaje flotante, solo el spinner en el botón
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
          <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-purple-400 text-sm font-bold uppercase tracking-wider">CARGANDO SECTOR...</p>
          <p className="text-slate-500 text-xs mt-2 animate-pulse">Obteniendo habitaciones de internación</p>
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
              <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-900/40">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div>
                <p className="text-[10px] text-purple-400 font-bold uppercase tracking-wider">RECORRIDO DE OCUPACIÓN</p>
                <h1 className="text-xl font-bold text-white">{piso?.nombre_piso}</h1>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[8px] text-slate-500 uppercase">Operador</p>
              <p className="text-xs font-bold text-white">{perfilUsuario?.jerarquia} {perfilUsuario?.apellido}</p>
            </div>
          </div>
          
          {/* Tarjeta de resumen con animación */}
          <div className="bg-slate-800/50 rounded-xl p-3 transition-all duration-300">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-slate-400">
                Total camas: <span className="text-white font-bold">{totalCamas}</span>
              </span>
              <span className="text-slate-400">
                Ocupadas: <span className="text-yellow-400 font-bold">{totalOcupadas}</span>
              </span>
              <span className="text-slate-400">
                Disponibles: <span className="text-green-400 font-bold">{totalCamas - totalOcupadas}</span>
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

      {/* Lista de habitaciones con animación de entrada */}
      <div className="p-4 space-y-3">
        {habitaciones.map((hab, index) => {
          const camasOcupadas = ocupaciones[hab.id]?.camas_ocupadas || 0;
          const totalCamasHab = hab.total_camas;
          
          let estado = '';
          let colorBg = '';
          let colorBorder = '';
          let iconoEstado = '';
          
          if (camasOcupadas === 0) {
            estado = 'VACÍA';
            colorBg = 'bg-red-900/20';
            colorBorder = 'border-red-800/50';
            iconoEstado = '🔴';
          } else if (camasOcupadas === totalCamasHab) {
            estado = 'COMPLETA';
            colorBg = 'bg-green-900/20';
            colorBorder = 'border-green-800/50';
            iconoEstado = '🟢';
          } else {
            estado = 'PARCIAL';
            colorBg = 'bg-yellow-900/20';
            colorBorder = 'border-yellow-800/50';
            iconoEstado = '🟡';
          }
          
          return (
            <div 
              key={hab.id} 
              className={`rounded-xl border p-4 ${colorBg} ${colorBorder} transition-all duration-300 hover:scale-[1.01] animate-in fade-in slide-in-from-bottom-2`}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="flex justify-between items-center mb-3">
                <div>
                  <span className="text-lg font-bold text-white">{hab.nombre}</span>
                  <span className="text-xs text-slate-400 ml-2">({totalCamasHab} cama{totalCamasHab === 1 ? '' : 's'})</span>
                </div>
                <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${colorBg.replace('/20', '/50')} border ${colorBorder}`}>
                  {iconoEstado} {estado}
                </span>
              </div>
              
              <div className="flex items-center gap-4">
                <button
                  onClick={() => actualizarCamas(hab.id, camasOcupadas - 1)}
                  disabled={camasOcupadas === 0}
                  className="w-12 h-12 bg-red-900/50 rounded-xl text-2xl font-bold text-red-400 active:scale-95 transition-all disabled:opacity-30 disabled:active:scale-100 hover:bg-red-900/70"
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
                      className="w-24 bg-slate-900 text-4xl font-black text-center text-purple-400 rounded-xl p-2 outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                    />
                    <span className="text-xl text-slate-500 font-bold">/ {totalCamasHab}</span>
                  </div>
                  <p className="text-[9px] text-slate-500 uppercase tracking-wider mt-1">PACIENTES OCUPANDO CAMA</p>
                </div>
                
                <button
                  onClick={() => actualizarCamas(hab.id, camasOcupadas + 1)}
                  disabled={camasOcupadas === totalCamasHab}
                  className="w-12 h-12 bg-green-900/50 rounded-xl text-2xl font-bold text-green-400 active:scale-95 transition-all disabled:opacity-30 disabled:active:scale-100 hover:bg-green-900/70"
                >
                  +
                </button>
              </div>
              
              {/* Barra de ocupación individual */}
              <div className="mt-3 h-1 bg-slate-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-purple-500 transition-all duration-300 rounded-full"
                  style={{ width: `${(camasOcupadas / totalCamasHab) * 100}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Botón guardar flotante con spinner integrado */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-slate-950 via-slate-950 to-transparent pt-8">
        <button
          onClick={guardarTodas}
          disabled={guardando}
          className={`w-full bg-gradient-to-r from-purple-600 to-purple-500 p-4 rounded-xl font-bold text-white uppercase shadow-lg transition-all text-lg tracking-wider ${
            guardando ? 'opacity-80 cursor-wait' : 'hover:scale-[1.02] active:scale-95'
          }`}
        >
          {guardando ? (
            <span className="flex items-center justify-center gap-3">
              <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              GUARDANDO OCUPACIÓN...
            </span>
          ) : (
            'GUARDAR OCUPACIÓN'
          )}
        </button>
      </div>

      {/* Notificación de éxito */}
      {mensajeExito && (
        <div className="fixed top-20 left-4 right-4 bg-slate-800 text-slate-200 p-4 rounded-lg text-center shadow-lg z-50 border border-slate-600">
          <div className="flex items-center justify-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="font-medium">{mensajeExito}</span>
          </div>
        </div>
      )}
      
      {/* Notificación de error */}
      {error && (
        <div className="fixed top-20 left-4 right-4 bg-red-600 text-white p-4 rounded-xl text-center shadow-2xl z-50 animate-in slide-in-from-top-5 fade-in duration-300">
          <div className="flex items-center justify-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span className="font-bold">{error}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecorridoOcupacion;