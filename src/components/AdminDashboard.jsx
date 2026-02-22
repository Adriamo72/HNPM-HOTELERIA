import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const AdminDashboard = () => {
  const [personal, setPersonal] = useState([]);
  const [pisos, setPisos] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [notificacion, setNotificacion] = useState({ visible: false, mensaje: '' });
  const [nuevoMiembro, setNuevoMiembro] = useState({ dni: '', nombre: '', apellido: '', jerarquia: '', celular: '', rol: 'pañolero' });
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
      .select('*, pisos(nombre_piso), personal!movimientos_stock_dni_pañolero_fkey(apellido)')
      .order('created_at', { ascending: false }).limit(10);
    
    setPersonal(resPers.data || []);
    setPisos(resPisos.data || []);
    setMovimientos(resMov.data || []);
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

  const agregarPiso = async (e) => {
    e.preventDefault();
    const slug = nuevoPiso.nombre_piso.toLowerCase().replace(/ /g, '-');
    await supabase.from('pisos').insert([{ nombre_piso: nuevoPiso.nombre_piso, slug }]);
    mostrarSplash("Piso Creado");
    setNuevoPiso({ nombre_piso: '' });
    cargarDatos();
  };

  const descargarQR = (slug, nombre) => {
    const urlApp = `${window.location.origin}/piso/${slug}`; 
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(urlApp)}`;
    window.open(qrUrl, '_blank');
  };

  return (
    <div className="p-4 md:p-8 space-y-10 bg-slate-950 text-slate-100 pb-20">
      {notificacion.visible && (
        <div className="fixed bottom-10 right-10 z-50 bg-blue-600 px-6 py-3 rounded-2xl shadow-2xl border border-blue-400 animate-pulse">
          <p className="text-white font-black uppercase text-xs">{notificacion.mensaje}</p>
        </div>
      )}

      <header className="flex justify-between items-center border-b border-slate-800 pb-4">
        <h1 className="text-2xl font-black text-blue-500 uppercase italic tracking-tighter">Sentinel Jefatura</h1>
      </header>

      {/* SECCIÓN PERSONAL */}
      <section className="bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-xl">
        <h2 className="text-[10px] font-black text-slate-500 mb-6 uppercase tracking-widest">Gestión de Tripulación</h2>
        <form onSubmit={agregarPersonal} className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-8">
          <input className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm" placeholder="Jerarquía" value={nuevoMiembro.jerarquia} onChange={e => setNuevoMiembro({...nuevoMiembro, jerarquia: e.target.value})} required />
          <input className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm" placeholder="Nombre" value={nuevoMiembro.nombre} onChange={e => setNuevoMiembro({...nuevoMiembro, nombre: e.target.value})} required />
          <input className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm" placeholder="Apellido" value={nuevoMiembro.apellido} onChange={e => setNuevoMiembro({...nuevoMiembro, apellido: e.target.value})} required />
          <button className="bg-blue-600 p-3 rounded-xl font-black uppercase text-[10px]">Alta</button>
        </form>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {personal.map(p => (
            <div key={p.dni} className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex justify-between items-center">
              <span className="text-[10px] font-bold uppercase">{p.jerarquia} {p.apellido}</span>
              <span className="text-[8px] bg-slate-800 px-2 py-1 rounded text-blue-400">{p.rol}</span>
            </div>
          ))}
        </div>
      </section>

      {/* SECCIÓN PISOS Y QRs */}
      <section className="bg-slate-900 p-6 rounded-3xl border border-slate-800">
        <h2 className="text-[10px] font-black text-slate-500 mb-6 uppercase tracking-widest">Puntos de Control (QRs)</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {pisos.map(p => (
            <div key={p.id} className="p-4 bg-slate-950 rounded-2xl border border-slate-800 flex justify-between items-center">
              <span className="text-xs font-black uppercase">{p.nombre_piso}</span>
              <button onClick={() => descargarQR(p.slug, p.nombre_piso)} className="bg-blue-600/20 text-blue-400 p-2 rounded-lg text-[10px] font-black hover:bg-blue-600 hover:text-white transition-all">QR</button>
            </div>
          ))}
        </div>
      </section>

      {/* SECCIÓN AUDITORÍA MACRO */}
      <section className="bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-2xl">
        <h2 className="text-[10px] font-black text-slate-500 mb-6 uppercase tracking-widest">Auditoría en Tiempo Real</h2>
        <div className="space-y-3">
          {movimientos.map(m => (
            <div key={m.id} className="grid grid-cols-4 gap-2 p-3 bg-slate-950 rounded-xl border-l-4 border-blue-600 text-[10px] items-center">
              <span className="font-black text-blue-300 uppercase">{m.pisos?.nombre_piso}</span>
              <span className="font-bold text-slate-400">{m.item}</span>
              <span className="text-center font-black">+{m.entregado_limpio} / -{m.retirado_sucio}</span>
              <span className="text-right text-slate-600 font-mono">{new Date(m.created_at).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default AdminDashboard;