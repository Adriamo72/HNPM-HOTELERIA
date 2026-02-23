import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('historial');
  const [personal, setPersonal] = useState([]);
  const [pisos, setPisos] = useState([]);
  const [movimientosAgrupados, setMovimientosAgrupados] = useState({});
  const [resumenStock, setResumenStock] = useState({});
  const [notificacion, setNotificacion] = useState({ visible: false, mensaje: '' });
  
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

    // 1. Agrupar movimientos por Piso
    const agrupados = movs ? movs.reduce((acc, curr) => {
      const nombrePiso = curr.pisos?.nombre_piso || "Sector Desconocido";
      if (!acc[nombrePiso]) acc[nombrePiso] = [];
      acc[nombrePiso].push(curr);
      return acc;
    }, {}) : {};

    // 2. Calcular Stock Disponible por Item por Piso (Último recuento físico o balance)
    const stockMap = {};
    if (movs) {
      movs.forEach(m => {
        const p = m.pisos?.nombre_piso;
        const it = m.item;
        if (!stockMap[p]) stockMap[p] = {};
        // Tomamos el primer registro encontrado (el más reciente) como stock actual
        if (!stockMap[p][it]) {
          stockMap[p][it] = m.stock_fisico_piso || 0;
        }
      });
    }
    
    setPersonal(resPers.data || []);
    setPisos(resPisos.data || []);
    setMovimientosAgrupados(agrupados);
    setResumenStock(stockMap);
  };

  const formatearFecha = (fechaISO) => {
    const fecha = new Date(fechaISO);
    return fecha.toLocaleDateString('es-AR', {
      weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
    }) + ' hs';
  };

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
        <button onClick={() => setActiveTab('historial')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'historial' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' : 'text-slate-500 hover:text-slate-300'}`}>Monitor de Movimientos</button>
        <button onClick={() => setActiveTab('admin')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'admin' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' : 'text-slate-500 hover:text-slate-300'}`}>Administración</button>
      </div>

      {activeTab === 'historial' && (
        <section className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex justify-between items-end">
            <h2 className="text-2xl font-black text-blue-500 uppercase italic">Control de Activos por Sector</h2>
            <button onClick={cargarDatos} className="text-[10px] bg-slate-800 px-4 py-2 rounded-xl font-black text-slate-400 border border-slate-700 hover:bg-slate-700 transition-colors">Sincronizar Datos</button>
          </div>

          {Object.keys(movimientosAgrupados).map((nombrePiso) => (
            <div key={nombrePiso} className="bg-slate-900 rounded-[2.5rem] border border-slate-800 overflow-hidden shadow-2xl">
              {/* CABECERA DEL PISO */}
              <div className="bg-slate-800/40 px-8 py-5 border-b border-slate-800 flex justify-between items-center">
                <span className="text-lg font-black text-blue-400 uppercase tracking-widest">{nombrePiso}</span>
                <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Sentinel Security Status: OK</span>
              </div>

              {/* RESUMEN DE STOCK ACTUAL DEL PISO */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 p-4 bg-slate-950/50 border-b border-slate-800">
                {Object.keys(resumenStock[nombrePiso] || {}).map(item => (
                  <div key={item} className="bg-slate-900 p-3 rounded-2xl border border-slate-800 flex flex-col items-center">
                    <span className="text-[7px] text-slate-500 font-black uppercase mb-1">{item}</span>
                    <span className="text-sm font-black text-blue-300">{resumenStock[nombrePiso][item]}</span>
                  </div>
                ))}
              </div>

              {/* HISTORIAL DETALLADO */}
              <div className="p-4 space-y-3">
                {movimientosAgrupados[nombrePiso].map((m) => (
                  <div key={m.id} className="bg-slate-950 p-4 rounded-[2rem] border border-slate-800 flex flex-col md:flex-row justify-between gap-4 items-center">
                    <div className="w-full md:w-1/4">
                      <p className="text-sm font-black text-white uppercase">{m.item}</p>
                      <p className="text-[9px] text-slate-500 font-medium italic">{formatearFecha(m.created_at)}</p>
                    </div>

                    <div className="flex items-center gap-4 bg-slate-900 px-6 py-3 rounded-2xl border border-slate-800/50">
                      <div className="text-center min-w-[45px]">
                        <span className="text-[7px] text-green-500 font-black uppercase">Ingreso</span>
                        <p className="text-sm font-black text-green-500">+{m.ingreso_limpio || m.entregado_limpio}</p>
                      </div>
                      <div className="w-px h-8 bg-slate-800"></div>
                      <div className="text-center min-w-[45px]">
                        <span className="text-[7px] text-red-500 font-black uppercase">Egreso</span>
                        <p className="text-sm font-black text-red-500">-{m.egreso_limpio || 0}</p>
                      </div>
                      <div className="w-px h-8 bg-slate-800"></div>
                      <div className="text-center min-w-[50px]">
                        <span className="text-[7px] text-blue-400 font-black uppercase">Stock</span>
                        <p className="text-sm font-black text-blue-400">{m.stock_fisico_piso}</p>
                      </div>
                    </div>

                    <div className="w-full md:w-1/3 text-right">
                      <p className="text-[9px] text-blue-500 font-black uppercase">
                        Pañolero: <span className="text-slate-300 font-bold">{m.pañolero?.jerarquia} {m.pañolero?.apellido}</span>
                      </p>
                      {m.enfermero && (
                        <p className="text-[9px] text-emerald-500 font-black uppercase mt-1">
                          Receptor: <span className="text-slate-300 font-bold">{m.enfermero?.jerarquia} {m.enfermero?.apellido}</span>
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* PESTAÑA ADMIN: SE MANTIENE INTACTA SEGÚN TU SOLICITUD */}
      {activeTab === 'admin' && (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <section className="bg-slate-900 p-6 rounded-[2rem] border border-slate-800 shadow-2xl">
            <h3 className="text-xs font-black text-slate-500 mb-6 uppercase tracking-widest">Registrar Nuevo Pañolero / Enfermero</h3>
            <form onSubmit={agregarPersonal} className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
              <input className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm" placeholder="Jerarquía" value={nuevoMiembro.jerarquia} onChange={e => setNuevoMiembro({...nuevoMiembro, jerarquia: e.target.value})} required />
              <input className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm" placeholder="Nombre" value={nuevoMiembro.nombre} onChange={e => setNuevoMiembro({...nuevoMiembro, nombre: e.target.value})} required />
              <input className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm" placeholder="Apellido" value={nuevoMiembro.apellido} onChange={e => setNuevoMiembro({...nuevoMiembro, apellido: e.target.value})} required />
              <input className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm font-mono" placeholder="DNI" value={nuevoMiembro.dni} onChange={e => setNuevoMiembro({...nuevoMiembro, dni: e.target.value})} required />
              <select className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm" value={nuevoMiembro.rol} onChange={e => setNuevoMiembro({...nuevoMiembro, rol: e.target.value})}>
                <option value="pañolero">Pañolero</option>
                <option value="enfermero">Enfermero</option>
              </select>
              <button className="bg-blue-600 p-3 rounded-xl font-black uppercase text-xs hover:bg-blue-500 transition-all">Registrar Personal</button>
            </form>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
              {personal.map(p => (
                <div key={p.dni} className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex justify-between items-center group">
                  <div>
                    <span className="text-xs font-bold uppercase">{p.jerarquia} {p.apellido}</span>
                    <span className="ml-2 text-[8px] bg-slate-800 px-2 py-1 rounded text-blue-400 uppercase font-black">{p.rol}</span>
                  </div>
                  <button onClick={() => eliminarPersonal(p.dni)} className="text-red-500 text-[10px] font-bold uppercase opacity-0 group-hover:opacity-100 transition-opacity">Eliminar</button>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-slate-900 p-6 rounded-[2rem] border border-slate-800 shadow-2xl">
            <h3 className="text-xs font-black text-slate-500 mb-6 uppercase tracking-widest">Configurar Pisos y QRs</h3>
            <form onSubmit={agregarPiso} className="flex gap-2 mb-8">
              <input className="flex-grow bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm" placeholder="Nombre del Piso" value={nuevoPiso.nombre_piso} onChange={e => setNuevoPiso({...nuevoPiso, nombre_piso: e.target.value})} required />
              <button className="bg-slate-700 px-6 rounded-xl font-bold text-xs uppercase">Crear</button>
            </form>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pisos.map(p => (
                <div key={p.id} className="p-4 bg-slate-950 rounded-2xl border border-slate-800 flex flex-col items-center space-y-4 text-center">
                  <span className="text-xs font-black uppercase text-blue-400">{p.nombre_piso}</span>
                  <div className="flex gap-2">
                    <button onClick={() => descargarQR(p.slug)} className="bg-blue-600 text-white px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest">QR</button>
                    <button onClick={() => eliminarPiso(p.id)} className="text-red-500 text-[10px] font-bold uppercase">Borrar</button>
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