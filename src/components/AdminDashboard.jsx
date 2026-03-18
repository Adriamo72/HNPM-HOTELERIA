import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('historial');
  const [personal, setPersonal] = useState([]);
  const [pisos, setPisos] = useState([]);
  const [auditoriaHabilitada, setAuditoriaHabilitada] = useState(false);
  const [notificacion, setNotificacion] = useState({ visible: false, mensaje: '' });
  
  // Mantenemos solo lo necesario para la lógica de habitaciones
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
    const { data: config } = await supabase.from('configuracion_sistema').select('valor').eq('clave', 'MODO_AUDITORIA').single();
    
    setAuditoriaHabilitada(config?.valor === 'true');
    setPersonal(resPers.data || []);
    setPisos(resPisos.data || []);
  };

  const generarQR = (path, titulo) => {
    const urlApp = `${window.location.origin}${path}`; 
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(urlApp)}`;
    const win = window.open('', '_blank');
    win.document.write(`
      <html>
        <head><title>QR - ${titulo}</title><style>body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; } h1 { text-transform: uppercase; font-size: 20px; margin-bottom: 10px; font-weight: 900; } img { width: 300px; } p { margin-top: 15px; font-size: 12px; font-weight: bold; color: #666; }</style></head>
        <body><h1>${titulo}</h1><img src="${qrUrl}" /><p>Dpto. Hotelería - HNPM</p><script>setTimeout(() => { window.print(); window.close(); }, 600);</script></body>
      </html>
    `);
    win.document.close();
  };

  const toggleAuditoria = async () => {
    const nuevoEstado = !auditoriaHabilitada;
    await supabase.from('configuracion_sistema').update({ valor: nuevoEstado.toString() }).eq('clave', 'MODO_AUDITORIA');
    setAuditoriaHabilitada(nuevoEstado);
    mostrarSplash(nuevoEstado ? "MODO AUDITORÍA ACTIVADO" : "MODO AUDITORÍA CERRADO");
  };

  const agregarPiso = async (e) => {
    e.preventDefault();
    const slug = nuevoPiso.nombre_piso.toLowerCase().replace(/ /g, '-');
    await supabase.from('pisos').insert([{ nombre_piso: nuevoPiso.nombre_piso, slug }]);
    setNuevoPiso({ nombre_piso: '' }); cargarDatos();
  };

  const agregarPersonal = async (e) => {
    e.preventDefault();
    await supabase.from('personal').insert([nuevoMiembro]);
    setNuevoMiembro({ dni: '', nombre: '', apellido: '', jerarquia: '', celular: '', rol: 'pañolero' });
    cargarDatos();
  };

  return (
    <div className="p-4 md:p-8 bg-slate-950 min-h-screen text-slate-100 font-sans">
      
      {/* Pestañas */}
      <div className="flex gap-2 mb-8 bg-slate-900 p-1.5 rounded-2xl border border-slate-800 w-fit">
        <button onClick={() => setActiveTab('historial')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase ${activeTab === 'historial' ? 'bg-blue-600' : 'text-slate-500'}`}>Monitor</button>
        <button onClick={() => setActiveTab('admin')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase ${activeTab === 'admin' ? 'bg-blue-600' : 'text-slate-500'}`}>Administración</button>
      </div>

      {activeTab === 'historial' && (
        <section className="space-y-8 animate-in fade-in text-center py-20">
          <h2 className="text-4xl font-black text-white uppercase italic tracking-tighter">Sentinel Monitor</h2>
          <p className="text-slate-500 text-xs uppercase tracking-widest">El sistema está operando correctamente</p>
          <button onClick={cargarDatos} className="text-[10px] bg-slate-800 px-6 py-3 rounded-xl font-black text-slate-400 border border-slate-700">Actualizar Estado</button>
        </section>
      )}

      {activeTab === 'admin' && (
        <div className="space-y-10 animate-in fade-in">
          {/* Mando de Auditoría */}
          <section className="bg-slate-900 p-6 rounded-[2rem] border border-yellow-600/30 flex justify-between items-center">
            <div className="text-yellow-500">
               <h3 className="text-sm font-black uppercase italic">Mando de Auditoría</h3>
               <p className="text-[10px] text-slate-500 uppercase font-bold">Ajuste manual de stock habilitado</p>
            </div>
            <button onClick={toggleAuditoria} className={`px-8 py-3 rounded-xl font-black text-[10px] uppercase ${auditoriaHabilitada ? 'bg-red-600' : 'bg-green-600'}`}>
              {auditoriaHabilitada ? 'Desactivar' : 'Activar'}
            </button>
          </section>

          {/* Gestión de Personal */}
          <section className="bg-slate-900 p-6 rounded-[2rem] border border-slate-800">
            <h3 className="text-xs font-black text-slate-500 mb-6 uppercase tracking-widest">Personal de Guardia</h3>
            <form onSubmit={agregarPersonal} className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
              <input className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm" placeholder="Jerarquía" value={nuevoMiembro.jerarquia} onChange={e => setNuevoMiembro({...nuevoMiembro, jerarquia: e.target.value})} required />
              <input className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm" placeholder="Nombre" value={nuevoMiembro.nombre} onChange={e => setNuevoMiembro({...nuevoMiembro, nombre: e.target.value})} required />
              <input className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm" placeholder="Apellido" value={nuevoMiembro.apellido} onChange={e => setNuevoMiembro({...nuevoMiembro, apellido: e.target.value})} required />
              <input className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm font-mono" placeholder="DNI" value={nuevoMiembro.dni} onChange={e => setNuevoMiembro({...nuevoMiembro, dni: e.target.value})} required />
              <button className="bg-blue-600 p-3 rounded-xl font-black uppercase text-xs md:col-span-2">Registrar Personal</button>
            </form>
          </section>

          {/* Sectores y QRs */}
          <section className="bg-slate-900 p-6 rounded-[2rem] border border-slate-800 shadow-2xl">
            <h3 className="text-xs font-black text-slate-500 mb-6 uppercase tracking-widest">Sectores y Generador de QRs</h3>
            <form onSubmit={agregarPiso} className="flex gap-2 mb-8">
              <input className="flex-grow bg-slate-800 p-4 rounded-2xl border border-slate-700 text-sm outline-none" placeholder="Nombre de nuevo sector..." value={nuevoPiso.nombre_piso} onChange={e => setNuevoPiso({...nuevoPiso, nombre_piso: e.target.value})} required />
              <button className="bg-blue-600 px-8 rounded-2xl font-black text-[10px] uppercase">Crear</button>
            </form>
            
            <div className="space-y-4">
              {pisos.map(p => (
                <div key={p.id} className="bg-slate-950 p-6 rounded-3xl border border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4">
                  <span className="text-sm font-black text-blue-400 uppercase tracking-widest">{p.nombre_piso}</span>
                  <div className="flex flex-wrap justify-center gap-2">
                    <button onClick={() => generarQR(`/piso/${p.slug}`, `PAÑOL - ${p.nombre_piso}`)} className="px-4 py-2 bg-slate-800 rounded-lg text-[9px] font-bold uppercase text-blue-500 border border-blue-900/30">QR Pañol</button>
                    <button onClick={() => generarQR(`/lavadero/${p.slug}`, `LAVADERO - ${p.nombre_piso}`)} className="px-4 py-2 bg-slate-800 rounded-lg text-[9px] font-bold uppercase text-green-500 border border-green-900/30">QR Lavadero</button>
                    <button onClick={() => {
                        const h = prompt("Nombre de habitación (ej: Medico de Guardia):");
                        if(h) generarQR(`/habitacion/${p.slug}-${h.toLowerCase().replace(/ /g, '-')}`, `${h.toUpperCase()} - ${p.nombre_piso}`);
                    }} className="px-4 py-2 bg-slate-800 rounded-lg text-[9px] font-bold uppercase text-purple-400 border border-purple-900/30">+ Hab. Especial</button>
                    <button onClick={async () => { if(window.confirm(`¿Eliminar ${p.nombre_piso}?`)) { await supabase.from('pisos').delete().eq('id', p.id); cargarDatos(); } }} className="text-red-500 font-black px-2">×</button>
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