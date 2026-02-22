import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const AdminDashboard = () => {
  const [personal, setPersonal] = useState([]);
  const [pisos, setPisos] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
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
    const resMov = await supabase.from('movimientos_stock')
      .select('*, pisos(nombre_piso)')
      .order('created_at', { ascending: false }).limit(10);
    
    setPersonal(resPers.data || []);
    setPisos(resPisos.data || []);
    setMovimientos(resMov.data || []);
  };

  const agregarPersonal = async (e) => {
    e.preventDefault();
    const { error } = await supabase.from('personal').insert([nuevoMiembro]);
    if (error) mostrarSplash("Error: DNI ya registrado");
    else { 
      mostrarSplash("Personal Registrado");
      setNuevoMiembro({ dni: '', nombre: '', apellido: '', jerarquia: '', celular: '', rol: 'pañolero' }); 
      cargarDatos(); 
    }
  };

  const eliminarPersonal = async (dni) => {
    if (window.confirm("¿Dar de baja a este integrante?")) {
      await supabase.from('personal').delete().eq('dni', dni);
      cargarDatos();
      mostrarSplash("Personal Eliminado");
    }
  };

  const agregarPiso = async (e) => {
    e.preventDefault();
    const slug = nuevoPiso.nombre_piso.toLowerCase().replace(/ /g, '-');
    await supabase.from('pisos').insert([{ nombre_piso: nuevoPiso.nombre_piso, slug }]);
    mostrarSplash("Piso Creado");
    setNuevoPiso({ nombre_piso: '' });
    cargarDatos();
  };

  const eliminarPiso = async (id) => {
    if (window.confirm("¿Eliminar este piso y sus registros?")) {
      await supabase.from('pisos').delete().eq('id', id);
      cargarDatos();
      mostrarSplash("Piso Eliminado");
    }
  };

  const descargarQR = (slug, nombre) => {
    const urlApp = `${window.location.origin}/piso/${slug}`; 
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(urlApp)}`;
    window.open(qrUrl, '_blank');
  };

  const formatearFecha = (fechaISO) => {
  const fecha = new Date(fechaISO);
  return fecha.toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit'
  }) + ' hs';
};

  return (
    <div className="p-4 md:p-8 space-y-10 bg-slate-950 text-slate-100 pb-20">
      {notificacion.visible && (
        <div className="fixed bottom-10 right-10 z-50 bg-blue-600 px-6 py-3 rounded-2xl shadow-2xl border border-blue-400">
          <p className="text-white font-black uppercase text-xs">{notificacion.mensaje}</p>
        </div>
      )}

      <h1 className="text-2xl font-black text-blue-500 border-b-2 border-blue-900 pb-2 uppercase italic tracking-tighter">
        Sentinel - Jefatura de Hotelería HNPM
      </h1>

      {/* GESTIÓN DE PERSONAL */}
      <section className="bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-xl">
        <h2 className="text-xs font-black text-slate-400 mb-6 uppercase tracking-widest">Tripulación del Sistema</h2>
        <form onSubmit={agregarPersonal} className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-8">
          <input className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm" placeholder="Jerarquía" value={nuevoMiembro.jerarquia} onChange={e => setNuevoMiembro({...nuevoMiembro, jerarquia: e.target.value})} required />
          <input className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm" placeholder="Nombre" value={nuevoMiembro.nombre} onChange={e => setNuevoMiembro({...nuevoMiembro, nombre: e.target.value})} required />
          <input className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm" placeholder="Apellido" value={nuevoMiembro.apellido} onChange={e => setNuevoMiembro({...nuevoMiembro, apellido: e.target.value})} required />
          <input className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm font-mono" placeholder="DNI" value={nuevoMiembro.dni} onChange={e => setNuevoMiembro({...nuevoMiembro, dni: e.target.value})} required />
          <select className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm text-slate-300" value={nuevoMiembro.rol} onChange={e => setNuevoMiembro({...nuevoMiembro, rol: e.target.value})}>
            <option value="pañolero">Pañolero</option>
            <option value="enfermero">Enfermero</option>
          </select>
          <button className="bg-blue-600 p-3 rounded-xl font-black uppercase text-xs tracking-widest hover:bg-blue-500 transition-all">Registrar</button>
        </form>

        <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
          {personal.map(p => (
            <div key={p.dni} className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex justify-between items-center">
              <div>
                <p className="text-xs font-bold uppercase">{p.jerarquia} {p.apellido}, {p.nombre}</p>
                <p className="text-[10px] text-slate-500">DNI: {p.dni} | <span className="text-blue-400 uppercase font-black">{p.rol}</span></p>
              </div>
              <button onClick={() => eliminarPersonal(p.dni)} className="text-red-500 hover:text-red-400 text-[10px] font-bold uppercase">Eliminar</button>
            </div>
          ))}
        </div>
      </section>

      {/* GESTIÓN DE PISOS */}
      <section className="bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-xl">
        <h2 className="text-xs font-black text-slate-400 mb-6 uppercase tracking-widest">Control de Pisos (QRs)</h2>
        <form onSubmit={agregarPiso} className="flex gap-2 mb-8">
          <input className="flex-grow bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm" placeholder="Nombre del Piso (Ej: Piso 2 - Cirugía)" value={nuevoPiso.nombre_piso} onChange={e => setNuevoPiso({...nuevoPiso, nombre_piso: e.target.value})} required />
          <button className="bg-slate-700 px-6 rounded-xl font-bold text-[10px] uppercase hover:bg-slate-600">Crear</button>
        </form>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pisos.map(p => (
            <div key={p.id} className="p-5 bg-slate-950 rounded-3xl border border-slate-800 flex flex-col items-center space-y-4 text-center">
              <span className="text-sm font-black uppercase text-blue-400">{p.nombre_piso}</span>
              <div className="flex gap-2">
                <button onClick={() => descargarQR(p.slug, p.nombre_piso)} className="bg-blue-600 text-white px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest">QR</button>
                <button onClick={() => eliminarPiso(p.id)} className="text-red-500 font-bold text-[10px] uppercase">Borrar</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* VISTA MACRO DE MOVIMIENTOS - DISEÑO MEJORADO */}
        <section className="bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-2xl">
        <h2 className="text-[10px] font-black text-slate-500 mb-6 uppercase tracking-[0.2em]">Auditoría de Movimientos</h2>
        <div className="space-y-3">
            {movimientos.map((m) => (
            <div key={m.id} className="p-4 bg-slate-950 rounded-2xl border-l-4 border-blue-600 flex flex-col md:flex-row md:justify-between md:items-center gap-3">
                <div className="flex flex-col">
                <span className="text-xs font-black text-blue-400 uppercase tracking-tight">
                    {m.pisos?.nombre_piso || "Piso no identificado"}
                </span>
                <span className="text-[14px] font-bold text-white mt-1">
                    {m.item}
                </span>
                </div>

                <div className="flex items-center gap-4 bg-slate-900 px-4 py-2 rounded-xl border border-slate-800">
                <div className="flex flex-col items-center">
                    <span className="text-[8px] text-green-500 font-black uppercase">Limpio</span>
                    <span className="text-sm font-black text-green-500">+{m.entregado_limpio}</span>
                </div>
                <div className="w-[1px] h-6 bg-slate-700"></div>
                <div className="flex flex-col items-center">
                    <span className="text-[8px] text-red-500 font-black uppercase">Sucio</span>
                    <span className="text-sm font-black text-red-500">-{m.retirado_sucio}</span>
                </div>
                </div>

                <div className="text-right">
                <p className="text-[10px] text-slate-400 font-medium capitalize">
                    {formatearFecha(m.created_at)}
                </p>
                <p className="text-[8px] text-slate-600 font-mono uppercase mt-1">
                    ID Operación: {m.id.split('-')[0]}
                </p>
                </div>
            </div>
            ))}
            
            {movimientos.length === 0 && (
            <p className="text-center text-slate-600 text-xs py-10 uppercase tracking-widest font-bold">
                Sin movimientos registrados en las últimas 24hs
            </p>
            )}
        </div>
        </section>
    </div>
  );
};

export default AdminDashboard;