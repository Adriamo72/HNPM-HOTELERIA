import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('historial');
  const [personal, setPersonal] = useState([]);
  const [pisos, setPisos] = useState([]);
  const [movimientosAgrupados, setMovimientosAgrupados] = useState({});
  const [resumenStock, setResumenStock] = useState({});
  const [notificacion, setNotificacion] = useState({ visible: false, mensaje: '' });
  
  // Definición de ítems críticos para la auditoría del HNPM
  const ITEMS_REQUERIDOS = [
    'SABANAS', 'TOALLAS', 'TOALLONES', 'FRAZADAS', 
    'SALEAS HULE', 'SALEAS TELA', 'FUNDAS', 'CUBRECAMAS'
  ];

  const STOCK_CRITICO = 5; // Umbral de alerta roja

  const [nuevoMiembro, setNuevoMiembro] = useState({
    dni: '', nombre: '', apellido: '', jerarquia: '', celular: '', rol: 'pañolero'
  });
  const [nuevoPiso, setNuevoPiso] = useState({ nombre_piso: '' });

  useEffect(() => { cargarDatos(); }, []);

  const mostrarSplash = (mensaje) => {
    setNotificacion({ visible: true, mensaje });
    setTimeout(() => setNotificacion({ visible: false, mensaje: '' }), 2500);
  };

  const cargarDatos = async () => {
    const resPers = await supabase.from('personal').select('*').order('apellido');
    const resPisos = await supabase.from('pisos').select('*').order('nombre_piso');
    
    const { data: movs } = await supabase
      .from('movimientos_stock')
      .select(`
        *,
        pisos(nombre_piso),
        pañolero:personal!movimientos_stock_dni_pañolero_fkey(jerarquia, apellido),
        enfermero:personal!movimientos_stock_dni_enfermero_fkey(jerarquia, apellido)
      `)
      .order('created_at', { ascending: false });

    const agrupados = movs ? movs.reduce((acc, curr) => {
      const nombrePiso = curr.pisos?.nombre_piso || "Sector Desconocido";
      if (!acc[nombrePiso]) acc[nombrePiso] = [];
      acc[nombrePiso].push(curr);
      return acc;
    }, {}) : {};

    const stockMap = {};
    if (resPisos.data) {
      resPisos.data.forEach(p => {
        stockMap[p.nombre_piso] = {};
        ITEMS_REQUERIDOS.forEach(item => {
          stockMap[p.nombre_piso][item] = 0;
        });
      });

      if (movs) {
        [...movs].reverse().forEach(m => {
          const pNombre = m.pisos?.nombre_piso;
          if (stockMap[pNombre]) {
            stockMap[pNombre][m.item] = m.stock_fisico_piso || 0;
          }
        });
      }
    }
    
    setPersonal(resPers.data || []);
    setPisos(resPisos.data || []);
    setMovimientosAgrupados(agrupados);
    setResumenStock(stockMap);
  };

  const eliminarMovimiento = async (id) => {
    if (window.confirm("¿CONFIRMA ELIMINAR ESTE REGISTRO?")) {
      const { error } = await supabase.from('movimientos_stock').delete().eq('id', id);
      if (error) mostrarSplash("Error al borrar");
      else {
        mostrarSplash("REGISTRO ELIMINADO");
        cargarDatos();
      }
    }
  };

  const formatearFecha = (fechaISO) => {
    const fecha = new Date(fechaISO);
    return fecha.toLocaleDateString('es-AR', {
      weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
    }) + ' hs';
  };

  // --- ADMINISTRACIÓN INTACTA ---
  const agregarPersonal = async (e) => {
    e.preventDefault();
    const { error } = await supabase.from('personal').insert([nuevoMiembro]);
    if (error) mostrarSplash("Error: DNI duplicado");
    else { 
      mostrarSplash("Personal Registrado"); 
      setNuevoMiembro({ dni: '', nombre: '', apellido: '', jerarquia: '', celular: '', rol: 'pañolero' }); 
      cargarDatos(); 
    }
  };

  const eliminarPersonal = async (dni) => {
    if (window.confirm("¿Dar de baja?")) {
      await supabase.from('personal').delete().eq('dni', dni);
      cargarDatos();
      mostrarSplash("Baja Procesada");
    }
  };

  const agregarPiso = async (e) => {
    e.preventDefault();
    const slug = nuevoPiso.nombre_piso.toLowerCase().replace(/ /g, '-');
    await supabase.from('pisos').insert([{ nombre_piso: nuevoPiso.nombre_piso, slug }]);
    setNuevoPiso({ nombre_piso: '' });
    cargarDatos();
    mostrarSplash("Piso Creado");
  };

  const eliminarPiso = async (id) => {
    if (window.confirm("¿Eliminar sector?")) {
      await supabase.from('pisos').delete().eq('id', id);
      cargarDatos();
      mostrarSplash("Piso Eliminado");
    }
  };

  const descargarQR = (slug) => {
    const urlApp = `${window.location.origin}/piso/${slug}`; 
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(urlApp)}`;
    window.open(qrUrl, '_blank');
  };

  return (
    <div className="p-4 md:p-8 bg-slate-950 min-h-screen text-slate-100 font-sans">
      {notificacion.visible && (
        <div className="fixed bottom-10 right-10 z-50 bg-blue-600 px-6 py-3 rounded-2xl shadow-2xl border border-blue-400">
          <p className="text-white font-black uppercase text-xs tracking-widest">{notificacion.mensaje}</p>
        </div>
      )}

      {/* SELECTOR DE PESTAÑAS */}
      <div className="flex gap-2 mb-8 bg-slate-900 p-1.5 rounded-2xl border border-slate-800 w-fit">
        <button onClick={() => setActiveTab('historial')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'historial' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500'}`}>Monitor de Movimientos</button>
        <button onClick={() => setActiveTab('admin')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'admin' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500'}`}>Administración</button>
      </div>

      {activeTab === 'historial' && (
        <section className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-black text-blue-500 uppercase italic">Control de Activos por Piso</h2>
            <button onClick={cargarDatos} className="text-[10px] bg-slate-800 px-4 py-2 rounded-xl font-black text-slate-400 border border-slate-700">Actualizar</button>
          </div>

          {Object.keys(resumenStock).map((nombrePiso) => (
            <div key={nombrePiso} className="bg-slate-900 rounded-[2.5rem] border border-slate-800 overflow-hidden shadow-2xl">
              <div className="bg-slate-800/40 px-8 py-5 border-b border-slate-800 flex justify-between items-center">
                <span className="text-lg font-black text-blue-400 uppercase tracking-widest">{nombrePiso}</span>
                {Object.values(resumenStock[nombrePiso]).some(qty => qty > 0 && qty < STOCK_CRITICO) && (
                  <span className="text-[9px] bg-red-600 text-white px-3 py-1 rounded-full font-black animate-pulse uppercase">Alerta de Stock</span>
                )}
              </div>

              {/* GRUPO DE STOCK CON SEMÁFORO CRÍTICO */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 p-4 bg-slate-950/50 border-b border-slate-800">
                {ITEMS_REQUERIDOS.map(item => {
                  const stock = resumenStock[nombrePiso][item];
                  const esCritico = stock > 0 && stock < STOCK_CRITICO;
                  
                  return (
                    <div key={item} className={`p-3 rounded-2xl border flex flex-col items-center transition-all duration-500 ${
                      esCritico 
                        ? 'bg-red-950/40 border-red-600 shadow-[0_0_15px_rgba(220,38,38,0.2)] animate-pulse' 
                        : stock > 0 
                          ? 'bg-blue-900/20 border-blue-900/50' 
                          : 'bg-slate-900 border-slate-800 opacity-40'
                    }`}>
                      <span className={`text-[7px] font-black uppercase mb-1 ${esCritico ? 'text-red-400' : 'text-slate-500'}`}>{item}</span>
                      <span className={`text-sm font-black ${esCritico ? 'text-red-500' : stock > 0 ? 'text-blue-300' : 'text-slate-600'}`}>
                        {stock}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* HISTORIAL RECIENTE */}
              <div className="p-4 space-y-3 max-h-[400px] overflow-y-auto">
                {movimientosAgrupados[nombrePiso]?.map((m) => (
                  <div key={m.id} className="bg-slate-950 p-4 rounded-[2rem] border border-slate-800 flex flex-col md:flex-row justify-between gap-4 items-center group relative">
                    <div className="w-full md:w-1/4">
                      <p className="text-sm font-black text-white uppercase">{m.item}</p>
                      <p className="text-[9px] text-slate-500 italic">{formatearFecha(m.created_at)}</p>
                    </div>

                    <div className="flex items-center gap-6 bg-slate-900 px-6 py-3 rounded-2xl border border-slate-800/50">
                      <div className="text-center min-w-[45px]">
                        <span className="text-[7px] text-green-500 font-black uppercase">Ingreso</span>
                        {/* Corregido: Muestra ingreso_limpio o entregado_limpio (carga lavadero) */}
                        <p className="text-sm font-black text-green-500">+{m.entregado_limpio || 0}</p>
                      </div>
                      <div className="w-px h-8 bg-slate-800"></div>
                      <div className="text-center min-w-[45px]">
                        <span className="text-[7px] text-red-400 font-black uppercase">Entrega</span>
                        {/* NUEVO: Muestra lo que salió hacia el piso */}
                        <p className="text-sm font-black text-red-400">-{m.egreso_limpio || 0}</p>
                      </div>
                      <div className="w-px h-8 bg-slate-800"></div>
                      <div className="text-center min-w-[45px]">
                        <span className="text-[7px] text-red-500 font-black uppercase">Sucio</span>
                        <p className="text-sm font-black text-red-500">-{m.retirado_sucio || 0}</p>
                      </div>
                    </div>

                    <div className="w-full md:w-1/3 flex justify-between md:justify-end items-center gap-4">
                      <div className="text-right text-[9px] uppercase font-black">
                        <p className="text-blue-500">OP: {m.pañolero?.apellido}</p>
                        {m.enfermero && <p className="text-emerald-500 mt-1">REC: {m.enfermero?.apellido}</p>}
                      </div>
                      <button onClick={() => eliminarMovimiento(m.id)} className="bg-red-900/20 hover:bg-red-600 text-red-500 hover:text-white p-2 rounded-xl transition-all opacity-0 group-hover:opacity-100 border border-red-900/30">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

      {/* ADMINISTRACIÓN INTACTA */}
      {activeTab === 'admin' && (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4">
          <section className="bg-slate-900 p-6 rounded-[2rem] border border-slate-800 shadow-2xl">
            <h3 className="text-xs font-black text-slate-500 mb-6 uppercase tracking-widest">Registrar Nuevo Personal</h3>
            <form onSubmit={agregarPersonal} className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
              <input className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm" placeholder="Jerarquía" value={nuevoMiembro.jerarquia} onChange={e => setNuevoMiembro({...nuevoMiembro, jerarquia: e.target.value})} required />
              <input className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm" placeholder="Nombre" value={nuevoMiembro.nombre} onChange={e => setNuevoMiembro({...nuevoMiembro, nombre: e.target.value})} required />
              <input className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm" placeholder="Apellido" value={nuevoMiembro.apellido} onChange={e => setNuevoMiembro({...nuevoMiembro, apellido: e.target.value})} required />
              <input className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm font-mono" placeholder="DNI" value={nuevoMiembro.dni} onChange={e => setNuevoMiembro({...nuevoMiembro, dni: e.target.value})} required />
              <select className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm" value={nuevoMiembro.rol} onChange={e => setNuevoMiembro({...nuevoMiembro, rol: e.target.value})}>
                <option value="pañolero">Pañolero</option>
                <option value="enfermero">Enfermero</option>
              </select>
              <button className="bg-blue-600 p-3 rounded-xl font-black uppercase text-xs">Registrar</button>
            </form>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
              {personal.map(p => (
                <div key={p.dni} className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex justify-between items-center group">
                  <span className="text-xs font-bold uppercase">{p.jerarquia} {p.apellido} <small className="text-blue-500 ml-2">[{p.rol}]</small></span>
                  <button onClick={() => eliminarPersonal(p.dni)} className="text-red-500 text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity">Eliminar</button>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-slate-900 p-6 rounded-[2rem] border border-slate-800 shadow-2xl">
            <h3 className="text-xs font-black text-slate-500 mb-6 uppercase tracking-widest">Configurar Pisos y QRs</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pisos.map(p => (
                <div key={p.id} className="p-4 bg-slate-950 rounded-2xl border border-slate-800 flex flex-col items-center space-y-4">
                  <span className="text-xs font-black uppercase text-blue-400">{p.nombre_piso}</span>
                  <div className="flex gap-2">
                    <button onClick={() => descargarQR(p.slug)} className="bg-blue-600 text-white px-3 py-2 rounded-lg text-[10px] font-black uppercase">QR</button>
                    <button onClick={() => eliminarPiso(p.id)} className="text-red-500 text-[10px] font-bold">Borrar</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;