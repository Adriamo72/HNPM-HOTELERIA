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
        .limit(300);

      const stockPañolMap = {};
      const stockUsoMap = {};
      const stockLavaderoMap = {};
      
      if (resPisos.data) {
        for (const piso of resPisos.data) {
          stockPañolMap[piso.nombre_piso] = {};
          stockUsoMap[piso.nombre_piso] = {};
          stockLavaderoMap[piso.nombre_piso] = {};
          
          for (const item of ITEMS_REQUERIDOS) {
            // Stock en pañol
            const { data: pStock } = await supabase
              .from('stock_piso')
              .select('cantidad')
              .eq('piso_id', piso.id)
              .eq('item', item)
              .maybeSingle();
            stockPañolMap[piso.nombre_piso][item] = pStock?.cantidad || 0;
            
            // Stock en uso
            const { data: uStock } = await supabase
              .from('stock_piso_uso')
              .select('cantidad')
              .eq('piso_id', piso.id)
              .eq('item', item)
              .maybeSingle();
            stockUsoMap[piso.nombre_piso][item] = uStock?.cantidad || 0;
            
            // Stock en lavadero
            const { data: lStock } = await supabase
              .from('stock_lavadero')
              .select('cantidad')
              .eq('piso_id', piso.id)
              .eq('item', item)
              .maybeSingle();
            stockLavaderoMap[piso.nombre_piso][item] = lStock?.cantidad || 0;
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

  const descargarQR = (path, titulo) => {
    const urlApp = `${window.location.origin}${path}`; 
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(urlApp)}`;
    const win = window.open('', '_blank');
    win.document.write(`<html><head><title>${titulo}</title><style>body{font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}h1{text-transform:uppercase;font-size:24px;margin-bottom:10px;font-weight:900}img{width:300px}p{margin-top:15px;font-size:14px;font-weight:bold;color:#444}</style></head><body><h1>${titulo}</h1><img src="${qrUrl}" onload="window.print();" /><p>Dpto. Hotelería - HNPM</p><script>setTimeout(()=>{window.close()},1000)</script></body></html>`);
    win.document.close();
  };

  const agregarHabitacionPersistente = async (pisoId, pisoSlug) => {
    const nombre = prompt("Nombre de la Habitación (Ej: Medico Interno):");
    if(nombre) {
      const slugH = `${pisoSlug}-${nombre.toLowerCase().replace(/ /g, '-')}`;
      const { error } = await supabase.from('habitaciones_especiales').insert([{ piso_id: pisoId, nombre, slug: slugH }]);
      if(!error) { mostrarSplash("✅ Habitación Guardada"); cargarDatos(); }
    }
  };

  const eliminarMovimiento = async (id) => {
    if (window.confirm("¿Confirma la eliminación del registro?")) {
      const { error } = await supabase.from('movimientos_stock').delete().eq('id', id);
      if (!error) { mostrarSplash("✅ Registro eliminado"); cargarDatos(); }
    }
  };

  const toggleAuditoria = async () => {
    const nuevoEstado = !auditoriaHabilitada;
    await supabase.from('configuracion_sistema').update({ valor: nuevoEstado.toString() }).eq('clave', 'MODO_AUDITORIA');
    setAuditoriaHabilitada(nuevoEstado);
    mostrarSplash(nuevoEstado ? "🔴 AUDITORÍA ACTIVADA" : "🟢 AUDITORÍA CERRADA");
  };

  const agregarPiso = async (e) => {
    e.preventDefault();
    const slug = nuevoPiso.nombre_piso.toLowerCase().replace(/ /g, '-');
    await supabase.from('pisos').insert([{ nombre_piso: nuevoPiso.nombre_piso, slug }]);
    setNuevoPiso({ nombre_piso: '' }); 
    cargarDatos();
  };

  const agregarPersonal = async (e) => {
    e.preventDefault();
    await supabase.from('personal').insert([nuevoMiembro]);
    setNuevoMiembro({ dni: '', nombre: '', apellido: '', jerarquia: '', celular: '', rol: 'pañolero' });
    cargarDatos();
  };

  const formatearFechaGuardia = (fechaISO) => {
    const fecha = new Date(fechaISO);
    const opciones = { weekday: 'long', day: 'numeric' };
    const diaYNumero = fecha.toLocaleDateString('es-AR', opciones);
    const hora = fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    return `${diaYNumero.charAt(0).toUpperCase() + diaYNumero.slice(1)}, ${hora}`;
  };

  return (
    <div className="p-6 md:p-8 bg-slate-950 min-h-screen text-slate-100 font-sans">
      <div className="flex gap-3 mb-8 bg-slate-900 p-1.5 rounded-xl border border-slate-800 w-fit">
        <button onClick={() => setActiveTab('historial')} className={`px-8 py-2 rounded-lg text-sm font-black uppercase transition-all ${activeTab === 'historial' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}>Monitor</button>
        <button onClick={() => setActiveTab('admin')} className={`px-8 py-2 rounded-lg text-sm font-black uppercase transition-all ${activeTab === 'admin' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}>Administración</button>
      </div>

      {activeTab === 'historial' && (
        <div className="space-y-8">
          <div className="flex justify-between items-center">
            <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Control de Activos</h2>
            <button 
              onClick={cargarDatos} 
              disabled={sincronizando}
              className={`text-xs px-5 py-2 rounded-lg font-black transition-all ${sincronizando ? 'bg-slate-700 text-slate-400 cursor-wait' : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'}`}
            >
              {sincronizando ? '⌛ SINCRONIZANDO...' : '🔄 SINCRONIZAR'}
            </button>
          </div>
          
          <div className="bg-blue-900/10 border border-blue-900/30 rounded-2xl p-6">
            <p className="text-sm font-black text-blue-400 uppercase tracking-wider mb-4 text-center">
              📊 STOCK TOTAL REAL (Pañol + En Uso + Lavadero)
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
              {ITEMS_REQUERIDOS.map(item => (
                <div key={item} className="bg-slate-900/80 p-3 rounded-xl border border-blue-800/40 text-center">
                  <span className="text-[10px] text-slate-500 font-black uppercase block">{item}</span>
                  <span className="text-2xl font-black text-blue-400">{totalGlobal[item] || 0}</span>
                </div>
              ))}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-green-900/20 p-3 rounded-xl border border-green-900/30">
                <p className="text-xs font-black text-green-500 uppercase text-center">📍 PAÑOL (Limpio disponible)</p>
                <div className="grid grid-cols-4 gap-1 mt-2">
                  {ITEMS_REQUERIDOS.map(item => {
                    let total = 0;
                    Object.keys(stockPañol).forEach(piso => { total += stockPañol[piso]?.[item] || 0; });
                    return (
                      <div key={item} className="text-center">
                        <span className="text-[8px] text-slate-500 block">{item.substring(0, 4)}</span>
                        <span className={`text-base font-black ${total < STOCK_CRITICO ? 'text-red-400' : 'text-green-400'}`}>{total}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="bg-yellow-900/20 p-3 rounded-xl border border-yellow-900/30">
                <p className="text-xs font-black text-yellow-500 uppercase text-center">🛏️ EN USO (Habitaciones/Pisos)</p>
                <div className="grid grid-cols-4 gap-1 mt-2">
                  {ITEMS_REQUERIDOS.map(item => {
                    let total = 0;
                    Object.keys(stockUso).forEach(piso => { total += stockUso[piso]?.[item] || 0; });
                    return (
                      <div key={item} className="text-center">
                        <span className="text-[8px] text-slate-500 block">{item.substring(0, 4)}</span>
                        <span className="text-base font-black text-yellow-400">{total}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="bg-red-900/20 p-3 rounded-xl border border-red-900/30">
                <p className="text-xs font-black text-red-500 uppercase text-center">🧺 LAVADERO (Sucio)</p>
                <div className="grid grid-cols-4 gap-1 mt-2">
                  {ITEMS_REQUERIDOS.map(item => {
                    let total = 0;
                    Object.keys(stockLavadero).forEach(piso => { total += stockLavadero[piso]?.[item] || 0; });
                    return (
                      <div key={item} className="text-center">
                        <span className="text-[8px] text-slate-500 block">{item.substring(0, 4)}</span>
                        <span className="text-base font-black text-red-400">{total}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {Object.keys(stockPañol).map((nombrePiso) => {
            const totalPiso = {};
            ITEMS_REQUERIDOS.forEach(item => {
              totalPiso[item] = (stockPañol[nombrePiso]?.[item] || 0) + (stockUso[nombrePiso]?.[item] || 0) + (stockLavadero[nombrePiso]?.[item] || 0);
            });
            
            return (
              <div key={nombrePiso} className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
                <div className="bg-slate-800/40 px-6 py-3 border-b border-slate-800 flex justify-between items-center">
                  <span className="text-xl font-black text-blue-400 uppercase tracking-wider">{nombrePiso}</span>
                  <div className="flex gap-3">
                    {ITEMS_REQUERIDOS.slice(0, 4).map(item => (
                      <span key={item} className="text-xs text-blue-400 font-black">
                        {item}: {totalPiso[item] || 0}
                      </span>
                    ))}
                  </div>
                </div>
                
                <div className="grid grid-cols-3 gap-3 p-4 bg-slate-950/50 border-b border-slate-800">
                  <div className="bg-green-900/20 p-3 rounded-xl">
                    <p className="text-sm font-black text-green-500 uppercase text-center">🗄️ PAÑOL</p>
                    <div className="grid grid-cols-4 gap-1 mt-2">
                      {ITEMS_REQUERIDOS.map(item => (
                        <div key={item} className="text-center">
                          <span className="text-[8px] text-slate-500 block">{item.substring(0, 4)}</span>
                          <span className={`text-sm font-black ${(stockPañol[nombrePiso]?.[item] || 0) < STOCK_CRITICO ? 'text-red-400' : 'text-green-400'}`}>
                            {stockPañol[nombrePiso]?.[item] || 0}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="bg-yellow-900/20 p-3 rounded-xl">
                    <p className="text-sm font-black text-yellow-500 uppercase text-center">🛏️ EN USO</p>
                    <div className="grid grid-cols-4 gap-1 mt-2">
                      {ITEMS_REQUERIDOS.map(item => (
                        <div key={item} className="text-center">
                          <span className="text-[8px] text-slate-500 block">{item.substring(0, 4)}</span>
                          <span className="text-sm font-black text-yellow-400">{stockUso[nombrePiso]?.[item] || 0}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="bg-red-900/20 p-3 rounded-xl">
                    <p className="text-sm font-black text-red-500 uppercase text-center">🧺 LAVADERO</p>
                    <div className="grid grid-cols-4 gap-1 mt-2">
                      {ITEMS_REQUERIDOS.map(item => (
                        <div key={item} className="text-center">
                          <span className="text-[8px] text-slate-500 block">{item.substring(0, 4)}</span>
                          <span className="text-sm font-black text-red-400">{stockLavadero[nombrePiso]?.[item] || 0}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                
                <div className="p-3 space-y-2 max-h-[500px] overflow-y-auto bg-slate-950/20">
                  {movimientosAgrupados[nombrePiso]?.map((m) => (
                    <div key={m.id} className="bg-slate-950/50 px-4 py-2 rounded-xl border border-slate-800/50 flex items-center group hover:bg-slate-800 transition-all text-sm">
                      <div className="w-[20%] shrink-0">
                        <p className="font-black text-white text-base uppercase">{m.item}</p>
                        <p className="text-[10px] text-blue-500 font-black uppercase">{formatearFechaGuardia(m.created_at)}</p>
                        {m.es_cambio_habitacion && <span className="text-[8px] bg-purple-900/50 px-1.5 py-0.5 rounded mt-1 inline-block">HABITACIÓN</span>}
                        {m.novedades?.includes('Ajuste automático') && <span className="text-[8px] bg-orange-900/50 px-1.5 py-0.5 rounded mt-1 ml-1 inline-block">⚡AJUSTE</span>}
                      </div>
                      <div className="flex-1 grid grid-cols-3 gap-2">
                        <div className="text-center">
                          <span className="text-[9px] text-green-500 font-black uppercase block">Lav→Pañol</span>
                          <p className="text-xl font-black text-green-500">{m.entregado_limpio > 0 ? `+${m.entregado_limpio}` : '—'}</p>
                        </div>
                        <div className="text-center">
                          <span className="text-[9px] text-orange-500 font-black uppercase block">Pañol→Uso</span>
                          <p className="text-xl font-black text-orange-500">{m.egreso_limpio > 0 ? `-${m.egreso_limpio}` : '—'}</p>
                        </div>
                        <div className="text-center">
                          <span className="text-[9px] text-red-500 font-black uppercase block">Uso→Lav</span>
                          <p className="text-xl font-black text-red-500">{m.retirado_sucio > 0 ? m.retirado_sucio : '—'}</p>
                        </div>
                      </div>
                      <div className="w-[22%] flex items-center justify-end gap-2 border-l border-slate-800 pl-3">
                        <p className="text-[10px] text-slate-400 font-black uppercase truncate">{m.pañolero?.jerarquia} {m.pañolero?.apellido}</p>
                        <button onClick={() => eliminarMovimiento(m.id)} className="p-1.5 bg-red-950/30 text-red-500 rounded-lg border border-red-900/30 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                  {(!movimientosAgrupados[nombrePiso] || movimientosAgrupados[nombrePiso].length === 0) && (
                    <div className="text-center text-slate-500 text-sm py-6">Sin movimientos registrados</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeTab === 'admin' && (
        <div className="space-y-6">
          <section className="bg-slate-900 p-6 rounded-2xl border border-yellow-600/30 flex justify-between items-center">
            <div>
              <h3 className="text-lg font-black uppercase text-yellow-500">Mando de Auditoría</h3>
              <p className="text-xs text-slate-500 uppercase font-bold">Ajuste manual de stock habilitado</p>
            </div>
            <button onClick={toggleAuditoria} className={`px-6 py-2 rounded-xl font-black text-sm uppercase ${auditoriaHabilitada ? 'bg-red-600 text-white' : 'bg-green-600 text-white'}`}>
              {auditoriaHabilitada ? 'Desactivar' : 'Activar'}
            </button>
          </section>

          <section className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
            <h3 className="text-lg font-black text-slate-500 mb-4 uppercase tracking-wider">Tripulación</h3>
            <form onSubmit={agregarPersonal} className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <input className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-base" placeholder="Jerarquía" value={nuevoMiembro.jerarquia} onChange={e => setNuevoMiembro({...nuevoMiembro, jerarquia: e.target.value})} required />
              <input className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-base" placeholder="Nombre" value={nuevoMiembro.nombre} onChange={e => setNuevoMiembro({...nuevoMiembro, nombre: e.target.value})} required />
              <input className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-base" placeholder="Apellido" value={nuevoMiembro.apellido} onChange={e => setNuevoMiembro({...nuevoMiembro, apellido: e.target.value})} required />
              <input className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-base font-mono" placeholder="DNI" value={nuevoMiembro.dni} onChange={e => setNuevoMiembro({...nuevoMiembro, dni: e.target.value})} required />
              <select className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-base font-bold text-blue-400 uppercase" value={nuevoMiembro.rol} onChange={e => setNuevoMiembro({...nuevoMiembro, rol: e.target.value})}>
                <option value="pañolero">Pañolero / Operador</option>
                <option value="enfermero">Encargado de Piso</option>
                <option value="ADMIN">Administrador</option>
              </select>
              <button className="bg-blue-600 p-3 rounded-xl font-black uppercase text-sm">Registrar</button>
            </form>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {personal.map(p => (
                <div key={p.dni} className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex justify-between items-center text-sm uppercase font-bold">
                   <span>{p.jerarquia} {p.apellido}, {p.nombre} <span className="text-blue-500 opacity-50">[{p.rol}]</span></span>
                   <button onClick={async () => { if(window.confirm("¿Eliminar?")) { await supabase.from('personal').delete().eq('dni', p.dni); cargarDatos(); } }} className="text-red-500 text-xs font-black uppercase">Eliminar</button>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
            <h3 className="text-lg font-black text-slate-500 mb-4 uppercase tracking-wider">Sectores y QRs</h3>
            <form onSubmit={agregarPiso} className="flex gap-3 mb-4">
              <input className="flex-grow bg-slate-800 p-3 rounded-xl border border-slate-700 text-base" placeholder="Nuevo Sector..." value={nuevoPiso.nombre_piso} onChange={e => setNuevoPiso({...nuevoPiso, nombre_piso: e.target.value})} required />
              <button className="bg-blue-600 px-5 rounded-xl font-black text-sm uppercase">Crear</button>
            </form>
            <div className="grid grid-cols-1 gap-4">
              {pisos.map(p => (
                <div key={p.id} className="bg-slate-950 p-5 rounded-xl border border-slate-800">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-lg font-black text-blue-400 uppercase tracking-wider">{p.nombre_piso}</span>
                    <div className="flex gap-2">
                      <button onClick={() => descargarQR(`/piso/${p.slug}`, `PAÑOL - ${p.nombre_piso}`)} className="px-3 py-1.5 bg-slate-800 rounded-lg text-xs font-bold uppercase text-blue-500 border border-blue-900/30">QR Pañol</button>
                      <button onClick={() => descargarQR(`/lavadero/${p.slug}`, `LAVADERO - ${p.nombre_piso}`)} className="px-3 py-1.5 bg-slate-800 rounded-lg text-xs font-bold uppercase text-green-500 border border-green-900/30">QR Lavadero</button>
                      <button onClick={async () => { if(window.confirm(`¿Eliminar ${p.nombre_piso}?`)) { await supabase.from('pisos').delete().eq('id', p.id); cargarDatos(); } }} className="text-red-500 font-black text-xl leading-none px-1">×</button>
                    </div>
                  </div>
                  <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-800/50">
                    <div className="flex justify-between items-center mb-2">
                      <p className="text-xs font-black text-slate-500 uppercase tracking-wider">Habitaciones Especiales</p>
                      <button onClick={() => agregarHabitacionPersistente(p.id, p.slug)} className="bg-blue-600/20 text-blue-400 px-3 py-1 rounded-lg text-[10px] font-black uppercase border border-blue-600/30 hover:bg-blue-600 hover:text-white transition-all">+ Agregar</button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {habitacionesEspeciales.filter(h => h.piso_id === p.id).map(hab => (
                        <div key={hab.id} className="bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800 flex items-center gap-2">
                          <span className="text-sm font-black uppercase text-slate-300">{hab.nombre}</span>
                          <button onClick={() => descargarQR(`/habitacion/${hab.slug}`, `${hab.nombre} - ${p.nombre_piso}`)} className="text-blue-500 text-xs font-bold uppercase">QR</button>
                          <button onClick={async () => { if(window.confirm("¿Eliminar?")) { await supabase.from('habitaciones_especiales').delete().eq('id', hab.id); cargarDatos(); } }} className="text-red-500 font-black text-sm px-1">×</button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
      
      {notificacion.visible && (
        <div className="fixed bottom-6 right-6 bg-blue-600 text-white px-5 py-2.5 rounded-xl shadow-2xl font-black uppercase text-sm z-[100] border border-blue-400">
          {notificacion.mensaje}
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;