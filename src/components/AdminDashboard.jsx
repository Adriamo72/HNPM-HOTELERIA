import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('historial');
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
      .order('created_at', { ascending: false })
      .limit(30);
    
    setPersonal(resPers.data || []);
    setPisos(resPisos.data || []);
    setMovimientos(resMov.data || []);
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
      mostrarSplash("Baja Procesada");
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

  return (
    <div className="p-4 md:p-8 bg-slate-950 min-h-screen text-slate-100 font-sans">
      {notificacion.visible && (
        <div className="fixed bottom-10 right-10 z-50 bg-blue-600 px-6 py-3 rounded-2xl shadow-2xl border border-blue-400">
          <p className="text-white font-black uppercase text-xs tracking-widest">{notificacion.mensaje}</p>
        </div>
      )}

      {/* SELECTOR DE PESTAÑAS */}
      <div className="flex gap-2 mb-8 bg-slate-900 p-1.5 rounded-2xl border border-slate-800 w-fit">
        <button 
          onClick={() => setActiveTab('historial')}
          className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'historial' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' : 'text-slate-500 hover:text-slate-300'}`}
        >
          Monitor de Movimientos
        </button>
        <button 
          onClick={() => setActiveTab('admin')}
          className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'admin' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' : 'text-slate-500 hover:text-slate-300'}`}
        >
          Administración
        </button>
      </div>

      {/* VISTA: HISTORIAL MACRO (LO QUE YA FUNCIONABA BIEN) */}
      {activeTab === 'historial' && (
        <section className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-black text-blue-500 uppercase italic">Auditoría en Tiempo Real</h2>
            <button onClick={cargarDatos} className="text-[9px] bg-slate-800 px-3 py-1.5 rounded-full font-black text-slate-400 border border-slate-700">Refrescar</button>
          </div>
          <div className="space-y-3">
            {movimientos.map((m) => (
              <div key={m.id} className="p-5 bg-slate-900 rounded-[2rem] border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">{m.pisos?.nombre_piso}</span>
                  <span className="text-xl font-bold text-white mt-1 leading-none">{m.item}</span>
                </div>
                <div className="flex items-center gap-6 bg-slate-950 px-6 py-3 rounded-2xl border border-slate-800 self-start md:self-center">
                  <div className="text-center min-w-[60px]">
                    <p className="text-[8px] text-green-500 font-black uppercase mb-1">Limpio</p>
                    <p className="text-2xl font-black text-green-500">+{m.entregado_limpio}</p>
                  </div>
                  <div className="w-px h-10 bg-slate-800"></div>
                  <div className="text-center min-w-[60px]">
                    <p className="text-[8px] text-red-500 font-black uppercase mb-1">Sucio</p>
                    <p className="text-2xl font-black text-red-500">-{m.retirado_sucio}</p>
                  </div>
                </div>
                <div className="text-left md:text-right border-t md:border-t-0 border-slate-800 pt-3 md:pt-0">
                  <p className="text-[11px] text-slate-400 font-bold capitalize italic">{formatearFecha(m.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* VISTA: ADMINISTRACIÓN (RESTAURADA A VERSIÓN ORIGINAL) */}
      {activeTab === 'admin' && (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
          
          {/* GESTIÓN DE PERSONAL ORIGINAL */}
          <section className="bg-slate-900 p-6 rounded-[2rem] border border-slate-800">
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
              <button className="bg-blue-600 p-3 rounded-xl font-black uppercase text-xs hover:bg-blue-500">Registrar Personal</button>
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

          {/* GESTIÓN DE PISOS ORIGINAL */}
          <section className="bg-slate-900 p-6 rounded-[2rem] border border-slate-800">
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
                    <button onClick={() => descargarQR(p.slug, p.nombre_piso)} className="bg-blue-600 text-white px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest">QR</button>
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