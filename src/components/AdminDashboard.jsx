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
      .select(`
        *, 
        pisos(nombre_piso), 
        pañolero:personal!movimientos_stock_dni_pañolero_fkey(jerarquia, apellido, nombre), 
        enfermero:personal!movimientos_stock_dni_enfermero_fkey(jerarquia, apellido, nombre)
      `)
      .order('created_at', { ascending: false });

    const stockMap = {};
    const globalAcc = {};
    ITEMS_REQUERIDOS.forEach(it => globalAcc[it] = 0);

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

        ITEMS_REQUERIDOS.forEach(item => {
          let sumaTotal = 0;
          Object.values(stockMap).forEach(pisoStock => {
            sumaTotal += (pisoStock[item] || 0);
          });
          globalAcc[item] = sumaTotal;
        });
      }
    }

    const agrupados = movs ? movs.reduce((acc, curr) => {
      const nombrePiso = curr.pisos?.nombre_piso || "Sector Desconocido";
      if (!acc[nombrePiso]) acc[nombrePiso] = [];
      acc[nombrePiso].push(curr);
      return acc;
    }, {}) : {};
    
    setPersonal(resPers.data || []);
    setPisos(resPisos.data || []);
    setMovimientosAgrupados(agrupados);
    setResumenStock(stockMap);
    setStockGlobal(globalAcc);
  };

  const eliminarMovimiento = async (id) => {
    if (window.confirm("¿Confirma la eliminación de este registro del manifiesto?")) {
      const { error } = await supabase.from('movimientos_stock').delete().eq('id', id);
      if (error) mostrarSplash("Error al eliminar");
      else {
        mostrarSplash("Registro eliminado");
        cargarDatos();
      }
    }
  };

  const toggleAuditoria = async () => {
    const nuevoEstado = !auditoriaHabilitada;
    await supabase.from('configuracion_sistema').update({ valor: nuevoEstado.toString() }).eq('clave', 'MODO_AUDITORIA');
    setAuditoriaHabilitada(nuevoEstado);
    mostrarSplash(nuevoEstado ? "MODO AUDITORÍA ACTIVADO" : "MODO AUDITORÍA CERRADO");
  };

  const formatearFechaGuardia = (fechaISO) => {
    const fecha = new Date(fechaISO);
    const opciones = { weekday: 'long', day: 'numeric' };
    const diaYNumero = fecha.toLocaleDateString('es-AR', opciones);
    const hora = fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    const diaCapitalizado = diaYNumero.charAt(0).toUpperCase() + diaYNumero.slice(1);
    return `${diaCapitalizado}, ${hora} hs`;
  };

  return (
    <div className="p-4 md:p-8 bg-slate-950 min-h-screen text-slate-100 font-sans">
      {/* Notificaciones Splash */}
      {notificacion.visible && (
        <div className="fixed bottom-10 right-10 z-50 bg-blue-600 px-6 py-3 rounded-2xl shadow-2xl border border-blue-400 animate-in slide-in-from-right">
          <p className="text-white font-black uppercase text-xs tracking-widest">{notificacion.mensaje}</p>
        </div>
      )}

      {/* Tabs de Navegación */}
      <div className="flex gap-2 mb-8 bg-slate-900 p-1.5 rounded-2xl border border-slate-800 w-fit">
        <button onClick={() => setActiveTab('historial')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === 'historial' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' : 'text-slate-500 hover:text-slate-300'}`}>Monitor de Movimientos</button>
        <button onClick={() => setActiveTab('admin')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === 'admin' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' : 'text-slate-500 hover:text-slate-300'}`}>Administración</button>
      </div>

      {activeTab === 'historial' && (
        <section className="space-y-8 animate-in fade-in">
          <div className="flex justify-between items-center">
            <h2 className="text-4xl font-black text-white uppercase italic tracking-tighter">Control de Activos</h2>
            <button onClick={cargarDatos} className="text-[10px] bg-slate-800 px-4 py-2 rounded-xl font-black text-slate-400 border border-slate-700 hover:bg-slate-700">Actualizar</button>
          </div>

          {/* Patrimonio Consolidado */}
          <div className="bg-blue-900/10 border-2 border-blue-900/30 rounded-[2.5rem] p-6 shadow-2xl">
            <p className="text-[11px] font-black text-blue-400 uppercase tracking-[0.3em] mb-4 text-center italic font-bold">Patrimonio Total Consolidado (HNPM)</p>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
              {ITEMS_REQUERIDOS.map(item => (
                <div key={item} className="bg-slate-900/80 p-4 rounded-3xl border border-blue-800/40 text-center">
                  <span className="text-[9px] text-slate-500 font-black uppercase block mb-1 tracking-tighter">{item}</span>
                  <span className="text-3xl font-black text-blue-400">{stockGlobal[item] || 0}</span>
                </div>
              ))}
            </div>
          </div>

          {Object.keys(resumenStock).map((nombrePiso) => (
            <div key={nombrePiso} className="bg-slate-900 rounded-[3rem] border border-slate-800 overflow-hidden shadow-2xl">
              <div className="bg-slate-800/40 px-8 py-4 border-b border-slate-800">
                <span className="text-lg font-black text-blue-400 uppercase tracking-widest">{nombrePiso}</span>
              </div>

              {/* Grilla de Stock por Piso */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 p-4 bg-slate-950/50 border-b border-slate-800">
                {ITEMS_REQUERIDOS.map(item => {
                  const stock = resumenStock[nombrePiso][item];
                  const esCero = stock === 0;
                  const esBajo = stock <= STOCK_CRITICO;
                  return (
                    <div key={item} className={`p-4 rounded-3xl border transition-all ${esCero ? 'bg-red-600 border-red-400 animate-pulse text-white' : esBajo ? 'bg-red-900/20 border-red-900/50' : 'bg-slate-900 border-slate-700'}`}>
                      <span className={`text-[10px] font-black uppercase block mb-1 text-center ${esBajo ? 'text-red-100' : 'text-slate-500'}`}>{item}</span>
                      <span className={`text-3xl font-black block text-center ${esBajo ? 'text-white' : 'text-blue-400'}`}>{stock}</span>
                    </div>
                  );
                })}
              </div>

              {/* HISTORIAL CON SCROLL (Altura fijada para 5 filas aprox) */}
              <div className="p-3 space-y-1 overflow-y-auto max-h-[350px] custom-scroll">
                {movimientosAgrupados[nombrePiso]?.map((m) => (
                  <div key={m.id} className="bg-slate-950/50 px-5 py-3 rounded-2xl border border-slate-800/50 flex items-center justify-between group hover:bg-slate-800 transition-all">
                    <div className="w-1/4">
                      <p className="text-xs font-black text-white uppercase leading-none">{m.item}</p>
                      <p className="text-[9px] text-blue-500 font-black uppercase mt-1 tracking-tighter">
                        {formatearFechaGuardia(m.created_at)}
                      </p>
                    </div>

                    <div className="flex items-center gap-10">
                      <div className="text-center min-w-[60px]">
                        <span className="text-[7px] text-green-500 font-black uppercase block">Ingreso</span>
                        <p className="text-xl font-black text-green-500">+{m.entregado_limpio || 0}</p>
                      </div>
                      <div className="text-center min-w-[60px]">
                        <span className="text-[7px] text-blue-400 font-black uppercase block">Entrega</span>
                        <p className="text-xl font-black text-blue-400">-{m.egreso_limpio || 0}</p>
                      </div>
                      <div className="text-center min-w-[60px]">
                        <span className="text-[7px] text-red-500 font-black uppercase block">Sucio</span>
                        <p className="text-xl font-black text-red-500">-{m.retirado_sucio || 0}</p>
                      </div>
                    </div>

                    <div className="w-1/3 flex items-center justify-end gap-4">
                      <div className="text-right">
                        <p className="text-[10px] text-slate-300 font-black uppercase leading-tight tracking-tighter">
                          OP: {m.pañolero?.jerarquia} {m.pañolero?.apellido}
                        </p>
                        {m.enfermero && (
                          <p className="text-[9px] text-slate-500 font-bold uppercase mt-1 tracking-tighter">
                            REC: {m.enfermero?.jerarquia} {m.enfermero?.apellido}
                          </p>
                        )}
                      </div>
                      {/* BOTÓN DE ELIMINACIÓN DE LÍNEA */}
                      <button 
                        onClick={() => eliminarMovimiento(m.id)}
                        className="p-2 bg-red-950/30 text-red-500 rounded-lg border border-red-900/30 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 hover:text-white"
                        title="Eliminar Registro"
                      >
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

      {/* Pestaña Admin (Agregar Personal/Pisos)... */}
      {activeTab === 'admin' && (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4">
                  {/* Mando de Auditoría */}
                  <section className="bg-slate-900 p-6 rounded-[2rem] border border-yellow-600/30 flex justify-between items-center shadow-xl">
                    <div className="max-w-[70%]">
                      <h3 className="text-sm font-black text-yellow-500 uppercase italic">Mando de Auditoría</h3>
                      <p className="text-[10px] text-slate-500 font-bold mt-1 uppercase italic tracking-tighter leading-tight">Habilita ajuste manual de stock para pañoleros</p>
                    </div>
                    <button onClick={toggleAuditoria} className={`px-8 py-3 rounded-xl font-black text-[10px] uppercase transition-all shadow-lg ${auditoriaHabilitada ? 'bg-red-600 animate-pulse text-white' : 'bg-green-600 text-white'}`}>
                      {auditoriaHabilitada ? 'Desactivar Ajuste' : 'Activar Ajuste'}
                    </button>
                  </section>
        
                  {/* Configuración de Pisos */}
                  <section className="bg-slate-900 p-6 rounded-[2rem] border border-slate-800 shadow-2xl">
                    <h3 className="text-xs font-black text-slate-500 mb-6 uppercase tracking-widest">Configurar Sectores / Pisos</h3>
                    <form onSubmit={agregarPiso} className="flex gap-2 mb-8">
                      <input className="flex-grow bg-slate-800 p-4 rounded-2xl border border-slate-700 text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Nombre del Piso..." value={nuevoPiso.nombre_piso} onChange={e => setNuevoPiso({...nuevoPiso, nombre_piso: e.target.value})} required />
                      <button className="bg-blue-600 px-8 rounded-2xl font-black text-[10px] uppercase">Crear Piso</button>
                    </form>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {pisos.map(p => (
                        <div key={p.id} className="p-4 bg-slate-950 rounded-2xl border border-slate-800 flex justify-between items-center shadow-lg group">
                          <span className="text-xs font-black text-blue-400 uppercase tracking-widest">{p.nombre_piso}</span>
                          <div className="flex gap-2">
                            <button onClick={() => descargarQR(p.slug)} className="p-2 bg-slate-800 rounded-lg text-[9px] font-bold uppercase text-blue-500 border border-blue-900/30">QR</button>
                            <button onClick={async () => { if(window.confirm(`¿Eliminar ${p.nombre_piso}?`)) { await supabase.from('pisos').delete().eq('id', p.id); cargarDatos(); } }} className="p-2 text-red-500 text-lg font-black hover:scale-110 transition-transform">×</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
        
                  {/* Personal de Guardia */}
                  <section className="bg-slate-900 p-6 rounded-[2rem] border border-slate-800 shadow-2xl">
                    <h3 className="text-xs font-black text-slate-500 mb-6 uppercase tracking-widest">Personal de Guardia</h3>
                    <form onSubmit={agregarPersonal} className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
                      <input className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm" placeholder="Jerarquía" value={nuevoMiembro.jerarquia} onChange={e => setNuevoMiembro({...nuevoMiembro, jerarquia: e.target.value})} required />
                      <input className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm" placeholder="Nombre" value={nuevoMiembro.nombre} onChange={e => setNuevoMiembro({...nuevoMiembro, nombre: e.target.value})} required />
                      <input className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm" placeholder="Apellido" value={nuevoMiembro.apellido} onChange={e => setNuevoMiembro({...nuevoMiembro, apellido: e.target.value})} required />
                      <input className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm font-mono" placeholder="DNI" value={nuevoMiembro.dni} onChange={e => setNuevoMiembro({...nuevoMiembro, dni: e.target.value})} required />
                      <select className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-sm font-bold text-blue-400" value={nuevoMiembro.rol} onChange={e => setNuevoMiembro({...nuevoMiembro, rol: e.target.value})}>
                        <option value="pañolero">Pañolero</option>
                        <option value="enfermero">Enfermero</option>
                        <option value="admin">Administrador</option>
                      </select>
                      <button className="bg-blue-600 p-3 rounded-xl font-black uppercase text-xs">Registrar</button>
                    </form>
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scroll">
                      {personal.map(p => (
                        <div key={p.dni} className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex justify-between items-center group">
                          <span className="text-xs font-bold uppercase">{p.jerarquia} {p.apellido} <small className="text-blue-500 ml-2">[{p.rol}]</small></span>
                          <button onClick={async () => { if(window.confirm("¿Dar de baja?")) { await supabase.from('personal').delete().eq('dni', p.dni); cargarDatos(); } }} className="text-red-500 text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity uppercase">Eliminar</button>
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