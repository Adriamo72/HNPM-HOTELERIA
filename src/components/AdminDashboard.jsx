import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const AdminDashboard = () => {
  const [personal, setPersonal] = useState([]);
  const [pisos, setPisos] = useState([]);
  const [nuevoMiembro, setNuevoMiembro] = useState({
    dni: '', nombre: '', apellido: '', jerarquia: '', celular: '', rol: 'pañolero'
  });
  const [nuevoPiso, setNuevoPiso] = useState({ nombre_piso: '' });

  useEffect(() => { cargarDatos(); }, []);

  const cargarDatos = async () => {
    const resPers = await supabase.from('personal').select('*').order('apellido');
    const resPisos = await supabase.from('pisos').select('*').order('nombre_piso');
    setPersonal(resPers.data || []);
    setPisos(resPisos.data || []);
  };

  const agregarPersonal = async (e) => {
    e.preventDefault();
    const { error } = await supabase.from('personal').insert([nuevoMiembro]);
    if (error) alert("Error: " + error.message);
    else { setNuevoMiembro({ dni: '', nombre: '', apellido: '', jerarquia: '', celular: '', rol: 'pañolero' }); cargarDatos(); }
  };

  const eliminarPersonal = async (dni) => {
    if (window.confirm("¿Dar de baja a este integrante?")) {
      await supabase.from('personal').delete().eq('dni', dni);
      cargarDatos();
    }
  };

  const agregarPiso = async (e) => {
    e.preventDefault();
    const slug = nuevoPiso.nombre_piso.toLowerCase().replace(/ /g, '-');
    await supabase.from('pisos').insert([{ nombre_piso: nuevoPiso.nombre_piso, slug }]);
    setNuevoPiso({ nombre_piso: '' });
    cargarDatos();
  };

  const eliminarPiso = async (id) => {
    if (window.confirm("¿Eliminar este piso y sus registros?")) {
      await supabase.from('pisos').delete().eq('id', id);
      cargarDatos();
    }
  };

  const descargarQR = (slug, nombre) => {
  // window.location.origin detecta automáticamente si estás en 
  // sentinel-laundry-hnpm o en hoteleria-hnpm
  const urlBase = window.location.origin; 
  const urlApp = `${urlBase}/piso/${slug}`; 
  
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(urlApp)}`;
  
  const link = document.createElement('a');
  link.href = qrUrl;
  link.download = `QR-${nombre}.png`;
  link.target = "_blank";
  link.click();
};

  return (
    <div className="p-4 md:p-8 space-y-10 bg-slate-950 text-slate-100">
      <h1 className="text-2xl font-black text-blue-500 border-b-2 border-blue-900 pb-2 uppercase italic">
        Sentinel - Jefatura de Hotelería HNPM
      </h1>

      {/* GESTIÓN DE PERSONAL */}
      <section className="bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-xl">
        <h2 className="text-xs font-black text-slate-400 mb-6 uppercase tracking-[0.2em]">Registro de Tripulación</h2>
        <form onSubmit={agregarPersonal} className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-8">
          <input className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm" placeholder="Jerarquía" value={nuevoMiembro.jerarquia} onChange={e => setNuevoMiembro({...nuevoMiembro, jerarquia: e.target.value})} required />
          <input className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm" placeholder="Nombre" value={nuevoMiembro.nombre} onChange={e => setNuevoMiembro({...nuevoMiembro, nombre: e.target.value})} required />
          <input className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm" placeholder="Apellido" value={nuevoMiembro.apellido} onChange={e => setNuevoMiembro({...nuevoMiembro, apellido: e.target.value})} required />
          <input className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm font-mono" placeholder="DNI" value={nuevoMiembro.dni} onChange={e => setNuevoMiembro({...nuevoMiembro, dni: e.target.value})} required />
          <select className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm" value={nuevoMiembro.rol} onChange={e => setNuevoMiembro({...nuevoMiembro, rol: e.target.value})}>
            <option value="pañolero">Pañolero</option>
            <option value="enfermero">Enfermero Resp.</option>
          </select>
          <button className="bg-blue-600 hover:bg-blue-500 p-3 rounded-xl font-black uppercase text-[10px] tracking-widest">Registrar</button>
        </form>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="text-[10px] text-slate-500 uppercase border-b border-slate-800">
              <tr>
                <th className="pb-3 px-2">Jerarquía / Nombre</th>
                <th className="pb-3 px-2 text-center">Rol</th>
                <th className="pb-3 px-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {personal.map(p => (
                <tr key={p.dni} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-4 px-2">
                    <p className="text-sm font-bold uppercase">{p.jerarquia} {p.apellido}, {p.nombre}</p>
                    <p className="text-[10px] text-slate-500 font-mono italic">DNI: {p.dni}</p>
                  </td>
                  <td className="py-4 px-2 text-center">
                    <span className={`text-[9px] px-2 py-1 rounded font-black ${p.rol === 'enfermero' ? 'bg-purple-900/50 text-purple-400' : 'bg-blue-900/50 text-blue-400'}`}>
                      {p.rol}
                    </span>
                  </td>
                  <td className="py-4 px-2 text-right">
                    <button onClick={() => eliminarPersonal(p.dni)} className="text-red-500 hover:text-red-400 text-[10px] font-bold uppercase ml-4">Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* GESTIÓN DE PISOS Y QR */}
      <section className="bg-slate-900 p-6 rounded-3xl border border-slate-800">
        <h2 className="text-xs font-black text-slate-400 mb-6 uppercase tracking-[0.2em]">Puntos de Control (Pisos)</h2>
        <form onSubmit={agregarPiso} className="flex gap-2 mb-8">
          <input className="flex-grow bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm" placeholder="Nombre del Piso (Ej: Piso 2 - Cirugía)" value={nuevoPiso.nombre_piso} onChange={e => setNuevoPiso({...nuevoPiso, nombre_piso: e.target.value})} required />
          <button className="bg-slate-700 px-6 rounded-xl font-bold text-[10px] uppercase">Crear Piso</button>
        </form>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pisos.map(p => (
            <div key={p.id} className="p-5 bg-slate-950 rounded-3xl border border-slate-800 flex flex-col items-center space-y-4">
              <div className="text-center">
                <p className="text-sm font-black text-blue-400 uppercase">{p.nombre_piso}</p>
                <p className="text-[9px] text-slate-600 font-mono">{p.slug}</p>
              </div>
              
              <div className="p-3 bg-white rounded-2xl shadow-inner">
                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(`https://tu-app.vercel.app/piso/${p.slug}`)}`} alt="QR" />
              </div>

              <div className="flex gap-4 w-full justify-center">
                <button onClick={() => descargarQR(p.slug, p.nombre_piso)} className="text-[9px] bg-blue-600 px-3 py-2 rounded-lg font-black uppercase tracking-widest">Descargar QR</button>
                <button onClick={() => eliminarPiso(p.id)} className="text-[9px] text-red-500 font-bold uppercase">Borrar</button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default AdminDashboard;