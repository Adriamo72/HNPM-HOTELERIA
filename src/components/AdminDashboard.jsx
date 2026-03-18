import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import QRCode from 'react-qr-code'; // Asegúrate de instalarlo: npm install react-qr-code

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('historial');
  const [personal, setPersonal] = useState([]);
  const [pisos, setPisos] = useState([]);
  const [movimientosAgrupados, setMovimientosAgrupados] = useState({});
  const [resumenStock, setResumenStock] = useState({});
  const [stockGlobal, setStockGlobal] = useState({}); 
  const [auditoriaHabilitada, setAuditoriaHabilitada] = useState(false);
  const [notificacion, setNotificacion] = useState({ visible: false, mensaje: '' });
  
  // --- NUEVOS ESTADOS PARA GESTIÓN DINÁMICA ---
  const [cantHabitaciones, setCantHabitaciones] = useState({}); // Objeto para guardar cantidad por piso
  const [verQR, setVerQR] = useState({ visible: false, url: '', titulo: '' });

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
      .select(`
        *, 
        pisos(nombre_piso), 
        pañolero:personal!movimientos_stock_dni_pañolero_fkey(jerarquia, apellido, nombre), 
        enfermero:personal!movimientos_stock_dni_enfermero_fkey(jerarquia, apellido, nombre)
      `)
      .order('created_at', { ascending: true });

    const stockMap = {};
    const globalAcc = {};
    
    ITEMS_REQUERIDOS.forEach(it => {
      globalAcc[it] = { pañol: 0, en_piso: 0, en_lavadero: 0 };
    });

    if (resPisos.data) {
      resPisos.data.forEach(p => {
        stockMap[p.nombre_piso] = {};
        ITEMS_REQUERIDOS.forEach(item => stockMap[p.nombre_piso][item] = 0);
      });

      if (movs) {
        movs.forEach(m => {
          const it = m.item;
          const pNombre = m.pisos?.nombre_piso;
          const esSincro = !m.entregado_limpio && !m.egreso_limpio && !m.retirado_sucio;

          if (esSincro) {
            globalAcc[it].pañol = m.stock_fisico_piso;
          } else {
            if (m.egreso_limpio > 0) {
              globalAcc[it].pañol = Math.max(0, globalAcc[it].pañol - m.egreso_limpio);
              globalAcc[it].en_piso += m.egreso_limpio;
            }
            if (m.retirado_sucio > 0) {
              if (globalAcc[it].en_piso < m.retirado_sucio) {
                globalAcc[it].en_lavadero += m.retirado_sucio;
              } else {
                globalAcc[it].en_piso -= m.retirado_sucio;
                globalAcc[it].en_lavadero += m.retirado_sucio;
              }
            }
            if (m.entregado_limpio > 0) {
              if (globalAcc[it].en_lavadero < m.entregado_limpio) {
                globalAcc[it].pañol += m.entregado_limpio;
              } else {
                globalAcc[it].en_lavadero -= m.entregado_limpio;
                globalAcc[it].pañol += m.entregado_limpio;
              }
            }
          }
          if (stockMap[pNombre]) stockMap[pNombre][it] = m.stock_fisico_piso || 0;
        });
      }
    }

    const globalFinal = {};
    ITEMS_REQUERIDOS.forEach(it => {
      globalFinal[it] = (globalAcc[it].pañol || 0) + (globalAcc[it].en_piso || 0) + (globalAcc[it].en_lavadero || 0);
    });

    const agrupados = movs ? [...movs].reverse().reduce((acc, curr) => {
      const nombrePiso = curr.pisos?.nombre_piso || "Sector Desconocido";
      if (!acc[nombrePiso]) acc[nombrePiso] = [];
      acc[nombrePiso].push(curr);
      return acc;
    }, {}) : {};
    
    setPersonal(resPers.data || []);
    setPisos(resPisos.data || []);
    setMovimientosAgrupados(agrupados);
    setResumenStock(stockMap);
    setStockGlobal(globalFinal);
  };

  // --- LÓGICA DE MODAL DE QR ---
  const abrirModalQR = (path, titulo) => {
    const urlCompleta = `${window.location.origin}${path}`;
    setVerQR({ visible: true, url: urlCompleta, titulo });
  };

  const eliminarMovimiento = async (id) => {
    if (window.confirm("¿Confirma la eliminación del registro?")) {
      const { error } = await supabase.from('movimientos_stock').delete().eq('id', id);
      if (!error) { mostrarSplash("Registro eliminado"); cargarDatos(); }
    }
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
    const diaCapitalizado = diaYNumero.charAt(0).toUpperCase() + diaYNumero.slice(1);
    return `${diaCapitalizado}, ${hora} hs`;
  };

  return (
    <div className="p-4 md:p-8 bg-slate-950 min-h-screen text-slate-100 font-sans relative">
      
      {/* Pestañas */}
      <div className="flex gap-2 mb-8 bg-slate-900 p-1.5 rounded-2xl border border-slate-800 w-fit">
        <button onClick={() => setActiveTab('historial')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === 'historial' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>Monitor</button>
        <button onClick={() => setActiveTab('admin')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === 'admin' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>Administración</button>
      </div>

      {activeTab === 'historial' && (
        /* ... (Mismo código del monitor que ya tienes) ... */
        <section className="space-y-8 animate-in fade-in">
          <div className="flex justify-between items-center px-2">
            <h2 className="text-4xl font-black text-white uppercase italic tracking-tighter">Control de Activos</h2>
            <button onClick={cargarDatos} className="text-[10px] bg-slate-800 px-4 py-2 rounded-xl font-black text-slate-400 border border-slate-700">Sincronizar</button>
          </div>
          {/* PATRIMONIO Y LISTADO DE PISOS IGUAL A TU CÓDIGO ANTERIOR */}
          {/* (Se omite por brevedad para enfocar en la sección Admin) */}
          <p className="text-xs text-slate-500 italic">Visualizando monitor de stock...</p>
        </section>
      )}

      {activeTab === 'admin' && (
        <div className="space-y-10 animate-in fade-in">
          {/* Mando de Auditoría */}
          <section className="bg-slate-900 p-6 rounded-[2rem] border border-yellow-600/30 flex justify-between items-center shadow-xl">
            <div className="max-w-[70%] text-yellow-500">
               <h3 className="text-sm font-black uppercase italic">Mando de Auditoría</h3>
               <p className="text-[10px] text-slate-500 uppercase font-bold">Ajuste manual de stock en pañoles</p>
            </div>
            <button onClick={toggleAuditoria} className={`px-8 py-3 rounded-xl font-black text-[10px] uppercase shadow-lg ${auditoriaHabilitada ? 'bg-red-600 text-white animate-pulse' : 'bg-green-600 text-white'}`}>
              {auditoriaHabilitada ? 'Desactivar' : 'Activar'}
            </button>
          </section>

          {/* Gestión de Personal (Igual a tu código anterior) */}
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
          </section>

          {/* CONFIGURACIÓN DE PISOS / QR ESPECIALES (Módulo renovado) */}
          <section className="bg-slate-900 p-6 rounded-[2.5rem] border border-slate-800 shadow-2xl">
            <h3 className="text-xs font-black text-slate-500 mb-6 uppercase tracking-widest">Sectores / Pisos y Generador de QRs</h3>
            
            <form onSubmit={agregarPiso} className="flex gap-2 mb-10">
              <input className="flex-grow bg-slate-800 p-4 rounded-2xl border border-slate-700 text-sm outline-none" placeholder="Nombre de nuevo sector..." value={nuevoPiso.nombre_piso} onChange={e => setNuevoPiso({...nuevoPiso, nombre_piso: e.target.value})} required />
              <button className="bg-blue-600 px-8 rounded-2xl font-black text-[10px] uppercase shadow-lg tracking-widest">Crear</button>
            </form>

            <div className="space-y-6">
              {pisos.map(p => (
                <div key={p.id} className="p-6 bg-slate-950 rounded-[2rem] border border-slate-800 shadow-lg group">
                  <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                    <span className="text-lg font-black text-blue-400 uppercase tracking-widest italic">{p.nombre_piso}</span>
                    <div className="flex gap-2">
                      {/* BOTÓN QR PAÑOL */}
                      <button onClick={() => abrirModalQR(`/piso/${p.slug}`, `PAÑOL - ${p.nombre_piso}`)} className="bg-blue-600/20 text-blue-400 border border-blue-600/30 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all">QR Pañol</button>
                      
                      {/* BOTÓN QR LAVADERO */}
                      <button onClick={() => abrirModalQR(`/lavadero/${p.slug}`, `LAVADERO - ${p.nombre_piso}`)} className="bg-green-600/20 text-green-400 border border-green-600/30 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-green-600 hover:text-white transition-all">QR Lavadero</button>
                      
                      {/* ELIMINAR PISO */}
                      <button onClick={async () => { if(window.confirm(`¿Eliminar ${p.nombre_piso}?`)) { await supabase.from('pisos').delete().eq('id', p.id); cargarDatos(); } }} className="bg-red-950/20 text-red-500 border border-red-900/30 px-3 py-2 rounded-xl text-lg font-black hover:bg-red-600 hover:text-white transition-all">×</button>
                    </div>
                  </div>

                  {/* GENERADOR DE HABITACIONES DINÁMICO */}
                  <div className="bg-slate-900/50 p-5 rounded-[1.5rem] border border-slate-800/50">
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Generar Habitaciones Especiales</p>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] text-slate-500">Cantidad:</span>
                        <input 
                          type="number" 
                          min="0"
                          placeholder="0"
                          value={cantHabitaciones[p.id] || ''}
                          onChange={(e) => setCantHabitaciones({...cantHabitaciones, [p.id]: parseInt(e.target.value)})}
                          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1 w-20 text-xs text-blue-400 font-black text-center"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-4 sm:grid-cols-8 md:grid-cols-12 gap-2">
                      {Array.from({ length: cantHabitaciones[p.id] || 0 }, (_, i) => i + 1).map((num) => (
                        <button
                          key={num}
                          onClick={() => abrirModalQR(`/habitacion/${p.slug}-hab-${num}`, `HAB ${num} - ${p.nombre_piso}`)}
                          className="bg-slate-800/40 hover:bg-blue-600 border border-slate-700 hover:border-blue-400 transition-all p-2 rounded-lg text-[9px] font-black text-slate-400 hover:text-white text-center"
                        >
                          H-{num}
                        </button>
                      ))}
                      {(!cantHabitaciones[p.id] || cantHabitaciones[p.id] === 0) && (
                        <p className="col-span-full text-[9px] text-slate-600 uppercase text-center italic py-2">Ingresa una cantidad para generar QRs de habitación</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* MODAL DE VISUALIZACIÓN DE QR E IMPRESIÓN */}
      {verQR.visible && (
        <div className="fixed inset-0 bg-slate-950/95 flex items-center justify-center z-[200] p-4 backdrop-blur-xl animate-in fade-in zoom-in duration-300">
          <div className="bg-white p-8 rounded-[3.5rem] text-center max-w-sm w-full shadow-[0_0_100px_rgba(37,99,235,0.2)]">
            <p className="text-slate-400 text-[10px] font-black uppercase mb-2 tracking-[0.3em]">Sentinel Security QR</p>
            <h2 className="text-slate-900 font-black uppercase text-xl mb-8 leading-tight tracking-tighter">{verQR.titulo}</h2>
            
            <div className="bg-white p-5 inline-block rounded-[2.5rem] mb-8 shadow-2xl border border-slate-100">
              <QRCode value={verQR.url} size={220} level="H" />
            </div>

            <p className="text-slate-400 text-[8px] mb-8 break-all font-mono opacity-50">{verQR.url}</p>

            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => window.print()} 
                className="bg-slate-900 text-white p-5 rounded-[1.5rem] font-black uppercase text-[10px] tracking-widest shadow-xl hover:bg-slate-800 active:scale-95 transition-all"
              >
                Imprimir
              </button>
              <button 
                onClick={() => setVerQR({ visible: false, url: '', titulo: '' })} 
                className="bg-red-50 text-red-600 p-5 rounded-[1.5rem] font-black uppercase text-[10px] tracking-widest hover:bg-red-100 active:scale-95 transition-all"
              >
                Cerrar
              </button>
            </div>
            <p className="text-[9px] text-slate-300 mt-6 font-bold uppercase tracking-widest italic">Dpto. Hotelería - HNPM</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;