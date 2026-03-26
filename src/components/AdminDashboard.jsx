import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('historial');
  const [personal, setPersonal] = useState([]);
  const [pisos, setPisos] = useState([]);
  const [habitacionesEspeciales, setHabitacionesEspeciales] = useState([]); 
  const [movimientosAgrupados, setMovimientosAgrupados] = useState({});
  const [stockPañol, setStockPañol] = useState({});
  const [stockUso, setStockUso] = useState({});
  const [stockLavadero, setStockLavadero] = useState({});
  const [auditoriaHabilitada, setAuditoriaHabilitada] = useState(false);
  const [notificacion, setNotificacion] = useState({ visible: false, mensaje: '' });
  const [sincronizando, setSincronizando] = useState(false);
  
  const ITEMS_REQUERIDOS = ['SABANAS', 'TOALLAS', 'TOALLONES', 'FRAZADAS', 'SALEAS HULE', 'SALEAS TELA', 'FUNDAS', 'CUBRECAMAS'];
  const STOCK_CRITICO = 5;

  const [nuevoMiembro, setNuevoMiembro] = useState({ dni: '', nombre: '', apellido: '', jerarquia: '', celular: '', rol: 'pañolero' });
  const [nuevoPiso, setNuevoPiso] = useState({ nombre_piso: '' });

  useEffect(() => {
    cargarDatos();
  }, []);

  const mostrarSplash = (mensaje) => {
    setNotificacion({ visible: true, mensaje });
    setTimeout(() => setNotificacion({ visible: false, mensaje: '' }), 2500);
  };

  // ==================== FUNCIÓN PARA RECALCULAR STOCK DE UN PISO ====================
  const recalcularStockPiso = async (pisoId) => {
    try {
      const { data: movimientos, error: mError } = await supabase
        .from('movimientos_stock')
        .select('*')
        .eq('piso_id', pisoId)
        .order('created_at', { ascending: true });
      
      if (mError) throw mError;
      
      const stocksIniciales = {};
      ITEMS_REQUERIDOS.forEach(item => {
        stocksIniciales[item] = { pañol: 0, uso: 0, lavadero: 0 };
      });
      
      for (const mov of movimientos) {
        const item = mov.item;
        if (!stocksIniciales[item]) continue;
        
        if (mov.entregado_limpio > 0) {
          stocksIniciales[item].pañol += mov.entregado_limpio;
          stocksIniciales[item].lavadero = Math.max(0, stocksIniciales[item].lavadero - mov.entregado_limpio);
        }
        
        if (mov.egreso_limpio > 0) {
          stocksIniciales[item].pañol -= mov.egreso_limpio;
          stocksIniciales[item].uso += mov.egreso_limpio;
        }
        
        if (mov.retirado_sucio > 0) {
          stocksIniciales[item].uso = Math.max(0, stocksIniciales[item].uso - mov.retirado_sucio);
          stocksIniciales[item].lavadero += mov.retirado_sucio;
        }
      }
      
      for (const item of ITEMS_REQUERIDOS) {
        const { error: upsertError } = await supabase
          .from('stock_piso')
          .upsert({
            piso_id: pisoId,
            item: item,
            stock_pañol: Math.max(0, stocksIniciales[item]?.pañol || 0),
            stock_en_uso: Math.max(0, stocksIniciales[item]?.uso || 0),
            stock_lavadero: Math.max(0, stocksIniciales[item]?.lavadero || 0),
            updated_at: new Date()
          }, { onConflict: 'piso_id,item' });
        
        if (upsertError) console.error(`Error actualizando ${item}:`, upsertError);
      }
      
      return true;
    } catch (error) {
      console.error("Error recalculando stock:", error);
      throw error;
    }
  };

  // ==================== CARGAR DATOS PRINCIPAL ====================
  const cargarDatos = async () => {
    setSincronizando(true);
    mostrarSplash("🔄 SINCRONIZANDO...");
    
    try {
      const resPers = await supabase.from('personal').select('*').order('apellido');
      const resPisos = await supabase.from('pisos').select('*').order('nombre_piso');
      const resHabs = await supabase.from('habitaciones_especiales').select('*').order('nombre');
      
      const { data: config } = await supabase.from('configuracion_sistema').select('valor').eq('clave', 'MODO_AUDITORIA').single();
      setAuditoriaHabilitada(config?.valor === 'true');

      const { data: movs } = await supabase.from('movimientos_stock')
        .select(`
          *, 
          pisos(nombre_piso, id), 
          pañolero:personal!movimientos_stock_dni_pañolero_fkey(jerarquia, apellido, nombre), 
          enfermero:personal!movimientos_stock_dni_enfermero_fkey(jerarquia, apellido, nombre)
        `)
        .order('created_at', { ascending: false })
        .limit(500);

      const stockPañolMap = {};
      const stockUsoMap = {};
      const stockLavaderoMap = {};
      
      if (resPisos.data) {
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
      
      setPersonal(resPers.data || []);
      setPisos(resPisos.data || []);
      setHabitacionesEspeciales(resHabs.data || []);
      setMovimientosAgrupados(agrupados);
      setStockPañol(stockPañolMap);
      setStockUso(stockUsoMap);
      setStockLavadero(stockLavaderoMap);
      
      mostrarSplash("✅ DATOS ACTUALIZADOS");
    } catch (error) {
      console.error(error);
      mostrarSplash("❌ ERROR AL SINCRONIZAR");
    } finally {
      setSincronizando(false);
    }
  };

  // ==================== ELIMINAR MOVIMIENTO CON RECÁLCULO ====================
  const eliminarMovimiento = async (id) => {
    if (window.confirm("⚠️ ¿ELIMINAR REGISTRO?\n\nEl stock se recalculará automáticamente después de eliminar.")) {
      mostrarSplash("🗑️ ELIMINANDO REGISTRO...");
      
      try {
        const { data: movimiento, error: getError } = await supabase
          .from('movimientos_stock')
          .select('piso_id')
          .eq('id', id)
          .single();
        
        if (getError) throw getError;
        
        const { error: delError } = await supabase
          .from('movimientos_stock')
          .delete()
          .eq('id', id);
        
        if (delError) throw delError;
        
        mostrarSplash("🔄 RECALCULANDO STOCK...");
        await recalcularStockPiso(movimiento.piso_id);
        mostrarSplash("✅ Registro eliminado y stock actualizado");
        cargarDatos();
        
      } catch (error) {
        console.error("Error:", error);
        mostrarSplash("❌ ERROR AL ELIMINAR");
      }
    }
  };

  // ==================== ELIMINAR PISO COMPLETO ====================
  const eliminarPiso = async (pisoId, pisoNombre) => {
    if (window.confirm(`⚠️ ¿ELIMINAR COMPLETAMENTE el piso "${pisoNombre}"?\n\nSe eliminarán:\n- Todos los movimientos de stock\n- Todo el stock registrado (pañol, uso, lavadero)\n- Todas las habitaciones especiales\n- El piso en sí\n\nEsta acción NO SE PUEDE DESHACER.`)) {
      mostrarSplash("🗑️ ELIMINANDO PISO Y REGISTROS ASOCIADOS...");
      
      try {
        await supabase.from('movimientos_stock').delete().eq('piso_id', pisoId);
        await supabase.from('stock_piso').delete().eq('piso_id', pisoId);
        await supabase.from('habitaciones_especiales').delete().eq('piso_id', pisoId);
        await supabase.from('pisos').delete().eq('id', pisoId);
        
        mostrarSplash(`✅ PISO "${pisoNombre}" ELIMINADO COMPLETAMENTE`);
        cargarDatos();
      } catch (error) {
        console.error("Error:", error);
        mostrarSplash("❌ ERROR AL ELIMINAR");
      }
    }
  };

  // ==================== ELIMINAR PERSONAL ====================
  const eliminarPersonal = async (dni, nombre) => {
    if (window.confirm(`¿Eliminar al personal "${nombre}"?`)) {
      const { error } = await supabase.from('personal').delete().eq('dni', dni);
      if (!error) { 
        mostrarSplash("✅ Personal eliminado"); 
        cargarDatos(); 
      } else {
        mostrarSplash("❌ Error al eliminar");
      }
    }
  };

  // ==================== CALCULAR TOTAL GLOBAL ====================
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

  // ==================== GENERAR QR ====================
  const descargarQR = (path, titulo) => {
    const urlApp = `${window.location.origin}${path}`; 
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(urlApp)}`;
    const win = window.open('', '_blank');
    win.document.write(`<html><head><title>${titulo}</title><style>
      body{font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}
      h1{text-transform:uppercase;font-size:24px;margin-bottom:10px;font-weight:900}
      img{width:300px}
      p{margin-top:15px;font-size:14px;font-weight:bold;color:#444}
      @media print { button { display: none; } }
    </style></head><body>
      <h1>${titulo}</h1>
      <img src="${qrUrl}" />
      <p>Dpto. Hotelería - HNPM</p>
      <button onclick="window.print()" style="margin-top:20px;padding:10px 20px;font-size:16px">🖨️ Imprimir</button>
      <script>setTimeout(()=>{window.close()},30000)</script>
    </body></html>`);
    win.document.close();
  };

  // ==================== AGREGAR HABITACIÓN ESPECIAL ====================
  const agregarHabitacionPersistente = async (pisoId, pisoSlug) => {
    const nombre = prompt("Nombre de la Habitación (Ej: Medico Interno):");
    if(nombre && nombre.trim()) {
      const slugH = `${pisoSlug}-${nombre.toLowerCase().replace(/ /g, '-')}`;
      const { error } = await supabase.from('habitaciones_especiales').insert([{ piso_id: pisoId, nombre: nombre.trim(), slug: slugH }]);
      if(!error) { 
        mostrarSplash("✅ Habitación Guardada"); 
        cargarDatos(); 
      } else {
        mostrarSplash("❌ Error al guardar");
      }
    }
  };

  // ==================== ELIMINAR HABITACIÓN ESPECIAL ====================
  const eliminarHabitacion = async (id, nombre) => {
    if(window.confirm(`¿Eliminar habitación "${nombre}"?`)) { 
      const { error } = await supabase.from('habitaciones_especiales').delete().eq('id', id); 
      if(!error) { 
        mostrarSplash("✅ Habitación eliminada"); 
        cargarDatos(); 
      } else {
        mostrarSplash("❌ Error al eliminar");
      }
    }
  };

  // ==================== TOGGLE AUDITORÍA ====================
  const toggleAuditoria = async () => {
    const nuevoEstado = !auditoriaHabilitada;
    await supabase.from('configuracion_sistema').update({ valor: nuevoEstado.toString() }).eq('clave', 'MODO_AUDITORIA');
    setAuditoriaHabilitada(nuevoEstado);
    mostrarSplash(nuevoEstado ? "🔴 AUDITORÍA ACTIVADA" : "🟢 AUDITORÍA CERRADA");
  };

  // ==================== AGREGAR PISO ====================
  const agregarPiso = async (e) => {
    e.preventDefault();
    if (!nuevoPiso.nombre_piso.trim()) {
      mostrarSplash("Ingrese un nombre para el sector");
      return;
    }
    const slug = nuevoPiso.nombre_piso.toLowerCase().replace(/ /g, '-');
    const { error } = await supabase.from('pisos').insert([{ nombre_piso: nuevoPiso.nombre_piso.trim(), slug }]);
    if (!error) {
      setNuevoPiso({ nombre_piso: '' });
      mostrarSplash("✅ Sector creado");
      cargarDatos();
    } else {
      mostrarSplash("❌ Error al crear sector");
    }
  };

  // ==================== AGREGAR PERSONAL ====================
  const agregarPersonal = async (e) => {
    e.preventDefault();
    if (!nuevoMiembro.dni || !nuevoMiembro.nombre || !nuevoMiembro.apellido) {
      mostrarSplash("Complete todos los campos");
      return;
    }
    const { error } = await supabase.from('personal').insert([nuevoMiembro]);
    if (!error) {
      setNuevoMiembro({ dni: '', nombre: '', apellido: '', jerarquia: '', celular: '', rol: 'pañolero' });
      mostrarSplash("✅ Personal registrado");
      cargarDatos();
    } else {
      mostrarSplash("❌ Error al registrar");
    }
  };

  // ==================== FORMATEAR FECHA ====================
  const formatearFechaGuardia = (fechaISO) => {
    const fecha = new Date(fechaISO);
    const opciones = { weekday: 'long', day: 'numeric' };
    const diaYNumero = fecha.toLocaleDateString('es-AR', opciones);
    const hora = fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    return `${diaYNumero.charAt(0).toUpperCase() + diaYNumero.slice(1)}, ${hora}`;
  };

  // ==================== RENDER ====================
  return (
    <div className="p-6 md:p-8 bg-slate-950 min-h-screen text-slate-100 font-sans">
      {/* Tabs */}
      <div className="flex gap-3 mb-8 bg-slate-900 p-1.5 rounded-xl border border-slate-800 w-fit">
        <button 
          onClick={() => setActiveTab('historial')} 
          className={`px-8 py-2.5 rounded-lg text-sm font-semibold uppercase transition-all ${activeTab === 'historial' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
        >
          📊 Monitor
        </button>
        <button 
          onClick={() => setActiveTab('admin')} 
          className={`px-8 py-2.5 rounded-lg text-sm font-semibold uppercase transition-all ${activeTab === 'admin' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
        >
          ⚙️ Administración
        </button>
      </div>

      {/* Panel HISTORIAL - Monitor de stock */}
      {activeTab === 'historial' && (
        <div className="space-y-8">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-semibold text-white uppercase tracking-tighter">📦 Control de Activos</h2>
            <button 
              onClick={cargarDatos} 
              disabled={sincronizando}
              className={`text-xs px-5 py-2 rounded-xl font-semibold transition-all ${sincronizando ? 'bg-slate-700 text-slate-400 cursor-wait' : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700 hover:text-slate-300'}`}
            >
              {sincronizando ? '⌛ SINCRONIZANDO...' : '🔄 SINCRONIZAR'}
            </button>
          </div>
          
          {/* Stock Total Consolidado */}
          <div className="bg-blue-900/10 border border-blue-900/30 rounded-2xl p-6">
            <p className="text-sm font-semibold text-blue-400 uppercase tracking-wider mb-4 text-center">
              📊 STOCK TOTAL REAL (Pañol + En Uso + Lavadero)
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
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-green-900/20 p-3 rounded-xl border border-green-900/30">
                <p className="text-xs font-semibold text-green-500 uppercase text-center">PAÑOL (Limpio disponible)</p>
                <div className="grid grid-cols-4 gap-1 mt-2">
                  {ITEMS_REQUERIDOS.map(item => {
                    let total = 0;
                    Object.keys(stockPañol).forEach(piso => { total += stockPañol[piso]?.[item] || 0; });
                    return (
                      <div key={item} className="text-center">
                        <span className="text-[8px] text-slate-500 block">{item.substring(0, 4)}</span>
                        <span className={`text-base font-semibold ${total < STOCK_CRITICO ? 'text-red-400' : 'text-green-400'}`}>{total}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="bg-yellow-900/20 p-3 rounded-xl border border-yellow-900/30">
                <p className="text-xs font-semibold text-yellow-500 uppercase text-center">EN USO (Habitaciones/Pisos)</p>
                <div className="grid grid-cols-4 gap-1 mt-2">
                  {ITEMS_REQUERIDOS.map(item => {
                    let total = 0;
                    Object.keys(stockUso).forEach(piso => { total += stockUso[piso]?.[item] || 0; });
                    return (
                      <div key={item} className="text-center">
                        <span className="text-[8px] text-slate-500 block">{item.substring(0, 4)}</span>
                        <span className="text-base font-semibold text-yellow-400">{total}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="bg-red-900/20 p-3 rounded-xl border border-red-900/30">
                <p className="text-xs font-semibold text-red-500 uppercase text-center">LAVADERO (Sucio)</p>
                <div className="grid grid-cols-4 gap-1 mt-2">
                  {ITEMS_REQUERIDOS.map(item => {
                    let total = 0;
                    Object.keys(stockLavadero).forEach(piso => { total += stockLavadero[piso]?.[item] || 0; });
                    return (
                      <div key={item} className="text-center">
                        <span className="text-[8px] text-slate-500 block">{item.substring(0, 4)}</span>
                        <span className="text-base font-semibold text-red-400">{total}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Stock por Piso */}
          {Object.keys(stockPañol).map((nombrePiso) => {
            const totalPiso = {};
            ITEMS_REQUERIDOS.forEach(item => {
              totalPiso[item] = (stockPañol[nombrePiso]?.[item] || 0) + (stockUso[nombrePiso]?.[item] || 0) + (stockLavadero[nombrePiso]?.[item] || 0);
            });
            
            return (
              <div key={nombrePiso} className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
                <div className="bg-slate-800/40 px-6 py-3 border-b border-slate-800 flex justify-between items-center flex-wrap gap-2">
                  <span className="text-xl font-semibold text-blue-400 uppercase tracking-wider">{nombrePiso}</span>
                  <div className="flex gap-3 flex-wrap">
                    {ITEMS_REQUERIDOS.slice(0, 4).map(item => (
                      <span key={item} className="text-xs text-blue-400 font-semibold">
                        {item}: {totalPiso[item] || 0}
                      </span>
                    ))}
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 bg-slate-950/50 border-b border-slate-800">
                  <div className="bg-green-900/20 p-3 rounded-xl">
                    <p className="text-sm font-semibold text-green-500 uppercase text-center">PAÑOL</p>
                    <div className="grid grid-cols-4 gap-1 mt-2">
                      {ITEMS_REQUERIDOS.map(item => (
                        <div key={item} className="text-center">
                          <span className="text-[8px] text-slate-500 block">{item.substring(0, 10)}</span>
                          <span className={`text-base font-semibold ${(stockPañol[nombrePiso]?.[item] || 0) < STOCK_CRITICO ? 'text-red-400' : 'text-green-400'}`}>
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
                          <span className="text-[8px] text-slate-500 block">{item.substring(0, 4)}</span>
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
                          <span className="text-[8px] text-slate-500 block">{item.substring(0, 4)}</span>
                          <span className="text-sm font-semibold text-red-400">{stockLavadero[nombrePiso]?.[item] || 0}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                
                {/* Historial de movimientos */}
                <div className="p-2 space-y-1 max-h-[500px] overflow-y-auto bg-slate-950/20">
                  {movimientosAgrupados[nombrePiso]?.length > 0 ? (
                    movimientosAgrupados[nombrePiso].map((m) => (
                      <div key={m.id} className="bg-slate-950/50 px-3 py-1.5 rounded-lg border border-slate-800/50 flex items-center gap-2 group hover:bg-slate-800 transition-all text-xs">
                        {/* Item y fecha */}
                        <div className="w-[22%] shrink-0 flex items-center gap-2">
                          <p className="font-semibold text-white text-[11px] uppercase">{m.item}</p>
                          <p className="text-[10px] text-blue-500 font-semibold">{formatearFechaGuardia(m.created_at)}</p>
                        </div>
                        
                        {/* Movimientos */}
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
                        
                        {/* Novedades, badges, operador y eliminar */}
                        <div className="w-[28%] shrink-0 flex items-center justify-end gap-2">
                          {m.novedades && m.novedades !== 'Sin novedades' && m.novedades !== 'Sin novedad' && (
                            <span className="text-[9px] text-yellow-500 font-semibold truncate max-w-[100px]" title={m.novedades}>
                              📝 {m.novedades.length > 12 ? m.novedades.substring(0, 12) + '...' : m.novedades}
                            </span>
                          )}
                          {m.es_cambio_habitacion && <span className="text-[8px] bg-purple-900/50 px-1.5 py-0.5 rounded">HAB</span>}
                          {m.novedades?.includes('Ajuste automático') && <span className="text-[8px] bg-orange-900/50 px-1.5 py-0.5 rounded">⚡</span>}
                          <p className="text-[9px] text-slate-400 font-semibold uppercase truncate">{m.pañolero?.jerarquia} {m.pañolero?.apellido}</p>
                          <button 
                            onClick={() => eliminarMovimiento(m.id)} 
                            className="p-1 bg-red-950/30 text-red-500 rounded border border-red-900/30 hover:bg-red-900/50 transition-all"
                            title="Eliminar movimiento"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center text-slate-500 text-sm py-6">📭 Sin movimientos registrados en este sector</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Panel ADMINISTRACIÓN */}
      {activeTab === 'admin' && (
        <div className="space-y-6">
          {/* Auditoría */}
          <section className="bg-slate-900 p-6 rounded-2xl border border-yellow-600/30 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="text-center sm:text-left">
              <h3 className="text-lg font-semibold uppercase text-yellow-500">🔐 Mando de Auditoría</h3>
              <p className="text-xs text-slate-500 uppercase font-semibold">Ajuste manual de stock habilitado</p>
            </div>
            <button 
              onClick={toggleAuditoria} 
              className={`px-6 py-2.5 rounded-xl font-semibold text-sm uppercase transition-all ${auditoriaHabilitada ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-green-600 text-white hover:bg-green-500'}`}
            >
              {auditoriaHabilitada ? '🔴 Desactivar' : '🟢 Activar'}
            </button>
          </section>

          {/* Gestión de Personal */}
          <section className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
            <h3 className="text-lg font-semibold text-slate-500 mb-4 uppercase tracking-wider">👥 Tripulación</h3>
            <form onSubmit={agregarPersonal} className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <input 
                className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-base focus:ring-2 focus:ring-blue-500 outline-none" 
                placeholder="Jerarquía (Ej: Enfermero)" 
                value={nuevoMiembro.jerarquia} 
                onChange={e => setNuevoMiembro({...nuevoMiembro, jerarquia: e.target.value})} 
                required 
              />
              <input 
                className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-base focus:ring-2 focus:ring-blue-500 outline-none" 
                placeholder="Nombre" 
                value={nuevoMiembro.nombre} 
                onChange={e => setNuevoMiembro({...nuevoMiembro, nombre: e.target.value})} 
                required 
              />
              <input 
                className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-base focus:ring-2 focus:ring-blue-500 outline-none" 
                placeholder="Apellido" 
                value={nuevoMiembro.apellido} 
                onChange={e => setNuevoMiembro({...nuevoMiembro, apellido: e.target.value})} 
                required 
              />
              <input 
                className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-base font-mono focus:ring-2 focus:ring-blue-500 outline-none" 
                placeholder="DNI" 
                value={nuevoMiembro.dni} 
                onChange={e => setNuevoMiembro({...nuevoMiembro, dni: e.target.value})} 
                required 
              />
              <select 
                className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-base font-semibold text-blue-400 uppercase focus:ring-2 focus:ring-blue-500 outline-none" 
                value={nuevoMiembro.rol} 
                onChange={e => setNuevoMiembro({...nuevoMiembro, rol: e.target.value})}
              >
                <option value="pañolero">🧺 Pañolero / Operador</option>
                <option value="enfermero">🩺 Encargado de Piso</option>
                <option value="ADMIN">⚙️ Administrador</option>
              </select>
              <button 
                type="submit" 
                className="bg-blue-600 p-3 rounded-xl font-semibold uppercase text-sm hover:bg-blue-500 transition-all"
              >
                + Registrar Personal
              </button>
            </form>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {personal.length > 0 ? (
                personal.map(p => (
                  <div key={p.dni} className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex justify-between items-center text-sm uppercase font-semibold">
                    <span>
                      {p.jerarquia} {p.apellido}, {p.nombre} 
                      <span className="text-blue-500 opacity-50 ml-2">[{p.rol}]</span>
                    </span>
                    <button 
                      onClick={() => eliminarPersonal(p.dni, `${p.jerarquia} ${p.apellido}`)} 
                      className="text-red-500 text-xs font-semibold uppercase hover:text-red-400 transition-all px-3 py-1 rounded-lg hover:bg-red-950/30"
                    >
                      Eliminar
                    </button>
                  </div>
                ))
              ) : (
                <div className="text-center text-slate-500 text-sm py-4">📭 No hay personal registrado</div>
              )}
            </div>
          </section>

          {/* Gestión de Pisos y QRs */}
          <section className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
            <h3 className="text-lg font-semibold text-slate-500 mb-4 uppercase tracking-wider">🏥 Sectores y QRs</h3>
            <form onSubmit={agregarPiso} className="flex flex-col sm:flex-row gap-3 mb-6">
              <input 
                className="flex-grow bg-slate-800 p-3 rounded-xl border border-slate-700 text-base focus:ring-2 focus:ring-blue-500 outline-none" 
                placeholder="Nuevo Sector (Ej: Piso 1, Terapia, Guardia...)" 
                value={nuevoPiso.nombre_piso} 
                onChange={e => setNuevoPiso({...nuevoPiso, nombre_piso: e.target.value})} 
                required 
              />
              <button 
                type="submit" 
                className="bg-blue-600 px-6 rounded-xl font-semibold text-sm uppercase hover:bg-blue-500 transition-all"
              >
                + Crear Sector
              </button>
            </form>
            <div className="grid grid-cols-1 gap-5">
              {pisos.length > 0 ? (
                pisos.map(p => (
                  <div key={p.id} className="bg-slate-950 p-5 rounded-xl border border-slate-800 hover:border-slate-700 transition-all">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                      <span className="text-xl font-semibold text-blue-400 uppercase tracking-wider">{p.nombre_piso}</span>
                      <div className="flex flex-wrap gap-2">
                        <button 
                          onClick={() => descargarQR(`/piso/${p.slug}`, `PAÑOL - ${p.nombre_piso}`)} 
                          className="px-3 py-1.5 bg-slate-800 rounded-lg text-xs font-semibold uppercase text-blue-500 border border-blue-900/30 hover:bg-blue-900/30 transition-all"
                        >
                          🗄️ QR Pañol
                        </button>
                        <button 
                          onClick={() => descargarQR(`/lavadero/${p.slug}`, `LAVADERO - ${p.nombre_piso}`)} 
                          className="px-3 py-1.5 bg-slate-800 rounded-lg text-xs font-semibold uppercase text-green-500 border border-green-900/30 hover:bg-green-900/30 transition-all"
                        >
                          🧺 QR Lavadero
                        </button>
                        <button 
                          onClick={() => eliminarPiso(p.id, p.nombre_piso)} 
                          className="text-red-500 font-semibold text-xl leading-none px-2 py-1 rounded-lg hover:bg-red-950/30 transition-all"
                          title="Eliminar sector y todos sus registros"
                        >
                          🗑️ Eliminar
                        </button>
                      </div>
                    </div>
                    <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800/50">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-3">
                        <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">🏠 Habitaciones Especiales</p>
                        <button 
                          onClick={() => agregarHabitacionPersistente(p.id, p.slug)} 
                          className="bg-blue-600/20 text-blue-400 px-4 py-1.5 rounded-lg text-xs font-semibold uppercase border border-blue-600/30 hover:bg-blue-600 hover:text-white transition-all"
                        >
                          + Agregar Habitación
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {habitacionesEspeciales.filter(h => h.piso_id === p.id).length > 0 ? (
                          habitacionesEspeciales.filter(h => h.piso_id === p.id).map(hab => (
                            <div key={hab.id} className="bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800 flex items-center gap-2 hover:bg-slate-800 transition-all">
                              <span className="text-sm font-semibold uppercase text-slate-300">{hab.nombre}</span>
                              <button 
                                onClick={() => descargarQR(`/habitacion/${hab.slug}`, `${hab.nombre} - ${p.nombre_piso}`)} 
                                className="text-blue-500 text-xs font-semibold uppercase hover:text-blue-400 transition-all"
                              >
                                📱 QR
                              </button>
                              <button 
                                onClick={() => eliminarHabitacion(hab.id, hab.nombre)} 
                                className="text-red-500 font-semibold text-sm px-1 hover:text-red-400 transition-all"
                              >
                                ×
                              </button>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-slate-500 italic">No hay habitaciones especiales registradas</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-slate-500 text-base py-8">📭 No hay sectores registrados. Crea el primer sector usando el formulario arriba.</div>
              )}
            </div>
          </section>
        </div>
      )}
      
      {/* Notificaciones flotantes */}
      {notificacion.visible && (
        <div className="fixed bottom-6 right-6 bg-blue-600 text-white px-5 py-2.5 rounded-xl shadow-2xl font-semibold uppercase text-sm z-[100] border border-blue-400 animate-in slide-in-from-bottom-5">
          {notificacion.mensaje}
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;