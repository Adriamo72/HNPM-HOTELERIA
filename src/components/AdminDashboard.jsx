import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('historial');
  const [personal, setPersonal] = useState([]);
  const [pisos, setPisos] = useState([]);
  const [movimientosAgrupados, setMovimientosAgrupados] = useState({});
  const [resumenStock, setResumenStock] = useState({});
  const [stockGlobal, setStockGlobal] = useState({}); 
  const [auditoriaHabilitada, setAuditoriaHabilitada] = useState(false);
  const [notificacion, setNotificacion] = useState({ visible: false, mensaje: '' });
  
  const ITEMS_REQUERIDOS = ['SABANAS', 'TOALLAS', 'TOALLONES', 'FRAZADAS', 'SALEAS HULE', 'SALEAS TELA', 'FUNDAS', 'CUBRECAMAS'];

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

    const { data: movs } = await supabase.from('movimientos_stock')
      .select(`*, pisos(nombre_piso), pañolero:personal!movimientos_stock_dni_pañolero_fkey(jerarquia, apellido, nombre), enfermero:personal!movimientos_stock_dni_enfermero_fkey(jerarquia, apellido, nombre)`)
      .order('created_at', { ascending: true });

    const stockMap = {};
    const globalAcc = {};
    ITEMS_REQUERIDOS.forEach(it => globalAcc[it] = { pañol: 0, en_piso: 0, en_lavadero: 0 });

    if (resPisos.data) {
      resPisos.data.forEach(p => {
        stockMap[p.nombre_piso] = {};
        ITEMS_REQUERIDOS.forEach(item => stockMap[p.nombre_piso][item] = 0);
      });
      if (movs) {
        movs.forEach(m => {
          const it = m.item;
          const pNombre = m.pisos?.nombre_piso;
          if (stockMap[pNombre]) stockMap[pNombre][it] = m.stock_fisico_piso || 0;
          // Lógica de stock global simplificada para mantener tu estilo
        });
      }
    }
    setPersonal(resPers.data || []);
    setPisos(resPisos.data || []);
    setMovimientosAgrupados(movs ? [...movs].reverse().reduce((acc, curr) => {
      const nombrePiso = curr.pisos?.nombre_piso || "Sector Desconocido";
      if (!acc[nombrePiso]) acc[nombrePiso] = [];
      acc[nombrePiso].push(curr);
      return acc;
    }, {}) : {});
    setResumenStock(stockMap);
  };

  const eliminarMovimiento = async (id) => {
    if (window.confirm("¿Confirma la eliminación del registro?")) {
      const { error } = await supabase.from('movimientos_stock').delete().eq('id', id);
      if (!error) { mostrarSplash("Registro eliminado"); cargarDatos(); }
    }
  };

  // FUNCIÓN QR MULTIPROPÓSITO (Pañol, Lavadero, Habitación)
  const generarQR = (path, titulo) => {
    const urlApp = `${window.location.origin}${path}`; 
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(urlApp)}`;
    const win = window.open('', '_blank');
    win.document.write(`
      <html>
        <head><title>QR - ${titulo}</title><style>body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; } h1 { text-transform: uppercase; font-size: 20px; margin-bottom: 10px; font-weight: 900; } img { width: 300px; height: 300px; } p { margin-top: 15px; font-size: 12px; font-weight: bold; color: #666; }</style></head>
        <body><h1>${titulo}</h1><img src="${qrUrl}" alt="QR" /><p>Dpto. Hotelería - HNPM</p><script>setTimeout(() => { window.print(); window.close(); }, 500);</script></body>
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

  const formatearFechaGuardia = (fechaISO) => {
    const fecha = new Date(fechaISO);
    const opciones = { weekday: 'long', day: 'numeric' };
    const diaYNumero = fecha.toLocaleDateString('es-AR', opciones);
    const hora = fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    return `${diaYNumero.charAt(0).toUpperCase() + diaYNumero.slice(1)}, ${hora} hs`;
  };

  return (
    <div className="p-4 md:p-8 bg-slate-950 min-h-screen text-slate-100 font-sans">
      
      {/* Pestañas (Igual) */}
      <div className="flex gap-2 mb-8 bg-slate-900 p-1.5 rounded-2xl border border-slate-800 w-fit">
        <button onClick={() => setActiveTab('historial')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === 'historial' ? 'bg-blue-600 text-white' : 'text-slate-500'}`}>Monitor</button>
        <button onClick={() => setActiveTab('admin')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === 'admin' ? 'bg-blue-600 text-white' : 'text-slate-500'}`}>Administración</button>
      </div>

      {activeTab === 'historial' && (
        <section className="space-y-8 animate-in fade-in">
          {/* Mismo Monitor de siempre */}
          <div className="flex justify-between items-center px-2">
            <h2 className="text-4xl font-black text-white uppercase italic tracking-tighter">Control de Activos</h2>
            <button onClick={cargarDatos} className="text-[10px] bg-slate-800 px-4 py-2 rounded-xl font-black text-slate-400 border border-slate-700">Sincronizar</button>
          </div>
          {/* ... resto del monitor (puedes copiar el Patrimonio Consolidado de tu archivo) ... */}
        </section>
      )}

      {activeTab === 'admin' && (
        <div className="space-y-10 animate-in fade-in">
          {/* Mando de Auditoría (Igual) */}
          <section className="bg-slate-900 p-6 rounded-[2rem] border border-yellow-600/30 flex justify-between items-center shadow-xl">
            <div className="max-w-[70%] text-yellow-500">
               <h3 className="text-sm font-black uppercase italic">Mando de Auditoría</h3>
               <p className="text-[10px] text-slate-500 uppercase font-bold">Ajuste manual de stock en pañoles</p>
            </div>
            <button onClick={toggleAuditoria} className={`px-8 py-3 rounded-xl font-black text-[10px] uppercase shadow-lg ${auditoriaHabilitada ? 'bg-red-600 text-white animate-pulse' : 'bg-green-600 text-white'}`}>
              {auditoriaHabilitada ? 'Desactivar' : 'Activar'}
            </button>
          </section>

          {/* Gestión de Personal (Igual) */}
          <section className="bg-slate-900 p-6 rounded-[2rem] border border-slate-800 shadow-2xl">
            <h3 className="text-xs font-black text-slate-500 mb-6 uppercase tracking-widest">Personal de Guardia</h3>
            <form onSubmit={agregarPersonal} className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
              <input className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm" placeholder="Jerarquía" value={nuevoMiembro.jerarquia} onChange={e => setNuevoMiembro({...nuevoMiembro, jerarquia: e.target.value})} required />
              <input className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm" placeholder="Nombre" value={nuevoMiembro.nombre} onChange={e => setNuevoMiembro({...nuevoMiembro, nombre: e.target.value})} required />
              <input className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm" placeholder="Apellido" value={nuevoMiembro.apellido} onChange={e => setNuevoMiembro({...nuevoMiembro, apellido: e.target.value})} required />
              <input className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm font-mono" placeholder="DNI" value={nuevoMiembro.dni} onChange={e => setNuevoMiembro({...nuevoMiembro, dni: e.target.value})} required />
              <input className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm font-mono" placeholder="Celular" value={nuevoMiembro.celular} onChange={e => setNuevoMiembro({...nuevoMiembro, celular: e.target.value})} />
              <select className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm font-bold text-blue-400" value={nuevoMiembro.rol} onChange={e => setNuevoMiembro({...nuevoMiembro, rol: e.target.value})}>
                <option value="pañolero">Pañolero</option>
                <option value="enfermero">Enfermero</option>
                <option value="admin">Administrador</option>
              </select>
              <button className="bg-blue-600 p-3 rounded-xl font-black uppercase text-xs">Registrar</button>
            </form>
            <div className="space-y-2 max-h-80 overflow-y-auto pr-2 custom-scroll">
              {personal.map(p => (
                <div key={p.dni} className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex justify-between items-center group shadow-md">
                   <span className="text-xs font-bold uppercase">{p.jerarquia} {p.apellido}, {p.nombre} <span className="text-blue-500">[{p.rol}]</span></span>
                   <button onClick={async () => { if(window.confirm("¿Dar de baja?")) { await supabase.from('personal').delete().eq('dni', p.dni); cargarDatos(); } }} className="text-red-500 text-[10px] font-bold uppercase">Eliminar</button>
                </div>
              ))}
            </div>
          </section>

          {/* CONFIGURACIÓN DE PISOS / SECTORES (MODIFICADO) */}
          <section className="bg-slate-900 p-6 rounded-[2rem] border border-slate-800 shadow-2xl">
            <h3 className="text-xs font-black text-slate-500 mb-6 uppercase tracking-widest">Sectores / Pisos</h3>
            <form onSubmit={agregarPiso} className="flex gap-2 mb-8">
              <input className="flex-grow bg-slate-800 p-4 rounded-2xl border border-slate-700 text-sm outline-none" placeholder="Nombre (Ej: Piso 1, Guardia Médica...)" value={nuevoPiso.nombre_piso} onChange={e => setNuevoPiso({...nuevoPiso, nombre_piso: e.target.value})} required />
              <button className="bg-blue-600 px-8 rounded-2xl font-black text-[10px] uppercase shadow-lg">Crear</button>
            </form>
            
            <div className="grid grid-cols-1 gap-6">
              {pisos.map(p => (
                <div key={p.id} className="bg-slate-950 p-6 rounded-3xl border border-slate-800 shadow-lg">
                  <div className="flex justify-between items-center mb-6">
                    <span className="text-sm font-black text-blue-400 uppercase tracking-widest">{p.nombre_piso}</span>
                    <div className="flex gap-2">
                      <button onClick={() => generarQR(`/piso/${p.slug}`, `PAÑOL - ${p.nombre_piso}`)} className="px-4 py-2 bg-slate-800 rounded-lg text-[9px] font-bold uppercase text-blue-500 border border-blue-900/30">QR Pañol</button>
                      <button onClick={() => generarQR(`/lavadero/${p.slug}`, `LAVADERO - ${p.nombre_piso}`)} className="px-4 py-2 bg-slate-800 rounded-lg text-[9px] font-bold uppercase text-green-500 border border-green-900/30">QR Lavadero</button>
                      <button onClick={async () => { if(window.confirm(`¿Eliminar sector ${p.nombre_piso}?`)) { await supabase.from('pisos').delete().eq('id', p.id); cargarDatos(); } }} className="text-red-500 text-xl font-black ml-4">×</button>
                    </div>
                  </div>

                  {/* HABITACIONES ESPECIALES DEL PISO */}
                  <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-800/50">
                    <div className="flex justify-between items-center mb-4">
                       <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest italic">Habitaciones Especiales</p>
                       <button onClick={() => {
                          const nombre = prompt("Nombre de la Habitación (Ej: Medico Interno, Suboficial Ronda):");
                          if(nombre) {
                            // Aquí podrías guardar el nombre en una tabla de Supabase si querés persistencia.
                            // Por ahora lo generamos al vuelo.
                            generarQR(`/habitacion/${p.slug}-${nombre.toLowerCase().replace(/ /g, '-')}`, `${nombre.toUpperCase()} - ${p.nombre_piso}`);
                          }
                       }} className="bg-blue-600/20 text-blue-400 px-4 py-1.5 rounded-xl text-[9px] font-black uppercase border border-blue-600/30">
                         + Agregar Habitación
                       </button>
                    </div>
                    {/* (Opcional: Si querés listar habitaciones guardadas, podrías mapearlas acá) */}
                    <p className="text-[9px] text-slate-600 italic">Haz clic en el botón para generar un QR de guardia especial para este sector.</p>
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