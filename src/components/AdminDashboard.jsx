import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('historial');
  const [personal, setPersonal] = useState([]);
  const [pisos, setPisos] = useState([]);
  const [habitacionesEspeciales, setHabitacionesEspeciales] = useState([]); 
  const [movimientosAgrupados, setMovimientosAgrupados] = useState({});
  const [resumenStock, setResumenStock] = useState({});
  const [stockGlobal, setStockGlobal] = useState({}); 
  const [auditoriaHabilitada, setAuditoriaHabilitada] = useState(false);
  const [notificacion, setNotificacion] = useState({ visible: false, mensaje: '' });
  
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
      .order('created_at', { ascending: true });

    const stockMap = {};
    const globalStock = {};
    
    ITEMS_REQUERIDOS.forEach(item => {
      globalStock[item] = 0;
    });

    if (resPisos.data) {
      resPisos.data.forEach(p => {
        stockMap[p.nombre_piso] = {};
        ITEMS_REQUERIDOS.forEach(item => {
          stockMap[p.nombre_piso][item] = 0;
        });
      });

      for (const piso of resPisos.data) {
        for (const item of ITEMS_REQUERIDOS) {
          const { data: ultimoMov } = await supabase
            .from('movimientos_stock')
            .select('stock_fisico_piso')
            .eq('piso_id', piso.id)
            .eq('item', item)
            .order('created_at', { ascending: false })
            .limit(1);
          
          const stockPiso = ultimoMov?.[0]?.stock_fisico_piso || 0;
          stockMap[piso.nombre_piso][item] = stockPiso;
          globalStock[item] += stockPiso;
        }
      }
    }

    const agrupados = movs ? [...movs].reverse().reduce((acc, curr) => {
      const nombrePiso = curr.pisos?.nombre_piso || "Sector Desconocido";
      if (!acc[nombrePiso]) acc[nombrePiso] = [];
      acc[nombrePiso].push(curr);
      return acc;
    }, {}) : {};
    
    setPersonal(resPers.data || []);
    setPisos(resPisos.data || []);
    setHabitacionesEspeciales(resHabs.data || []);
    setMovimientosAgrupados(agrupados);
    setResumenStock(stockMap);
    setStockGlobal(globalStock);
  };

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
      if(!error) { mostrarSplash("Habitación Guardada"); cargarDatos(); }
    }
  };

  const eliminarMovimiento = async (id) => {
    if (window.confirm("¿Confirma la eliminación del registro?")) {
      const { error } = await supabase.from('movimientos_stock').delete().eq('id', id);
      if (!error) { mostrarSplash("Registro eliminado"); cargarDatos(); }
    }
  };

  const toggleAuditoria = async () => {
    const nuevoEstado = !auditoriaHabilitada;
    await supabase.from('configuracion_sistema').update({ valor: nuevoEstado.toString() }).eq('clave', 'MODO_AUDITORIA');
    setAuditoriaHabilitada(nuevoEstado);
    mostrarSplash(nuevoEstado ? "AUDITORÍA ACTIVADA" : "AUDITORÍA CERRADA");
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
    return `${diaYNumero.charAt(0).toUpperCase() + diaYNumero.slice(1)}, ${hora} hs`;
  };

  const getTipoMovimiento = (mov) => {
    if (mov.entregado_limpio > 0 && mov.retirado_sucio === 0) return 'Lavado → Pañol';
    if (mov.entregado_limpio > 0 && mov.retirado_sucio > 0) return 'Lavado (Mixto)';
    if (mov.retirado_sucio > 0 && mov.entregado_limpio === 0 && mov.egreso_limpio === 0) return 'Sucio → Lavadero';
    if (mov.egreso_limpio > 0 && mov.es_cambio_habitacion) return 'Entrega a Habitación';
    if (mov.egreso_limpio > 0 && mov.dni_enfermero) return 'Entrega a Piso';
    return 'Otro';
  };

  return (
    <div className="p-4 md:p-8 bg-slate-950 min-h-screen text-slate-100 font-sans relative text-left">
      <div className="flex gap-2 mb-8 bg-slate-900 p-1.5 rounded-2xl border border-slate-800 w-fit">
        <button onClick={() => setActiveTab('historial')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === 'historial' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>Monitor</button>
        <button onClick={() => setActiveTab('admin')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === 'admin' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>Administración</button>
      </div>

      {activeTab === 'historial' && (
        <section className="space-y-8 animate-in fade-in">
          <div className="flex justify-between items-center px-2">
            <h2 className="text-4xl font-black text-white uppercase italic tracking-tighter">Control de Activos</h2>
            <button onClick={cargarDatos} className="text-[10px] bg-slate-800 px-4 py-2 rounded-xl font-black text-slate-400 border border-slate-700">Sincronizar</button>
          </div>
          
          {/* STOCK TOTAL CONSOLIDADO */}
          <div className="bg-blue-900/10 border-2 border-blue-900/30 rounded-[2.5rem] p-6 shadow-2xl">
            <p className="text-[11px] font-black text-blue-400 uppercase tracking-[0.3em] mb-4 text-center italic font-bold">
              STOCK TOTAL CONSOLIDADO (SUMA DE TODOS LOS PAÑOLES)
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
              {ITEMS_REQUERIDOS.map(item => (
                <div key={item} className="bg-slate-900/80 p-4 rounded-3xl border border-blue-800/40 text-center shadow-inner">
                  <span className="text-[9px] text-slate-500 font-black uppercase block mb-1 tracking-tighter">{item}</span>
                  <span className={`text-3xl font-black ${stockGlobal[item] < STOCK_CRITICO ? 'text-red-500' : 'text-blue-400'}`}>
                    {stockGlobal[item] || 0}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* STOCK POR PISO */}
          {Object.keys(resumenStock).map((nombrePiso) => (
            <div key={nombrePiso} className="bg-slate-900 rounded-[3.5rem] border border-slate-800 overflow-hidden shadow-2xl mt-8">
              <div className="bg-slate-800/40 px-8 py-4 border-b border-slate-800">
                <span className="text-lg font-black text-blue-400 uppercase tracking-widest italic">{nombrePiso}</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 p-3 bg-slate-950/50 border-b border-slate-800 text-left">
                {ITEMS_REQUERIDOS.map(item => (
                  <div key={item} className="p-2.5 rounded-2xl border bg-slate-900 border-slate-700">
                    <span className="text-[8px] font-black uppercase block mb-0.5 text-center text-slate-500">{item}</span>
                    <span className="text-xl font-black block text-center text-blue-400">{resumenStock[nombrePiso][item]}</span>
                  </div>
                ))}
              </div>
              
              {/* HISTORIAL DE MOVIMIENTOS DEL PISO */}
              <div className="p-2 space-y-1 overflow-y-auto max-h-[450px] custom-scroll bg-slate-950/20 text-left">
                {movimientosAgrupados[nombrePiso]?.map((m) => (
                  <div key={m.id} className="bg-slate-950/50 px-3 py-2 rounded-2xl border border-slate-800/50 flex items-center group hover:bg-slate-800 transition-all text-left">
                    {/* Fecha e Item */}
                    <div className="w-[20%] shrink-0">
                      <p className="text-[11px] font-black text-white uppercase leading-none">{m.item}</p>
                      <p className="text-[8px] text-blue-500 font-black uppercase mt-1 tracking-tighter italic">{formatearFechaGuardia(m.created_at)}</p>
                    </div>
                    
                    {/* Columnas de movimientos */}
                    <div className="flex-1 grid grid-cols-3 gap-2 px-3">
                      <div className="text-center">
                        <span className="text-[7px] text-green-500 font-black uppercase block tracking-widest">→ Piso</span>
                        <p className="text-sm font-black text-green-500">{m.egreso_limpio > 0 && !m.es_cambio_habitacion ? m.egreso_limpio : '0'}</p>
                      </div>
                      <div className="text-center">
                        <span className="text-[7px] text-purple-500 font-black uppercase block tracking-widest">→ Habitación</span>
                        <p className="text-sm font-black text-purple-500">{m.egreso_limpio > 0 && m.es_cambio_habitacion ? m.egreso_limpio : '0'}</p>
                      </div>
                      <div className="text-center">
                        <span className="text-[7px] text-red-500 font-black uppercase block tracking-widest">Sucio → Lavadero</span>
                        <p className="text-sm font-black text-red-500">{m.retirado_sucio > 0 ? m.retirado_sucio : '0'}</p>
                      </div>
                    </div>
                    
                    {/* Operador */}
                    <div className="w-[25%] flex items-center justify-end gap-2 border-l border-slate-800 pl-3">
                      <p className="text-[8px] text-slate-400 font-black uppercase truncate">
                        {m.pañolero?.jerarquia} {m.pañolero?.apellido}
                      </p>
                      <button onClick={() => eliminarMovimiento(m.id)} className="p-1 bg-red-950/30 text-red-500 rounded-lg border border-red-900/30 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {activeTab === 'admin' && (
        <div className="space-y-10 animate-in fade-in text-left">
          <section className="bg-slate-900 p-6 rounded-[2rem] border border-yellow-600/30 flex justify-between items-center shadow-xl">
            <div className="max-w-[70%] text-yellow-500">
              <h3 className="text-sm font-black uppercase italic">Mando de Auditoría</h3>
              <p className="text-[10px] text-slate-500 uppercase font-bold text-left">Ajuste manual de stock habilitado</p>
            </div>
            <button onClick={toggleAuditoria} className={`px-8 py-3 rounded-xl font-black text-[10px] uppercase shadow-lg ${auditoriaHabilitada ? 'bg-red-600 text-white animate-pulse' : 'bg-green-600 text-white'}`}>
              {auditoriaHabilitada ? 'Desactivar' : 'Activar'}
            </button>
          </section>

          <section className="bg-slate-900 p-6 rounded-[2rem] border border-slate-800 shadow-2xl">
            <h3 className="text-xs font-black text-slate-500 mb-6 uppercase tracking-widest text-left">Tripulación y Guardia</h3>
            <form onSubmit={agregarPersonal} className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
              <input className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm" placeholder="Jerarquía" value={nuevoMiembro.jerarquia} onChange={e => setNuevoMiembro({...nuevoMiembro, jerarquia: e.target.value})} required />
              <input className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm" placeholder="Nombre" value={nuevoMiembro.nombre} onChange={e => setNuevoMiembro({...nuevoMiembro, nombre: e.target.value})} required />
              <input className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm" placeholder="Apellido" value={nuevoMiembro.apellido} onChange={e => setNuevoMiembro({...nuevoMiembro, apellido: e.target.value})} required />
              <input className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm font-mono" placeholder="DNI" value={nuevoMiembro.dni} onChange={e => setNuevoMiembro({...nuevoMiembro, dni: e.target.value})} required />
              <select className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm font-bold text-blue-400 uppercase" value={nuevoMiembro.rol} onChange={e => setNuevoMiembro({...nuevoMiembro, rol: e.target.value})}>
                <option value="pañolero">Pañolero / Operador</option>
                <option value="enfermero">Encargado de Piso</option>
                <option value="ADMIN">Administrador</option>
              </select>
              <button className="bg-blue-600 p-3 rounded-xl font-black uppercase text-xs">Registrar en DB</button>
            </form>
            <div className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scroll text-left">
              {personal.map(p => (
                <div key={p.dni} className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex justify-between items-center group shadow-md text-xs uppercase font-bold">
                   <span>{p.jerarquia} {p.apellido}, {p.nombre} <span className="text-blue-500 opacity-50">[{p.rol}]</span></span>
                   <button onClick={async () => { if(window.confirm("¿Eliminar?")) { await supabase.from('personal').delete().eq('dni', p.dni); cargarDatos(); } }} className="text-red-500 text-[10px] font-black uppercase md:opacity-0 md:group-hover:opacity-100 transition-opacity">Eliminar</button>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-slate-900 p-6 rounded-[2rem] border border-slate-800 shadow-2xl">
            <h3 className="text-xs font-black text-slate-500 mb-6 uppercase tracking-widest text-left">Sectores y Generador de QRs</h3>
            <form onSubmit={agregarPiso} className="flex gap-2 mb-8">
              <input className="flex-grow bg-slate-800 p-4 rounded-2xl border border-slate-700 text-sm outline-none" placeholder="Nuevo Sector..." value={nuevoPiso.nombre_piso} onChange={e => setNuevoPiso({...nuevoPiso, nombre_piso: e.target.value})} required />
              <button className="bg-blue-600 px-8 rounded-2xl font-black text-[10px] uppercase shadow-lg">Crear</button>
            </form>
            <div className="grid grid-cols-1 gap-6">
              {pisos.map(p => (
                <div key={p.id} className="bg-slate-950 p-6 rounded-3xl border border-slate-800 shadow-lg text-left">
                  <div className="flex justify-between items-center mb-6">
                    <span className="text-sm font-black text-blue-400 uppercase tracking-widest italic">{p.nombre_piso}</span>
                    <div className="flex gap-2">
                      <button onClick={() => descargarQR(`/piso/${p.slug}`, `PAÑOL - ${p.nombre_piso}`)} className="px-4 py-2 bg-slate-800 rounded-lg text-[9px] font-bold uppercase text-blue-500 border border-blue-900/30">QR Pañol</button>
                      <button onClick={() => descargarQR(`/lavadero/${p.slug}`, `LAVADERO - ${p.nombre_piso}`)} className="px-4 py-2 bg-slate-800 rounded-lg text-[9px] font-bold uppercase text-green-500 border border-green-900/30">QR Lavadero</button>
                      <button onClick={async () => { if(window.confirm(`¿Eliminar ${p.nombre_piso}?`)) { await supabase.from('pisos').delete().eq('id', p.id); cargarDatos(); } }} className="text-red-500 font-black ml-4">×</button>
                    </div>
                  </div>
                  <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-800/50 text-left">
                    <div className="flex justify-between items-center mb-4">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest italic font-bold">Habitaciones Especiales</p>
                      <button onClick={() => agregarHabitacionPersistente(p.id, p.slug)} className="bg-blue-600/20 text-blue-400 px-4 py-1.5 rounded-xl text-[9px] font-black uppercase border border-blue-600/30 hover:bg-blue-600 hover:text-white transition-all">+ Agregar</button>
                    </div>
                    <div className="flex flex-wrap gap-2 text-left">
                      {habitacionesEspeciales.filter(h => h.piso_id === p.id).map(hab => (
                        <div key={hab.id} className="bg-slate-900 p-2 rounded-xl border border-slate-800 flex items-center gap-3">
                          <span className="text-[10px] font-black uppercase text-slate-300">{hab.nombre}</span>
                          <button onClick={() => descargarQR(`/habitacion/${hab.slug}`, `${hab.nombre} - ${p.nombre_piso}`)} className="text-blue-500 text-[9px] font-bold uppercase hover:underline">QR</button>
                          <button onClick={async () => { if(window.confirm("¿Eliminar?")) { await supabase.from('habitaciones_especiales').delete().eq('id', hab.id); cargarDatos(); } }} className="text-red-500 font-black text-xs px-1 hover:scale-125 transition-all">×</button>
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
      {notificacion.visible && <div className="fixed bottom-4 right-4 bg-blue-600 text-white px-6 py-3 rounded-2xl shadow-2xl font-black uppercase text-[10px] z-[100] border border-blue-400">{notificacion.mensaje}</div>}
    </div>
  );
};

export default AdminDashboard;