import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const AdminDashboard = () => {
  const [personal, setPersonal] = useState([]);
  const [pisos, setPisos] = useState([]);
  const [nuevoMiembro, setNuevoMiembro] = useState({
    dni: '', nombre: '', apellido: '', jerarquia: '', celular: '', rol: 'pañolero'
  });
  const [nuevoPiso, setNuevoPiso] = useState({ nombre_piso: '', slug: '' });

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    const resPersonal = await supabase.from('personal').select('*').order('apellido');
    const resPisos = await supabase.from('pisos').select('*').order('nombre_piso');
    setPersonal(resPersonal.data || []);
    setPisos(resPisos.data || []);
  };

  const agregarPersonal = async (e) => {
    e.preventDefault();
    const { error } = await supabase.from('personal').insert([nuevoMiembro]);
    if (error) alert("Error al cargar personal: " + error.message);
    else {
      alert("Personal registrado correctamente");
      setNuevoMiembro({ dni: '', nombre: '', apellido: '', jerarquia: '', celular: '', rol: 'pañolero' });
      cargarDatos();
    }
  };

  const agregarPiso = async (e) => {
    e.preventDefault();
    const slug = nuevoPiso.nombre_piso.toLowerCase().replace(/ /g, '-');
    const { error } = await supabase.from('pisos').insert([{ ...nuevoPiso, slug }]);
    if (error) alert("Error al cargar piso: " + error.message);
    else {
      alert("Piso creado");
      setNuevoPiso({ nombre_piso: '', slug: '' });
      cargarDatos();
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-8 bg-slate-950 min-h-screen text-slate-100 font-sans">
      <h1 className="text-2xl font-black text-blue-500 border-b-2 border-blue-900 pb-2 uppercase tracking-tighter">
        Panel de Control - Jefatura de Hotelería
      </h1>

      {/* SECCIÓN: ALTA DE PERSONAL */}
      <section className="bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-2xl">
        <h2 className="text-sm font-black text-slate-400 mb-4 uppercase tracking-widest">Registrar Personal (Pañoleros / Enfermeros)</h2>
        <form onSubmit={agregarPersonal} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm" placeholder="Jerarquía (Ej: Suboficial Segundo)" value={nuevoMiembro.jerarquia} onChange={e => setNuevoMiembro({...nuevoMiembro, jerarquia: e.target.value})} required />
          <input className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm" placeholder="Nombre" value={nuevoMiembro.nombre} onChange={e => setNuevoMiembro({...nuevoMiembro, nombre: e.target.value})} required />
          <input className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm" placeholder="Apellido" value={nuevoMiembro.apellido} onChange={e => setNuevoMiembro({...nuevoMiembro, apellido: e.target.value})} required />
          <input className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm font-mono" placeholder="DNI (Sin puntos)" value={nuevoMiembro.dni} onChange={e => setNuevoMiembro({...nuevoMiembro, dni: e.target.value})} required />
          <input className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm" placeholder="Celular" value={nuevoMiembro.celular} onChange={e => setNuevoMiembro({...nuevoMiembro, celular: e.target.value})} />
          <select className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm text-slate-300" value={nuevoMiembro.rol} onChange={e => setNuevoMiembro({...nuevoMiembro, rol: e.target.value})}>
            <option value="pañolero">Pañolero (Operador)</option>
            <option value="enfermero">Enfermero (Responsable de Piso)</option>
          </select>
          <button className="md:col-span-2 bg-blue-600 hover:bg-blue-500 p-4 rounded-xl font-black uppercase text-xs tracking-widest transition-all shadow-lg shadow-blue-900/20">
            Incorporar al Sistema
          </button>
        </form>
      </section>

      {/* SECCIÓN: GESTIÓN DE PISOS */}
      <section className="bg-slate-900 p-6 rounded-3xl border border-slate-800">
        <h2 className="text-sm font-black text-slate-400 mb-4 uppercase tracking-widest">Configuración de Pisos</h2>
        <form onSubmit={agregarPiso} className="flex gap-2 mb-6">
          <input className="flex-grow bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm" placeholder="Nombre del Piso (Ej: Piso 2 - Maternidad)" value={nuevoPiso.nombre_piso} onChange={e => setNuevoPiso({...nuevoPiso, nombre_piso: e.target.value})} required />
          <button className="bg-slate-700 px-6 rounded-xl font-bold text-xs uppercase">Crear</button>
        </form>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {pisos.map(piso => (
            <div key={piso.id} className="p-4 bg-slate-950 rounded-2xl border border-slate-800 flex flex-col items-center">
              <span className="text-[10px] font-black text-blue-400 mb-2">{piso.nombre_piso}</span>
              <div className="bg-white p-2 rounded-lg">
                {/* Aquí irá el componente QR más adelante */}
                <div className="w-24 h-24 bg-slate-200 flex items-center justify-center text-[8px] text-slate-500 text-center uppercase p-1">
                  QR Pendiente<br/>{piso.slug}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default AdminDashboard;