// components/RecorridosList.jsx
import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const RecorridosList = ({ esVisualizador = false }) => {
  const [recorridos, setRecorridos] = useState([]);
  const [cargando, setCargando] = useState(true);
  // Inicializar con la fecha actual en zona horaria local
  const [filtroFecha, setFiltroFecha] = useState(() => {
    const hoy = new Date();
    return hoy.toISOString().split('T')[0];
  });
  const [filtroPiso, setFiltroPiso] = useState('');
  const [pisos, setPisos] = useState([]);

  // Función para convertir una fecha YYYY-MM-DD a rango UTC correcto
  const getRangoFechasLocal = (fechaStr) => {
    // Crear fecha en zona horaria local (Argentina UTC-3)
    const [year, month, day] = fechaStr.split('-').map(Number);
    
    // Fecha inicio: 00:00:00 en hora local
    const startDate = new Date(year, month - 1, day, 0, 0, 0);
    // Fecha fin: 23:59:59 en hora local
    const endDate = new Date(year, month - 1, day, 23, 59, 59);
    
    return {
      start: startDate.toISOString(),
      end: endDate.toISOString()
    };
  };

  useEffect(() => {
    cargarPisos();
    cargarRecorridos();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    cargarRecorridos();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroFecha, filtroPiso]);

  const cargarPisos = async () => {
    const { data } = await supabase
      .from('pisos')
      .select('id, nombre_piso')
      .order('nombre_piso');
    setPisos(data || []);
  };

  const cargarRecorridos = async () => {
    setCargando(true);
    
    console.log('📅 Fecha seleccionada (local):', filtroFecha);
    
    let query = supabase
      .from('log_recorridos')
      .select(`
        *,
        pisos!inner (nombre_piso)
      `)
      .order('fecha_registro', { ascending: false });
    
    if (filtroFecha) {
      // Usar el rango correcto según zona horaria local
      const { start, end } = getRangoFechasLocal(filtroFecha);
      console.log('📅 Rango UTC:', { start, end });
      
      query = query
        .gte('fecha_registro', start)
        .lte('fecha_registro', end);
    }
    
    if (filtroPiso) {
      query = query.eq('piso_id', filtroPiso);
    }
    
    const { data, error } = await query.limit(200);
    
    console.log('📊 Resultados:', data?.length || 0, 'registros');
    
    if (!error && data) {
      setRecorridos(data);
    } else if (error) {
      console.error('Error cargando recorridos:', error);
    }
    
    setCargando(false);
  };

  const formatearFechaHora = (fechaISO) => {
    const fecha = new Date(fechaISO);
    // Mostrar en hora local de Argentina en formato 24h
    return {
      fecha: fecha.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' }),
      hora: fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
    };
  };

  const getColorOcupacion = (ocupadas, libres) => {
    const total = ocupadas + libres;
    const porcentaje = total > 0 ? (ocupadas / total) * 100 : 0;
    if (porcentaje >= 80) return 'bg-red-500/30 text-red-400';
    if (porcentaje >= 50) return 'bg-yellow-500/30 text-yellow-400';
    return 'bg-green-500/30 text-green-400';
  };

  const getPorcentajeOcupacion = (ocupadas, libres) => {
    const total = ocupadas + libres;
    return total > 0 ? ((ocupadas / total) * 100).toFixed(0) : 0;
  };

  const borrarRecorrido = async (id, operador, fecha) => {
    if (!window.confirm(`¿Estás seguro que quieres borrar el recorrido de ${operador} del ${fecha}?\n\n⚠️ Esta acción solo borra el registro del recorrido. Los datos de ocupación de habitaciones permanecerán intactos.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('log_recorridos')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error borrando recorrido:', error);
        alert('Error al borrar el recorrido. Intenta nuevamente.');
      } else {
        console.log('✅ Recorrido borrado exitosamente');
        cargarRecorridos(); // Recargar la lista
      }
    } catch (err) {
      console.error('Error:', err);
      alert('Error al borrar el recorrido. Intenta nuevamente.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="bg-slate-900 rounded-2xl p-4 border border-slate-800">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-slate-500 uppercase font-bold block mb-2">Filtrar por fecha</label>
            <input
              type="date"
              value={filtroFecha}
              onChange={(e) => setFiltroFecha(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white"
            />
            <p className="text-[10px] text-slate-500 mt-1">
              ⚠️ Mostrando registros del día seleccionado (hora Argentina)
            </p>
          </div>
          <div>
            <label className="text-xs text-slate-500 uppercase font-bold block mb-2">Filtrar por sector</label>
            <select
              value={filtroPiso}
              onChange={(e) => setFiltroPiso(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white"
            >
              <option value="">Todos los sectores</option>
              {pisos.map(piso => (
                <option key={piso.id} value={piso.id}>{piso.nombre_piso}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Tabla de recorridos */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-800/50">
              <tr className="text-left text-[10px] text-slate-400 uppercase font-bold">
                <th className="p-3">OPERADOR</th>
                <th className="p-3">FECHA</th>
                <th className="p-3">HORA</th>
                <th className="p-3">SECTOR</th>
                <th className="p-3">OCUPACIÓN</th>
                <th className="p-3">CAMAS</th>
                {!esVisualizador && <th className="p-3">ACCIONES</th>}
               </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {cargando ? (
                <tr>
                  <td colSpan={esVisualizador ? 6 : 7} className="p-8 text-center text-slate-500">
                    <div className="animate-pulse">Cargando recorridos...</div>
                  </td>
                </tr>
              ) : recorridos.length === 0 ? (
                <tr>
                  <td colSpan={esVisualizador ? 6 : 7} className="p-8 text-center text-slate-500">
                    📭 No hay recorridos registrados en esta fecha
                    <p className="text-xs mt-2 text-slate-600">
                      Sugerencia: Verifica que los recorridos se estén registrando correctamente al guardar estados de habitaciones.
                    </p>
                  </td>
                </tr>
              ) : (
                recorridos.map((rec) => {
                  const { fecha, hora } = formatearFechaHora(rec.fecha_registro);
                  const porcentaje = getPorcentajeOcupacion(rec.camas_ocupadas, rec.camas_libres);
                  const operadorCompleto = `${rec.jerarquia_hist} ${rec.apellido_hist}`;
                  
                  return (
                    <tr key={rec.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="p-3">
                        <div>
                          <p className="text-sm font-bold text-white">
                            {rec.jerarquia_hist} {rec.apellido_hist}
                          </p>
                          <p className="text-[9px] text-slate-500">{rec.nombre_hist}</p>
                        </div>
                      </td>
                      <td className="p-3">
                        <p className="text-sm text-white font-mono">{fecha}</p>
                      </td>
                      <td className="p-3">
                        <p className="text-sm font-mono text-blue-400 font-bold">{hora}</p>
                      </td>
                      <td className="p-3">
                        <p className="text-sm font-bold text-yellow-400">{rec.pisos?.nombre_piso || 'N/A'}</p>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="w-20 bg-slate-700 rounded-full h-2">
                            <div 
                              className="h-2 rounded-full bg-gradient-to-r from-purple-500 to-purple-400"
                              style={{ width: `${porcentaje}%` }}
                            />
                          </div>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${getColorOcupacion(rec.camas_ocupadas, rec.camas_libres)}`}>
                            {porcentaje}%
                          </span>
                        </div>
                      </td>
                      <td className="p-3">
                        <p className="text-sm">
                          <span className="text-yellow-400 font-bold">{rec.camas_ocupadas}</span>
                          <span className="text-slate-500"> / </span>
                          <span className="text-slate-400">{rec.camas_ocupadas + rec.camas_libres}</span>
                        </p>
                        <p className="text-[9px] text-slate-500">
                          {rec.camas_libres} libres
                        </p>
                      </td>
                      {!esVisualizador && (
                        <td className="p-3">
                          <button
                            onClick={() => borrarRecorrido(rec.id, operadorCompleto, fecha)}
                            className="bg-red-600/20 hover:bg-red-600/30 text-red-400 px-3 py-1 rounded-lg text-xs font-bold transition-colors"
                            title="Borrar recorrido (solo registro, no afecta datos de ocupación)"
                          >
                            🗑️ Borrar
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Botón refresh */}
      <div className="flex justify-between items-center">
        <button
          onClick={cargarRecorridos}
          disabled={cargando}
          className="text-slate-400 hover:text-white transition-colors text-sm flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Actualizar
        </button>
        
        {recorridos.length > 0 && (
          <p className="text-[10px] text-slate-500">
            Mostrando {recorridos.length} recorrido{recorridos.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>
    </div>
  );
};

export default RecorridosList;