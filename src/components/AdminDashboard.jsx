import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('historial');
  const [personal, setPersonal] = useState([]);
  const [pisos, setPisos] = useState([]);
  const [movimientosAgrupados, setMovimientosAgrupados] = useState({});
  const [resumenStock, setResumenStock] = useState({});
  const [auditoriaHabilitada, setAuditoriaHabilitada] = useState(false);
  const [notificacion, setNotificacion] = useState({ visible: false, mensaje: '' });
  
  const ITEMS_REQUERIDOS = ['SABANAS', 'TOALLAS', 'TOALLONES', 'FRAZADAS', 'SALEAS HULE', 'SALEAS TELA', 'FUNDAS', 'CUBRECAMAS'];
  const STOCK_CRITICO = 5;

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
      .select('*, pisos(nombre_piso), pañolero:personal!movimientos_stock_dni_pañolero_fkey(jerarquia, apellido, nombre), enfermero:personal!movimientos_stock_dni_enfermero_fkey(jerarquia, apellido, nombre)')
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
        ITEMS_REQUERIDOS.forEach(item => stockMap[p.nombre_piso][item] = 0);
      });
      if (movs) {
        [...movs].reverse().forEach(m => {
          const pNombre = m.pisos?.nombre_piso;
          if (stockMap[pNombre]) stockMap[pNombre][m.item] = m.stock_fisico_piso || 0;
        });
      }
    }
    
    setPersonal(resPers.data || []);
    setPisos(resPisos.data || []);
    setMovimientosAgrupados(agrupados);
    setResumenStock(stockMap);
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
    const { error } = await supabase.from('pisos').insert([{ nombre_piso: nuevoPiso.nombre_piso, slug }]);
    if (error) mostrarSplash("Error al crear piso");
    else { mostrarSplash("Piso Creado"); setNuevoPiso({ nombre_piso: '' }); cargarDatos(); }
  };

  const eliminarMovimiento = async (id) => {
    if (window.confirm("¿Eliminar registro?")) {
      await supabase.from('movimientos_stock').delete().eq('id', id);
      cargarDatos();
    }
  };

  const descargarQR = (slug) => {
    const urlApp = `${window.location.origin}/piso/${slug}`; 
    window.open(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(urlApp)}`, '_blank');
  };

  const formatearFecha = (fechaISO) => {
    const fecha = new Date(fechaISO);
    return fecha.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' hs';
  };

  return (
    <div className="p-4 md:p-8 bg-slate-950 min-h-screen text-slate-100 font-sans">
      {notificacion.visible && (
        <div className="fixed bottom-10 right-10 z-50 bg-blue-600 px-6 py-3 rounded-2xl shadow-2xl border border-blue-400">
          <p className="text-white font-black uppercase text-xs tracking-widest">{notificacion.mensaje}</p>
        </div>
      )}

      <div className="flex gap-2 mb-8 bg-slate-900 p-1.5 rounded-2xl border border-slate-800 w-fit">
        <button onClick={() => setActiveTab('historial')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === 'historial' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' : 'text-slate-500 hover:text-slate-300'}`}>Monitor de Movimientos</button>
        <button onClick={() => setActiveTab('admin')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === 'admin' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' : 'text-slate-500 hover:text-slate-300'}`}>Administración</button>
      </div>

      {activeTab === 'historial' && (
        <section className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-black text-blue-500 uppercase italic">Control de Activos</h2>
            <button onClick={cargarDatos} className="text-[10px] bg-slate-800 px-4 py-2 rounded-xl font-black text-slate-400 border border-slate-700 hover:bg-slate-700">Actualizar</button>
          </div>

          {Object.keys(resumenStock).map((nombrePiso) => (
            <div key={nombrePiso} className="bg-slate-900 rounded-[2.5rem] border border-slate-800 overflow-hidden shadow-2xl">
              <div className="bg-slate-800/40 px-8 py-5 border-b border-slate-800 flex justify-between items-center">
                <span className="text-lg font-black text-blue-400 uppercase tracking-widest">{nombrePiso}</span>
                {Object.values(resumenStock[nombrePiso]).some(qty => qty > 0 && qty < STOCK_CRITICO) && (
                  <span className="text-[10px] bg-red-600 text-white px-3 py-1 rounded-full font-black animate-pulse uppercase">Alerta de Stock</span>
                )}
              </div>

              {/* GRUPO DE STOCK CON COLORES CORREGIDOS */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 p-4 bg-slate-950/50 border-b border-slate-800">
                {ITEMS_REQUERIDOS.map(item => {
                  const stock = resumenStock[nombrePiso][item];
                  const esCritico = stock > 0 && stock < STOCK_CRITICO;
                  return (
                    <div key={item} className={`p-3 rounded-2xl border flex flex-col items-center transition-all ${esCritico ? 'bg-red-950/40 border-red-500 animate-pulse' : 'bg-slate-900 border-slate-700'}`}>
                      <span className={`text-[8px] font-black uppercase mb-1 ${esCritico ? 'text-red-400' : 'text-slate-300'}`}>{item}</span>
                      <span className={`text-base font-black ${esCritico ? 'text-red-500' : stock > 0 ? 'text-blue-400' : 'text-slate-500'}`}>{stock}</span>
                    </div>
                  );
                })}
              </div>

              {/* LISTA DE MOVIMIENTOS CON NOMBRES COMPLETOS */}
              <div className="p-4 space-y-3 max-h-[400px] overflow-y-auto">
                {movimientosAgrupados[nombrePiso]?.map((m) => (
                  <div key={m.id} className="bg-slate-950 p-4 rounded-[2rem] border border-slate-800 flex flex-col md:flex-row justify-between gap-4 items-center group relative">
                    <div className="w-full md:w-1/4">
                      <p className="text-sm font-black text-white uppercase">{m.item}</p>
                      <p className="text-[9px] text-slate-500 italic mt-1">{formatearFecha(m.created_at)}</p>
                    </div>
                    <div className="flex items-center gap-4 bg-slate-900 px-6 py-3 rounded-2xl border border-slate-800/50">
                      <div className="text-center min-w-[50px]">
                        <span className="text-[7px] text-green-500 font-black uppercase tracking-tighter">Lavadero</span>
                        <p className="text-sm font-black text-green-500">+{m.entregado_limpio || 0}</p>
                      </div>
                      <div className="w-px h-8 bg-slate-800"></div>
                      <div className="text-center min-w-[50px]">
                        <span className="text-[7px] text-blue-400 font-black uppercase tracking-tighter">Entrega</span>
                        <p className="text-sm font-black text-blue-400">-{m.egreso_limpio || 0}</p>
                      </div>
                      <div className="w-px h-8 bg-slate-800"></div>
                      <div className="text-center min-w-[50px]">
                        <span className="text-[7px] text-red-500 font-black uppercase tracking-tighter">Sucio</span>
                        <p className="text-sm font-black text-red-500">S:{m.retirado_sucio || 0}</p>
                      </div>
                    </div>
                    <div className="w-full md:w-1/3 flex justify-between md:justify-end items-center gap-4">
                      <div className="text-right text-[9px] uppercase font-black leading-tight">
                        <p className="text-blue-500">OP: {m.pañolero?.jerarquia} {m.pañolero?.apellido} {m.pañolero?.nombre}</p>
                        {m.enfermero && <p className="text-emerald-500 mt-1">REC: {m.enfermero?.jerarquia} {m.enfermero?.apellido} {m.enfermero?.nombre}</p>}
                      </div>
                      <button onClick={() => eliminarMovimiento(m.id)} className="bg-red-900/20 hover:bg-red-600 text-red-500 hover:text-white p-2 rounded-xl transition-all opacity-0 group-hover:opacity-100 border border-red-900/30">×</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Pestaña Admin se mantiene con su estilo y funcionalidad */}
      {activeTab === 'admin' && (
        <div className="space-y-10">
          <section className="bg-slate-900 p-6 rounded-[2rem] border border-yellow-600/30 flex justify-between items-center shadow-xl">
            <div className="max-w-[70%]">
              <h3 className="text-sm font-black text-yellow-500 uppercase italic">Mando de Auditoría</h3>
              <p className="text-[10px] text-slate-500 font-bold mt-1 uppercase italic tracking-tighter">Habilita ajuste manual de stock para pañoleros durante recuentos físicos</p>
            </div>
            <button onClick={toggleAuditoria} className={`px-8 py-3 rounded-xl font-black text-[10px] uppercase transition-all shadow-lg ${auditoriaHabilitada ? 'bg-red-600 animate-pulse text-white' : 'bg-green-600 text-white'}`}>
              {auditoriaHabilitada ? 'Desactivar Ajuste' : 'Activar Ajuste'}
            </button>
          </section>

          <section className="bg-slate-900 p-6 rounded-[2rem] border border-slate-800 shadow-2xl">
            <h3 className="text-xs font-black text-slate-500 mb-6 uppercase tracking-widest">Configurar Sectores / Pisos</h3>
            <form onSubmit={agregarPiso} className="flex gap-2 mb-8">
              <input className="flex-grow bg-slate-800 p-4 rounded-2xl border border-slate-700 text-sm" placeholder="Nombre del Piso (Ej: PISO 2 NORTE)..." value={nuevoPiso.nombre_piso} onChange={e => setNuevoPiso({...nuevoPiso, nombre_piso: e.target.value})} required />
              <button className="bg-blue-600 px-8 rounded-2xl font-black text-[10px] uppercase shadow-lg shadow-blue-900/20">Crear Piso</button>
            </form>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {pisos.map(p => (
                <div key={p.id} className="p-4 bg-slate-950 rounded-2xl border border-slate-800 flex justify-between items-center shadow-lg">
                  <span className="text-xs font-black text-blue-400 uppercase tracking-widest">{p.nombre_piso}</span>
                  <div className="flex gap-2">
                    <button onClick={() => descargarQR(p.slug)} className="p-2 bg-slate-800 rounded-lg text-[9px] font-bold uppercase text-blue-500 border border-blue-900/30">QR</button>
                    <button onClick={async () => { if(window.confirm("¿Eliminar sector?")) { await supabase.from('pisos').delete().eq('id', p.id); cargarDatos(); } }} className="p-2 text-red-500 text-lg font-black">×</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
          
          {/* El resto del código de administración de personal se mantiene igual... */}
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;