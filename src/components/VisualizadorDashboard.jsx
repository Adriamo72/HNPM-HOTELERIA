// components/VisualizadorDashboard.jsx
import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import CroquisPiso from './CroquisPiso';
import SpinnerCarga from './SpinnerCarga';
import RecorridosList from './RecorridosList';

const VisualizadorDashboard = () => {
  const [activeTab, setActiveTab] = useState('croquis');
  const [pisos, setPisos] = useState([]);
  const [habitacionesEspeciales, setHabitacionesEspeciales] = useState([]);
  const [movimientosAgrupados, setMovimientosAgrupados] = useState({});
  const [stockPañol, setStockPañol] = useState({});
  const [stockUso, setStockUso] = useState({});
  const [stockLavadero, setStockLavadero] = useState({});
  const [cargandoCroquis, setCargandoCroquis] = useState(false);
  const [cargandoMonitor, setCargandoMonitor] = useState(false);
  const [notificacion, setNotificacion] = useState({ visible: false, mensaje: '' });
  const [pisoSeleccionado, setPisoSeleccionado] = useState('');
  const [croquisKey, setCroquisKey] = useState(0);
  const [fechaSeleccionada, setFechaSeleccionada] = useState(new Date().toISOString().split('T')[0]);

  const ITEMS_REQUERIDOS = ['SABANAS', 'TOALLAS', 'TOALLONES', 'FRAZADAS', 'SALEAS HULE', 'SALEAS TELA', 'FUNDAS', 'CUBRECAMAS'];

  useEffect(() => {
    cargarDatos();
  }, []);

  // Recargar datos cuando se cambia a la pestaña monitor y no hay datos
  useEffect(() => {
    if (activeTab === 'monitor' && Object.keys(stockPañol).length === 0 && !cargandoMonitor) {
      cargarDatos();
    }
  }, [activeTab, stockPañol, cargandoMonitor]);

  const mostrarSplash = (mensaje) => {
    setNotificacion({ visible: true, mensaje });
    setTimeout(() => setNotificacion({ visible: false, mensaje: '' }), 2500);
  };

  const cargarDatos = async () => {
    setCargandoCroquis(true);
    setCargandoMonitor(true);
    
    try {
      // Cargar pisos y habitaciones
      const resPisos = await supabase.from('pisos').select('*').order('nombre_piso');
      const resHabs = await supabase.from('habitaciones_especiales').select('*').order('nombre');
      setPisos(resPisos.data || []);
      setHabitacionesEspeciales(resHabs.data || []);
      
      // Seleccionar automáticamente el piso más alto
      if (resPisos.data && resPisos.data.length > 0) {
        const pisoMasAlto = resPisos.data.reduce((prev, current) => {
          const numPrev = parseInt(prev.nombre_piso.replace(/\D/g, '')) || 0;
          const numCurrent = parseInt(current.nombre_piso.replace(/\D/g, '')) || 0;
          return numCurrent > numPrev ? current : prev;
        });
        setPisoSeleccionado(pisoMasAlto.id);
      }
      
      // Cargar movimientos para monitor
      const { data: movs } = await supabase
        .from('movimientos_stock')
        .select(`
          *, 
          pisos(nombre_piso, id), 
          pañolero:personal!movimientos_stock_dni_pañolero_fkey(jerarquia, apellido, nombre), 
          enfermero:personal!movimientos_stock_dni_enfermero_fkey(jerarquia, apellido, nombre)
        `)
        .order('created_at', { ascending: false })
        .limit(500);
      
      // Cargar stocks
      const stockPañolMap = {};
      const stockUsoMap = {};
      const stockLavaderoMap = {};
      
      if (resPisos.data && resPisos.data.length > 0) {
        for (const piso of resPisos.data) {
          stockPañolMap[piso.nombre_piso] = {};
          stockUsoMap[piso.nombre_piso] = {};
          stockLavaderoMap[piso.nombre_piso] = {};
          
          for (const item of ITEMS_REQUERIDOS) {
            const { data: stockData } = await supabase
              .from('stock_piso')
              .select('stock_pañol, stock_en_uso, stock_lavadero')
              .eq('piso_id', piso.id)
              .eq('item', item)
              .maybeSingle();
            
            stockPañolMap[piso.nombre_piso][item] = stockData?.stock_pañol || 0;
            stockUsoMap[piso.nombre_piso][item] = stockData?.stock_en_uso || 0;
            stockLavaderoMap[piso.nombre_piso][item] = stockData?.stock_lavadero || 0;
          }
        }
      }
      
      const agrupados = movs ? movs.reduce((acc, curr) => {
        const nombrePiso = curr.pisos?.nombre_piso || "Sector Desconocido";
        if (!acc[nombrePiso]) acc[nombrePiso] = [];
        acc[nombrePiso].push(curr);
        return acc;
      }, {}) : {};
      
      setMovimientosAgrupados(agrupados);
      setStockPañol(stockPañolMap);
      setStockUso(stockUsoMap);
      setStockLavadero(stockLavaderoMap);
      
      mostrarSplash("Datos actualizados correctamente");
    } catch (error) {
      console.error(error);
      mostrarSplash("Error al sincronizar datos");
    } finally {
      setCargandoCroquis(false);
      setCargandoMonitor(false);
    }
  };

  const calcularTotalGlobal = () => {
    const total = {};
    ITEMS_REQUERIDOS.forEach(item => total[item] = 0);
    Object.keys(stockPañol).forEach(piso => {
      ITEMS_REQUERIDOS.forEach(item => {
        total[item] += (stockPañol[piso]?.[item] || 0) + (stockUso[piso]?.[item] || 0) + (stockLavadero[piso]?.[item] || 0);
      });
    });
    return total;
  };

  const totalGlobal = calcularTotalGlobal();
  const STOCK_CRITICO = 5;

  const formatearFechaGuardia = (fechaISO) => {
    const fecha = new Date(fechaISO);
    const opciones = { weekday: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    return fecha.toLocaleDateString('es-AR', opciones);
  };

  return (
    <div className="p-6 md:p-8 bg-slate-950 min-h-screen text-slate-100 font-sans">
      {/* Banner de solo lectura */}
      <div className="mb-6 bg-green-900/20 border border-green-700 rounded-xl p-3 text-center">
        <p className="text-green-400 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          MODO VISUALIZADOR - Solo lectura
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-3 mb-8 bg-slate-900 p-1.5 rounded-xl border border-slate-800 w-fit">
        <button 
          onClick={() => setActiveTab('croquis')} 
          className={`px-8 py-2.5 rounded-lg text-sm font-semibold uppercase transition-all ${activeTab === 'croquis' ? 'bg-green-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
        >
          Pisos
        </button>
        <button 
          onClick={() => setActiveTab('recorridos')} 
          className={`px-8 py-2.5 rounded-lg text-sm font-semibold uppercase transition-all ${activeTab === 'recorridos' ? 'bg-green-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
        >
          Recorridos
        </button>
        <button 
          onClick={() => setActiveTab('monitor')} 
          className={`px-8 py-2.5 rounded-lg text-sm font-semibold uppercase transition-all ${activeTab === 'monitor' ? 'bg-green-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
        >
          Monitor de Stock
        </button>
      </div>

      {/* Panel CROQUIS */}
      {activeTab === 'croquis' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-semibold text-white uppercase tracking-tighter">
              MAPA DE SECTORES
            </h2>
            <div className="flex gap-2">
              <select
                value={pisoSeleccionado}
                onChange={(e) => {
                  setPisoSeleccionado(e.target.value);
                  setCroquisKey(prev => prev + 1);
                }}
                className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white"
              >
                <option value="">Seleccionar ...</option>
                {pisos.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre_piso}</option>
                ))}
              </select>
              <input 
                type="date" 
                value={fechaSeleccionada}
                onChange={(e) => setFechaSeleccionada(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
              />
              <button 
                onClick={() => {
                  cargarDatos();
                  setCroquisKey(prev => prev + 1);
                }} 
                disabled={cargandoCroquis}
                className="text-2xl p-2 rounded-lg font-bold text-white hover:text-slate-300 transition-all disabled:opacity-50"
              >
                {cargandoCroquis ? '🔄' : '🔄'}
              </button>
            </div>
          </div>
          
          {cargandoCroquis ? (
            <SpinnerCarga mensaje="CARGANDO SECTORES..." />
          ) : pisoSeleccionado ? (
            <CroquisPiso
              key={croquisKey}
              pisoId={pisoSeleccionado}
              pisoNombre={pisos.find(p => String(p.id) === String(pisoSeleccionado))?.nombre_piso}
              habitaciones={habitacionesEspeciales.filter(h => String(h.piso_id) === String(pisoSeleccionado))}
              esVisualizador={true}
              fechaConsulta={fechaSeleccionada}
            />
          ) : (
            <div className="bg-slate-800 rounded-xl p-12 text-center">
              <p className="text-slate-400">Selecciona un piso para ver su plano</p>
            </div>
          )}
        </div>
      )}

       {/* Panel Recorridos - Solo lectura */}
      {activeTab === 'recorridos' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-semibold text-white uppercase tracking-tighter">
              REGISTRO DE RECORRIDOS
            </h2>
            <p className="text-xs text-slate-500">
              Historial de recorridos de ocupación
            </p>
          </div>
          <RecorridosList />
        </div>
      )}

      {/* Panel MONITOR - Solo lectura */}
      {activeTab === 'monitor' && (
        <div className="space-y-8">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-semibold text-white uppercase tracking-tighter">Monitor de Stock</h2>
            <button 
              onClick={() => cargarDatos()} 
              disabled={cargandoMonitor}
              className="text-2xl p-2 rounded-lg font-bold text-white hover:text-slate-300 transition-all disabled:opacity-50"
            >
              {cargandoMonitor ? '⌛' : '🔄'}
            </button>
          </div>
          
          {cargandoMonitor ? (
            <SpinnerCarga mensaje="CARGANDO MOVIMIENTOS..." />
          ) : (
            <>
              {/* Stock Total Consolidado */}
              <div className="bg-blue-900/10 border border-blue-900/30 rounded-2xl p-6">
                <p className="text-sm font-semibold text-blue-400 uppercase tracking-wider mb-4 text-center">
                  STOCK TOTAL REAL (Pañol + En Uso + Lavadero)
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
                  {ITEMS_REQUERIDOS.map(item => (
                    <div key={item} className="bg-slate-900/80 p-3 rounded-xl border border-blue-800/40 text-center">
                      <span className="text-[10px] text-slate-500 font-semibold uppercase block">{item}</span>
                      <span className={`text-2xl font-semibold ${totalGlobal[item] < STOCK_CRITICO ? 'text-red-500' : 'text-blue-400'}`}>
                        {totalGlobal[item] || 0}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Stock por Piso */}
              {Object.keys(stockPañol).map((nombrePiso) => (
                <div key={nombrePiso} className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
                  <div className="bg-slate-800/40 px-6 py-3 border-b border-slate-800">
                    <span className="text-xl font-semibold text-green-400 uppercase tracking-wider">{nombrePiso}</span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 bg-slate-950/50 border-b border-slate-800">
                    <div className="bg-green-900/20 p-3 rounded-xl">
                      <p className="text-sm font-semibold text-green-500 uppercase text-center">PAÑOL</p>
                      <div className="grid grid-cols-4 gap-1 mt-2">
                        {ITEMS_REQUERIDOS.map(item => (
                          <div key={item} className="text-center">
                            <span className="text-[8px] text-slate-500 block">{item.substring(0, 8)}</span>
                            <span className="text-base font-semibold text-green-400">
                              {stockPañol[nombrePiso]?.[item] || 0}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="bg-yellow-900/20 p-3 rounded-xl">
                      <p className="text-sm font-semibold text-yellow-500 uppercase text-center">EN USO</p>
                      <div className="grid grid-cols-4 gap-1 mt-2">
                        {ITEMS_REQUERIDOS.map(item => (
                          <div key={item} className="text-center">
                            <span className="text-[8px] text-slate-500 block">{item.substring(0, 8)}</span>
                            <span className="text-sm font-semibold text-yellow-400">{stockUso[nombrePiso]?.[item] || 0}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="bg-red-900/20 p-3 rounded-xl">
                      <p className="text-sm font-semibold text-red-500 uppercase text-center">LAVADERO</p>
                      <div className="grid grid-cols-4 gap-1 mt-2">
                        {ITEMS_REQUERIDOS.map(item => (
                          <div key={item} className="text-center">
                            <span className="text-[8px] text-slate-500 block">{item.substring(0, 8)}</span>
                            <span className="text-sm font-semibold text-red-400">{stockLavadero[nombrePiso]?.[item] || 0}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  
                  {/* Historial de movimientos - Solo lectura, sin botón eliminar */}
                  <div className="p-2 space-y-1 max-h-[500px] overflow-y-auto bg-slate-950/20">
                    {movimientosAgrupados[nombrePiso]?.length > 0 ? (
                      movimientosAgrupados[nombrePiso].map((m) => (
                        <div key={m.id} className="bg-slate-950/50 px-3 py-1.5 rounded-lg border border-slate-800/50 flex items-center gap-2 text-xs">
                          <div className="w-[22%] shrink-0 flex items-center gap-2">
                            <p className="font-semibold text-white text-[11px] uppercase">{m.item}</p>
                            <p className="text-[10px] text-blue-500 font-semibold">{formatearFechaGuardia(m.created_at)}</p>
                          </div>
                          <div className="flex-1 flex items-center justify-around gap-2">
                            <div className="text-center min-w-[50px]">
                              <span className="text-[9px] text-green-500 font-semibold uppercase block">Lav→Pañol</span>
                              <p className="text-sm font-semibold text-green-500">{m.entregado_limpio > 0 ? `+${m.entregado_limpio}` : '—'}</p>
                            </div>
                            <div className="text-center min-w-[50px]">
                              <span className="text-[9px] text-orange-500 font-semibold uppercase block">Pañol→Uso</span>
                              <p className="text-sm font-semibold text-orange-500">{m.egreso_limpio > 0 ? `-${m.egreso_limpio}` : '—'}</p>
                            </div>
                            <div className="text-center min-w-[50px]">
                              <span className="text-[9px] text-red-500 font-semibold uppercase block">Uso→Lav</span>
                              <p className="text-sm font-semibold text-red-500">{m.retirado_sucio > 0 ? m.retirado_sucio : '—'}</p>
                            </div>
                          </div>
                          <div className="w-[28%] shrink-0 flex items-center justify-end gap-2">
                            {m.novedades && m.novedades !== 'Sin novedades' && m.novedades !== 'Sin novedad' && (
                              <span className="text-[9px] text-yellow-500 font-semibold truncate max-w-[100px]" title={m.novedades}>
                                📝 {m.novedades.length > 12 ? m.novedades.substring(0, 12) + '...' : m.novedades}
                              </span>
                            )}
                            {m.es_cambio_habitacion && <span className="text-[8px] bg-purple-900/50 px-1.5 py-0.5 rounded">HAB</span>}
                            {m.novedades?.includes('Ajuste automático') && <span className="text-[8px] bg-orange-900/50 px-1.5 py-0.5 rounded">⚡</span>}
                            <p className="text-[9px] text-slate-400 font-semibold uppercase truncate">{m.pañolero?.jerarquia} {m.pañolero?.apellido}</p>
                            {/* Sin botón de eliminar para visualizadores */}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center text-slate-500 text-sm py-6">📭 Sin movimientos registrados en este sector</div>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Notificación flotante */}
      {notificacion.visible && (
        <div className="fixed bottom-6 right-6 bg-slate-800 text-slate-200 px-4 py-3 rounded-lg shadow-lg font-medium text-sm z-[100] border border-slate-600">
          {notificacion.mensaje}
        </div>
      )}
    </div>
  );
};

export default VisualizadorDashboard;